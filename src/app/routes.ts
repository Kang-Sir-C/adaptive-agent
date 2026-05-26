import express from "express";
import type { Request, Response } from "express";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";
import type { ModelsApiResponse, RunApiRequest, RunApiResponse, TraceApiResponse } from "../models/schemas/api.js";
import type { OpenAIChatRequest, OpenAIModelsListResponse } from "../models/schemas/openai.js";
import { AA_ALIASES, openAIStreamChunks, openAIToRunRequest, runResultToOpenAI } from "./openai-bridge.js";
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

  router.post("/run", async (req: Request<object, RunApiResponse, RunApiRequest>, res: Response) => {
    const body = req.body;
    const runId = body.runId ?? createId("run");
    const sessionId = body.sessionId ?? createId("session");

    try {
      const result = await orchestrator.run({
        runId,
        sessionId,
        userInput: body.userInput,
        mode: body.mode,
        context: body.context,
        preferences: body.preferences,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal error";
      res.status(502).json({ error: { message, type: "upstream_error", runId } });
    }
  });

  // -------- OpenAI-compatible surface --------
  // Any client that speaks OpenAI chat/completions can point its base_url
  // at /v1 and use Adaptive Agent transparently.

  router.get("/v1/models", (_req: Request, res: Response<OpenAIModelsListResponse>) => {
    const now = Math.floor(Date.now() / 1000);
    // Expose both the AA adaptive aliases (aa-auto/fast/reliable/compare) and
    // the real underlying model ids. Clients that understand AA can pick an
    // alias and get adaptive routing; clients that just want a specific model
    // can pick it by id and AA will pass through.
    const aliases = AA_ALIASES.map((id) => ({
      id,
      object: "model" as const,
      created: now,
      owned_by: "adaptive-agent",
    }));
    const profiles = orchestrator.getProvider().getProfiles().map((profile) => ({
      id: profile.id,
      object: "model" as const,
      created: now,
      owned_by: "adaptive-agent",
    }));
    res.json({ object: "list", data: [...aliases, ...profiles] });
  });

  router.post("/v1/chat/completions", async (req: Request, res: Response) => {
    const body = req.body as OpenAIChatRequest;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: { message: "messages is required", type: "invalid_request_error" } });
      return;
    }

    const runRequest = openAIToRunRequest(body);
    let result;
    try {
      result = await orchestrator.run(runRequest);
    } catch (error) {
      const message = (error as Error).message ?? "internal error";
      res.status(502).json({ error: { message, type: "upstream_error" } });
      return;
    }

    if (body.stream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      for (const chunk of openAIStreamChunks(result, body.model)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.json(runResultToOpenAI(result, body.model));
  });

  return router;
};
