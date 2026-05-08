/**
 * Trace analysis.
 *
 * Reads every trace JSON file under ./traces and produces aggregate statistics:
 * - total runs
 * - workflow distribution
 * - average cost / latency per workflow
 * - cheap_first escalation rate
 * - compare winner distribution
 * - model usage frequency
 * - judge confidence distribution
 *
 * Usage:
 *   npm run exp:analyze
 *   npm run exp:analyze -- --since 2026-05-01
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RunTrace } from "../models/schemas/trace.js";

const tracesDir = path.resolve(process.cwd(), "traces");

type Bucket = {
  count: number;
  totalCost: number;
  totalLatency: number;
  escalated: number;
};

function emptyBucket(): Bucket {
  return { count: 0, totalCost: 0, totalLatency: 0, escalated: 0 };
}

function parseSinceArg(argv: string[]): Date | null {
  const idx = argv.indexOf("--since");
  if (idx === -1 || idx === argv.length - 1) return null;
  const parsed = Date.parse(argv[idx + 1]);
  if (Number.isNaN(parsed)) {
    console.warn(`Ignoring invalid --since value: ${argv[idx + 1]}`);
    return null;
  }
  return new Date(parsed);
}

async function loadTraces(since: Date | null): Promise<RunTrace[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(tracesDir);
  } catch {
    return [];
  }

  const traces: RunTrace[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(tracesDir, entry), "utf8");
    try {
      const trace = JSON.parse(raw) as RunTrace;
      if (since && trace.createdAt && new Date(trace.createdAt) < since) continue;
      traces.push(trace);
    } catch {
      // ignore malformed trace files
    }
  }
  return traces;
}

function bucketFor<K extends string>(map: Map<K, Bucket>, key: K): Bucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = emptyBucket();
    map.set(key, bucket);
  }
  return bucket;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function main() {
  const since = parseSinceArg(process.argv.slice(2));
  const traces = await loadTraces(since);

  if (traces.length === 0) {
    console.log("No traces found.");
    return;
  }

  const byWorkflow = new Map<string, Bucket>();
  const modelUsage = new Map<string, number>();
  const judgeConfidences: number[] = [];
  const compareWinners = { candidate_a: 0, candidate_b: 0, other: 0 };
  let cheapFirstRuns = 0;
  let cheapFirstEscalated = 0;

  for (const trace of traces) {
    const workflow = trace.workflow ?? "unknown";
    const bucket = bucketFor(byWorkflow, workflow);
    bucket.count += 1;
    if (trace.finalResult) {
      bucket.totalCost += trace.finalResult.costUnits;
      bucket.totalLatency += trace.finalResult.latencyMs;
      if (trace.finalResult.escalated) bucket.escalated += 1;
      for (const model of trace.finalResult.modelsUsed) {
        modelUsage.set(model, (modelUsage.get(model) ?? 0) + 1);
      }
    }

    if (workflow === "cheap_first") {
      cheapFirstRuns += 1;
      if (trace.finalResult?.escalated) cheapFirstEscalated += 1;
    }

    if (workflow === "compare") {
      const judgeStep = trace.steps.find((step) => step.role === "judge");
      if (judgeStep?.evaluatorScore !== undefined) {
        judgeConfidences.push(judgeStep.evaluatorScore);
      }
      const winnerNote = judgeStep?.notes?.find((note) => note.startsWith("winner="));
      if (winnerNote) {
        const winnerId = winnerNote.slice("winner=".length);
        if (winnerId === "candidate_a") compareWinners.candidate_a += 1;
        else if (winnerId === "candidate_b") compareWinners.candidate_b += 1;
        else compareWinners.other += 1;
      }
    }
  }

  console.log(`Analyzed ${traces.length} traces${since ? ` since ${since.toISOString()}` : ""}.\n`);

  console.log("Workflow distribution:");
  const workflowRows = Array.from(byWorkflow.entries()).map(([workflow, bucket]) => ({
    workflow,
    count: bucket.count,
    avg_cost: round(bucket.count ? bucket.totalCost / bucket.count : 0),
    avg_latency_ms: round(bucket.count ? bucket.totalLatency / bucket.count : 0, 0),
    escalated: bucket.escalated,
    escalation_rate: round(bucket.count ? bucket.escalated / bucket.count : 0),
  }));
  console.table(workflowRows);

  if (cheapFirstRuns > 0) {
    console.log(`cheap_first escalation rate: ${round(cheapFirstEscalated / cheapFirstRuns)} (${cheapFirstEscalated}/${cheapFirstRuns})`);
  }

  console.log("\nModel usage frequency:");
  const modelRows = Array.from(modelUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count }));
  console.table(modelRows);

  if (judgeConfidences.length > 0) {
    const sum = judgeConfidences.reduce((acc, value) => acc + value, 0);
    const avg = sum / judgeConfidences.length;
    const min = Math.min(...judgeConfidences);
    const max = Math.max(...judgeConfidences);
    console.log(`\nJudge confidence: avg=${round(avg)} min=${round(min)} max=${round(max)} n=${judgeConfidences.length}`);
  }

  const totalCompare = compareWinners.candidate_a + compareWinners.candidate_b + compareWinners.other;
  if (totalCompare > 0) {
    console.log(`\nCompare winners: candidate_a=${compareWinners.candidate_a} candidate_b=${compareWinners.candidate_b} other=${compareWinners.other}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
