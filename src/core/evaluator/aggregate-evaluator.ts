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
        },
        recommendedAction: "escalate",
      };
    }

    if (!rules.passed) {
      const severity = !rules.notRefusal || !rules.notTruncated ? "escalate" : "retry";
      return {
        passed: false,
        score: 0.45,
        reasons: reasons.length > 0 ? reasons : ["rule evaluation failed"],
        signals: {
          schema: true,
          rules: false,
          jsonValid: schema.jsonValid,
          length: schema.length,
          notRefusal: rules.notRefusal,
          notTruncated: rules.notTruncated,
        },
        recommendedAction: severity,
      };
    }

    // Graduated pass score. Structured output getting valid JSON is a strong signal.
    let score = 0.75;
    if (schema.jsonValid === true) score += 0.1;
    if (schema.length > 200) score += 0.05;

    return {
      passed: true,
      score: Math.min(0.95, score),
      reasons: ["basic evaluation passed"],
      signals: {
        schema: true,
        rules: true,
        jsonValid: schema.jsonValid,
        length: schema.length,
        notRefusal: rules.notRefusal,
        notTruncated: rules.notTruncated,
      },
      recommendedAction: "accept",
    };
  }
}
