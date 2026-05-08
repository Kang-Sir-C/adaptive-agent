import type { WorkflowName } from "../../models/schemas/triage.js";
import type { BrokerProvider } from "../../providers/broker/broker-provider.js";
import { AggregateEvaluator } from "../evaluator/aggregate-evaluator.js";
import { JudgeEvaluator } from "../evaluator/judge-evaluator.js";
import { CheapFirstWorkflow } from "./cheap-first-workflow.js";
import { CompareWorkflow } from "./compare-workflow.js";
import { DirectWorkflow } from "./direct-workflow.js";
import type { Workflow } from "./workflow.js";

export class WorkflowFactory {
  constructor(private readonly provider: BrokerProvider) {}

  create(name: WorkflowName): Workflow {
    const evaluator = new AggregateEvaluator();

    switch (name) {
      case "compare":
        return new CompareWorkflow(this.provider, evaluator, new JudgeEvaluator(this.provider));
      case "cheap_first":
        return new CheapFirstWorkflow(this.provider, evaluator);
      case "direct":
      default:
        return new DirectWorkflow(this.provider, evaluator);
    }
  }
}
