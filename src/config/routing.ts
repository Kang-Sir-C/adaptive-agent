export const routingConfig = {
  shortInputThreshold: 240,
  longInputThreshold: 1800,
  compareAllowedModes: ["chat", "review"] as const,
  highRiskKeywords: ["production", "database", "permission", "security", "auth", "config"],
  codeEditKeywords: ["refactor", "fix", "edit", "modify", "patch", "rewrite"],
  reviewKeywords: ["review", "judge", "compare", "audit", "assess"],
};
