/**
 * Routing configuration.
 *
 * These thresholds and keyword lists drive the rule-based triage. They are
 * intentionally exposed as a single config object so you can tune them from
 * one place without touching the triage logic itself.
 */

// ─── Input length thresholds ────────────────────────────────────────────────
// These are measured on the LAST USER MESSAGE only (after the bridge fix).
export const LENGTH_THRESHOLDS = {
  /** Below this: likely a simple question or command */
  short: 120,
  /** Above this: likely a multi-part or detailed request */
  medium: 500,
  /** Above this: almost certainly a complex task */
  long: 1500,
} as const;

// ─── Task type signals ──────────────────────────────────────────────────────
// Each list is checked against the lowercased last user message.

export const CODE_EDIT_SIGNALS = [
  "refactor", "fix", "edit", "modify", "patch", "rewrite",
  "重构", "修改", "修复", "改写", "优化这段",
] as const;

export const CODE_GENERATE_SIGNALS = [
  "write a function", "write a script", "implement", "create a class",
  "写一个函数", "写一个脚本", "实现一个", "创建一个类", "帮我写",
  "generate code", "code for", "写代码",
] as const;

export const REVIEW_SIGNALS = [
  "review", "audit", "critique", "assess", "evaluate",
  "审查", "评审", "评估", "分析这段代码",
] as const;

export const ANALYSIS_SIGNALS = [
  "analyze", "explain why", "compare", "what are the tradeoffs",
  "分析", "解释为什么", "对比", "权衡", "优缺点",
  "pros and cons", "architecture", "design",
] as const;

export const DEBUG_SIGNALS = [
  "debug", "error", "bug", "traceback", "exception", "stack trace",
  "报错", "异常", "错误", "调试", "为什么报",
] as const;

// ─── Complexity signals ─────────────────────────────────────────────────────
// Patterns that indicate the request has multiple steps or high cognitive load.

export const HIGH_COMPLEXITY_PATTERNS = [
  /\d+\)\s/,                    // numbered steps: "1) ... 2) ..."
  /step\s*\d/i,                 // "step 1", "step 2"
  /第[一二三四五六七八九十\d]+[步点条]/,  // Chinese numbered steps
  /\band\s+also\b/i,           // compound requests
  /同时.*还要/,                  // Chinese compound
  /\bfirst\b.*\bthen\b/i,     // sequential instructions
  /先.*然后/,                    // Chinese sequential
  /考虑.*兼容/,                  // "consider compatibility"
  /backward.?compat/i,         // backward compatibility
  /migration/i,                // migration tasks are inherently complex
  /迁移/,
] as const;

export const MEDIUM_COMPLEXITY_PATTERNS = [
  /```[\s\S]{50,}/,            // code block > 50 chars
  /\bfunction\b.*\bfunction\b/i, // multiple functions mentioned
  /\bclass\b.*\bmethod\b/i,   // class + method
  /with.*error.?handl/i,      // "with error handling"
  /加上.*错误处理/,
  /\btest\b.*\bcase/i,        // "test cases"
  /单元测试/,
] as const;

// ─── Risk signals ───────────────────────────────────────────────────────────
// Two-tier: action verbs + target nouns. Risk is only HIGH when both an
// action AND a target co-occur, preventing false positives like "learn about
// security" or "what is a database".

export const RISK_ACTION_VERBS = [
  "delete", "drop", "remove", "modify", "update", "change", "alter",
  "deploy", "push to", "migrate", "grant", "revoke",
  "删除", "修改", "部署", "推送", "迁移", "授权", "撤销",
] as const;

export const RISK_TARGET_NOUNS = [
  "production", "prod", "database", "db", "permission", "auth",
  "credentials", "secret", "token", "config", "firewall", "ssl",
  "certificate", "dns", "user data", "pii",
  "生产", "数据库", "权限", "认证", "密钥", "证书", "用户数据",
] as const;

// Standalone high-risk phrases that don't need action+target pairing
export const RISK_STANDALONE = [
  "rm -rf", "drop table", "truncate table", "format c:",
  "force push", "git push -f", "--no-verify",
  "sudo rm", "chmod 777",
] as const;

// ─── Workflow routing ────────────────────────────────────────────────────────
export const WORKFLOW_CONFIG = {
  /** Compare is only triggered when parallel is allowed AND these conditions */
  compareMinComplexity: "medium" as const,
  /** Maximum conversation turns to keep in the prompt (from OpenAI bridge) */
  maxConversationTurns: 6,
} as const;
