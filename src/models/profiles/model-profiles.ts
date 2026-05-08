import type { ModelTier, TaskType } from "../schemas/triage.js";

export type ModelProfile = {
  id: string;
  label: string;
  tier: ModelTier;
  multiplier: number;
  avgLatencyMs: number;
  availability: number;
  stability: number;
  strengths: Record<TaskType, number>;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
};
