import type { WorkflowResult } from "../../models/schemas/workflow.js";
import type { RunContext } from "../orchestrator/run-context.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";
import { createId } from "../../utils/ids.js";
import type { Workflow } from "./workflow.js";

export class DirectWorkflow implements Workflow {
  readonly name = "direct" as const;

  constructor(
    private readonly provider: BrokerProvider,
    private readonly evaluator: AggregateEvaluator,
  ) {}

  async execute(context: RunContext): Promise<WorkflowResult> {
    const assessment = context.assessment!;
    const profile = this.provider.pickModelByTier(assessment.modelTier, assessment.taskType);
    const response = await this.provider.generate({
      model: profile.id,
      prompt: context.executionPrompt,
      taskType: assessment.taskType,
    });

    const evaluation = this.evaluator.evaluate({ answer: response.answer, assessment });
    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: profile.id,
      tier: profile.tier,
      latencyMs: response.latencyMs,
      costUnits: response.costUnits,
      outputValid: evaluation.passed,
      evaluatorScore: evaluation.score,
      notes: evaluation.reasons,
    });

    return {
      workflow: this.name,
      answer: response.answer,
      modelsUsed: [profile.id],
      escalated: false,
      latencyMs: response.latencyMs,
      costUnits: response.costUnits,
      confidence: evaluation.score,
    };
  }
}
