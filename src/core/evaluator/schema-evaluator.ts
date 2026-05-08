import type { EvaluatorInput } from "./evaluation-types.js";

export type SchemaSignal = {
  passed: boolean;
  reasons: string[];
  isJson: boolean;
  jsonValid?: boolean;
  length: number;
};

export class SchemaEvaluator {
  /**
   * Structural validity checks.
   * - Non-empty output
   * - If the assessment expects structured output, attempt to parse JSON and report validity
   */
  evaluate(input: EvaluatorInput): SchemaSignal {
    const trimmed = input.answer.trim();
    const length = trimmed.length;
    const reasons: string[] = [];

    if (length === 0) {
      return { passed: false, reasons: ["empty output"], isJson: false, length };
    }

    const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    let jsonValid: boolean | undefined;
    if (input.assessment?.needsStructuredOutput || looksJson) {
      try {
        JSON.parse(trimmed);
        jsonValid = true;
      } catch {
        jsonValid = false;
      }
    }

    if (input.assessment?.needsStructuredOutput && jsonValid === false) {
      reasons.push("structured output expected but JSON parse failed");
      return { passed: false, reasons, isJson: looksJson, jsonValid, length };
    }

    return { passed: true, reasons, isJson: looksJson, jsonValid, length };
  }
}
