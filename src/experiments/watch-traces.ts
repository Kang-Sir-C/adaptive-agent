/**
 * Live trace watcher.
 *
 * Polls traces/ every 2s and prints one line per new run. Use while
 * dogfooding through Narrafork / Cursor / any OpenAI client so you can
 * see what AA decided in real time.
 *
 * Usage:
 *   npm run watch
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RunTrace } from "../models/schemas/trace.js";

const tracesDir = path.resolve(process.cwd(), "traces");
const seen = new Set<string>();

async function scanOnce(): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(tracesDir);
  } catch {
    return;
  }
  const files = entries.filter((e) => e.endsWith(".json")).sort();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      const raw = await fs.readFile(path.join(tracesDir, file), "utf8");
      const trace = JSON.parse(raw) as RunTrace;
      printTrace(trace);
    } catch {
      // ignore partial writes; we'll see the file again next scan
    }
  }
}

function printTrace(trace: RunTrace): void {
  const when = new Date(trace.createdAt).toLocaleTimeString();
  const a = trace.assessment;
  const overrides = (trace.steps[0]?.notes ?? []).filter((n) => n.startsWith("override="));
  const exec = trace.steps.filter((s) => s.role === "executor");
  const modelsUsed = trace.finalResult?.modelsUsed.join(",") ?? "-";
  const cost = trace.finalResult?.costUnits.toFixed(3) ?? "-";
  const latency = trace.finalResult?.latencyMs ?? "-";
  const escalated = trace.finalResult?.escalated ? " ESCALATED" : "";
  const failed = exec.some((s) => !s.outputValid) ? " EVAL-FAIL" : "";

  console.log(
    `[${when}] ${trace.runId} ` +
    `mode=${trace.request.mode} ` +
    `type=${a?.taskType ?? "-"}/${a?.complexity ?? "-"}/${a?.risk ?? "-"} ` +
    `wf=${trace.workflow ?? "-"} tier=${a?.modelTier ?? "-"} ` +
    `models=${modelsUsed} cost=${cost} ${latency}ms` +
    `${escalated}${failed}`,
  );
  if (overrides.length > 0) {
    console.log(`           overrides: ${overrides.join(", ")}`);
  }
  const preview = (trace.request.userInput ?? "").slice(0, 90).replace(/\n/g, " ");
  console.log(`           input: ${preview}${trace.request.userInput && trace.request.userInput.length > 90 ? "..." : ""}`);
  const answerPreview = trace.finalResult?.answerPreview?.replace(/\n/g, " ") ?? "";
  console.log(`           answer: ${answerPreview}`);
  console.log("");
}

async function main(): Promise<void> {
  // preload existing files so we only print new ones from now on
  try {
    const entries = await fs.readdir(tracesDir);
    for (const e of entries) if (e.endsWith(".json")) seen.add(e);
  } catch {
    // traces/ may not exist yet; fine
  }
  console.log(`Watching ${tracesDir} for new traces. Ctrl+C to stop.\n`);
  // Simple poll loop
  while (true) {
    await scanOnce();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
