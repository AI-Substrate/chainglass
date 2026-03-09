# Harness Agent Runner for System Verification

**Plan**: 070-harness-agent-runner
**Created**: 2026-03-07
**Status**: Draft

📚 This specification incorporates findings from [exploration.md](exploration.md) (61 research findings across 8 subagents) and [Workshop 001](workshops/001-copilot-sdk-adapter-reuse-and-agent-runner-design.md) (Copilot SDK adapter reuse and agent runner design).

## Research Context

The existing codebase has 2,800+ lines of battle-tested agent orchestration code across three adapters (SdkCopilot, ClaudeCode, CopilotCLI). The harness (Plan 067) already provides Docker containerization, Playwright/CDP browser automation, a typed CLI returning structured JSON, and a diagnostic doctor command. Two successful zero-context agent test runs validated the harness works for ad-hoc prompts. The missing capability is **declarative, repeatable, schema-validated agent runs** with full auditability.

Workshop 001 resolved the agent definition format (folder-based with prompt + schema), the UX for humans (rich colored terminal output) and agents (structured JSON), and the turn logging design (NDJSON event stream + completed.json metadata). The integration strategy has been **corrected**: we use the **Copilot SDK** (`@github/copilot-sdk`) directly via `IAgentAdapter`/`SdkCopilotAdapter` — not the Copilot CLI binary as a subprocess. This gives us typed event streaming, proper session management, and direct control over the agent lifecycle.

## Summary

Add the ability to run declarative sub-agents from the harness CLI. An agent is a versioned folder containing a prompt, output schema, and optional instructions. The harness CLI uses the **Copilot SDK** (via the existing `SdkCopilotAdapter` and `IAgentAdapter` interface from `@chainglass/shared`) to execute prompts, stream typed events in real-time, log every turn to an NDJSON file, validate the agent's structured output against the declared schema, and write a completion record with the session ID for later investigation.

This closes the "agentic verification" loop: the harness can boot the app, interact with it via browser automation, and now dispatch autonomous agents to perform complex verification tasks — smoke tests, visual audits, console log checks — producing structured, validated reports. Agent retrospectives feed directly back into harness improvement, creating a high-fidelity dogfooding loop.

## Goals

- **Declarative agent definitions**: Agents are versioned folders (`harness/agents/<slug>/`) with a prompt, output schema, and optional instructions — discoverable, portable, iterable
- **One-command execution**: `just harness agent run <slug>` creates a run folder, executes the agent via Copilot SDK, streams progress, validates output, and returns structured JSON
- **Full auditability**: Every agent turn, tool call, and thinking step is logged to `events.ndjson` in the run folder; `completed.json` records session ID, timing, and validation result
- **Schema-validated output**: Agents produce structured reports (JSON) validated against a declared JSON Schema; validation failure is "degraded" (not "error") — the agent did work, it just didn't conform
- **Rich human experience**: Colored terminal output with event streaming (tool calls, thinking, messages), pre-flight health check, completion summary with artifact listing
- **Clean agent experience**: Machine-parseable JSON envelope on stdout, structured error codes, artifact paths, validation results
- **Run history**: ISO-dated run folders with frozen prompt copies; `agent history` lists past runs with pass/fail/timing; `agent validate` re-validates output
- **Retrospective feedback loop**: The first agent (smoke-test) includes a mandatory retrospective section — honest feedback on harness friction that drives improvement
- **Reuse existing agent infrastructure**: Import `IAgentAdapter` and `SdkCopilotAdapter` from `@chainglass/shared`; add `@github/copilot-sdk` to harness deps — typed events, proper session objects, no log-file parsing hacks

## Non-Goals

- **Not a workflow system**: This is single-agent, linear execution — not multi-node DAGs, parallel fan-out, session chaining, or orchestration graphs. That's the positional graph / workflow system.
- **Not multi-agent-type support (v1)**: Copilot SDK only for now. Claude Code adapter support is architecturally trivial (same `IAgentAdapter` interface) but deferred.
- **Not a CI/CD pipeline**: Agents run locally on developer machines. CI integration is a future plan.
- **Not a web UI**: Terminal-only. No agent chat UI, SSE streaming, or status indicators.
- **Not modifying the web app or CLI**: Zero changes to `apps/web`, `apps/cli`, or their API routes. Adapter improvements are to `packages/shared` (the agents domain) — these are additive optional fields, not breaking changes.
- **Not storing raw Copilot logs in git**: Run folders are gitignored by default. Only `completed.json` is small enough to commit optionally.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| (external: harness/) | existing | **modify** | Add agent runner CLI commands, agent definition format, run folder management, event logging, schema validation |
| agents | existing | **modify** | Add `model`, `reasoningEffort` to `AgentRunOptions`; add `listModels()` to `ICopilotClient`; fix `approveAll` bug; update fakes — all additive, non-breaking |
| _platform/sdk | existing | **consume** | `@github/copilot-sdk` consumed via `@chainglass/shared`; `CopilotClient` instantiated in harness |

No new domains. The agents domain receives additive improvements (new optional fields on existing interfaces) to support the harness agent runner. The harness imports from `@chainglass/shared` via pnpm workspace resolution.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=0, F=0, T=1 → Total P=5 → CS-3
  - **Surface Area (S=1)**: Multiple files in harness/ but all within one directory tree
  - **Integration (I=2)**: Two external deps — `@github/copilot-sdk` (SDK client) and `@chainglass/shared` (IAgentAdapter, SdkCopilotAdapter, event types)
  - **Data/State (D=1)**: New folder structure (agents/, runs/), JSON Schema validation, completed.json metadata
  - **Novelty (N=0)**: Well-specified — workshop resolved all design questions, `SdkCopilotAdapter` is battle-tested
  - **Non-Functional (F=0)**: Standard dev tooling — no perf/security/compliance concerns beyond path traversal prevention
  - **Testing/Rollout (T=1)**: Unit tests for runner/validator + integration test against real agent (skip in fft)
- **Confidence**: 0.85 — workshop resolved key questions; SDK adapter pattern proven in `demo-copilot-adapter-streaming.ts`
- **Assumptions**:
  - `@github/copilot-sdk` works standalone (no web framework needed — confirmed in research DC-05)
  - `CopilotClient()` zero-arg constructor connects via `GH_TOKEN` env var
  - `SdkCopilotAdapter.run()` returns typed `AgentResult` with `sessionId`, `status`, `exitCode`
  - SDK event handler fires before `sendAndWait()` returns (DYK-02 pattern)
  - `ajv` library works for JSON Schema Draft 2020-12 validation
- **Dependencies**:
  - Plan 067 (harness) complete ✅
  - `@github/copilot-sdk` installable in harness (standalone package.json)
  - `@chainglass/shared` importable from harness (may need workspace config or file: reference)
  - `GH_TOKEN` environment variable set
- **Risks**:
  - `@chainglass/shared` import from outside pnpm-workspace may need special config (file: protocol or workspace:* reference)
  - Turbopack `import.meta.resolve` issue (PL-09) — harness uses tsx not Turbopack, so likely not an issue
  - SDK `CopilotClient` constructor may throw if `GH_TOKEN` invalid — need graceful error handling
  - Agent timeout handling requires calling `adapter.terminate()` cleanly
- **Phases**:
  1. Agent runner core (SDK integration, folder structure, event logging)
  2. Schema validation + CLI commands (validate, history, list)
  3. First agent: smoke-test (definition, output schema, retrospective)

## Acceptance Criteria

### Agent Definition & Discovery

- **AC-01**: Agent definitions live at `harness/agents/<slug>/` with at least `prompt.md` — discovered by scanning for folders with this file
- **AC-02**: `just harness agent list` shows all available agents with their slug and whether they have an output schema
- **AC-03**: Agent slug validation prevents path traversal (reject `../`, `/`, `\`, null bytes; allow `[a-zA-Z0-9_-]{1,64}`)

### Agent Execution

- **AC-04**: `just harness agent run <slug>` creates an ISO-dated run folder (`runs/YYYY-MM-DDTHH-MM-SSZ/`), copies prompt and instructions into it, and executes the agent via `SdkCopilotAdapter.run()`
- **AC-05**: The runner sends the prompt to a Copilot SDK session with `onPermissionRequest: approveAll` for auto-approved tool execution; events are streamed via the `onEvent` callback
- **AC-06**: Agent working directory is the repository root (not the run folder) so the agent can interact with the harness CLI and codebase
- **AC-07**: The runner captures any adapter errors/warnings and writes them to `stderr.log` in the run folder
- **AC-08**: If the agent exceeds `--timeout` (default 300s), the runner kills the process, writes `completed.json` with `result: "timeout"`, and returns error code E123
- **AC-09**: The runner returns a `HarnessEnvelope` JSON to stdout with `command: "agent run"`, session ID, run directory, timing, and validation result

### Event Logging & Auditability

- **AC-10**: Every agent event (tool calls, thinking, messages, session lifecycle) is written to `events.ndjson` in the run folder as it occurs — not buffered until completion
- **AC-11**: Events use the unified `AgentEvent` type mapping (same as `events-jsonl-parser.ts`): `text_delta`, `message`, `tool_call`, `tool_result`, `thinking`, `usage`, `session_start`, `session_idle`, `session_error`
- **AC-12**: `completed.json` records: agent slug, run ID, start/end times, duration, session ID, result status, exit code, validation result, event count, tool call count, and artifact list

### Schema Validation

- **AC-13**: If `output-schema.json` exists in the agent folder, the runner validates `output/report.json` from the run folder against it after agent completion
- **AC-14**: Validation failure results in `status: "degraded"` (exit 0), not `status: "error"` — the agent completed work, it just didn't conform to the schema
- **AC-15**: Validation errors are listed in `completed.json` under `validationErrors` and in the JSON envelope under `data.validationErrors`
- **AC-16**: If no `output-schema.json` exists, validation is skipped and `validated` is `null` in `completed.json`

### Human Experience

- **AC-17**: When run from a terminal (not piped), the runner displays a header box with agent name and run ID, pre-flight health status, and real-time event streaming (tool calls, thinking, messages) to stderr
- **AC-18**: Tool calls show the tool name and a truncated input preview; tool results show success/error status and truncated output
- **AC-19**: On completion, the runner displays a summary: status, timing, session ID, validation result, artifact listing

### History & Management

- **AC-20**: `just harness agent history <slug>` lists past runs with run ID, result, duration, and session ID (most recent first)
- **AC-21**: `just harness agent validate <slug>` re-validates the most recent run's output against the current schema (useful after schema changes)

### First Agent: smoke-test

- **AC-22**: A `smoke-test` agent definition exists at `harness/agents/smoke-test/` with prompt, output schema, and instructions
- **AC-23**: The smoke-test agent performs: health check, 3-viewport screenshots, console error check, server log check, and writes a structured report
- **AC-24**: The smoke-test report includes a `retrospective` section with `workedWell`, `confusing`, and `magicWand` fields — honest feedback on the harness experience
- **AC-25**: The smoke-test runs successfully against the harness container and produces a validated report

### Error Handling

- **AC-26**: If agent slug doesn't exist, return error code E121 with message listing available agents
- **AC-27**: If `GH_TOKEN` is not set, return error code E122 with fix command (`export GH_TOKEN=$(gh auth token)`)
- **AC-28**: If the harness is not healthy, the runner calls `doctor --wait` before launching the agent (pre-flight check)

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@chainglass/shared` import resolution from harness | Medium | High | Add harness to `pnpm-workspace.yaml`; verify with `pnpm ls` |
| SDK `CopilotClient` constructor throws on invalid token | Medium | Medium | Doctor pre-flight checks GH_TOKEN; graceful error E122 |
| Agent timeout during `adapter.run()` | Low | Medium | `adapter.terminate(sessionId)` + finally cleanup; error E123 |
| `ajv` JSON Schema validation too strict | Low | Low | Use `ajv` with `allErrors: true`; coerce types where reasonable |
| Large agent outputs fill disk | Low | Low | `agent clean --keep N` command for pruning; run folders are gitignored |
| Adapter changes break existing contract tests | Low | High | All changes are additive (new optional fields); run `just fft` before commit |

**Assumptions**:
- `@github/copilot-sdk` works standalone via `@chainglass/shared` (confirmed in POC `scratch/copilot-sdk-poc/run.ts`)
- `GH_TOKEN` env var provides valid GitHub authentication
- `SdkCopilotAdapter.run()` with `onPermissionRequest: approveAll` auto-approves all tool executions
- SDK event handler fires typed `AgentEvent` objects in real-time
- Agent definitions are authored by humans (not auto-generated)

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| OQ-01 | Should we support Claude Code CLI (`npx claude`) as an alternative agent backend? | Medium — different binary, same runner structure | Deferred to v2 |
| OQ-02 | Should `completed.json` include the full final agent output text or just a reference to events.ndjson? | Low — storage vs convenience trade-off | [NEEDS CLARIFICATION: including output text is convenient for quick inspection but could be large for verbose agents] |
| OQ-03 | Should the runner inject `CLAUDE.md` or harness docs as context alongside the prompt? | Medium — richer context vs prompt bloat | [NEEDS CLARIFICATION: the agent will discover CLAUDE.md if it reads the repo, but explicit injection guarantees it] |

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ~~SDK Adapter Reuse~~ | ~~Integration Pattern~~ | ~~Done~~ | [Workshop 001](workshops/001-copilot-sdk-adapter-reuse-and-agent-runner-design.md) ✅ |

All major design questions were resolved in Workshop 001. No additional workshops needed before architecture.
