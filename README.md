# Adaptive Agent

**Stop paying for Opus when Haiku is enough.**

Adaptive Agent is a local proxy that sits between your LLM client and your provider. It looks at each request, decides which model tier actually fits, and routes accordingly — cheap model first, escalate only when needed, compare in parallel when it matters. Every decision is traced so you can see exactly what happened and why.

**One line to start using it:**

```bash
export OPENAI_BASE_URL=http://localhost:3000/v1
```

Works with Cursor, Cline, Continue, Narrafork, any OpenAI SDK, any OpenAI-compatible relay. Zero code changes on the client side.

---

## How it's different

| | OpenRouter | LiteLLM | RouteLLM | **Adaptive Agent** |
|---|---|---|---|---|
| Routes between models | ❌ you pick | ❌ you pick | ✅ binary cheap/strong | ✅ three-tier + workflow |
| Workflow-level decisions | ❌ | ❌ | ❌ | ✅ direct / cheap_first / compare |
| Evaluator-driven escalation | ❌ | ❌ | ❌ | ✅ fail → upgrade |
| Parallel compare + judge | ❌ | ❌ | ❌ | ✅ |
| Per-run trace with full decision log | ❌ | ❌ | ❌ | ✅ |
| Mock mode (no API key needed) | ❌ | ❌ | ❌ | ✅ |
| Node/TypeScript native | ❌ Python | ✅ Python | ❌ Python | ✅ |
| Drop-in OpenAI proxy | ❌ | ✅ | ❌ | ✅ |

**Core insight:** The question isn't "which model?" — it's "which workflow?" A simple chat needs one cheap call. A code refactor needs cheap-first with escalation. A critical review needs two models compared by a judge. Adaptive Agent picks the workflow first, then picks the models.

---

## What it does in 30 seconds

```
User sends request
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ TRIAGE                                              │
│ • taskType: chat / code / review / analysis / debug │
│ • complexity: low / medium / high                   │
│ • risk: low / medium / high                         │
│ • → picks workflow + model tier                     │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     ┌─────────┐ ┌──────────┐ ┌─────────┐
     │ direct  │ │cheap_first│ │ compare │
     │         │ │           │ │         │
     │ 1 call  │ │ cheap→eval│ │ A vs B  │
     │ done    │ │ fail→mid  │ │ judge C │
     └────┬────┘ └─────┬─────┘ └────┬────┘
          │             │            │
          └─────────────┼────────────┘
                        ▼
              ┌──────────────────┐
              │ trace written    │
              │ answer returned  │
              └──────────────────┘
```

---

## Quick start

```bash
git clone https://github.com/Kang-Sir-C/adaptive-agent
cd adaptive-agent
npm install
npm run dev          # starts on :3000, mock mode, no key needed
```

Second terminal:

```bash
npm run smoke:openai
```

You'll see AA triage a request, pick a workflow, call a model, and return a standard OpenAI response with an extra `adaptive` field showing what happened behind the scenes.

---

## Picking a model: aliases vs passthrough

When your client asks for a model, AA interprets it:

| You request | AA does |
|---|---|
| `aa-auto` | Full triage → picks workflow and tier automatically |
| `aa-fast` | Single cheap call, no escalation, lowest latency |
| `aa-reliable` | Cheap first, evaluator checks, escalate on failure |
| `aa-compare` | Two models in parallel, judge picks the winner |
| `claude-haiku-4-5` (real id) | Passthrough — no routing, just forward and trace |
| `claude-opus-4-7` (real id) | Passthrough — you get exactly what you asked for |

**The hybrid approach:** users who trust AA pick an alias and save money. Users who want control pick a real model and AA just proxies + traces.

---

## Triage rules

AA's triage is rule-based (no ML, no extra API call, zero latency):

**Task type** — inferred from keywords, code markers, and mode:
- `chat`, `code_generate`, `code_edit`, `debug`, `review`, `analysis`, `doc_qa`

**Complexity** — inferred from input length + structural patterns:
- Numbered steps, multi-part requests, migration keywords → high
- Code blocks, error handling requests → medium
- Short simple questions → low

**Risk** — action verb + target noun co-occurrence:
- "delete" + "production database" → high
- "learn about" + "security" → medium (informational, not dangerous)
- No risk signals → low

**Tier selection** — multi-dimensional:
- risk=high + complexity=high → premium
- analysis/review + medium complexity → mid
- simple chat → cheap

Supports both English and Chinese keywords.

---

## Connecting a real provider

AA speaks OpenAI-compatible `chat/completions`. Works with:

| Provider | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Claude via relay (中转站) | `https://<relay>/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| vLLM / TGI | `http://<host>:<port>/v1` |

```bash
cp .env.example .env
# edit .env with your provider details
# edit src/config/models.ts to match your provider's model ids
npm run dev
```

Discover available models:
```bash
curl -H "Authorization: Bearer YOUR_KEY" https://your-relay.example.com/v1/models
```

---

## Observability

Every request writes a trace to `traces/<runId>.json`:

```json
{
  "assessment": { "taskType": "code_edit", "complexity": "medium", "risk": "low", "workflow": "cheap_first", "modelTier": "mid" },
  "steps": [
    { "role": "triage", "notes": ["taskType=code_edit", "complexity=medium"] },
    { "role": "executor", "model": "claude-haiku-4-5", "tier": "cheap", "outputValid": true, "evaluatorScore": 0.8 }
  ],
  "finalResult": { "modelsUsed": ["claude-haiku-4-5"], "escalated": false, "costUnits": 0.327 }
}
```

**Live monitoring:**
```bash
npm run watch        # prints one line per new trace in real time
```

**Aggregate analysis:**
```bash
npm run exp:analyze  # workflow distribution, escalation rate, model usage, judge confidence
```

---

## Architecture

```
src/
  app/                 Express server + OpenAI-compatible routes
  core/
    triage/            rule-based task classification
    workflow/          direct / cheap_first / compare / passthrough
    evaluator/         schema + rules + judge
    orchestrator/      top-level run loop
    budget/            per-run cost/latency tracking
    context/           prompt assembly
  providers/           ModelProvider interface + OpenAI adapter
  models/              TypeScript schemas
  config/              model profiles, routing rules, workflow budgets
  storage/             trace persistence
  experiments/         smoke tests + trace analyzer + watch
samples/               canned test inputs
traces/                per-run JSON traces
```

---

## Scripts

```bash
npm run dev            # start server (mock mode by default)
npm run build          # compile TypeScript
npm run check          # typecheck only
npm run smoke          # full HTTP smoke test (5 samples)
npm run smoke:openai   # OpenAI-compat surface test (aliases + passthrough + streaming)
npm run watch          # live trace monitor
npm run exp:samples    # run samples directly through Orchestrator
npm run exp:analyze    # aggregate trace statistics
```

---

## TODO

Contributions welcome. Pick one and open a PR.

### High priority

- [ ] **Streaming from upstream**: currently AA buffers the full response then streams chunks to the client. True token-by-token streaming from the provider would cut TTFT significantly.
- [ ] **LLM-based triage option**: use Haiku itself (0.3s, ~$0.001) to classify task type and complexity instead of keyword rules. Much more accurate for ambiguous inputs.
- [ ] **Evaluator signals for escalation**: current evaluator is too lenient — Haiku almost never fails. Add task-specific rubrics (code must compile, JSON must parse, analysis must have structure).
- [ ] **Conversation context inheritance**: if the previous turn was `code_edit/high`, a follow-up "continue" should inherit that classification, not reset to `chat/low`.

### Medium priority

- [ ] **`plan_execute` workflow**: for multi-step tasks, plan first (cheap), then execute each step (appropriate tier).
- [ ] **Trace-based routing learning**: use accumulated traces to train a lightweight classifier that replaces or augments keyword rules.
- [ ] **Cost tracking dashboard**: simple HTML page served at `/dashboard` showing real-time cost savings vs always-premium baseline.
- [ ] **Fallback on provider errors**: if the chosen model returns 429/5xx, automatically retry with a different model in the same tier.
- [ ] **Anthropic `/v1/messages` endpoint**: support Claude Code and native Anthropic SDK clients directly without needing a relay.

### Low priority / future

- [ ] **Multi-provider routing**: route different tiers to different providers (e.g., cheap → DeepSeek, premium → Anthropic).
- [ ] **Token budget enforcement**: hard cap on tokens per run, not just cost units.
- [ ] **Plugin system**: let users register custom evaluators, triage rules, or workflows without forking.
- [ ] **Retrieval integration**: feed `retrievedDocs` from a real vector store.
- [ ] **WebSocket support**: for clients that prefer WS over SSE.

---

## Contributing

```bash
npm install
npm run check
npm run smoke          # requires npm run dev in another terminal
npm run smoke:openai   # also verify the OpenAI surface
```

A PR is good if:
1. `npm run check` passes
2. `npm run smoke` + `npm run smoke:openai` pass in mock mode
3. New routing behavior is covered by a sample in `samples/`

---

## License

[MIT](./LICENSE)
