import type { WorkflowResult } from "../../models/schemas/workflow.js";
import type { RunContext } from "../orchestrator/run-context.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";
import { createId } from "../../utils/ids.js";
import type { Workflow } from "./workflow.js";

/**
 * Call exactly one model by id with no triage-based tier selection.
 *
 * Used when the caller sends `routing.forceModel` (e.g. from the OpenAI-
 * compatible surface when the user explicitly picked a real model name).
 * No escalation, no compare, no judge. Trace is still written for
 * observability.
 */
export class PassthroughWorkflow implements Workflow {
  readonly name = "direct" as const;

  constructor(
    private readonly provider: BrokerProvider,
    private readonly evaluator: AggregateEvaluator,
    private readonly modelId: string,
  ) {}

  async execute(context: RunContext): Promise<WorkflowResult> {
    const assessment = context.assessment;
    const response = await this.provider.generate({
      model: this.modelId,
      prompt: context.executionPrompt,
      taskType: assessment?.taskType,
    });

    const evaluation = this.evaluator.evaluate({ answer: response.answer, assessment });
    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: this.modelId,
      latencyMs: response.latencyMs,
      costUnits: response.costUnits,
      outputValid: evaluation.passed,
      evaluatorScore: evaluation.score,
      notes: ["passthrough", ...evaluation.reasons],
    });

    return {
      workflow: "direct",
      answer: response.answer,
      modelsUsed: [this.modelId],
      escalated: false,
      latencyMs: response.latencyMs,
      costUnits: response.costUnits,
      confidence: evaluation.score,
    };
  }
}
