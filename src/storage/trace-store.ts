import { promises as fs } from "node:fs";
import path from "node:path";
import type { RunTrace } from "../models/schemas/trace.js";

export class TraceStore {
  private readonly traceDir = path.resolve(process.cwd(), "traces");

  async save(trace: RunTrace): Promise<void> {
    const filePath = path.join(this.traceDir, `${trace.runId}.json`);
    await fs.mkdir(this.traceDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(trace, null, 2), "utf8");
  }

  async get(runId: string): Promise<RunTrace | null> {
    try {
      const filePath = path.join(this.traceDir, `${runId}.json`);
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content) as RunTrace;
    } catch {
      return null;
    }
  }
}
