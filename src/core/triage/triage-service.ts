import type { RunRequest } from "../../models/schemas/run.js";
import type { TaskAssessment } from "../../models/schemas/triage.js";
import type { TriageExplanation } from "./triage-types.js";
import { TriageRules } from "./triage-rules.js";

export class TriageService {
  constructor(private readonly rules = new TriageRules()) {}

  assess(request: RunRequest): { assessment: TaskAssessment; explanation: TriageExplanation } {
    const assessment = this.rules.assess(request);

    return {
      assessment,
      explanation: {
        summary: `Detected ${assessment.taskType} task, routed to ${assessment.workflow}.`,
        factors: assessment.reasons,
      },
    };
  }
}
