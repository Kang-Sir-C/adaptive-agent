import type { RunContext } from "../orchestrator/run-context.js";
import type { WorkflowResult } from "../../models/schemas/workflow.js";

export interface Workflow {
  name: string;
  execute(context: RunContext): Promise<WorkflowResult>;
}
