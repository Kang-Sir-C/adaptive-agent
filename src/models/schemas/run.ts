import type { ModelTier, TaskAssessment, WorkflowName } from "./triage.js";

export type RunMode = "chat" | "code" | "review";

export type FileContext = {
  path: string;
  content: string;
  language?: string;
};

export type RetrievedDocument = {
  id: string;
  title: string;
  content: string;
  source?: string;
};

export type RunRequest = {
  runId: string;
  sessionId: string;
  userInput: string;
  mode: RunMode;
  context?: {
    selectedText?: string;
    currentFile?: FileContext;
    relatedFiles?: FileContext[];
    retrievedDocs?: RetrievedDocument[];
  };
  preferences?: {
    priority?: "speed" | "cost" | "quality" | "balanced";
    allowParallel?: boolean;
    maxLatencyMs?: number;
  };
};

export type RunArtifactBundle = {
  patch?: string;
  json?: unknown;
  citations?: string[];
};

export type RunResult = {
  runId: string;
  answer: string;
  artifacts?: RunArtifactBundle;
  meta: {
    workflow: WorkflowName;
    modelsUsed: string[];
    escalated: boolean;
    latencyMs: number;
    costUnits: number;
    confidence?: number;
    tier?: ModelTier;
  };
};

export type SessionState = {
  sessionId: string;
  userGoal?: string;
  constraints: string[];
  acceptedDecisions: string[];
  rejectedDecisions: string[];
  currentTaskType?: TaskAssessment["taskType"];
  currentStage?: string;
  relevantFacts: string[];
  relatedFiles: string[];
  memoryVersion: number;
};
