# Adaptive Agent

An adaptive multi-model orchestration kernel for Node / TypeScript.

Instead of calling one model for every request, Adaptive Agent **triages** each request, picks a **workflow template** (direct / cheap-first with escalation / parallel compare), routes each step to a **model tier**, evaluates the output, and writes a **trace** for every run. Those traces become the dataset you use to refine routing rules over time.

**Drop-in replacement for the OpenAI endpoint.** Point your Cursor / Cline / Claude Code / OpenAI SDK at `http://localhost:3000/v1` and Adaptive Agent will transparently route each request to the right model tier. Zero code changes on the client.

> This is not another model aggregator. It is a small, composable routing + workflow layer you drop into a Node backend. Zero-config mock mode means contributors can run the full pipeline without any API key.

---

## Why this exists

Most production LLM deployments default to one strong model for every prompt. That is expensive and overkill for simple requests. The common alternative — picking a model per request — usually stops at a binary "cheap vs strong" classification.

Adaptive Agent makes three decisions instead of one:

| Decision          | Signal                                                 | Output                                    |
| ----------------- | ------------------------------------------------------ | ----------------------------------------- |
| What kind of task | input length, mode, context, risk keywords             | `taskType`, `complexity`, `risk`          |
| What workflow     | triage + user preferences (allowParallel, etc.)        | `direct` \| `cheap_first` \| `compare`    |
| Which model tier  | workflow template + evaluator feedback                 | `cheap` → `mid` → `premium` with escalate |

Every run writes `traces/<runId>.json`. Mine those traces to improve routing. That feedback loop is the product.

---

## Status

This is **v0.1**: an orchestration kernel, not a full platform. It has:

- Rule-based triage
- Three workflow templates (`direct`, `cheap_first`, `compare`)
- Two-layer provider abstraction (`ModelProvider` interface + adapter)
- One adapter: OpenAI-compatible `chat/completions` with mock and real modes
- Composable evaluator (schema + rules + judge)
- JSON trace persistence
- HTTP API
- Sample runner and trace analyzer

Not in v0.1:

- Learned routing policies
- `plan_execute` / `review` workflows
- Retrieval / tool execution
- Long-term memory
- IDE integration
- Auth, rate limiting, multi-tenant gateway

See the [roadmap](#roadmap) and `docs/architecture.md` for details.

---

## Quick start

Requires Node 20+.

```bash
git clone https://github.com/<you>/adaptive-agent
cd adaptive-agent
npm install
npm run check
```

### Run the server in mock mode (no API key needed)

```bash
npm run dev
```

In a second terminal, send a request through the full pipeline:

```bash
npm run smoke
```

You will see something like:

```
Adaptive Agent smoke test against http://localhost:3000
/health -> {"ok":true}
/models -> 4 profiles: qwen3-coder-next(cheap), deepseek-v3.2(cheap), sonnet-4.6(mid), opus-4.6(premium)

Smoke results (5 samples):
┌────┬──────────────────────┬───────────────┬─────────┬──────────────────────────────────┬───────────┐
│    │ sample               │ workflow      │ tier    │ models                           │ escalated │
├────┼──────────────────────┼───────────────┼─────────┼──────────────────────────────────┼───────────┤
│ 0  │ chat-simple          │ direct        │ cheap   │ deepseek-v3.2                    │ false     │
│ 1  │ code-edit-medium     │ cheap_first   │ mid     │ qwen3-coder-next                 │ false     │
│ 2  │ high-risk-security   │ cheap_first   │ mid     │ qwen3-coder-next                 │ false     │
│ 3  │ long-analysis        │ cheap_first   │ premium │ qwen3-coder-next                 │ false     │
│ 4  │ review-compare       │ compare       │ mid     │ opus-4.6,sonnet-4.6,sonnet-4.6   │ false     │
└────┴──────────────────────┴───────────────┴─────────┴──────────────────────────────────┴───────────┘
```

### See escalation in action

The mock adapter can simulate cheap-tier failures on demand:

**PowerShell:**
```powershell
# in the server terminal
$env:AA_MOCK_CHEAP_FAIL='true'; npm run dev
```

**bash / zsh:**
```bash
AA_MOCK_CHEAP_FAIL=true npm run dev
```

Now rerun `npm run smoke`. Cheap-first samples will show `escalated=true` and two models in the `models` column (cheap → mid).

### Aggregate stats across all traces

```bash
npm run exp:analyze
```

Outputs workflow distribution, cost / latency per workflow, `cheap_first` escalation rate, model usage frequency, and judge confidence.

---

## Connecting a real provider

> **Heads-up.** The model `id`s in `src/config/models.ts` are realistic defaults but your broker may expose different ones. You must replace them with model names your broker actually supports, or every real request will fail with 404 / unknown_model.

Adaptive Agent speaks any OpenAI-compatible `chat/completions` endpoint. Any broker exposing that shape works.

### Provider cookbook

| Provider                           | `AA_OPENAI_BASE_URL`                     | Suggested tier mapping for `src/config/models.ts`                                  |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| OpenAI official                    | `https://api.openai.com/v1`              | cheap `gpt-4o-mini`, mid `gpt-4o`, premium `gpt-4-turbo`                           |
| Anthropic-only relay (e.g. 中转站) | `https://<relay>/v1`                     | cheap `claude-haiku-4-5`, mid `claude-sonnet-4-5`, premium `claude-opus-4-5`       |
| DeepSeek official                  | `https://api.deepseek.com/v1`            | cheap `deepseek-chat`, mid `deepseek-chat`, premium `deepseek-reasoner`            |
| Moonshot (Kimi)                    | `https://api.moonshot.cn/v1`             | cheap `moonshot-v1-8k`, mid `moonshot-v1-32k`, premium `moonshot-v1-128k`          |
| 智谱 GLM                           | `https://open.bigmodel.cn/api/paas/v4`   | cheap `glm-4-flash`, mid `glm-4-air`, premium `glm-4-plus`                         |
| SiliconFlow (硅基流动)             | `https://api.siliconflow.cn/v1`          | pick any OpenAI-compatible model the platform lists                                |
| Ollama (local)                     | `http://localhost:11434/v1`              | cheap `llama3.2:3b`, mid `llama3.1:8b`, premium `llama3.1:70b` (or what you have)  |
| vLLM / TGI (self-hosted)           | `http://<host>:<port>/v1`                | use the exact `--served-model-name` you launched with                              |

To discover what a relay actually exposes, hit `/v1/models` first:

```powershell
$h = @{ 'Authorization' = 'Bearer YOUR_KEY' }
Invoke-RestMethod https://your-relay.example.com/v1/models -Headers $h
```

Then edit `src/config/models.ts` so each profile's `id` matches one of the returned ids. `AA_JUDGE_MODEL` in `.env` must also be a real id.

1. Copy the env template:

   ```bash
   cp .env.example .env
   ```

2. Fill it in:

   ```dotenv
   AA_PROVIDER_ENABLED=true
   AA_OPENAI_BASE_URL=https://your-broker.example.com/v1
   AA_OPENAI_API_KEY=sk-...
   AA_OPENAI_TIMEOUT_MS=60000
   AA_JUDGE_MODEL=the-model-id-your-broker-accepts
   ```

3. Edit `src/config/models.ts` so each profile `id` matches a model your broker accepts. The built-in ids (`qwen3-coder-next`, `sonnet-4.6`, etc.) are placeholders.

4. Restart the server and run the smoke test. The `answer_preview` column will contain real model output instead of mock strings.

---

## HTTP API

All endpoints return JSON.

### OpenAI-compatible surface

Adaptive Agent exposes a drop-in OpenAI chat/completions endpoint. Any tool that speaks OpenAI works without code changes.

```bash
# in whatever is calling you today
export OPENAI_BASE_URL=http://localhost:3000/v1
export OPENAI_API_KEY=anything-nonempty
```

`GET /v1/models` and `POST /v1/chat/completions` both work. Streaming (SSE) is supported. Non-OpenAI metadata (which workflow ran, which models were used, cost units, trace run_id) rides back on an `adaptive` key so you can inspect routing decisions from any client that doesn't strip unknown fields.

### Picking a model: aliases vs direct

The `/v1/models` list mixes two kinds of ids. Clients pick one the same way they pick `gpt-4o`.

**Adaptive aliases** — let AA choose the real model for you:

| alias          | what it does                                       |
| -------------- | -------------------------------------------------- |
| `aa-auto`      | full triage, AA picks workflow and tier            |
| `aa-fast`      | single cheap-tier call, no escalation              |
| `aa-reliable`  | cheap first, escalate to mid on evaluator failure  |
| `aa-compare`   | two parallel candidates, judge picks the winner    |

**Real model ids** (`claude-haiku-4-5`, `gpt-4o-mini`, whatever you configured) — passthrough. AA does not re-route, it just forwards to that specific model and writes a trace.

This hybrid is the point: power users who understand AA can pick an alias, regular clients that just want a specific model still work.

### Example

```bash
npm run smoke:openai
```

The response body keeps the standard OpenAI shape plus an extra hint:

```json
{
  "id": "chatcmpl-run_1778...",
  "object": "chat.completion",
  "choices": [{ "message": { "role": "assistant", "content": "..." } }],
  "adaptive": {
    "run_id": "run_1778...",
    "workflow": "cheap_first",
    "tier": "mid",
    "models_used": ["qwen3-coder-next", "sonnet-4.6"],
    "escalated": true,
    "cost_units": 0.189
  }
}
```

Adaptive Agent's own endpoints (`/run`, `/runs/:id`, `/models`, `/health`) remain available for power users who want the raw RunResult shape.

### `GET /health`

Basic health check. Returns `{ ok: true }`.

### `GET /models`

Returns configured model profiles (id, tier, strengths per task type).

### `POST /run`

Executes one full orchestration.

Request body (see `samples/*.json` for examples):

```json
{
  "mode": "chat | code | review",
  "userInput": "string",
  "context": {
    "selectedText": "optional string",
    "currentFile": { "path": "...", "content": "...", "language": "..." },
    "relatedFiles": [{ "path": "...", "content": "..." }],
    "retrievedDocs": [{ "id": "...", "title": "...", "content": "..." }]
  },
  "preferences": {
    "priority": "speed | cost | quality | balanced",
    "allowParallel": true,
    "maxLatencyMs": 5000
  }
}
```

Response body:

```json
{
  "runId": "run_...",
  "answer": "string",
  "meta": {
    "workflow": "direct | cheap_first | compare",
    "modelsUsed": ["model-id", ...],
    "escalated": false,
    "latencyMs": 1234,
    "costUnits": 0.07,
    "confidence": 0.82,
    "tier": "cheap | mid | premium"
  }
}
```

### `GET /runs/:id`

Returns the full trace for a run, including triage decision, every executor step, and the final result.

---

## Architecture

```
                   POST /run
                      │
                      ▼
                ┌────────────┐
                │  Express   │
                └─────┬──────┘
                      │ RunRequest
                      ▼
            ┌──────────────────────┐
            │    Orchestrator      │
            └──┬────────────┬──────┘
               │            │
               ▼            ▼
         ┌──────────┐  ┌──────────────┐
         │ Context  │  │    Triage    │──► TaskAssessment
         │ Builder  │  │  (rules)     │    (type, complexity,
         └────┬─────┘  └──────┬───────┘     risk, workflow, tier)
              │               │
              └────┬──────────┘
                   ▼
         ┌───────────────────────┐
         │   WorkflowFactory     │
         │    ┌──────────────┐   │
         │    │ direct       │   │
         │    │ cheap_first  │───┼──► ModelProvider ──► Adapter ──► HTTP
         │    │ compare      │   │       ▲
         │    └──────────────┘   │       │
         └──────────┬────────────┘       │
                    │                    │
                    ▼                    │
           ┌────────────────┐            │
           │   Evaluator    │◄───────────┘
           │ schema / rules │  signals drive escalate / accept
           │ judge (compare)│
           └────────┬───────┘
                    │
                    ▼
            ┌──────────────┐
            │ TraceStore   │──► traces/<runId>.json
            └──────────────┘
```

Layer-by-layer reference: [`docs/architecture.md`](./docs/architecture.md).

---

## Project layout

```
src/
  app/                 Express server + routes
  core/
    budget/            per-run budget tracking
    context/           role-specific prompt assembly
    triage/            rule-based triage
    workflow/          direct / cheap_first / compare templates
    evaluator/         schema + rules + judge aggregate evaluator
    orchestrator/      top-level run loop
  providers/           ModelProvider interface + OpenAI-compatible adapter
  models/              schemas (RunRequest, TaskAssessment, RunTrace, ...)
  config/              model profiles, routing thresholds, workflow budgets
  storage/             trace file persistence
  telemetry/           trace recorder
  experiments/         sample runner + trace analyzer + smoke
  utils/
samples/               canned experiment inputs (used by exp:samples and smoke)
traces/                per-run JSON traces (gitignored except demos)
docs/                  architecture notes + example request payload
```

---

## Configuration

All configuration lives in code or env vars. No config file format to learn.

| Setting             | Location                     | What it controls                                 |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| Model profiles      | `src/config/models.ts`       | id, tier, strengths, latency, availability       |
| Routing thresholds  | `src/config/routing.ts`      | input length cutoffs, keyword lists              |
| Workflow budgets    | `src/config/workflows.ts`    | max rounds, parallel calls, cost, latency        |
| Provider runtime    | `src/config/provider.ts`     | reads env vars below                             |

Environment variables (see `.env.example`):

| Name                      | Default                       | Purpose                                          |
| ------------------------- | ----------------------------- | ------------------------------------------------ |
| `AA_PROVIDER_ENABLED`     | `false`                       | When false, adapter returns mock responses       |
| `AA_OPENAI_BASE_URL`      | `https://api.openai.com/v1`   | OpenAI-compatible base URL                       |
| `AA_OPENAI_API_KEY`       | unset                         | Bearer token for the broker                      |
| `AA_OPENAI_TIMEOUT_MS`    | `60000`                       | Per-call timeout                                 |
| `AA_JUDGE_MODEL`          | `sonnet-4.6`                  | Model id used by compare workflow's judge step   |
| `AA_MOCK_CHEAP_FAIL`      | unset                         | When `true`, cheap-tier mock fails deterministically to trigger escalation |
| `PORT`                    | `3000`                        | HTTP server port                                 |
| `AA_SMOKE_BASE_URL`       | `http://localhost:3000`       | Base URL the smoke test targets                  |
| `AA_SMOKE_SAMPLE`         | unset                         | Limit smoke to a single sample by name           |

---

## Scripts

```bash
npm run dev          # start HTTP server (tsx watch-free, restart on edits yourself)
npm run build        # compile to dist/
npm run start        # run compiled dist
npm run check        # typecheck only
npm run smoke        # HTTP smoke test against a running server
npm run smoke:openai # verify the OpenAI-compatible surface specifically
npm run exp:samples  # run every sample through the Orchestrator directly (no HTTP)
npm run exp:analyze  # aggregate stats across traces/*.json
```

---

## Roadmap

| Priority | Item                                                                        |
| -------- | --------------------------------------------------------------------------- |
| P0       | `plan_execute` and `plan_execute_review` workflows                          |
| P0       | Richer evaluator signals (JSON schema validation, task-specific rubrics)    |
| P1       | Routing policy learned from stored traces                                   |
| P1       | Retrieval adapter (feed `retrievedDocs` from a real index)                  |
| P2       | Tool calls in workflows                                                     |
| P2       | IDE plugin and/or internal gateway wrapper                                  |
| P2       | Streaming responses                                                         |

Open issues welcome for anything on or off this list.

---

## Contributing

```bash
npm install
npm run check
npm run smoke     # requires npm run dev in another terminal
```

The smoke test is the de facto integration test. A PR is considered good if:

1. `npm run check` passes.
2. `npm run smoke` passes in mock mode (with the server running).
3. Any new routing / workflow behavior is covered by a sample in `samples/`.

Sample files live in `samples/*.json` and have two top-level keys:

```json
{
  "name": "short-identifier",
  "description": "what this sample exercises",
  "expected": {
    "workflow": "direct | cheap_first | compare",
    "modelTier": "cheap | mid | premium"
  },
  "request": { /* a POST /run body */ }
}
```

---

## License

[MIT](./LICENSE).
