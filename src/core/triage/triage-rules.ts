import type { RunRequest } from "../../models/schemas/run.js";
import type { TaskAssessment, TaskType, WorkflowName } from "../../models/schemas/triage.js";
import { routingConfig } from "../../config/routing.js";

export class TriageRules {
  assess(request: RunRequest): TaskAssessment {
    const input = request.userInput.toLowerCase();
    const hasCode = Boolean(request.context?.selectedText || request.context?.currentFile?.content);
    const hasDocs = Boolean(request.context?.retrievedDocs?.length);
    // review is a mode/explicit intent; keyword-only matches are treated as hints, not commitment
    const reviewHint = routingConfig.reviewKeywords.some((keyword) => input.includes(keyword));
    const isReviewMode = request.mode === "review";
    const isCodeEdit = routingConfig.codeEditKeywords.some((keyword) => input.includes(keyword)) || request.mode === "code";
    const isHighRisk = routingConfig.highRiskKeywords.some((keyword) => input.includes(keyword));

    const taskType: TaskType = isReviewMode
      ? "review"
      : hasDocs
        ? "doc_qa"
        : isCodeEdit && hasCode
          ? "code_edit"
          : isCodeEdit
            ? "code_generate"
            : reviewHint
              ? "review"
              : "chat";

    const complexity = input.length > routingConfig.longInputThreshold || (hasCode && request.context?.relatedFiles?.length)
      ? "high"
      : input.length > routingConfig.shortInputThreshold || hasCode || hasDocs
        ? "medium"
        : "low";

    // Risk only escalates on explicit high-risk signals. Review tasks are not automatically medium risk.
    const risk = isHighRisk ? "high" : "low";

    // Workflow selection order matters:
    // 1. High risk -> cheap_first (escalate on failure) because we want cheap validation first, then stronger model
    // 2. Compare requested and complexity allows -> compare
    // 3. High complexity -> cheap_first
    // 4. Medium complexity -> cheap_first
    // 5. Otherwise -> direct
    let workflow: WorkflowName = "direct";
    const parallelAllowed = request.preferences?.allowParallel ?? false;
    if (risk === "high") {
      workflow = "cheap_first";
    } else if (parallelAllowed && (taskType === "review" || complexity !== "low")) {
      workflow = "compare";
    } else if (complexity === "high") {
      workflow = "cheap_first";
    } else if (complexity === "medium") {
      workflow = "cheap_first";
    }

    return {
      taskType,
      complexity,
      risk,
      needsTools: taskType === "code_edit" || taskType === "code_generate",
      needsRetrieval: hasDocs,
      needsLongContext: complexity === "high",
      needsStructuredOutput: taskType === "review",
      workflow,
      modelTier: complexity === "low" ? "cheap" : complexity === "medium" ? "mid" : "premium",
      confidence: this.scoreConfidence({ hasCode, hasDocs, isHighRisk, isCodeEdit, isReviewMode, inputLength: input.length }),
      reasons: [
        `taskType=${taskType}`,
        `complexity=${complexity}`,
        `risk=${risk}`,
        `workflow=${workflow}`,
        parallelAllowed ? "parallel=allowed" : "parallel=denied",
      ],
    };
  }

  /**
   * Confidence reflects how many independent signals agreed on the decision.
   * More signals present -> higher confidence. Ambiguous chat requests stay lower.
   */
  private scoreConfidence(signals: {
    hasCode: boolean;
    hasDocs: boolean;
    isHighRisk: boolean;
    isCodeEdit: boolean;
    isReviewMode: boolean;
    inputLength: number;
  }): number {
    let score = 0.5;
    if (signals.hasCode) score += 0.1;
    if (signals.hasDocs) score += 0.1;
    if (signals.isHighRisk) score += 0.1;
    if (signals.isCodeEdit) score += 0.05;
    if (signals.isReviewMode) score += 0.05;
    if (signals.inputLength > 40) score += 0.05;
    return Math.min(0.95, Number(score.toFixed(2)));
  }
}
