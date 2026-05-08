import type { TaskAssessment } from "../../models/schemas/triage.js";

export type EvaluationSignals = {
  schema?: boolean;
  rules?: boolean;
  judge?: number;
  jsonValid?: boolean;
  length?: number;
  notRefusal?: boolean;
  notTruncated?: boolean;
};

export type EvaluationResult = {
  passed: boolean;
  score: number;
  reasons: string[];
  signals: EvaluationSignals;
  recommendedAction?: "accept" | "retry" | "escalate" | "fallback";
};

export type JudgeDecision = {
  winner: string;
  confidence: number;
  reasons: string[];
  scores: Record<string, number>;
};

export type EvaluatorInput = {
  answer: string;
  assessment?: TaskAssessment;
};
