# Harness Workflow Runner — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-16
**Spec**: [harness-workflow-runner-spec.md](harness-workflow-runner-spec.md)
**Status**: COMPLETE

## ADR References

| ADR | Title | Constraint on This Plan |
|-----|-------|------------------------|
| [ADR-0006](../../adr/adr-0006-cli-based-workflow-agent-orchestration.md) | CLI-Based Workflow Agent Orchestration | CLI subprocess pattern for `cg wf run`. Session binding: DYK-08 requires both `--fork-session` AND `--resume` together. Harness workflow commands are stateless (fresh per invocation — no session persistence needed). |
| [ADR-0010](../../adr/adr-0010-central-domain-event-notification-architecture.md) | Central Domain Event Notification | 3-layer architecture: Filesystem → WatcherAdapter → DomainEventAdapter → CentralEventNotifier. Pod failure events MUST flow through this pipeline, not bypass it via direct service calls. |
| [ADR-0012](../../adr/adr-0012-workflow-domain-boundaries.md) | Workflow Domain Boundaries | ODS (Orchestration) must not call Graph Domain services directly. Events are the extension point. Pod failures routed via NodeEvent filesystem writes, not `graphService.updateNodeStatus()`. |
| [ADR-0014](../../adr/adr-0014-first-class-agentic-development-harness.md) | First-Class Agentic Development Harness | Harness is external tooling — no monorepo imports, CLI subprocess only. "A feature is not done until the harness can verify it." |

## Summary

Plan 074 built workflow execution for the web UI but the implementing agent never physically validated it worked — nodes get stuck at "starting", SSE events fail silently, pod errors are swallowed. This plan fixes those runtime bugs AND builds the harness workflow tooling simultaneously, dogfooding the harness as we go. Each phase both fixes problems and improves the harness, so each iteration makes life easier for the current agent and future agents.

The approach: fix the critical execution blockers first (ODS pod error surfacing, SSE route error serialization, CLI telemetry flags), then add `cg wf show --detailed` for node-level status, then build the `harness workflow` command group (run, status, logs, reset), and finally validate end-to-end with documentation.

## Problem Context (Read This First)

> **Every phase dossier MUST reference the spec's Problem Context section.**
> See `harness-workflow-runner-spec.md § Problem Context` for the full bug table, dogfooding contract, and known runtime bugs.

**TL;DR**: Plan 074 passed 5568 unit tests but broke when a human clicked Run. Two bugs are UNFIXED (nodes stuck at "starting", SSE route errors). This plan fixes them while building the tooling that prevents this from happening again.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/positional-graph | existing | consume + fix | Orchestration engine (ODS pod error surfacing, CLI --detailed/--json-events) |
| workflow-ui | existing | consume | Web execution path — validate it works after fixes |
| agents | existing | consume | Agent adapters triggered by ODS |
| _platform/events | existing | consume + fix | SSE route error serialization fix |
| _platform/state | existing | consume | GlobalState paths for status |
| workflow-events | existing | consume | Q&A lifecycle |
| _(harness)_ | existing | modify | Add `workflow` command group |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/positional-graph/src/features/030-orchestration/ods.ts` | _platform/positional-graph | internal | Surface pod failures instead of swallowing in .catch() |
| `apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts` | _platform/positional-graph | internal | Add --json-events NDJSON output mode |
| `apps/cli/src/commands/positional-graph.command.ts` | _platform/positional-graph | internal | Add --detailed flag to `wf show`, --json-events to `wf run`, --timeout to `wf run` |
| `apps/web/src/lib/state/server-event-route.tsx` | _platform/events | internal | Fix empty error `{}` serialization |
| `apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts` | workflow-ui | internal | Verify broadcast wiring, add concurrency guard |
| `harness/src/cli/commands/workflow.ts` | _(harness)_ | internal | New: workflow run/status/logs/reset commands |
| `harness/src/cli/index.ts` | _(harness)_ | internal | Register workflow command group |
| `harness/src/test-data/environment.ts` | _(harness)_ | internal | Extend with telemetry collection |
| `harness/src/test-data/cg-runner.ts` | _(harness)_ | internal | Add timeout to execFile, strengthen freshness check |
| `harness/README.md` | _(harness)_ | internal | Add Workflow Execution section |
| `docs/how/harness-workflow.md` | docs | internal | New: detailed workflow execution guide |
| `docs/project-rules/harness.md` | docs | internal | Add workflow commands to CLI table |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | ODS `.catch()` swallows pod execution failures — nodes stay "starting" forever, no event emitted | Write typed NodeEvent (`node:error`) to disk in .catch() so event system discovers it (per ADR-0010/0012 — route through events, not direct service calls) |
| 02 | Critical | ServerEventRoute catches errors but serializes Error objects as `{}` — invisible failures | Serialize `error.message` and `error.stack` explicitly in console.warn |
| 03 | Critical | `cg wf run` blocks indefinitely if drive() hangs — harness subprocess never returns | Add `--timeout` flag with default 600s; harness `runCg()` uses `execFile({ timeout })` |
| 04 | Critical | No filesystem lock on concurrent drive() calls — two CLIs or CLI+web can corrupt graph state | Add `.lock` file check before drive() starts in CLI |
| 05 | High | `cg wf show` has no execution status — returns graph structure only | Add `--detailed` flag per Workshop 003 design (getStatus + loadGraphState + pod sessions) |
| 06 | High | `cg wf run` has no structured event output — only human-readable `--verbose` | Add `--json-events` flag per Workshop 002 design (NDJSON DriveEvents to stdout) |
| 07 | High | Harness has no workflow command group — `test-data run/stop` exist but no run+observe+assert flow | Create `harness/src/cli/commands/workflow.ts` following agent.ts pattern |
| 08 | High | Build freshness check warns but doesn't fail — stale CLI hides bug fixes | Strengthen to exit 1 when CLI bundle is stale |
| 09 | High | GH_TOKEN not pre-flight validated — silent runtime failure when missing/expired | Add token check before workflow run, clear error message |

## Harness Strategy

- **Current Maturity**: L3 (Boot + Browser + Evidence + CLI SDK)
- **Target Maturity**: L3 (no maturity change — adding capability within existing level)
- **Boot Command**: `just harness dev` (Docker) or `just dev` (local)
- **Health Check**: `just harness doctor --wait`
- **Interaction Model**: CLI subprocess (`runCg()`) for CG commands + HarnessEnvelope JSON for harness commands
- **Evidence Capture**: Structured JSON (HarnessEnvelope), NDJSON event streams, captured stderr
- **Pre-Phase Validation**: Each phase validates by running a real workflow, not just unit tests

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Fix Execution Blockers | _platform/positional-graph, _platform/events | Fix the bugs that prevent workflows from running: ODS error surfacing, SSE error serialization, CLI timeout/lock | None |
| 2 | CLI Telemetry Enhancement | _platform/positional-graph | Add `--detailed` and `--json-events` flags so harness and agents can observe orchestration | Phase 1 |
| 3 | Harness Workflow Commands | _(harness)_ | Build `harness workflow` command group (run, status, logs, reset) using CLI telemetry from Phase 2 | Phase 2 |
| 4 | End-to-End Validation + Docs | docs, _(harness)_ | Prove it all works (CLI + web + harness), write documentation, update harness README | Phase 3 |

---

### Phase 1: Fix Execution Blockers

**Objective**: Fix the runtime bugs that prevent workflows from actually executing — pod errors, SSE errors, CLI safety — so subsequent phases have a working foundation to build on.
**Domain**: `_platform/positional-graph` (ODS, CLI), `_platform/events` (SSE route)
**Delivers**:
- ODS pod failures surface as node errors (not silently swallowed)
- SSE route errors show actual error messages (not `{}`)
- `cg wf run` has `--timeout` flag and filesystem lock to prevent concurrent corruption
- `runCg()` has subprocess timeout
- Build freshness check fails instead of warning
**Depends on**: None
**Key risks**: ODS error surfacing changes the fire-and-forget contract — must not block the drive loop. SSE fix is low-risk (better logging only).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Surface pod failures in ODS `.catch()` — write a typed NodeEvent (e.g., `node:error`) to disk so ONBAS discovers it on next settle cycle via the event system | _platform/positional-graph | Node transitions from "starting" to "error" when pod.execute() fails, with error message preserved in event store | Per finding 01 + ADR-0010 + ADR-0012. Do NOT await — keep fire-and-forget. Do NOT call graphService directly from ODS (violates domain boundaries). Instead, write a NodeEvent entry to the event filesystem path so CentralWatcherService picks it up → DomainEventAdapter routes it → ONBAS settle phase processes it. This preserves fire-and-forget AND respects the 3-layer event architecture. |
| 1.2 | Fix SSE route error serialization — use `error.message` instead of raw error object | _platform/events | `[ServerEventRoute] Failed to process event` log shows actual error message and stack trace | Per finding 02. ~5 line change. |
| 1.3 | Add `--timeout` flag to `cg wf run` with default 600s — AbortController triggers after timeout | _platform/positional-graph | `cg wf run test-wf --timeout 60` aborts drive() after 60 seconds and returns exit code 1 | Per finding 03. Wire to existing AbortSignal in drive(). |
| 1.4 | Add filesystem lock for drive() in CLI — prevent concurrent runs on same graph | _platform/positional-graph | Second `cg wf run` on same graph returns error "workflow already running" | Per finding 04. Lock file at `.chainglass/data/workflows/{slug}/.lock`. |
| 1.5 | Strengthen `runCg()` build freshness check — exit 1 when stale instead of warning | _(harness)_ | Harness CLI fails fast if `apps/cli/dist/cli.cjs` is older than source files | Per finding 08. |
| 1.6 | Add subprocess timeout to `runCg()` — default 600s configurable | _(harness)_ | `runCg(['wf', 'run', ...], { timeout: 300 })` kills subprocess after 300s | Per finding 03. Use `execFile({ timeout })`. |
| 1.7 | Rebuild packages and verify CLI workflow run progresses past "starting" | _platform/positional-graph | `cg wf run test-workflow --verbose` shows nodes transitioning through starting → accepted → complete | **Dogfooding checkpoint**: Run `just test-data create env && cg wf run test-workflow --verbose` and include output in execution log. |

### Acceptance Criteria (Phase 1)

- [x] AC-5: Pod failures visible in output (not silently swallowed)
- [x] AC-13: Nodes progress through full lifecycle, not stuck at "starting"

---

### Phase 2: CLI Telemetry Enhancement

**Objective**: Add structured observability to the CG CLI so the harness (and agents) can see what the orchestration engine is doing at every step.
**Domain**: `_platform/positional-graph` (CLI commands)
**Delivers**:
- `cg wf show --detailed` returns node-level status, timing, pod sessions, questions, errors
- `cg wf run --json-events` emits DriveEvents as NDJSON lines to stdout
- Both commands return `--json` structured output
**Depends on**: Phase 1 (working drive loop)
**Key risks**: `--detailed` combines 3 data sources (getStatus, loadGraphState, PodManager) — must handle missing state files gracefully. `--json-events` changes stdout format — existing `--verbose` must still work.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add `--detailed` flag to `cg wf show` — combines getStatus + loadGraphState + pod sessions per Workshop 003 schema | _platform/positional-graph | `cg wf show test-workflow --detailed --json` returns per-node status, timing, sessionId, blockedBy, errors | Follow TypeScript types from Workshop 003. Handle missing state.json gracefully (return "pending" for all nodes). |
| 2.2 | Add `--json-events` flag to `cg wf run` — emits DriveEvents as NDJSON lines per Workshop 002 design | _platform/positional-graph | `cg wf run test-workflow --json-events` prints one JSON object per line per DriveEvent, parseable by `jq` | Add to cli-drive-handler.ts. Each line: `{"type","message","timestamp","data?","error?"}`. |
| 2.3 | Add GH_TOKEN pre-flight check to `cg wf run` — clear error when token missing | _platform/positional-graph | `cg wf run test-workflow` without GH_TOKEN prints "Error: GH_TOKEN environment variable required for agent execution" and exits 1 | Per finding 09. Check before calling drive(). |
| 2.4 | Verify telemetry by running workflow and inspecting output | _platform/positional-graph | `cg wf run test-workflow --json-events` emits iteration/idle/status events with accurate node states; `cg wf show test-workflow --detailed` matches | **Dogfooding checkpoint**: Run both commands, include NDJSON sample and --detailed JSON in execution log. |

### Acceptance Criteria (Phase 2)

- [x] AC-3: What ONBAS decided visible at each iteration (via --json-events iteration data)
- [x] AC-4: What ODS dispatched visible (via --json-events iteration data)
- [x] AC-14: `cg wf show --detailed` returns node-level status with per-node state, timing, pod session info

---

### Phase 3: Harness Workflow Commands

**Objective**: Build the `harness workflow` command group that guides agents through running, observing, and debugging workflows — using the CLI telemetry from Phase 2.
**Domain**: _(harness — external tooling)_
**Delivers**:
- `harness workflow reset` — clean + create env in one command
- `harness workflow run` — run workflow, capture NDJSON telemetry + stderr, report pass/fail
- `harness workflow status` — wrap `cg wf show --detailed` in HarnessEnvelope
- `harness workflow logs` — read accumulated events + captured stderr
- Progressive disclosure: Level 1 (run→summary) through Level 4 (logs --node→forensics)
**Depends on**: Phase 2 (--detailed and --json-events flags)
**Key risks**: Subprocess output parsing — NDJSON is line-oriented so should be reliable. Stderr capture for pod errors depends on Phase 1 error surfacing.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `harness/src/cli/commands/workflow.ts` with Commander.js command group registration | _(harness)_ | `harness workflow --help` shows run, status, logs, reset subcommands | Follow agent.ts pattern: `new Command('workflow')`, register with `program.addCommand()`. |
| 3.2 | Implement `workflow reset` — delegates to existing test-data clean + create env | _(harness)_ | `harness workflow reset` returns `{command: "workflow.reset", status: "ok", data: {cleaned, created}}` | Reuse `cleanTestData()` + `createEnv()` from environment.ts. One command, clean slate. |
| 3.3 | Implement `workflow run` — spawn `cg wf run --json-events`, capture stdout (NDJSON) + stderr, wait for exit, run assertions | _(harness)_ | `harness workflow run` returns HarnessEnvelope with exitReason, iterations, per-node status, events, stderrLines, assertion results | Auto-reset if test data missing. Spawn subprocess, parse NDJSON lines, accumulate. On exit, call `cg wf show --detailed` for final snapshot. Run built-in assertions. |
| 3.4 | Implement `workflow status` — wrap `cg wf show --detailed` in HarnessEnvelope | _(harness)_ | `harness workflow status` returns current node-level status, pods, sessions, iteration count | Simple delegation: call runCg, parse JSON, wrap in envelope. |
| 3.5 | Implement `workflow logs` — read accumulated events from last run + optional disk state | _(harness)_ | `harness workflow logs` returns event timeline; `--node <id>` filters to single node; `--errors` shows errors only | Cache events from last `workflow run` to temp file. Support `--node` and `--errors` filters. |
| 3.6 | Register workflow command in `harness/src/cli/index.ts` | _(harness)_ | `registerWorkflowCommand(program)` called in createCli() | One line addition + import. |
| 3.7 | Add `just harness workflow` recipe to justfile | _(harness)_ | `just harness workflow run` works from repo root | Follow existing `just test-data` pattern. |
| 3.8 | Verify complete feedback loop: reset → run → status → logs → fix → repeat | _(harness)_ | Agent can iterate on a workflow bug using only harness commands and structured JSON output | **Dogfooding checkpoint**: Include full harness workflow session (reset → run → status → logs) in execution log. |

### Acceptance Criteria (Phase 3)

- [x] AC-1: `harness workflow run` creates test data, executes, collects telemetry, reports pass/fail
- [x] AC-6: `harness workflow status` returns node-level status, pods, sessions, iterations
- [x] AC-7: `harness workflow reset` cleans + recreates (idempotent)
- [x] AC-9: All commands return HarnessEnvelope JSON
- [x] AC-10: Agent can iterate using reset→run→read→fix→repeat cycle
- [x] AC-11: `harness workflow logs` captures execution timeline + server errors
- [x] AC-12: Works against local dev server
- [x] AC-15: Progressive disclosure (4 levels)

---

### Phase 4: End-to-End Validation + Documentation

**Objective**: Prove the complete system works (CLI path, web UI path, harness path) and write documentation so future agents can use the harness workflow commands.
**Domain**: docs, _(harness)_
**Delivers**:
- Web UI Run button verified working (nodes progress, agents visible in agent system)
- Harness README updated with Workflow Execution section
- `docs/how/harness-workflow.md` guide written
- `docs/project-rules/harness.md` updated with workflow commands
- Execution evidence captured
**Depends on**: Phase 3 (harness workflow commands)
**Key risks**: Web UI execution may reveal additional bugs not found in CLI path. Agent nodes may not register in the existing agent system without additional wiring.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Verify web UI workflow execution — click Run in browser, watch nodes progress through full lifecycle | workflow-ui | Nodes transition: ready → starting → accepted → complete. Status badges update in real-time via SSE. | Use browser automation or manual browser. Capture screenshots as evidence. |
| 4.2 | Verify agent nodes appear in existing agent system — workflow agent pods should register as agents | agents | Running workflow agent node appears in agent list, has event history, can be observed | Per clarification Q5: "same system under the hood." If not wired, document the gap. |
| 4.3 | Add Workflow Execution section to `harness/README.md` — command table with descriptions | _(harness)_ | README has workflow run/status/logs/reset commands with examples | Follow existing command table pattern. |
| 4.4 | Create `docs/how/harness-workflow.md` — detailed guide with examples, debugging escalation, common failures | docs | Guide covers: setup, running, progressive disclosure, common failure patterns, dogfooding contract | Include real output examples from Phase 3 dogfooding. |
| 4.5 | Update `docs/project-rules/harness.md` — add workflow commands to CLI table | docs | Harness project rules include all workflow commands | Small table addition. |
| 4.6 | Run full validation: `harness workflow reset && harness workflow run` with real agents, capture evidence | _(harness)_ | Complete workflow passes all assertions; HarnessEnvelope shows exitReason=complete with all nodes done | **Final dogfooding checkpoint**: Include complete harness output in execution log. This is the proof that Plan 076 works. |

### Acceptance Criteria (Phase 4)

- [x] AC-2: Per-node status transitions observable
- [x] AC-8: Test workflow topology matches test-advanced-pipeline
- [x] AC-13: Web UI Run button works — nodes progress through full lifecycle

---

## Acceptance Criteria (Full Plan)

From spec, all 15:

- [x] AC-1: `harness workflow run` creates test data, executes, collects telemetry, reports pass/fail (Phase 3)
- [x] AC-2: Per-node status transitions observable (Phase 4)
- [x] AC-3: ONBAS decisions visible per iteration (Phase 2)
- [x] AC-4: ODS dispatches visible (Phase 2)
- [x] AC-5: Pod failures visible, not silently swallowed (Phase 1)
- [x] AC-6: `harness workflow status` returns node-level detail (Phase 3)
- [x] AC-7: `harness workflow reset` idempotent clean+create (Phase 3)
- [x] AC-8: Test workflow topology matches test-advanced-pipeline (Phase 4)
- [x] AC-9: All commands return HarnessEnvelope JSON (Phase 3)
- [x] AC-10: Agent can iterate: reset→run→read→fix→repeat (Phase 3)
- [x] AC-11: `harness workflow logs` captures timeline + server errors (Phase 3)
- [x] AC-12: Works against local dev server (Phase 3)
- [x] AC-13: Web UI Run button works, nodes not stuck at "starting" (Phase 1 + Phase 4)
- [x] AC-14: `cg wf show --detailed` returns node-level status (Phase 2)
- [x] AC-15: Progressive disclosure (4 levels) (Phase 3)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ODS error surfacing changes fire-and-forget contract | Medium | High | Keep async — write NodeEvent to disk in .catch() (per ADR-0010/0012), do NOT await or block drive loop, do NOT call graphService directly |
| Two concurrent drive() loops corrupt graph state | Medium | Critical | Filesystem lock file before drive() starts; check on entry, remove on exit/signal |
| GH_TOKEN missing causes silent agent failure | High | Medium | Pre-flight check in `cg wf run` and `harness workflow run`; clear error message |
| Build freshness — stale CLI hides bug fixes | High | High | Strengthen freshness check to exit 1; document rebuild requirement |
| Web DI wiring differs from CLI — bugs specific to web path | Medium | Medium | Phase 4 explicitly validates web path; capture evidence |
| Agent nodes may not register in existing agent system | Medium | Low | Phase 4 verifies; if not wired, document gap for future plan |

---

**Plan Location**: `docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md`
**Phases**: 4
**Tasks**: 25
**Domains**: 6 existing (consume) + 1 harness (modify), 0 new
**Next step**: Run `/plan-4-complete-the-plan` to validate readiness

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| [FX001](fixes/FX001-close-dev-loop.md) | 2026-03-24 | Close the agent development loop — host-default wf-*, wf-watch, AGENTS.md playbook | _(harness)_, docs | Complete | Workshop 010 |
| [FX002](fixes/FX002-unified-execution-logs.md) | 2026-03-26 | Unified workflow execution logs — timeline, diagnostics, cg wf logs, just wf-logs | positional-graph, workflow-ui, _(harness)_, docs | Complete | Workshop 012 |
| [FX003](fixes/FX003-pod-timeout-ui-diagnostics.md) | 2026-03-29 | Pod timeout, stuck detection, UI diagnostics, server.json fix | positional-graph, shared, workflow-ui, _(harness)_ | Proposed | Workshops 009/011/013 |
