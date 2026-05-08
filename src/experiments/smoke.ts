/**
 * HTTP smoke test.
 *
 * Assumes the server is running (npm run dev) on http://localhost:3000 or
 * a URL provided via AA_SMOKE_BASE_URL. Exercises:
 *   GET  /health
 *   GET  /models
 *   POST /run  (for every sample in ./samples)
 *   GET  /runs/:id
 *
 * Usage:
 *   npm run smoke
 *   AA_SMOKE_BASE_URL=http://localhost:3000 npm run smoke
 *   AA_SMOKE_SAMPLE=chat-simple npm run smoke      # only one sample
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type SampleFile = {
  name: string;
  description?: string;
  expected?: {
    workflow?: string;
    modelTier?: string;
  };
  request: Record<string, unknown>;
};

const baseUrl = process.env.AA_SMOKE_BASE_URL ?? "http://localhost:3000";
const onlySample = process.env.AA_SMOKE_SAMPLE;
const samplesDir = path.resolve(process.cwd(), "samples");

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function loadSamples(): Promise<SampleFile[]> {
  const entries = (await fs.readdir(samplesDir)).filter((entry) => entry.endsWith(".json")).sort();
  const samples: SampleFile[] = [];
  for (const file of entries) {
    const raw = await fs.readFile(path.join(samplesDir, file), "utf8");
    let parsed: SampleFile;
    try {
      parsed = JSON.parse(raw) as SampleFile;
    } catch (error) {
      console.warn(`Skipping ${file}: invalid JSON (${(error as Error).message})`);
      continue;
    }
    if (!parsed || typeof parsed !== "object" || !("request" in parsed)) {
      console.warn(`Skipping ${file}: missing "request" field`);
      continue;
    }
    if (onlySample && parsed.name !== onlySample) continue;
    samples.push(parsed);
  }
  return samples;
}

async function ensureServerUp(): Promise<void> {
  try {
    const health = await fetchJson(`${baseUrl}/health`);
    console.log(`/health -> ${JSON.stringify(health)}`);
  } catch (error) {
    console.error(`Cannot reach ${baseUrl}. Start the server first with: npm run dev`);
    console.error(`Underlying error: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  console.log(`Adaptive Agent smoke test against ${baseUrl}`);
  await ensureServerUp();

  const models = (await fetchJson(`${baseUrl}/models`)) as { models: Array<{ id: string; tier: string }> };
  console.log(`/models -> ${models.models.length} profiles: ${models.models.map((m) => `${m.id}(${m.tier})`).join(", ")}`);

  const samples = await loadSamples();
  if (samples.length === 0) {
    console.warn("No samples matched. Nothing to send.");
    return;
  }

  const rows: Array<Record<string, string | number | boolean>> = [];
  for (const sample of samples) {
    const startedAt = Date.now();
    try {
      const runResponse = (await fetchJson(`${baseUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample.request),
      })) as {
        runId: string;
        answer: string;
        meta: {
          workflow: string;
          modelsUsed: string[];
          escalated: boolean;
          latencyMs: number;
          costUnits: number;
          tier?: string;
          confidence?: number;
        };
      };

      // Pull the persisted trace back from the server to prove the full loop.
      const trace = (await fetchJson(`${baseUrl}/runs/${runResponse.runId}`)) as {
        steps: Array<unknown>;
        finalResult?: { modelsUsed: string[] };
      };

      rows.push({
        sample: sample.name,
        workflow: runResponse.meta.workflow,
        tier: runResponse.meta.tier ?? "-",
        models: runResponse.meta.modelsUsed.join(","),
        escalated: runResponse.meta.escalated,
        cost: Number(runResponse.meta.costUnits.toFixed(3)),
        latency_ms: runResponse.meta.latencyMs,
        wall_ms: Date.now() - startedAt,
        trace_steps: trace.steps.length,
        answer_preview: (runResponse.answer ?? "").slice(0, 40),
        run_id: runResponse.runId,
      });
    } catch (error) {
      rows.push({
        sample: sample.name,
        workflow: "error",
        tier: "-",
        models: "-",
        escalated: false,
        cost: 0,
        latency_ms: 0,
        wall_ms: Date.now() - startedAt,
        trace_steps: 0,
        answer_preview: (error as Error).message.slice(0, 40),
        run_id: "-",
      });
    }
  }

  console.log(`\nSmoke results (${rows.length} samples):`);
  console.table(rows);

  if (rows.some((row) => row.workflow === "error")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
