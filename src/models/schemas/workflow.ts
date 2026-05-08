import type { RunArtifactBundle } from "./run.js";
import type { ModelTier, WorkflowName } from "./triage.js";

export type CandidateResult = {
  candidateId: string;
  model: string;
  tier: ModelTier;
  answer: string;
  latencyMs: number;
  costUnits: number;
  valid: boolean;
  raw?: unknown;
};

export type WorkflowResult = {
  workflow: WorkflowName;
  answer: string;
  artifacts?: RunArtifactBundle;
  modelsUsed: string[];
  escalated: boolean;
  latencyMs: number;
  costUnits: number;
  confidence?: number;
  winningCandidateId?: string;
  candidates?: CandidateResult[];
};
