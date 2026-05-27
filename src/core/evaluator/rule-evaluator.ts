import type { EvaluatorInput } from "./evaluation-types.js";
import type { TaskType } from "../../models/schemas/triage.js";

export type RuleSignal = {
  passed: boolean;
  reasons: string[];
  minLengthOk: boolean;
  notRefusal: boolean;
  notTruncated: boolean;
  taskSpecificOk: boolean;
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
  "sorry, but i",
  "i'm not able to",
];

const TRUNCATION_PATTERNS = [
  /\.\.\.$/,
  /\[truncated\]$/i,
  /\[continued\]$/i,
  /\[cut off\]$/i,
];

// Task-specific quality signals. These are intentionally conservative —
// they catch obviously inadequate outputs, not subtle quality issues.
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|^    \S|^\t\S/m;
const STRUCTURED_JUDGMENT_PATTERN = /\b(better|worse|prefer|recommend|suggest|risk|tradeoff|advantage|disadvantage|pros?|cons?|should|优|劣|建议|推荐|风险|权衡)\b/i;
const ACTIONABLE_PATTERN = /\b(try|use|change|replace|add|remove|check|ensure|verify|update|instead|用|改|加|删|检查|确保|替换)\b/i;

function getMinLength(taskType?: TaskType): number {
  switch (taskType) {
    case "code_generate":
    case "code_edit":
      return 30;
    case "review":
      return 80;
    case "analysis":
      return 100;
    case "debug":
      return 40;
    case "doc_qa":
      return 30;
    case "chat":
    default:
      return 8;
  }
}

function checkTaskSpecific(answer: string, taskType?: TaskType): { ok: boolean; reason?: string } {
  const trimmed = answer.trim();

  switch (taskType) {
    case "code_generate":
    case "code_edit":
      // Code tasks should contain actual code
      if (!CODE_BLOCK_PATTERN.test(trimmed) && trimmed.length < 200) {
        return { ok: false, reason: "code task output lacks code block or substantial content" };
      }
      return { ok: true };

    case "review":
      // Review should contain structured judgment, not just a summary
      if (!STRUCTURED_JUDGMENT_PATTERN.test(trimmed)) {
        return { ok: false, reason: "review output lacks evaluative judgment" };
      }
      return { ok: true };

    case "analysis":
      // Analysis should be substantive
      if (trimmed.length < 150 && !STRUCTURED_JUDGMENT_PATTERN.test(trimmed)) {
        return { ok: false, reason: "analysis output too brief and lacks structured reasoning" };
      }
      return { ok: true };

    case "debug":
      // Debug should contain actionable advice or code
      if (!ACTIONABLE_PATTERN.test(trimmed) && !CODE_BLOCK_PATTERN.test(trimmed)) {
        return { ok: false, reason: "debug output lacks actionable suggestion or code fix" };
      }
      return { ok: true };

    default:
      return { ok: true };
  }
}

export class RuleEvaluator {
  evaluate(input: EvaluatorInput): RuleSignal {
    const trimmed = input.answer.trim();
    const lower = trimmed.toLowerCase();
    const reasons: string[] = [];
    const taskType = input.assessment?.taskType;

    // 1. Minimum length check (task-aware)
    const minLength = getMinLength(taskType);
    const minLengthOk = trimmed.length >= minLength;
    if (!minLengthOk) reasons.push(`output shorter than ${minLength} chars for ${taskType ?? "unknown"} task`);

    // 2. Refusal detection
    const notRefusal = !REFUSAL_PATTERNS.some((pattern) => lower.startsWith(pattern));
    if (!notRefusal) reasons.push("output looks like a refusal");

    // 3. Truncation detection
    const notTruncated = !TRUNCATION_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (!notTruncated) reasons.push("output appears truncated");

    // 4. Task-specific quality check
    const taskCheck = checkTaskSpecific(trimmed, taskType);
    const taskSpecificOk = taskCheck.ok;
    if (!taskSpecificOk && taskCheck.reason) reasons.push(taskCheck.reason);

    return {
      passed: minLengthOk && notRefusal && notTruncated && taskSpecificOk,
      reasons,
      minLengthOk,
      notRefusal,
      notTruncated,
      taskSpecificOk,
    };
  }
}
