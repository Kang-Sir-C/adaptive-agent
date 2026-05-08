import type { CandidateResult } from "../../models/schemas/workflow.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import type { JudgeDecision } from "./evaluation-types.js";

export class JudgeEvaluator {
  constructor(private readonly provider: BrokerProvider) {}

  async judge(candidates: CandidateResult[], prompt: string): Promise<JudgeDecision> {
    const validCandidates = candidates.filter((candidate) => candidate.valid);
    const targetCandidates = validCandidates.length > 0 ? validCandidates : candidates;

    const response = await this.provider.judge({
      model: this.provider.getJudgeModel(),
      prompt,
      candidates: targetCandidates.map((candidate) => ({
        id: candidate.candidateId,
        answer: candidate.answer,
      })),
    });

    return {
      winner: response.winner,
      confidence: response.confidence,
      reasons: response.reasons,
      scores: response.scores ?? Object.fromEntries(targetCandidates.map((candidate) => [candidate.candidateId, candidate.answer.length / 100])),
    };
  }
}
