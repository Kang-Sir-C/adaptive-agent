import type { ModelProfile } from "../models/profiles/model-profiles.js";

/**
 * Model profiles used by BrokerProvider to pick by tier and task strengths.
 *
 * ⚠️ IMPORTANT: The `id` values below MUST match whatever your broker accepts.
 * When AA_PROVIDER_ENABLED=true, these ids are sent on the wire verbatim. A
 * typo or a model your broker does not expose will return 404 / unknown_model.
 *
 * The defaults here are realistic Anthropic-style ids that work against most
 * OpenAI-compatible relays that proxy Claude. If your broker exposes other
 * models (gpt-4o, deepseek-chat, qwen, ...) replace the ids and the strengths
 * table to match.
 *
 * Remember to also set AA_JUDGE_MODEL in .env to a real id.
 */
export const modelProfiles: ModelProfile[] = [
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    tier: "cheap",
    multiplier: 0.2,
    avgLatencyMs: 1200,
    availability: 0.97,
    stability: 0.85,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.82,
      doc_qa: 0.8,
      code_generate: 0.78,
      code_edit: 0.78,
      debug: 0.76,
      review: 0.75,
      analysis: 0.78,
    },
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    tier: "mid",
    multiplier: 1.0,
    avgLatencyMs: 2400,
    availability: 0.97,
    stability: 0.92,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.9,
      doc_qa: 0.9,
      code_generate: 0.92,
      code_edit: 0.93,
      debug: 0.9,
      review: 0.9,
      analysis: 0.9,
    },
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    tier: "mid",
    multiplier: 1.1,
    avgLatencyMs: 2500,
    availability: 0.96,
    stability: 0.93,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.91,
      doc_qa: 0.91,
      code_generate: 0.93,
      code_edit: 0.94,
      debug: 0.91,
      review: 0.91,
      analysis: 0.91,
    },
  },
  {
    id: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    tier: "premium",
    multiplier: 2.5,
    avgLatencyMs: 3800,
    availability: 0.95,
    stability: 0.94,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.94,
      doc_qa: 0.94,
      code_generate: 0.94,
      code_edit: 0.94,
      debug: 0.95,
      review: 0.95,
      analysis: 0.95,
    },
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    tier: "premium",
    multiplier: 2.6,
    avgLatencyMs: 4000,
    availability: 0.94,
    stability: 0.94,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.95,
      doc_qa: 0.95,
      code_generate: 0.945,
      code_edit: 0.945,
      debug: 0.955,
      review: 0.955,
      analysis: 0.955,
    },
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    tier: "premium",
    multiplier: 2.7,
    avgLatencyMs: 4200,
    availability: 0.93,
    stability: 0.95,
    supportsStructuredOutput: true,
    supportsTools: true,
    strengths: {
      chat: 0.96,
      doc_qa: 0.96,
      code_generate: 0.95,
      code_edit: 0.95,
      debug: 0.96,
      review: 0.96,
      analysis: 0.96,
    },
  },
];
