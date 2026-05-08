import type { ModelProfile } from "../models/profiles/model-profiles.js";

/**
 * Model profiles used by BrokerProvider to pick by tier and task strengths.
 *
 * ⚠️ IMPORTANT: The `id` values below are PLACEHOLDERS for mock mode.
 * When you enable a real provider (`AA_PROVIDER_ENABLED=true`), every `id`
 * here must match a model name your broker actually accepts, otherwise the
 * HTTP call will fail with 404 / unknown_model.
 *
 * Typical mapping when switching to a real OpenAI-compatible broker:
 *   cheap tier  -> deepseek-chat, qwen-turbo, gpt-4o-mini, etc.
 *   mid tier    -> claude-3-5-sonnet, gpt-4o, etc.
 *   premium tier-> claude-opus-4, gpt-4-turbo, etc.
 *
 * Also remember to set AA_JUDGE_MODEL in .env to a real model id.
 */
export const modelProfiles: ModelProfile[] = [
  {
    id: "qwen3-coder-next",
    label: "Qwen3 Coder Next",
    tier: "cheap",
    multiplier: 0.05,
    avgLatencyMs: 1200,
    availability: 0.95,
    stability: 0.72,
    supportsStructuredOutput: true,
    supportsTools: false,
    strengths: {
      chat: 0.62,
      doc_qa: 0.6,
      code_generate: 0.78,
      code_edit: 0.8,
      debug: 0.68,
      review: 0.61,
      analysis: 0.64,
    },
  },
  {
    id: "deepseek-v3.2",
    label: "Deepseek v3.2",
    tier: "cheap",
    multiplier: 0.25,
    avgLatencyMs: 1500,
    availability: 0.93,
    stability: 0.78,
    supportsStructuredOutput: true,
    supportsTools: false,
    strengths: {
      chat: 0.72,
      doc_qa: 0.73,
      code_generate: 0.76,
      code_edit: 0.74,
      debug: 0.75,
      review: 0.69,
      analysis: 0.77,
    },
  },
  {
    id: "sonnet-4.6",
    label: "Sonnet 4.6",
    tier: "mid",
    multiplier: 1.3,
    avgLatencyMs: 2600,
    availability: 0.97,
    stability: 0.9,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.88,
      doc_qa: 0.88,
      code_generate: 0.9,
      code_edit: 0.91,
      debug: 0.89,
      review: 0.88,
      analysis: 0.87,
    },
  },
  {
    id: "opus-4.6",
    label: "Opus 4.6",
    tier: "premium",
    multiplier: 2.2,
    avgLatencyMs: 4200,
    availability: 0.95,
    stability: 0.94,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.94,
      doc_qa: 0.93,
      code_generate: 0.93,
      code_edit: 0.94,
      debug: 0.95,
      review: 0.94,
      analysis: 0.95,
    },
  },
];
