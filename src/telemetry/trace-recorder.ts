import type { RunTrace, TraceStep } from "../models/schemas/trace.js";

export class TraceRecorder {
  addStep(trace: RunTrace, step: TraceStep): void {
    trace.steps.push(step);
  }

  finalize(
    trace: RunTrace,
    result: {
      answer: string;
      modelsUsed: string[];
      escalated: boolean;
      latencyMs: number;
      costUnits: number;
    },
  ): RunTrace {
    trace.finalResult = {
      answerPreview: result.answer.slice(0, 240),
      modelsUsed: result.modelsUsed,
      escalated: result.escalated,
      latencyMs: result.latencyMs,
      costUnits: result.costUnits,
    };
    return trace;
  }
}
