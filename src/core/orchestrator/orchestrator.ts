import { workflowDefaults } from "../../config/workflows.js";
import type { RunRequest, RunResult, SessionState } from "../../models/schemas/run.js";
import type { RunTrace } from "../../models/schemas/trace.js";
import { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { OpenAICompatibleAdapter } from "../../providers/adapters/openai-compatible-adapter.js";
import { TraceStore } from "../../storage/trace-store.js";
import { TraceRecorder } from "../../telemetry/trace-recorder.js";
import { createId } from "../../utils/ids.js";
import { nowIso } from "../../utils/time.js";
import { ContextBuilder } from "../context/context-builder.js";
import { BudgetManager } from "../budget/budget-manager.js";
import { TriageService } from "../triage/triage-service.js";
import type { RunContext } from "./run-context.js";
import { WorkflowFactory } from "../workflow/workflow-factory.js";
import { PassthroughWorkflow } from "../workflow/passthrough-workflow.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";

export class Orchestrator {
  private readonly provider = new BrokerProvider(new OpenAICompatibleAdapter());
  private readonly triageService = new TriageService();
  private readonly contextBuilder = new ContextBuilder();
  private readonly traceStore = new TraceStore();
  private readonly traceRecorder = new TraceRecorder();
  private readonly workflowFactory = new WorkflowFactory(this.provider);

  async run(request: RunRequest): Promise<RunResult> {
    const startMs = Date.now();

    const sessionState: SessionState = {
      sessionId: request.sessionId,
      constraints: [],
      acceptedDecisions: [],
      rejectedDecisions: [],
      relevantFacts: [],
      relatedFiles: request.context?.relatedFiles?.map((file) => file.path) ?? [],
      memoryVersion: 1,
    };

    const builtContext = this.contextBuilder.build(request, sessionState);

    const { assessment } = this.triageService.assess(request);

    // Honor caller-supplied routing overrides:
    // - forceWorkflow: keep triage, swap the workflow template
    // - forceModel: bypass tier selection entirely (passthrough to a specific model)
    const effectiveAssessment = request.routing?.forceWorkflow
      ? { ...assessment, workflow: request.routing.forceWorkflow }
      : assessment;

    const budgetTemplate = workflowDefaults[effectiveAssessment.workflow as keyof typeof workflowDefaults] ?? workflowDefaults.direct;
    const budgetManager = new BudgetManager({
      ...budgetTemplate,
      currentRounds: 0,
      currentParallelCalls: 0,
      currentCostUnits: 0,
    });
    const trace: RunTrace = {
      runId: request.runId,
      sessionId: request.sessionId,
      createdAt: nowIso(),
      request: {
        mode: request.mode,
        userInput: request.userInput,
      },
      assessment: effectiveAssessment,
      workflow: request.routing?.forceModel ? "direct" : effectiveAssessment.workflow,
      steps: [
        {
          stepId: createId("step"),
          role: "triage",
          latencyMs: 0,
          costUnits: 0,
          outputValid: true,
          notes: [
            ...effectiveAssessment.reasons,
            ...(request.routing?.forceModel ? [`override=forceModel:${request.routing.forceModel}`] : []),
            ...(request.routing?.forceWorkflow ? [`override=forceWorkflow:${request.routing.forceWorkflow}`] : []),
          ],
        },
      ],
    };

    const context: RunContext = {
      request,
      sessionState,
      executionPrompt: builtContext.executionInput,
      reviewPrompt: builtContext.reviewInput,
      assessment: effectiveAssessment,
      budget: budgetManager.live(),
      trace,
      intermediate: {},
    };

    let workflowResult;
    try {
      const workflow = request.routing?.forceModel
        ? new PassthroughWorkflow(this.provider, new AggregateEvaluator(), request.routing.forceModel)
        : this.workflowFactory.create(effectiveAssessment.workflow);
      budgetManager.beginRound();
      workflowResult = await workflow.execute(context);
      budgetManager.recordUsage(workflowResult.costUnits);
    } catch (error) {
      // Record the failure in trace and persist it before re-throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      trace.steps.push({
        stepId: createId("step"),
        role: "executor",
        latencyMs: Date.now() - startMs,
        costUnits: 0,
        outputValid: false,
        notes: [`error: ${errorMessage}`],
      });
      this.traceRecorder.finalize(trace, {
        answer: "",
        modelsUsed: [],
        escalated: false,
        latencyMs: Date.now() - startMs,
        costUnits: budgetManager.snapshot().currentCostUnits,
      });
      await this.traceStore.save(trace).catch(() => {});
      throw error;
    }

    const totalLatencyMs = Date.now() - startMs;
    this.traceRecorder.finalize(trace, {
      answer: workflowResult.answer,
      modelsUsed: workflowResult.modelsUsed,
      escalated: workflowResult.escalated,
      latencyMs: totalLatencyMs,
      costUnits: workflowResult.costUnits,
    });

    await this.traceStore.save(trace);

    return {
      runId: request.runId,
      answer: workflowResult.answer,
      artifacts: workflowResult.artifacts,
      meta: {
        workflow: workflowResult.workflow,
        modelsUsed: workflowResult.modelsUsed,
        escalated: workflowResult.escalated,
        latencyMs: totalLatencyMs,
        costUnits: workflowResult.costUnits,
        confidence: workflowResult.confidence,
        tier: request.routing?.forceModel ? undefined : effectiveAssessment.modelTier,
      },
    };
  }

  getProvider(): BrokerProvider {
    return this.provider;
  }

  getTraceStore(): TraceStore {
    return this.traceStore;
  }
}
