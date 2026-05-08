import type { EvaluatorInput } from "./evaluation-types.js";

export type RuleSignal = {
  passed: boolean;
  reasons: string[];
  minLengthOk: boolean;
  notRefusal: boolean;
  notTruncated: boolean;
};

// Lightweight, language-agnostic heuristics. Intentionally simple so they are
// stable and predictable during routing experiments. A future version can
// swap this for a learned classifier without changing the call sites.
const REFUSAL_PATTERNS = [
  "i cannot",
  "i can't help",
  "i am unable",
  "as an ai",
  "sorry, i cannot",
];

const TRUNCATION_PATTERNS = [
  /\.\.\.$/,
  /\[truncated\]$/i,
];

export class RuleEvaluator {
  evaluate(input: EvaluatorInput): RuleSignal {
    const trimmed = input.answer.trim();
    const lower = trimmed.toLowerCase();
    const reasons: string[] = [];

    const minLength = input.assessment?.taskType === "chat" ? 8 : 20;
    const minLengthOk = trimmed.length >= minLength;
    if (!minLengthOk) reasons.push(`output shorter than ${minLength} chars`);

    const notRefusal = !REFUSAL_PATTERNS.some((pattern) => lower.startsWith(pattern));
    if (!notRefusal) reasons.push("output looks like a refusal");

    const notTruncated = !TRUNCATION_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (!notTruncated) reasons.push("output appears truncated");

    return {
      passed: minLengthOk && notRefusal && notTruncated,
      reasons,
      minLengthOk,
      notRefusal,
      notTruncated,
    };
  }
}
