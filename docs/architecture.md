# Adaptive Agent Architecture

## Overview

Adaptive Agent is a Node/TypeScript orchestration service for adaptive multi-model routing. The first version focuses on a narrow but testable core:

- triage incoming requests
- choose a workflow template
- route work to model tiers
- evaluate outputs
- escalate when needed
- persist traces for analysis

The initial goal is not a full plugin or enterprise platform. It is an orchestration kernel that can validate whether adaptive routing is better than fixed single-model execution for real tasks.

## Goals

- Provide a unified `POST /run` entry point for chat, code edit, and review tasks.
- Support three workflow templates:
  - `direct`
  - `cheap_first`
  - `compare`
- Keep provider integration abstract through a two-layer provider design.
- Record execution traces for every run.
- Produce a code structure that can later power IDE plugins or internal gateways.

## Non-Goals for v0.1

- Free-form multi-agent graph orchestration
- Long-term memory systems
- Enterprise auth and permissions
- Retrieval integration beyond request payload input
- Online learning for route policy updates
- Full code execution sandbox

## System Layers

### 1. Entry Layer
Receives HTTP requests, validates them, and forwards them into the orchestrator.

### 2. Context Layer
Assembles a single enriched prompt from user input, selected text, current file, related files, and session facts. The same `ContextBuilder` output feeds executor and reviewer roles in the workflows.

### 3. Triage Layer
Classifies the request into task type, complexity, risk, workflow, and model tier.

### 4. Workflow Layer
Executes a selected workflow template and applies budget, escalation, and fallback logic.

### 5. Provider Layer
Abstracts model calling. The upper layer uses unified provider semantics while adapters hide broker-specific details.

### 6. Evaluator Layer
Checks outputs through schema, rules, and judge scoring. Produces a unified evaluation result.

### 7. Telemetry Layer
Persists traces, timing, model usage, and escalation decisions.

## Request Lifecycle

```text
RunRequest
  -> context builder
  -> triage
  -> workflow selection
  -> workflow execution
  -> evaluation
  -> escalate or accept
  -> RunResult
  -> trace persistence
```

## Core Domain Objects

### RunRequest
Normalized user request with mode, context, and preferences.

### SessionState
Structured session memory for stable cross-model handoff.

### TaskAssessment
Triage result describing task type, complexity, risk, workflow, and model tier.

### RunContext
Internal mutable execution state used by the orchestrator and workflows.

### WorkflowResult
The normalized output of a workflow execution.

### EvaluationResult
A unified result from schema, rule, and judge evaluators.

### RunTrace
Persistent record of how a run was triaged, executed, evaluated, and finalized.

## Workflow Templates

### Direct Workflow
Used for simple, low-risk requests.

Flow:
1. Build execution context
2. Call a single model
3. Run basic evaluation
4. Return result

### Cheap First Workflow
Used for most normal requests.

Flow:
1. Call a cheap tier model
2. Evaluate result
3. If pass, return
4. If fail, escalate to a mid-tier model
5. Return escalated result

### Compare Workflow
Used when comparing multiple candidates is valuable.

Flow:
1. Select two candidate models
2. Run both in parallel
3. Filter invalid results
4. Judge the candidates
5. Return the winner and comparison metadata

## Provider Design

The provider layer uses a two-level abstraction.

### Unified Provider Interface
The system calls a provider through semantic methods:
- `generate()`
- `classify()`
- `judge()`

### Adapter Layer
The first adapter targets OpenAI-compatible broker APIs. Later adapters can support other brokers or local models.

### Runtime Mode
The adapter supports two runtime modes:
- mock mode when `AA_PROVIDER_ENABLED=false` or no API key is present
- real HTTP mode when `AA_PROVIDER_ENABLED=true` and valid broker credentials are configured

This lets the orchestration kernel run locally before a real provider is wired in.

## Evaluation Design

Evaluation is intentionally composable.

### Schema Evaluator
Checks structural validity such as JSON output shape.

### Rule Evaluator
Checks simple deterministic constraints.

### Judge Evaluator
Produces score-based comparison or review results.

In the current implementation, the compare workflow calls a dedicated judge model through the provider layer. When provider credentials are unavailable, the system falls back to a heuristic judge so the full execution path still works.

### Aggregate Evaluator
Combines evaluator outputs into a single `EvaluationResult`.

## Budget and Escalation

Budget is tracked per run and constrains:
- maximum rounds
- maximum parallel calls
- maximum latency
- maximum cost units

Escalation actions for v0.1:
- retry on minor output issues
- escalate from cheap to mid tier
- fallback when a candidate is unusable

## Trace and Observability

Every run stores:
- request summary
- triage result
- selected workflow
- models used per step
- latency and cost estimates
- evaluation signals
- escalation status
- final result summary

The first version stores traces locally as JSON files under `traces/`.

## HTTP API

### POST /run
Executes one run.

Request body:
- user input
- mode
- context
- preferences

Response body:
- answer
- optional artifacts
- workflow metadata

### GET /runs/:id
Returns the stored trace for a run.

### GET /models
Returns configured model profiles and tier information.

## Configuration Model

The first version keeps configuration simple:
- model profiles in code config
- workflow defaults in code config
- routing thresholds in code config
- provider environment variables in `.env` style configuration

Relevant variables include:
- `AA_PROVIDER_ENABLED`
- `AA_OPENAI_BASE_URL`
- `AA_OPENAI_API_KEY`
- `AA_OPENAI_TIMEOUT_MS`
- `AA_JUDGE_MODEL`

This keeps iteration fast while preserving clear abstraction points.

## Implementation Strategy

1. Initialize project and domain types.
2. Write the architecture document.
3. Implement triage and workflow interfaces.
4. Add provider abstraction and a broker adapter.
5. Add evaluator skeletons and trace persistence.
6. Expose HTTP routes.
7. Run type-check and startup validation.

## Future Evolution

After v0.1, the next layer can include:
- planner and reviewer workflows
- IDE/plugin integration
- retrieval and tool execution
- live model performance profiling
- policy learning from traces
- enterprise gateway features
