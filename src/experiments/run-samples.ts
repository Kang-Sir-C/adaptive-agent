/**
 * Sample experiment runner.
 *
 * Loads every JSON file in ./samples, executes it through the Orchestrator,
 * and prints a small comparison table. Each run writes a trace to ./traces/.
 *
 * Usage:
 *   npm run exp:samples
 *   AA_MOCK_CHEAP_FAIL=true npm run exp:samples   # exercise escalation paths
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";
import type { RunRequest } from "../models/schemas/run.js";
import { createId } from "../utils/ids.js";

type SampleFile = {
  name: string;
  description?: string;
  expected?: {
    workflow?: string;
    modelTier?: string;
  };
  request: Omit<RunRequest, "runId" | "sessionId"> & {
    runId?: string;
    sessionId?: string;
  };
};

const samplesDir = path.resolve(process.cwd(), "samples");

async function loadSamples(): Promise<SampleFile[]> {
  const entries = await fs.readdir(samplesDir);
  const sampleFiles = entries.filter((entry) => entry.endsWith(".json")).sort();
  const samples: SampleFile[] = [];
  for (const file of sampleFiles) {
    const content = await fs.readFile(path.join(samplesDir, file), "utf8");
    let parsed: SampleFile;
    try {
      parsed = JSON.parse(content) as SampleFile;
    } catch (error) {
      console.warn(`Skipping ${file}: invalid JSON (${(error as Error).message})`);
      continue;
    }
    if (!parsed || typeof parsed !== "object" || !("request" in parsed)) {
      console.warn(`Skipping ${file}: missing "request" field`);
      continue;
    }
    samples.push(parsed);
  }
  return samples;
}

async function main() {
  const orchestrator = new Orchestrator();
  const samples = await loadSamples();

  const rows: Array<Record<string, string | number | boolean>> = [];
  for (const sample of samples) {
    const runId = createId("run");
    const sessionId = sample.request.sessionId ?? createId("session");
    const request: RunRequest = {
      ...sample.request,
      runId,
      sessionId,
    } as RunRequest;

    const startedAt = Date.now();
    try {
      const result = await orchestrator.run(request);
      const wallMs = Date.now() - startedAt;
      const expectedWorkflow = sample.expected?.workflow;
      const expectedTier = sample.expected?.modelTier;
      const workflowMatch = expectedWorkflow ? result.meta.workflow === expectedWorkflow : true;
      const tierMatch = expectedTier ? result.meta.tier === expectedTier : true;

      rows.push({
        sample: sample.name,
        workflow: result.meta.workflow,
        expected_workflow: expectedWorkflow ?? "-",
        workflow_match: workflowMatch,
        tier: result.meta.tier ?? "-",
        expected_tier: expectedTier ?? "-",
        tier_match: tierMatch,
        models: result.meta.modelsUsed.join(","),
        escalated: result.meta.escalated,
        cost: Number(result.meta.costUnits.toFixed(3)),
        latency_ms: result.meta.latencyMs,
        wall_ms: wallMs,
        confidence: Number((result.meta.confidence ?? 0).toFixed(3)),
        run_id: runId,
      });
    } catch (error) {
      rows.push({
        sample: sample.name,
        workflow: "error",
        expected_workflow: sample.expected?.workflow ?? "-",
        workflow_match: false,
        tier: "-",
        expected_tier: sample.expected?.modelTier ?? "-",
        tier_match: false,
        models: "-",
        escalated: false,
        cost: 0,
        latency_ms: 0,
        wall_ms: Date.now() - startedAt,
        confidence: 0,
        run_id: runId,
        error: (error as Error).message,
      });
    }
  }

  console.log(`Ran ${rows.length} samples.`);
  console.table(rows);

  const mismatches = rows.filter((row) => row.workflow_match === false || row.tier_match === false);
  if (mismatches.length > 0) {
    console.warn(`\n${mismatches.length} samples did not match expectations.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
