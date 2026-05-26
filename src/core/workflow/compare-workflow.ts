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

    // Use Promise.allSettled so one model failure doesn't kill the whole compare
    const [settledA, settledB] = await Promise.allSettled([
      this.provider.generate({ model: modelA.id, prompt: context.executionPrompt, taskType: assessment.taskType }),
      this.provider.generate({ model: modelB.id, prompt: context.executionPrompt, taskType: assessment.taskType }),
    ]);

    const responseA = settledA.status === "fulfilled" ? settledA.value : null;
    const responseB = settledB.status === "fulfilled" ? settledB.value : null;

    // If both failed, throw so orchestrator can handle it
    if (!responseA && !responseB) {
      const errorA = settledA.status === "rejected" ? (settledA.reason as Error).message : "unknown";
      const errorB = settledB.status === "rejected" ? (settledB.reason as Error).message : "unknown";
      throw new Error(`Both compare candidates failed: A=${errorA}, B=${errorB}`);
    }

    // Build candidates from successful responses
    const candidates: CandidateResult[] = [];

    if (responseA) {
      const evalA = this.evaluator.evaluate({ answer: responseA.answer, assessment });
      candidates.push({
        candidateId: "candidate_a",
        model: modelA.id,
        tier: modelA.tier,
        answer: responseA.answer,
        latencyMs: responseA.latencyMs,
        costUnits: responseA.costUnits,
        valid: evalA.passed,
        raw: responseA.raw,
      });
    }

    if (responseB) {
      const evalB = this.evaluator.evaluate({ answer: responseB.answer, assessment });
      candidates.push({
        candidateId: "candidate_b",
        model: modelB.id,
        tier: modelB.tier,
        answer: responseB.answer,
        latencyMs: responseB.latencyMs,
        costUnits: responseB.costUnits,
        valid: evalB.passed,
        raw: responseB.raw,
      });
    }

    context.intermediate.candidates = candidates;

    // If only one candidate survived, skip judge and return it directly
    if (candidates.length === 1) {
      const sole = candidates[0];
      context.trace.steps.push({
        stepId: createId("step"),
        role: "executor",
        model: sole.model,
        tier: sole.tier,
        latencyMs: sole.latencyMs,
        costUnits: sole.costUnits,
        outputValid: sole.valid,
        notes: ["only surviving candidate (other failed)"],
      });
      return {
        workflow: this.name,
        answer: sole.answer,
        modelsUsed: [sole.model],
        escalated: false,
        latencyMs: sole.latencyMs,
        costUnits: sole.costUnits,
        confidence: sole.valid ? 0.7 : 0.4,
        winningCandidateId: sole.candidateId,
        candidates,
      };
    }

    // Both candidates available — run judge
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

    const totalCost = candidates.reduce((sum, c) => sum + c.costUnits, 0);
    const maxLatency = Math.max(...candidates.map((c) => c.latencyMs));

    return {
      workflow: this.name,
      answer: winner.answer,
      modelsUsed: [modelA.id, modelB.id, this.provider.getJudgeModel()],
      escalated: false,
      latencyMs: maxLatency,
      costUnits: totalCost,
      confidence: decision.confidence,
      winningCandidateId: winner.candidateId,
      candidates,
    };
  }
}
