import type { RunRequest, RunResult } from "./run.js";
import type { ModelProfile } from "../profiles/model-profiles.js";
import type { RunTrace } from "./trace.js";

export type RunApiRequest = Omit<RunRequest, "runId" | "sessionId"> & {
  runId?: string;
  sessionId?: string;
};

export type RunApiResponse = RunResult;

export type TraceApiResponse = RunTrace | { error: string };

export type ModelsApiResponse = {
  models: ModelProfile[];
};
