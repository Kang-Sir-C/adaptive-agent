export type TaskType =
  | "chat"
  | "doc_qa"
  | "code_generate"
  | "code_edit"
  | "debug"
  | "review"
  | "analysis";

export type Complexity = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";
export type WorkflowName = "direct" | "cheap_first" | "compare" | "plan_execute" | "plan_execute_review";
export type ModelTier = "cheap" | "mid" | "premium";

export type TaskAssessment = {
  taskType: TaskType;
  complexity: Complexity;
  risk: RiskLevel;
  needsTools: boolean;
  needsRetrieval: boolean;
  needsLongContext: boolean;
  needsStructuredOutput: boolean;
  workflow: WorkflowName;
  modelTier: ModelTier;
  confidence: number;
  reasons: string[];
};
