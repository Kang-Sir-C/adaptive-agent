import type { RunRequest } from "../../models/schemas/run.js";
import type { TaskAssessment, TaskType, WorkflowName, Complexity, RiskLevel, ModelTier } from "../../models/schemas/triage.js";
import {
  LENGTH_THRESHOLDS,
  CODE_EDIT_SIGNALS,
  CODE_GENERATE_SIGNALS,
  REVIEW_SIGNALS,
  ANALYSIS_SIGNALS,
  DEBUG_SIGNALS,
  HIGH_COMPLEXITY_PATTERNS,
  MEDIUM_COMPLEXITY_PATTERNS,
  RISK_ACTION_VERBS,
  RISK_TARGET_NOUNS,
  RISK_STANDALONE,
} from "../../config/routing.js";

export class TriageRules {
  assess(request: RunRequest): TaskAssessment {
    const input = request.userInput;
    const lower = input.toLowerCase();
    const hasCode = Boolean(request.context?.selectedText || request.context?.currentFile?.content);
    const hasDocs = Boolean(request.context?.retrievedDocs?.length);
    const hasRelatedFiles = Boolean(request.context?.relatedFiles?.length);

    // ─── Task Type ──────────────────────────────────────────────────────
    const taskType = this.inferTaskType(request.mode, lower, hasCode, hasDocs);

    // ─── Complexity ─────────────────────────────────────────────────────
    const complexity = this.inferComplexity(input, lower, hasCode, hasRelatedFiles);

    // ─── Risk ───────────────────────────────────────────────────────────
    const risk = this.inferRisk(lower);

    // ─── Workflow ───────────────────────────────────────────────────────
    const parallelAllowed = request.preferences?.allowParallel ?? false;
    const workflow = this.selectWorkflow(taskType, complexity, risk, parallelAllowed);

    // ─── Model Tier ─────────────────────────────────────────────────────
    const modelTier = this.selectTier(complexity, risk, taskType);

    // ─── Confidence ─────────────────────────────────────────────────────
    const confidence = this.scoreConfidence({
      hasCode, hasDocs, hasRelatedFiles,
      inputLength: input.length,
      taskType, complexity, risk,
    });

    const reasons = [
      `taskType=${taskType}`,
      `complexity=${complexity}`,
      `risk=${risk}`,
      `workflow=${workflow}`,
      `tier=${modelTier}`,
      parallelAllowed ? "parallel=allowed" : "parallel=denied",
    ];

    return {
      taskType,
      complexity,
      risk,
      needsTools: taskType === "code_edit" || taskType === "code_generate" || taskType === "debug",
      needsRetrieval: hasDocs,
      needsLongContext: complexity === "high",
      needsStructuredOutput: taskType === "review",
      workflow,
      modelTier,
      confidence,
      reasons,
    };
  }

  // ─── Task Type Inference ────────────────────────────────────────────────

  private inferTaskType(
    mode: string,
    lower: string,
    hasCode: boolean,
    hasDocs: boolean,
  ): TaskType {
    // Explicit mode from the client takes priority
    if (mode === "review") return "review";

    // Check signals in priority order (most specific first)
    if (this.matchesAny(lower, DEBUG_SIGNALS)) return "debug";
    if (mode === "code" || this.matchesAny(lower, CODE_EDIT_SIGNALS)) {
      return hasCode ? "code_edit" : "code_generate";
    }
    if (this.matchesAny(lower, CODE_GENERATE_SIGNALS)) return "code_generate";
    if (this.matchesAny(lower, REVIEW_SIGNALS)) return "review";
    if (this.matchesAny(lower, ANALYSIS_SIGNALS)) return "analysis";
    if (hasDocs) return "doc_qa";

    // Code blocks in the input suggest code task even without keywords
    if (/```[\s\S]*```/.test(lower) || (hasCode && lower.length > 60)) {
      return "code_edit";
    }

    return "chat";
  }

  // ─── Complexity Inference ───────────────────────────────────────────────

  private inferComplexity(
    input: string,
    lower: string,
    hasCode: boolean,
    hasRelatedFiles: boolean,
  ): Complexity {
    // Structural signals override length
    const highStructural = HIGH_COMPLEXITY_PATTERNS.some((p) => p.test(input));
    if (highStructural) return "high";

    // Long input is a strong signal
    if (input.length > LENGTH_THRESHOLDS.long) return "high";

    // Code context + related files = multi-file task
    if (hasCode && hasRelatedFiles) return "high";

    // Medium structural signals
    const mediumStructural = MEDIUM_COMPLEXITY_PATTERNS.some((p) => p.test(input));
    if (mediumStructural) return "medium";

    // Medium length
    if (input.length > LENGTH_THRESHOLDS.medium) return "medium";

    // Code context alone bumps to medium
    if (hasCode) return "medium";

    // Short input with no special signals
    if (input.length > LENGTH_THRESHOLDS.short) return "medium";

    return "low";
  }

  // ─── Risk Inference ─────────────────────────────────────────────────────

  private inferRisk(lower: string): RiskLevel {
    // Standalone dangerous commands are always high risk
    if (RISK_STANDALONE.some((phrase) => lower.includes(phrase))) return "high";

    // Action + Target co-occurrence = high risk
    const hasAction = RISK_ACTION_VERBS.some((verb) => lower.includes(verb));
    const hasTarget = RISK_TARGET_NOUNS.some((noun) => lower.includes(noun));
    if (hasAction && hasTarget) return "high";

    // Target noun alone without action verb = medium (informational query about sensitive topic)
    if (hasTarget) return "medium";

    return "low";
  }

  // ─── Workflow Selection ─────────────────────────────────────────────────

  private selectWorkflow(
    taskType: TaskType,
    complexity: Complexity,
    risk: RiskLevel,
    parallelAllowed: boolean,
  ): WorkflowName {
    // High risk: always cheap_first so we get cheap validation before committing
    if (risk === "high") return "cheap_first";

    // Compare: only when parallel allowed and task is non-trivial
    if (parallelAllowed && complexity !== "low") return "compare";
    if (parallelAllowed && taskType === "review") return "compare";

    // Complex or medium tasks: cheap_first for cost efficiency
    if (complexity === "high" || complexity === "medium") return "cheap_first";

    // Simple tasks: direct
    return "direct";
  }

  // ─── Tier Selection ─────────────────────────────────────────────────────

  private selectTier(complexity: Complexity, risk: RiskLevel, taskType: TaskType): ModelTier {
    // High risk + high complexity = premium (we need the best judgment)
    if (risk === "high" && complexity === "high") return "premium";

    // Analysis and review benefit from stronger models even at medium complexity
    if ((taskType === "analysis" || taskType === "review") && complexity !== "low") return "mid";

    // Standard mapping
    if (complexity === "high") return "premium";
    if (complexity === "medium") return "mid";
    return "cheap";
  }

  // ─── Confidence Scoring ─────────────────────────────────────────────────

  private scoreConfidence(signals: {
    hasCode: boolean;
    hasDocs: boolean;
    hasRelatedFiles: boolean;
    inputLength: number;
    taskType: TaskType;
    complexity: Complexity;
    risk: RiskLevel;
  }): number {
    // More independent signals agreeing = higher confidence
    let score = 0.5;
    if (signals.hasCode) score += 0.1;
    if (signals.hasDocs) score += 0.1;
    if (signals.hasRelatedFiles) score += 0.05;
    if (signals.risk === "high") score += 0.1;
    if (signals.taskType !== "chat") score += 0.05; // non-chat means we matched something
    if (signals.inputLength > LENGTH_THRESHOLDS.medium) score += 0.05;
    // Ambiguous short chat = lowest confidence
    if (signals.taskType === "chat" && signals.complexity === "low") score = 0.45;
    return Math.min(0.95, Number(score.toFixed(2)));
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private matchesAny(text: string, signals: readonly string[]): boolean {
    return signals.some((signal) => text.includes(signal));
  }
}
