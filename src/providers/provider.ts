import type { TaskType } from "../models/schemas/triage.js";

export type GenerateRequest = {
  model: string;
  prompt: string;
  taskType?: TaskType;
  responseFormat?: "text" | "json";
  systemPrompt?: string;
};

export type GenerateResponse = {
  model: string;
  answer: string;
  latencyMs: number;
  costUnits: number;
  raw?: unknown;
};

export type JudgeRequest = {
  model: string;
  prompt: string;
  candidates: Array<{
    id: string;
    answer: string;
  }>;
};

export type JudgeResponse = {
  winner: string;
  confidence: number;
  reasons: string[];
  scores?: Record<string, number>;
  raw?: unknown;
};

export interface ModelProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  classify(request: GenerateRequest): Promise<GenerateResponse>;
  judge(request: JudgeRequest): Promise<JudgeResponse>;
}
