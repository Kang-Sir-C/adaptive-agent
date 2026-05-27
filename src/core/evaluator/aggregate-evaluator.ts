import type { EvaluationResult, EvaluatorInput } from "./evaluation-types.js";
import { SchemaEvaluator } from "./schema-evaluator.js";
import { RuleEvaluator } from "./rule-evaluator.js";

export class AggregateEvaluator {
  constructor(
    private readonly schemaEvaluator = new SchemaEvaluator(),
    private readonly ruleEvaluator = new RuleEvaluator(),
  ) {}

  /**
   * Produce a graded evaluation result so routers can make nuanced decisions.
   * - Schema failures are hard fails (escalate)
   * - Rule failures are soft fails (retry or escalate depending on severity)
   * - Pass scores vary by how many positive signals we collected
   */
  evaluate(input: EvaluatorInput): EvaluationResult {
    const schema = this.schemaEvaluator.evaluate(input);
    const rules = this.ruleEvaluator.evaluate(input);

    const reasons = [...schema.reasons, ...rules.reasons];

    if (!schema.passed) {
      return {
        passed: false,
        score: 0.2,
        reasons: reasons.length > 0 ? reasons : ["schema evaluation failed"],
        signals: {
          schema: false,
          rules: rules.passed,
          jsonValid: schema.jsonValid,
          length: schema.length,
          notRefusal: rules.notRefusal,
          notTruncated: rules.notTruncated,
          taskSpecificOk: rules.taskSpecificOk,
        },
        recommendedAction: "escalate",
      };
    }

    if (!rules.passed) {
      // Determine severity: refusal/truncation are hard fails, task-specific
      // issues are softer (the model tried but output quality is insufficient)
      const hardFail = !rules.notRefusal || !rules.notTruncated;
      const severity = hardFail ? "escalate" : !rules.taskSpecificOk ? "escalate" : "retry";
      const score = hardFail ? 0.3 : 0.45;
      return {
        passed: false,
        score,
        reasons: reasons.length > 0 ? reasons : ["rule evaluation failed"],
        signals: {
          schema: true,
          rules: false,
          jsonValid: schema.jsonValid,
          length: schema.length,
          notRefusal: rules.notRefusal,
          notTruncated: rules.notTruncated,
          taskSpecificOk: rules.taskSpecificOk,
        },
        recommendedAction: severity,
      };
    }

    // Graduated pass score. More positive signals = higher confidence.
    let score = 0.75;
    if (schema.jsonValid === true) score += 0.1;
    if (schema.length > 200) score += 0.05;
    if (rules.taskSpecificOk) score += 0.05;

    return {
      passed: true,
      score: Math.min(0.95, score),
      reasons: ["evaluation passed"],
      signals: {
        schema: true,
        rules: true,
        jsonValid: schema.jsonValid,
        length: schema.length,
        notRefusal: rules.notRefusal,
        notTruncated: rules.notTruncated,
        taskSpecificOk: rules.taskSpecificOk,
      },
      recommendedAction: "accept",
    };
  }
}
