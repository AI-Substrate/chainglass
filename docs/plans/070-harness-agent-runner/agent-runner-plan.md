# Harness Agent Runner — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-07
**Spec**: [agent-runner-spec.md](agent-runner-spec.md)
**ADR**: [ADR-0014](../../adr/adr-0014-first-class-agentic-development-harness.md) (referenced; workspace amendment below)
**Status**: DRAFT
**Complexity**: CS-3 (medium)

## Summary

AI agents building Chainglass can boot and interact with the running app via the harness (Plan 067) — but cannot yet dispatch autonomous sub-agents for repeatable verification tasks. This plan adds a declarative agent runner to the harness CLI: versioned agent folders containing prompts and output schemas, executed via the Copilot SDK (`SdkCopilotAdapter` from `@chainglass/shared`), with full event logging, schema validation, and rich terminal output. Three phases: adapter improvements to `@chainglass/shared`, the runner infrastructure in `harness/`, and the first smoke-test agent that validates the harness end-to-end.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| agents | existing | modify | Add `model`, `reasoningEffort` to `AgentRunOptions`; fix `approveAll` bug; add `listModels()` to `ICopilotClient`; update fakes |
| (external: harness/) | existing | modify | Add agent runner CLI commands, agent definition format, run folder management, event logging, schema validation |
| _platform/sdk | existing | consume | `@github/copilot-sdk` consumed via `@chainglass/shared`; `CopilotClient` instantiated in harness |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/agent-types.ts` | agents | contract | Add `model`, `reasoningEffort` to `AgentRunOptions` |
| `packages/shared/src/interfaces/copilot-sdk.interface.ts` | agents | contract | Add `reasoningEffort`, `workingDirectory`, `availableTools`, `excludedTools`, `systemMessage` to config; add `listModels()` + `CopilotModelInfo` + `CopilotReasoningEffort`; add `setModel()` to session; update resume config |
| `packages/shared/src/index.ts` | agents | contract | Re-export `ICopilotClient`, `ICopilotSession`, `CopilotModelInfo`, `CopilotReasoningEffort` |
| `packages/shared/src/adapters/sdk-copilot-adapter.ts` | agents | internal | Wire `model`/`reasoningEffort` into `createSession()`; fix `approveAll` bug (`"approve"` → `"approved"`) |
| `packages/shared/src/fakes/fake-copilot-client.ts` | agents | internal | Add `listModels()` stub |
| `packages/shared/src/fakes/fake-copilot-session.ts` | agents | internal | Add `setModel()` stub |
| `harness/package.json` | external | internal | Add `@chainglass/shared`, `ajv` deps |
| `harness/src/agent/runner.ts` | external | internal | Agent execution orchestrator — SDK init, event streaming, run folder management |
| `harness/src/agent/validator.ts` | external | internal | JSON Schema validation of agent output via ajv |
| `harness/src/agent/types.ts` | external | internal | AgentDefinition, AgentRunConfig, AgentRunResult types |
| `harness/src/agent/folder.ts` | external | internal | Agent discovery, slug validation, run folder creation |
| `harness/src/agent/display.ts` | external | internal | Rich terminal output — event formatting, header/summary boxes |
| `harness/src/cli/commands/agent.ts` | external | internal | Commander.js `agent run/list/history/validate` subcommands |
| `harness/src/cli/index.ts` | external | internal | Register agent command in main CLI |
| `harness/src/cli/output.ts` | external | internal | Add error codes E120-E125 for agent runner |
| `harness/agents/smoke-test/prompt.md` | external | internal | Smoke test agent prompt |
| `harness/agents/smoke-test/output-schema.json` | external | internal | Smoke test expected output schema |
| `harness/agents/smoke-test/instructions.md` | external | internal | Smoke test agent rules |
| `harness/tests/unit/agent/runner.test.ts` | external | internal | Runner unit tests (with fake adapter) |
| `harness/tests/unit/agent/validator.test.ts` | external | internal | Schema validation unit tests |
| `harness/tests/unit/agent/folder.test.ts` | external | internal | Slug validation, folder structure tests |
| `harness/tests/unit/cli/output.test.ts` | external | internal | Output/error-code tests updated during smoke-test rollout |
| `test/contracts/agent-adapter.contract.ts` | agents | internal | Add model/reasoningEffort contract tests |
| `.gitignore` | _platform | cross-domain | Add `harness/agents/*/runs/` |
| `pnpm-workspace.yaml` | _platform | cross-domain | Add `harness` to workspace packages |
| `docs/project-rules/harness.md` | _platform | cross-domain | Document agent runner commands + workspace membership rationale |
| `CLAUDE.md` | _platform | cross-domain | Add agent runner commands to Harness Commands section |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `approveAll` bug — returns `{kind:"approve"}` but SDK expects `{kind:"approved"}`. Causes permission denials for tool execution. | Fix in Phase 1 (1-line bug fix) |
| 02 | Critical | Harness not in `pnpm-workspace.yaml` — cannot resolve `@chainglass/shared` imports. | Add `harness` to workspace in Phase 2 |
| 03 | Critical | AC-04/AC-05 reference "Copilot CLI" flags (`-p`, `--yolo`) but architecture uses SDK. | Spec already corrected; plan uses SDK throughout |
| 04 | High | `model` field exists on `CopilotSessionConfig` but adapter doesn't pass it to `createSession()`. | Wire through in Phase 1 |
| 05 | High | SDK has `listModels()` API and `ReasoningEffort` type — neither exposed in our interface. | Add to `ICopilotClient` in Phase 1 |
| 06 | High | Commander.js nested subcommands require `.addCommand()` pattern, not `.command().command()` chaining. | Use `addCommand()` in Phase 2 |
| 07 | Medium | `CopilotClient` cast to `ICopilotClient` via `as any` — type-unsafe. | Accept for now; interface alignment is Phase 1 work |
| 08 | Medium | Event NDJSON writes need to be incremental (not buffered) with graceful malformed-line handling. | appendFileSync per event in Phase 2 |
| 09 | Medium | `ICopilotClient` type not re-exported from `@chainglass/shared` index. | Add export in Phase 1 |

## Harness Strategy

- **Current Maturity**: L3 (auto boot + browser interaction + structured evidence + CLI SDK)
- **Target Maturity**: L3+ (adds agent execution capability — still L3 but richer)
- **Boot Command**: `just harness dev`
- **Health Check**: `just harness doctor --wait`
- **Interaction Model**: Copilot SDK (programmatic) + HTTP API + Browser via CDP
- **Evidence Capture**: `events.ndjson` (agent turns), `completed.json` (run metadata), `output/report.json` (validated output), screenshots
- **Pre-Phase Validation**: Required at start of Phase 3 (smoke-test needs running container)

---

## Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|---------------|-----------|------------|
| 1 | SdkCopilotAdapter Improvements | agents | Add model/reasoning support, fix approveAll bug, expose listModels() | None |
| 2 | Agent Runner Infrastructure | external (harness/) | CLI commands, runner orchestrator, event logging, schema validation, folder management | Phase 1 |
| 3 | Smoke Test Agent | external (harness/) | First agent definition, end-to-end validation against live harness | Phase 2 |

---

## Phase 1: SdkCopilotAdapter Improvements

**Objective**: Close the gaps between the Copilot SDK and our adapter so the harness can use it properly — model selection, reasoning effort, listModels(), and the approveAll bug fix.
**Domain**: agents (`packages/shared/`)
**Delivers**:
- Fixed `approveAll` kind value (bug fix)
- `model` and `reasoningEffort` fields on `AgentRunOptions`
- `reasoningEffort` and additional fields on `CopilotSessionConfig`
- Adapter wires `model`/`reasoningEffort` into `createSession()` and `resumeSession()`
- `listModels()` on `ICopilotClient` returning `CopilotModelInfo[]`
- `CopilotReasoningEffort` type exported
- `setModel()` on `ICopilotSession`
- Updated fakes (`FakeCopilotClient.listModels()`, `FakeCopilotSession.setModel()`)
- Contract tests for new capabilities
- Re-export `ICopilotClient` and related types from shared index

**Depends on**: None
**Key risks**: Contract test additions must not break existing tests. All changes are additive (new optional fields).
**Testing**: Lightweight — extend existing contract tests, run `just fft`

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Fix `approveAll` kind value | agents | `approveAll()` returns `{kind:"approved"}` not `{kind:"approve"}` | 1-line bug fix per Workshop 002 Finding C1 |
| 1.2 | Add `model`, `reasoningEffort` to `AgentRunOptions` | agents | New optional fields on interface; existing callers unaffected | Per Workshop 002 C2 |
| 1.3 | Add `reasoningEffort`, `workingDirectory`, `availableTools`, `excludedTools`, `systemMessage` to `CopilotSessionConfig` | agents | Config interface matches SDK capabilities | Per Workshop 002 C4/H1/H2/H3 |
| 1.4 | Update `CopilotResumeSessionConfig` with `model`, `reasoningEffort` | agents | Resume config accepts model/reasoning | Per Workshop 002 H5 |
| 1.5 | Wire `model`/`reasoningEffort` into adapter `createSession()` and `resumeSession()` | agents | Conditional spread — only passes when provided | Per Workshop 002 C3 |
| 1.6 | Add `CopilotReasoningEffort` type and `CopilotModelInfo` interface | agents | Types exported from shared | Per Workshop 002 C5 |
| 1.7 | Add `listModels()` to `ICopilotClient` interface | agents | Interface method returns `Promise<CopilotModelInfo[]>` | Per Workshop 002 C5 |
| 1.8 | Add `setModel()` to `ICopilotSession` interface | agents | Interface method accepts model string | Per Workshop 002 H4 |
| 1.9 | Update `FakeCopilotClient` with `listModels()` | agents | Returns canned model list for tests | Per Workshop 002 C6 |
| 1.10 | Update `FakeCopilotSession` with `setModel()` | agents | No-op stub for tests | Per Workshop 002 H4 |
| 1.11 | Re-export `ICopilotClient`, `ICopilotSession`, `CopilotModelInfo`, `CopilotReasoningEffort` from shared index | agents | Importable via `@chainglass/shared` | Per Finding 09 |
| 1.12 | Add contract tests for model/reasoning options | agents | Tests pass with FakeAdapter and real types | Per Workshop 002 §6 |

### Acceptance Criteria
- AC-05 (revised): Adapter accepts `model` and `reasoningEffort` in run options
- Existing `just fft` passes (no regressions)
- POC script works without `as any` cast for model/reasoning

---

## Phase 2: Agent Runner Infrastructure

**Objective**: Build the harness CLI agent runner — folder management, SDK execution, event logging, schema validation, rich display, and all CLI commands.
**Domain**: external (harness/)
**Delivers**:
- `harness agent run <slug>` — creates run folder, executes via SDK, streams events, validates output
- `harness agent list` — discovers agent definitions
- `harness agent history <slug>` — lists past runs
- `harness agent validate <slug>` — re-validates output against schema
- Agent definition format: `prompt.md` + `output-schema.json` + `instructions.md`
- Run folder structure: ISO-dated with frozen copies, `events.ndjson`, `completed.json`, `output/`
- Rich terminal display (tool calls, thinking, messages)
- JSON envelope on stdout for agent/CI consumption
- Error codes E120-E125
- Unit tests for runner, validator, folder management

**Depends on**: Phase 1 (adapter improvements)
**Key risks**: Workspace resolution (harness needs `@chainglass/shared`); Commander.js subcommand nesting (use `.addCommand()`)
**Testing**: Lightweight — unit tests with fake adapter (no real SDK calls in `just fft`); real agent run as `describe.skip` integration test

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add `harness` to `pnpm-workspace.yaml`; add `@chainglass/shared` and `ajv` to `harness/package.json` | external | `pnpm install` resolves; `import { SdkCopilotAdapter } from '@chainglass/shared'` compiles | Per Finding 02 |
| 2.2 | Add `harness/agents/*/runs/` to `.gitignore` | _platform | Run folders excluded from git | Per Finding 05 |
| 2.3 | Add error codes E120-E125 to `harness/src/cli/output.ts` | external | Error codes: E120=Agent execution failed, E121=Agent not found, E122=Agent auth missing, E123=Agent timeout, E124=Agent validation failed, E125=Agent run folder creation failed | Per Finding 06 |
| 2.4 | Create `harness/src/agent/types.ts` — AgentDefinition, AgentRunConfig, AgentRunResult | external | Types compile, documented | Foundation for all agent code |
| 2.5 | Create `harness/src/agent/folder.ts` — agent discovery, slug validation, run folder creation | external | `listAgents()`, `validateSlug()`, `createRunFolder()` work | AC-01, AC-03, AC-04 |
| 2.6 | Create `harness/src/agent/runner.ts` — SDK orchestration, event streaming, completed.json | external | Runs adapter, captures events to NDJSON, writes completed.json | AC-04, AC-09, AC-10, AC-11, AC-12 |
| 2.7 | Create `harness/src/agent/validator.ts` — JSON Schema validation via ajv | external | Validates output against schema; returns errors array | AC-13, AC-14, AC-15, AC-16 |
| 2.8 | Create `harness/src/agent/display.ts` — rich terminal event formatting | external | Header box, event streaming, completion summary to stderr | AC-17, AC-18, AC-19 |
| 2.9 | Create `harness/src/cli/commands/agent.ts` — Commander.js subcommands | external | `agent run`, `agent list`, `agent history`, `agent validate` registered | AC-02, AC-20, AC-21 |
| 2.10 | Register agent command in `harness/src/cli/index.ts` | external | `just harness agent --help` shows subcommands | |
| 2.11 | Pre-flight checks: GH_TOKEN and harness health | external | Error E122 if no token; calls `doctor --wait` before agent launch | AC-27, AC-28 |
| 2.12 | Agent not found error with available agents listing | external | Error E121 with helpful message | AC-26 |
| 2.13 | Timeout handling: kill adapter on `--timeout` expiry | external | `completed.json` with `result:"timeout"`, error E123 | AC-08 |
| 2.14 | Unit tests: runner, validator, folder | external | Tests pass in `just fft` using fake adapter (no real SDK) | |
| 2.15 | Update `docs/project-rules/harness.md` and `CLAUDE.md` | cross-domain | harness.md: (1) agent runner commands documented, (2) workspace membership clarified with rationale per ADR amendment, (3) error codes E120-E125 listed. CLAUDE.md: agent runner commands added to Harness Commands section | |

### Acceptance Criteria
- AC-01 through AC-21, AC-26 through AC-28
- `just fft` passes (agent tests use fake adapter, no GH_TOKEN needed)
- `just harness agent list` returns empty list (no agents yet)

---

## Phase 3: Smoke Test Agent

**Objective**: Create the first agent definition and validate it end-to-end against the live harness container.
**Domain**: external (harness/)
**Delivers**:
- `harness/agents/smoke-test/` agent definition (prompt, schema, instructions)
- Successful agent run producing validated `report.json`
- Retrospective feedback captured in the report
- Documentation updated with smoke-test as example

**Depends on**: Phase 2 (runner infrastructure); running harness container
**Key risks**: Agent may not follow the prompt perfectly (Copilot autonomy); schema validation may be too strict
**Testing**: Manual — real agent run against live container (describe.skip for CI)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `harness/agents/smoke-test/prompt.md` | external | Prompt instructs agent to: health check, 3 screenshots, console logs, server logs, report, retrospective | AC-22, AC-23 |
| 3.2 | Create `harness/agents/smoke-test/output-schema.json` | external | JSON Schema validates report with health, screenshots, verdict, retrospective fields | AC-24 |
| 3.3 | Create `harness/agents/smoke-test/instructions.md` | external | Agent rules: output to run folder, no git commits, retry limits, honest retrospective | AC-24 |
| 3.4 | Run smoke-test agent against live harness | external | `just harness agent run smoke-test` completes with validated report | AC-25 |
| 3.5 | Iterate on prompt/schema based on run results | external | At least 1 successful validated run | |
| 3.6 | Update harness.md prompt templates section | cross-domain | Smoke-test agent documented as first example | |

### Acceptance Criteria
- AC-22, AC-23, AC-24, AC-25
- Smoke-test report includes retrospective with `workedWell`, `confusing`, `magicWand`
- `events.ndjson` shows tool calls (doctor, screenshot, etc.)
- `completed.json` has `validated: true`

---

## ADR-0014 Amendment: Workspace-Managed Tooling

ADR-0014 established the harness as **"external tooling"** not in `pnpm-workspace.yaml`. This plan amends that principle:

**Change**: Add `harness` to `pnpm-workspace.yaml` so it can import `@chainglass/shared` (for `SdkCopilotAdapter`, `IAgentAdapter`, `AgentEvent` types).

**Why**: The agent runner needs typed SDK integration — not CLI subprocess hacking. The Copilot SDK gives us typed events, proper session management, `listModels()`, model selection, and reasoning effort. Importing via workspace is the clean way to get these. The alternative (CLI subprocess + log-file tailing) was evaluated in the exploration and rejected as fragile and untyped.

**What doesn't change**: The harness is still NOT a registered domain, still NOT in `apps/` or `packages/`, still exports zero contracts to other domains, and still functions as test infrastructure. Adding it to the workspace is a build-system concern, not an architectural promotion to domain status.

**Action**: Task 2.1 adds harness to workspace. Task 2.15 updates `docs/project-rules/harness.md` to clarify the workspace membership with rationale.

---

## Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|-----------|--------|------------|-------|
| `@chainglass/shared` import resolution from harness | Medium | High | Add harness to `pnpm-workspace.yaml`; verify with `pnpm ls` | 2 |
| `CopilotClient` → `ICopilotClient` type mismatch | Low | Medium | Phase 1 aligns the interface; `as any` acceptable short-term | 1 |
| `approveAll` bug causes permission denials | Confirmed | High | Fix in Phase 1 task 1.1 (1-line change) | 1 |
| SDK `listModels()` requires connected client | Low | Low | Create + destroy throwaway session first; or lazy-connect pattern | 1 |
| Agent doesn't follow prompt (Copilot autonomy) | Medium | Medium | Iterate prompt in Phase 3; schema validation catches structural issues | 3 |
| Race condition: terminate() during run() | Low | Medium | Document mutual exclusion; add session state guard if needed | 2 |
| NDJSON partial writes on crash | Low | Medium | appendFileSync per event; parser skips malformed lines (PL-07) | 2 |

## DYK

- **DYK-01: SDK has `listModels()` with reasoning effort metadata** — `CopilotClient.listModels()` returns `ModelInfo[]` including `supportedReasoningEfforts` per model. This is a cached API (first call fetches, subsequent calls return cache). The client must be connected first (lazy-start on `createSession()`).
- **DYK-02: `approveAll` is exported from the SDK** — `import { approveAll } from '@github/copilot-sdk'` gives the canonical implementation. Our adapter's copy had the wrong `kind` value.
- **DYK-03: Sessions support mid-conversation model switching** — `session.setModel("gpt-5.4")` changes the model for the next message while preserving history. Useful for multi-turn agents that start with a reasoning model and switch to a fast model for code generation.
- **DYK-04: SDK `SessionConfig` has 20 fields** — Our interface exposes 4. The most valuable additions for the harness are `workingDirectory` (native cwd), `availableTools`/`excludedTools` (constrained agents), and `systemMessage` (inject agent instructions).
- **DYK-05: POC validated at scratch/copilot-sdk-poc/run.ts** — Proves: zero-arg `CopilotClient()`, `SdkCopilotAdapter` from shared, typed events, model selection via `createSession({model})`, `listModels()` API. Run: `GH_TOKEN=$(gh auth token) npx tsx scratch/copilot-sdk-poc/run.ts --model gpt-5.4`.

---

**Next step**: Run `/plan-4-complete-the-plan` to validate readiness, then `/plan-5-v2-phase-tasks-and-brief` for Phase 1 dossier.

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX002 | 2026-03-08 | Smoke-test retrospective CLI improvements: `console-logs` + `screenshot-all` commands, pnpm workspace docs | external (harness/), cross-domain | Proposed | Smoke-test agent retrospective (run 2026-03-08T10-42-28-675Z-9dce) |
