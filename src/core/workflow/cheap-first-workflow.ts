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
    const cheapProfile = this.provider.pickModelByTier("cheap", assessment.taskType);
    const firstResponse = await this.provider.generate({
      model: cheapProfile.id,
      prompt: context.executionPrompt,
      taskType: assessment.taskType,
    });
    const firstEval = this.evaluator.evaluate({ answer: firstResponse.answer, assessment });

    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: cheapProfile.id,
      tier: cheapProfile.tier,
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
        modelsUsed: [cheapProfile.id],
        escalated: false,
        latencyMs: firstResponse.latencyMs,
        costUnits: firstResponse.costUnits,
        confidence: firstEval.score,
      };
    }

    const midProfile = this.provider.pickModelByTier("mid", assessment.taskType);
    const secondResponse = await this.provider.generate({
      model: midProfile.id,
      prompt: `${context.executionPrompt}\n\nImprove the previous attempt with higher reliability.`,
      taskType: assessment.taskType,
    });
    const secondEval = this.evaluator.evaluate({ answer: secondResponse.answer, assessment });

    context.trace.steps.push({
      stepId: createId("step"),
      role: "executor",
      model: midProfile.id,
      tier: midProfile.tier,
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
      modelsUsed: [cheapProfile.id, midProfile.id],
      escalated: true,
      latencyMs: firstResponse.latencyMs + secondResponse.latencyMs,
      costUnits: firstResponse.costUnits + secondResponse.costUnits,
      confidence: secondEval.score,
    };
  }
}
