import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
} from "../models/schemas/openai.js";
import type { RunRequest, RunResult } from "../models/schemas/run.js";
import type { WorkflowName } from "../models/schemas/triage.js";
import { modelProfiles } from "../config/models.js";
import { createId } from "../utils/ids.js";

// Pseudo model ids that trigger AA's adaptive routing modes.
// When a client requests one of these, AA picks tier + workflow itself.
const AA_ALIAS_MAP: Record<string, { forceWorkflow?: WorkflowName; description: string }> = {
  "aa-auto": { description: "Let AA triage pick the workflow and tier" },
  "aa-fast": { forceWorkflow: "direct", description: "Single cheap call, no escalation" },
  "aa-reliable": { forceWorkflow: "cheap_first", description: "Cheap first, escalate on failure" },
  "aa-compare": { forceWorkflow: "compare", description: "Parallel two models + judge" },
};

export const AA_ALIASES = Object.keys(AA_ALIAS_MAP);

function resolveRouting(requestedModel: string): { forceModel?: string; forceWorkflow?: WorkflowName } {
  // Three cases:
  // 1. Exact AA alias (aa-auto/fast/reliable/compare) -> let AA pick tier, optionally force workflow
  // 2. Exact real model id from our profiles -> passthrough to that model, no triage-based selection
  // 3. Unknown id -> treat as aa-auto so we don't 404 surprising clients
  if (Object.prototype.hasOwnProperty.call(AA_ALIAS_MAP, requestedModel)) {
    return { forceWorkflow: AA_ALIAS_MAP[requestedModel].forceWorkflow };
  }
  if (modelProfiles.some((profile) => profile.id === requestedModel)) {
    return { forceModel: requestedModel };
  }
  return {};
}

// Heuristics for inferring Adaptive Agent's internal "mode" from the
// OpenAI-style messages. Clients that know about us can pass metadata.mode
// to override, but the default has to be sensible for plain OpenAI clients.
const CODE_MARKERS = /```|\bfunction\s|\bclass\s|\bdef\s|\bimport\s+\w|\bconst\s|\blet\s|=>|\bpublic\s+class/;
const REVIEW_MARKERS = /\breview\b|\baudit\b|\bcritique\b|\bcompare\s+these\b/i;

function inferMode(messages: OpenAIChatRequest["messages"]): RunRequest["mode"] {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  if (REVIEW_MARKERS.test(text)) return "review";
  if (CODE_MARKERS.test(text)) return "code";
  return "chat";
}

function joinMessages(messages: OpenAIChatRequest["messages"]): string {
  // Separate system prompt from conversation. The system prompt is forwarded
  // to the model but should NOT pollute triage (which looks at userInput for
  // keywords and length). We keep the last N user/assistant turns as context
  // so the model has conversation history, but cap it to avoid cost explosion.
  const systemParts: string[] = [];
  const conversationParts: string[] = [];

  for (const m of messages) {
    if (typeof m.content !== "string" || m.content.length === 0) continue;
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      const prefix = m.role === "user" ? "User: " : m.role === "assistant" ? "Assistant: " : `${m.role}: `;
      conversationParts.push(`${prefix}${m.content}`);
    }
  }

  // Keep only the last 6 conversation turns to bound prompt size.
  const recentConversation = conversationParts.slice(-6);

  // System prompt goes first (model needs it), then conversation.
  const parts: string[] = [];
  if (systemParts.length > 0) {
    parts.push(systemParts.join("\n"));
  }
  parts.push(...recentConversation);
  return parts.join("\n\n");
}

/**
 * Extract just the last user message for triage purposes.
 * This avoids system prompt keywords polluting task type detection.
 */
function extractTriageInput(messages: OpenAIChatRequest["messages"]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return lastUser?.content ?? "";
}

export function openAIToRunRequest(body: OpenAIChatRequest): RunRequest {
  const mode = body.metadata?.mode ?? inferMode(body.messages);
  const routing = resolveRouting(body.model);
  // `aa-compare` benefits from allowParallel. Anything else defaults to whatever the caller said.
  const allowParallel = body.metadata?.allow_parallel ?? routing.forceWorkflow === "compare";

  // userInput is what triage reads for keywords/length. Use only the last
  // user message so system prompts don't pollute routing decisions.
  // The full conversation (with system prompt) is passed as context so the
  // model still sees everything it needs.
  const triageInput = extractTriageInput(body.messages);
  const fullPrompt = joinMessages(body.messages);

  return {
    runId: createId("run"),
    sessionId: body.user ?? createId("session"),
    userInput: triageInput,
    mode,
    preferences: {
      allowParallel,
      priority: body.metadata?.priority ?? "balanced",
    },
    // Stash the full prompt (with system + history) in context so the
    // orchestrator's ContextBuilder can use it for the actual model call.
    context: {
      selectedText: fullPrompt !== triageInput ? fullPrompt : undefined,
    },
    ...(routing.forceModel || routing.forceWorkflow ? { routing } : {}),
  };
}

export function runResultToOpenAI(result: RunResult, requestedModel: string): OpenAIChatResponse {
  const answer = result.answer ?? "";
  // Token counts are rough approximations unless providers surface real usage.
  const completionTokens = Math.max(1, Math.ceil(answer.length / 4));
  return {
    id: `chatcmpl-${result.runId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: answer },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: completionTokens,
      total_tokens: completionTokens,
    },
    adaptive: {
      run_id: result.runId,
      workflow: result.meta.workflow,
      tier: result.meta.tier,
      models_used: result.meta.modelsUsed,
      escalated: result.meta.escalated,
      cost_units: result.meta.costUnits,
      confidence: result.meta.confidence,
    },
  };
}

/**
 * Emit a non-streaming answer as a sequence of SSE chunks.
 * We do not actually stream tokens from the upstream provider yet — the
 * provider layer is non-streaming. What we do is split the final answer
 * into small pieces so that streaming clients (Cursor, Cline, Claude Code,
 * etc.) keep working without buffering the whole response.
 */
export function* openAIStreamChunks(result: RunResult, requestedModel: string, chunkSize = 32): Generator<OpenAIStreamChunk> {
  const id = `chatcmpl-${result.runId}`;
  const created = Math.floor(Date.now() / 1000);
  const answer = result.answer ?? "";

  // first chunk carries the role
  yield {
    id,
    object: "chat.completion.chunk",
    created,
    model: requestedModel,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null,
      },
    ],
  };

  for (let i = 0; i < answer.length; i += chunkSize) {
    yield {
      id,
      object: "chat.completion.chunk",
      created,
      model: requestedModel,
      choices: [
        {
          index: 0,
          delta: { content: answer.slice(i, i + chunkSize) },
          finish_reason: null,
        },
      ],
    };
  }

  yield {
    id,
    object: "chat.completion.chunk",
    created,
    model: requestedModel,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };
}
