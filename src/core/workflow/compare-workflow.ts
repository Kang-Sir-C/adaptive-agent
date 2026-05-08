import type { CandidateResult, WorkflowResult } from "../../models/schemas/workflow.js";
import type { RunContext } from "../orchestrator/run-context.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";
import { JudgeEvaluator } from "../evaluator/judge-evaluator.js";
import { createId } from "../../utils/ids.js";
import type { Workflow } from "./workflow.js";

export class CompareWorkflow implements Workflow {
  readonly name = "compare" as const;

  constructor(
    private readonly provider: BrokerProvider,
    private readonly evaluator: AggregateEvaluator,
    private readonly judgeEvaluator: JudgeEvaluator,
  ) {}

  async execute(context: RunContext): Promise<WorkflowResult> {
    const assessment = context.assessment!;
    const [modelA, modelB] = this.provider.pickCompareModels(assessment.taskType);

    const [responseA, responseB] = await Promise.all([
      this.provider.generate({ model: modelA.id, prompt: context.executionPrompt, taskType: assessment.taskType }),
      this.provider.generate({ model: modelB.id, prompt: context.executionPrompt, taskType: assessment.taskType }),
    ]);

    const evalA = this.evaluator.evaluate({ answer: responseA.answer, assessment });
    const evalB = this.evaluator.evaluate({ answer: responseB.answer, assessment });

    const candidates: CandidateResult[] = [
      {
        candidateId: "candidate_a",
        model: modelA.id,
        tier: modelA.tier,
        answer: responseA.answer,
        latencyMs: responseA.latencyMs,
        costUnits: responseA.costUnits,
        valid: evalA.passed,
        raw: responseA.raw,
      },
      {
        candidateId: "candidate_b",
        model: modelB.id,
        tier: modelB.tier,
        answer: responseB.answer,
        latencyMs: responseB.latencyMs,
        costUnits: responseB.costUnits,
        valid: evalB.passed,
        raw: responseB.raw,
      },
    ];

    context.intermediate.candidates = candidates;

    const decision = await this.judgeEvaluator.judge(
      candidates,
      [
        "Compare the candidates for the user request.",
        `Task type: ${assessment.taskType}`,
        context.reviewPrompt,
        "Prefer instruction following, correctness, and useful detail.",
      ].join("\n"),
    );
    const winner = candidates.find((candidate) => candidate.candidateId === decision.winner) ?? candidates[0];

    for (const candidate of candidates) {
      context.trace.steps.push({
        stepId: createId("step"),
        role: "executor",
        model: candidate.model,
        tier: candidate.tier,
        latencyMs: candidate.latencyMs,
        costUnits: candidate.costUnits,
        outputValid: candidate.valid,
        notes: [`candidate=${candidate.candidateId}`],
      });
    }

    context.trace.steps.push({
      stepId: createId("step"),
      role: "judge",
      model: this.provider.getJudgeModel(),
      latencyMs: 0,
      costUnits: 0,
      outputValid: true,
      evaluatorScore: decision.confidence,
      notes: [`winner=${winner.candidateId}`, `winner_model=${winner.model}`, ...decision.reasons],
    });

    return {
      workflow: this.name,
      answer: winner.answer,
      modelsUsed: [modelA.id, modelB.id, this.provider.getJudgeModel()],
      escalated: false,
      latencyMs: Math.max(responseA.latencyMs, responseB.latencyMs),
      costUnits: responseA.costUnits + responseB.costUnits,
      confidence: decision.confidence,
      winningCandidateId: winner.candidateId,
      candidates,
    };
  }
}
