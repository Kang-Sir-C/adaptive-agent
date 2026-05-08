import type { RunRequest } from "./run.js";
import type { TaskAssessment } from "./triage.js";

export type TraceStep = {
  stepId: string;
  role: "triage" | "executor" | "judge" | "reviewer";
  model?: string;
  tier?: "cheap" | "mid" | "premium";
  latencyMs: number;
  costUnits: number;
  outputValid: boolean;
  evaluatorScore?: number;
  escalated?: boolean;
  notes?: string[];
};

export type RunTrace = {
  runId: string;
  sessionId: string;
  createdAt: string;
  request: Pick<RunRequest, "mode" | "userInput">;
  assessment?: TaskAssessment;
  workflow?: string;
  steps: TraceStep[];
  finalResult?: {
    answerPreview: string;
    modelsUsed: string[];
    escalated: boolean;
    latencyMs: number;
    costUnits: number;
  };
};
