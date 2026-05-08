import express from "express";
import type { Request, Response } from "express";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";
import type { ModelsApiResponse, RunApiRequest, RunApiResponse, TraceApiResponse } from "../models/schemas/api.js";
import { createId } from "../utils/ids.js";

export const createRouter = (orchestrator: Orchestrator) => {
  const router = express.Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.get("/models", (_req: Request, res: Response<ModelsApiResponse>) => {
    res.json({ models: orchestrator.getProvider().getProfiles() });
  });

  router.get("/runs/:id", async (req: Request<{ id: string }>, res: Response<TraceApiResponse>) => {
    const trace = await orchestrator.getTraceStore().get(req.params.id);
    if (!trace) {
      res.status(404).json({ error: "Run trace not found." });
      return;
    }

    res.json(trace);
  });

  router.post("/run", async (req: Request<object, RunApiResponse, RunApiRequest>, res: Response<RunApiResponse>) => {
    const body = req.body;
    const runId = body.runId ?? createId("run");
    const sessionId = body.sessionId ?? createId("session");

    const result = await orchestrator.run({
      runId,
      sessionId,
      userInput: body.userInput,
      mode: body.mode,
      context: body.context,
      preferences: body.preferences,
    });

    res.json(result);
  });

  return router;
};
