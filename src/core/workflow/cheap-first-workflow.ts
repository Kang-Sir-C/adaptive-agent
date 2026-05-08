import type { WorkflowResult } from "../../models/schemas/workflow.js";
import type { RunContext } from "../orchestrator/run-context.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";
import { createId } from "../../utils/ids.js";
import type { Workflow } from "./workflow.js";

export class CheapFirstWorkflow implements Workflow {
  readonly name = "cheap_first" as const;

  constructor(
    private readonly provider: BrokerProvider,
    private readonly evaluator: AggregateEvaluator,
  ) {}

  async execute(context: RunContext): Promise<WorkflowResult> {
    const assessment = context.assessment!;

    // Start from one tier below the suggested tier. If suggested tier is
    // already cheap, start at cheap (can't go lower). This way triage's
    // tier recommendation actually influences the starting point.
    const startTier = assessment.modelTier === "premium" ? "mid"
      : assessment.modelTier === "mid" ? "cheap"
      : "cheap";
    const escalateTier = assessment.modelTier === "premium" ? "premium"
      : "mid";

    const firstProfile = this.provider.pickModelByTier(startTier, assessment.taskType);
    const firstResponse = await this.provider.generate({
      model: firstProfile.id,
      prompt: context.executionPrompt,
      taskType: assessment.taskType,
    });
    const firstEval = this.evaluator.evaluate({ answer: firstResponse.answer, assessment });

    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: firstProfile.id,
      tier: firstProfile.tier,
      latencyMs: firstResponse.latencyMs,
      costUnits: firstResponse.costUnits,
      outputValid: firstEval.passed,
      evaluatorScore: firstEval.score,
      notes: firstEval.reasons,
    });

    if (firstEval.passed) {
      return {
        workflow: this.name,
        answer: firstResponse.answer,
        modelsUsed: [firstProfile.id],
        escalated: false,
        latencyMs: firstResponse.latencyMs,
        costUnits: firstResponse.costUnits,
        confidence: firstEval.score,
      };
    }

    const escalateProfile = this.provider.pickModelByTier(escalateTier, assessment.taskType);
    const secondResponse = await this.provider.generate({
      model: escalateProfile.id,
      prompt: `${context.executionPrompt}\n\nImprove the previous attempt with higher reliability.`,
      taskType: assessment.taskType,
    });
    const secondEval = this.evaluator.evaluate({ answer: secondResponse.answer, assessment });

    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: escalateProfile.id,
      tier: escalateProfile.tier,
      latencyMs: secondResponse.latencyMs,
      costUnits: secondResponse.costUnits,
      outputValid: secondEval.passed,
      evaluatorScore: secondEval.score,
      escalated: true,
      notes: secondEval.reasons,
    });

    return {
      workflow: this.name,
      answer: secondResponse.answer,
      modelsUsed: [firstProfile.id, escalateProfile.id],
      escalated: true,
      latencyMs: firstResponse.latencyMs + secondResponse.latencyMs,
      costUnits: firstResponse.costUnits + secondResponse.costUnits,
      confidence: secondEval.score,
    };
  }
}
