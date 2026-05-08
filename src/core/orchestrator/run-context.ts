import type { RunRequest, SessionState } from "../../models/schemas/run.js";
import type { TaskAssessment } from "../../models/schemas/triage.js";
import type { RunTrace } from "../../models/schemas/trace.js";
import type { CandidateResult } from "../../models/schemas/workflow.js";
import type { Budget } from "../budget/budget-types.js";

export type RunContext = {
  request: RunRequest;
  sessionState: SessionState;
  /** Prompt for executor roles, already enriched with selected text / current file / related files. */
  executionPrompt: string;
  /** Prompt for reviewer/judge roles when they need the same enriched context. */
  reviewPrompt: string;
  assessment?: TaskAssessment;
  budget: Budget;
  trace: RunTrace;
  intermediate: {
    plan?: unknown;
    candidates?: CandidateResult[];
    review?: unknown;
  };
};
