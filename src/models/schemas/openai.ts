/**
 * Minimal OpenAI chat/completions types.
 * Intentionally scoped to the fields we actually consume or emit, so the
 * proxy stays small. Extra fields on the wire are passed through or ignored.
 */

export type OpenAIRole = "system" | "user" | "assistant" | "tool" | "function";

export type OpenAIMessage = {
  role: OpenAIRole;
  content: string | null;
  name?: string;
};

export type OpenAIChatRequest = {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: { type?: "text" | "json_object" };
  user?: string;
  // Adaptive Agent extension. Clients that know about us can nudge routing.
  // Safe to ignore when absent; standard OpenAI clients never set it.
  metadata?: {
    mode?: "chat" | "code" | "review";
    allow_parallel?: boolean;
    priority?: "speed" | "cost" | "quality" | "balanced";
  };
};

export type OpenAIChatChoice = {
  index: number;
  message: { role: "assistant"; content: string };
  finish_reason: "stop" | "length";
};

export type OpenAIChatResponse = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // Adaptive Agent extension — safe to ignore for standard clients.
  adaptive?: {
    run_id: string;
    workflow: string;
    tier?: string;
    models_used: string[];
    escalated: boolean;
    cost_units: number;
    confidence?: number;
  };
};

export type OpenAIStreamDelta = {
  role?: "assistant";
  content?: string;
};

export type OpenAIStreamChoice = {
  index: number;
  delta: OpenAIStreamDelta;
  finish_reason: null | "stop" | "length";
};

export type OpenAIStreamChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
};

export type OpenAIModelsListItem = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

export type OpenAIModelsListResponse = {
  object: "list";
  data: OpenAIModelsListItem[];
};
