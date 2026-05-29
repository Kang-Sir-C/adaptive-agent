# Adaptive Agent

**自适应多模型编排代理 — 不是选模型，而是选工作流。**

Adaptive Agent 是一个自适应多模型编排代理。它不是又一个模型聚合器或 API 网关，而是一个能根据任务自动决定"该怎么干、该谁来干"的智能路由层。

核心理念很简单：大多数请求不需要最贵的模型。一个简单问答用 Haiku 就够了，一段代码重构可以先让便宜模型试，失败了再升级，一个关键审查值得让两个模型并行比较再由裁判选优。Adaptive Agent 把这套决策逻辑做成了自动化系统——先分诊任务类型和复杂度，再选择工作流模板，再按成本和能力路由模型，最后用评估器验证结果、必要时升级重试。每次决策全程留痕，形成可分析的 trace 数据，为后续路由优化提供真实依据。

它以 OpenAI-compatible 代理的形式运行，任何支持 OpenAI API 的客户端（Cursor、Cline、Claude Code、任意 SDK）只需改一行 base URL 就能接入，零代码改动。

**Stop paying for Opus when Haiku is enough.**

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
| Evaluator-driven escalation | ❌ | ❌ | ❌ | ✅ fail → upgrade (budget-aware) |
| Parallel compare + judge | ❌ | ❌ | ❌ | ✅ (fault-tolerant) |
| Per-run trace with full decision log | ❌ | ❌ | ❌ | ✅ |
| Error recovery + trace on failure | ❌ | ❌ | ❌ | ✅ |
| Mock mode (no API key needed) | ❌ | ❌ | ❌ | ✅ |
| Node/TypeScript native | ❌ Python | ✅ Python | ❌ Python | ✅ |
| Drop-in OpenAI proxy | ❌ | ✅ | ❌ | ✅ |

**Core insight:** The question isn't "which model?" — it's "which workflow?" A simple chat needs one cheap call. A code refactor needs cheap-first with escalation. A critical review needs two models compared by a judge. Adaptive Agent picks the workflow first, then picks the models.

**Reliability built in:**
- Budget-aware escalation — won't upgrade if cost ceiling is reached
- Fault-tolerant compare — if one candidate model fails, the surviving one is returned instead of crashing
- Error traces — even failed runs get their trace persisted for debugging
- Graceful degradation — provider timeouts and errors produce structured error responses, never raw 500s

---

## Why routing pays off

We measured 10 open models across a range of software development tasks. The
takeaway is blunt: **paying for the biggest model is mostly wasted money.**

- A mid-size model reaches **~99% of the strongest model's quality at ~28% of the cost**.
- The cheapest model still reaches **~91%** of the top quality.
- Out of 10 models, only **4 sit on the cost-quality Pareto frontier** — the rest are strictly dominated, including the largest one.

So instead of routing everything to the most capable model, Adaptive Agent
picks a model that is *good enough for the task* and escalates only when an
output actually fails a quality check. In our measurements, task-aware routing
cut serving cost by **~80%** with **<2% quality loss** versus always using the
strongest model.

> These numbers are directional, from a pilot study on one provider. Your
> mileage will vary by workload and provider — which is exactly why the routing
> decision should be data-driven and observable, not a fixed rule.

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
  app/                 Express server + OpenAI-compatible routes + error handling
  core/
    triage/            rule-based task classification (EN + CN keywords)
    workflow/          direct / cheap_first / compare / passthrough
    evaluator/         schema + rules + judge (graded scoring)
    orchestrator/      top-level run loop with error recovery
    budget/            per-run cost/latency tracking and enforcement
    context/           prompt assembly (role-specific)
  providers/           ModelProvider interface + OpenAI adapter (mock/real dual-mode)
  models/              TypeScript schemas
  config/              model profiles, routing rules, workflow budgets
  storage/             trace persistence
  experiments/         smoke tests + trace analyzer + watch
samples/               canned test inputs
traces/                per-run JSON traces (auto-generated)
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
- [ ] **Judge cost tracking**: record judge model's token usage and cost in the compare workflow trace step.

### Medium priority

- [ ] **`plan_execute` workflow**: for multi-step tasks, plan first (cheap), then execute each step (appropriate tier).
- [ ] **Trace-based routing learning**: use accumulated traces to train a lightweight classifier that replaces or augments keyword rules.
- [ ] **Cost tracking dashboard**: simple HTML page served at `/dashboard` showing real-time cost savings vs always-premium baseline.
- [ ] **Multi-provider routing**: route different tiers to different providers (e.g., cheap → DeepSeek, premium → Anthropic).
- [ ] **Anthropic `/v1/messages` endpoint**: support Claude Code and native Anthropic SDK clients directly without needing a relay.

### Low priority / future

- [ ] **Token budget enforcement**: hard cap on tokens per run, not just cost units.
- [ ] **Plugin system**: let users register custom evaluators, triage rules, or workflows without forking.
- [ ] **Retrieval integration**: feed `retrievedDocs` from a real vector store.
- [ ] **WebSocket support**: for clients that prefer WS over SSE.
- [ ] **Online learning**: bandit-style policy that adjusts tier selection based on accumulated trace outcomes.

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
