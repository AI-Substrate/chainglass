# Workflow Execution from Web UI — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-14
**Spec**: [workflow-execution-spec.md](workflow-execution-spec.md)
**Status**: DRAFT

## Summary

The orchestration engine (`OrchestrationService` → `GraphOrchestration.drive()`) is fully built and tested but only wired in the CLI. This plan wires it into the web app by: (1) adding AbortSignal/stop support to `drive()`, (2) creating a central `WorkflowExecutionManager` singleton, (3) plumbing SSE + GlobalState for live UI updates, (4) building Run/Stop/Restart controls, (5) adding server restart recovery, and (6) building harness test-data CLI commands for deterministic test environments. ~80% of the system is built; this plan implements the remaining ~20% integration plumbing.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/positional-graph` | existing | modify | AbortSignal in drive(), 'stopped'+'interrupted' statuses, compound cache key, ONBAS case handling |
| `_platform/events` | existing | modify | Add `WorkflowExecution` SSE channel to WorkspaceDomain |
| `_platform/state` | existing | modify | Add workflowExecutionRoute ServerEventRouteDescriptor |
| `workflow-ui` | existing | modify | Run/Stop/Restart controls, execution status display, node locking |
| `workflow-events` | existing | consume | Q&A during execution (no changes) |
| `work-unit-state` | existing | consume | Per-node status display (no changes) |
| Harness (dev tooling) | existing | modify | test-data CLI commands, cg unit update/delete |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts` | positional-graph | contract | Add 'stopped' to DriveExitReason, signal to DriveOptions |
| `packages/positional-graph/src/features/030-orchestration/reality.types.ts` | positional-graph | contract | Add 'interrupted' to ExecutionStatus |
| `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | positional-graph | internal | AbortSignal check + abortable sleep in drive() |
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` | positional-graph | internal | Compound cache key |
| `packages/positional-graph/src/features/030-orchestration/onbas.ts` | positional-graph | internal | Handle 'interrupted' status in visitNode |
| `packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts` | positional-graph | contract | (no change — schema already supports update) |
| `apps/web/src/lib/di-container.ts` | positional-graph | cross-domain | Register orchestration services |
| `apps/web/instrumentation.ts` | positional-graph | cross-domain | Bootstrap WorkflowExecutionManager singleton |
| `apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts` | positional-graph | internal | Central execution host |
| `apps/web/src/features/074-workflow-execution/execution-registry.ts` | positional-graph | internal | Persist running-workflow manifest for restart recovery |
| `apps/web/src/features/074-workflow-execution/create-execution-manager.ts` | positional-graph | internal | Factory: resolve DI deps, create manager |
| `apps/web/src/features/074-workflow-execution/get-manager.ts` | positional-graph | internal | globalThis getter |
| `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` | events | contract | Add WorkflowExecution channel name |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | events | cross-domain | Add channel to WORKSPACE_SSE_CHANNELS |
| `apps/web/src/lib/state/workflow-execution-route.ts` | state | internal | ServerEventRouteDescriptor for execution status |
| `apps/web/src/lib/state/state-connector.tsx` | state | internal | Add route to SERVER_EVENT_ROUTES |
| `apps/web/app/actions/workflow-actions.ts` | workflow-ui | internal | Add run/stop/restart/getStatus server actions |
| `apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx` | workflow-ui | internal | Run/Stop/Restart buttons with execution state |
| `apps/web/src/features/050-workflow-page/components/workflow-line.tsx` | workflow-ui | internal | Node locking during execution |
| `apps/cli/src/commands/unit.command.ts` | positional-graph | cross-domain | Add update/delete subcommands |
| `harness/src/cli/commands/test-data.ts` | harness | internal | Command registration |
| `harness/src/cli/index.ts` | harness | internal | Register test-data command |
| `harness/src/test-data/cg-runner.ts` | harness | internal | runCg() helper |
| `harness/src/test-data/environment.ts` | harness | internal | create/clean/status/run/stop logic |
| `harness/src/test-data/constants.ts` | harness | internal | Hardcoded slugs and names |
| `harness/README.md` | harness | internal | Document test-data commands |
| `docs/how/workflow-execution.md` | docs | — | How-to guide |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `ExecutionStatus` has no 'interrupted' — ONBAS visitNode has no case for it | Add to union type, add case in ONBAS visitNode + verify diagnoseStuckLine |
| 02 | Critical | `DriveExitReason` has no 'stopped' — drive() can't express user-initiated halt | Add to union type, return 'stopped' when AbortSignal fires |
| 03 | Critical | OrchestrationService cache key is graphSlug-only — multi-worktree collision | Change to compound key `${worktreePath}:${graphSlug}` |
| 04 | High | No abortable sleep — drive() blocks 10s during idle sleep, ignores abort | Replace plain sleep with `node:timers/promises` setTimeout + signal |
| 05 | High | Orchestration services not registered in web DI — prerequisite for everything | Call registerOrchestrationServices() in web DI, ensure all dependency tokens registered first |
| 06 | High | AgentManager interface mismatch (Plan 019 vs 034) — ODS calls methods that don't exist on web | Register Plan 034 AgentManagerService for orchestration, keep Plan 019 for web agent UI |
| 07 | High | `cg unit update/delete` CLI commands don't exist — service methods exist, CLI wrappers missing | Add CLI wrappers following existing command pattern |
| 08 | High | ServerEventRouteDescriptor pattern proven by work-unit-state — no new abstraction needed | Follow exact same pattern for workflowExecutionRoute |
| 09 | High | ADR-0010 IMP-001: WorkspaceDomain value IS the SSE channel name — mismatch causes silent failure | Verify `WorkspaceDomain.WorkflowExecution === 'workflow-execution'` matches route segment exactly |

## ADR-0012 Deviation: Direct SSE Emission from Execution Manager

ADR-0012 states: "Events on disk are the sole interface between the workflow engine and the outside world." This applies to the **pod ↔ engine** boundary — pods write results to disk, EHS settles them on the next `run()` pass.

The `WorkflowExecutionManager` sits ABOVE the engine as a **consumer** (like the CLI's `cliDriveGraph()`). Execution-level status (running/stopped/completed/iterations) is a management-layer concern with no disk representation. Routing it through disk would:
- Add 600-2500ms latency (file watcher debounce + SSE round-trip)
- Require inventing a new disk format for ephemeral execution state
- Be architecturally equivalent to requiring the CLI to write to disk before printing to stdout

**Decision**: The execution manager emits DriveEvent → SSE directly for execution-level status. Node-level status continues to flow through disk (pod → events → EHS → state.json → file watcher → SSE) unchanged. This preserves ADR-0012 at the engine boundary while enabling responsive UI updates at the management layer.

**Node-level updates** (starting, complete, error): Disk → File Watcher → SSE (unchanged, ADR-0012 compliant)
**Execution-level updates** (running, stopped, iterations): Manager → SSE directly (management layer, not engine boundary)

## Harness Strategy

- **Current Maturity**: L3 (Boot + Browser Interaction + Structured Evidence + CLI SDK)
- **Target Maturity**: L3 (no change — add test-data commands within existing framework)
- **Boot Command**: `just harness dev`
- **Health Check**: `just harness doctor`
- **Interaction Model**: CLI (harness test-data commands) + HTTP API (workflow server actions)
- **Evidence Capture**: JSON envelopes (HarnessEnvelope), cg command output
- **Pre-Phase Validation**: Not required for every phase — test-data commands built in Phase 6

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Orchestration Contracts | `_platform/positional-graph` | Add AbortSignal, 'stopped', 'interrupted', compound key — TDD | None |
| 2 | Web DI + Execution Manager | `_platform/positional-graph` | Wire orchestration into web, create WorkflowExecutionManager singleton | Phase 1 |
| 3 | SSE + GlobalState Plumbing | `_platform/events`, `_platform/state` | Add execution SSE channel + state route + server actions | Phase 2 |
| 4 | UI Execution Controls | `workflow-ui` | Run/Stop/Restart buttons, status display, node locking | Phase 3 |
| 5 | Server Restart Recovery | `_platform/positional-graph` | Persist execution registry, resumeAll() on bootstrap | Phase 2 |
| 6 | Harness + CLI Tools | Harness, CLI | test-data commands, cg unit update/delete, documentation | Phase 1 |

---

### Phase 1: Orchestration Contracts

**Objective**: Extend the orchestration engine contracts with stop/interrupt support and multi-worktree isolation — all via TDD.
**Domain**: `_platform/positional-graph`
**Delivers**:
- AbortSignal support in `drive()` with abortable sleep
- `'stopped'` exit reason in `DriveExitReason`
- `'interrupted'` status in `ExecutionStatus` with ONBAS handling
- Compound cache key in `OrchestrationService.get()`
**Depends on**: None
**Key risks**: ONBAS must correctly handle 'interrupted' nodes — they should be skipped during execution (like in-flight) but eligible for re-dispatch on resume.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add `'stopped'` to `DriveExitReason` type | positional-graph | Type compiles, existing tests pass | Per finding 02 |
| 1.2 | Add `signal?: AbortSignal` to `DriveOptions` | positional-graph | Type compiles, existing tests pass | |
| 1.3 | Implement abortable sleep utility | positional-graph | Test: sleep(10000) aborts immediately when signal fires | Use `node:timers/promises` setTimeout with signal. Per finding 04 |
| 1.4 | Add abort check + abortable sleep to `drive()` | positional-graph | TDD: abort mid-loop returns `{exitReason:'stopped'}`. Abort during sleep returns immediately. Already-aborted signal returns without starting loop. | |
| 1.5 | Add `'interrupted'` to `ExecutionStatus` union type | positional-graph | Type compiles, existing tests pass | Per finding 01 |
| 1.6 | Add `'interrupted'` case to ONBAS `visitNode()` | positional-graph | TDD: interrupted nodes are skipped (return null). diagnoseStuckLine treats 'interrupted' as recoverable (blocks line progression like 'starting'). | Per finding 01 |
| 1.7 | Change `OrchestrationService.get()` to compound cache key | positional-graph | TDD: same slug + different ctx → different handles. Same slug + same ctx → same handle (unchanged). | Per finding 03 |
| 1.8 | Create PodManager + ODS per-handle in `OrchestrationService.get()` | positional-graph | TDD: two concurrent handles have isolated pods and sessions maps. destroyPod on handle A does not affect handle B. | DYK #2: shared PodManager corrupts sessions across concurrent workflows. Move creation from factory into get(). |

### Acceptance Criteria (Phase 1)
- [ ] `drive({signal})` returns `{exitReason:'stopped'}` when signal aborts
- [ ] Abort during sleep returns within <100ms (not waiting for full delay)
- [ ] ONBAS skips 'interrupted' nodes (returns null from visitNode)
- [ ] Two different worktreePaths with same graphSlug get different handles
- [ ] All existing orchestration tests pass unchanged

---

### Phase 2: Web DI + Execution Manager

**Objective**: Wire the orchestration engine into the web app DI container and create the central WorkflowExecutionManager singleton.
**Domain**: `_platform/positional-graph` (primary), web app (integration)
**Delivers**:
- Orchestration services registered in web DI
- `WorkflowExecutionManager` class with start/stop/restart/getStatus/listRunning
- globalThis singleton bootstrapped in `instrumentation.ts`
- `ExecutionHandle` state tracking per workflow
**Depends on**: Phase 1
**Key risks**: AgentManager interface mismatch (finding 06) — must resolve Plan 019/034 compatibility before ODS can dispatch pods.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Register Plan 034 `AgentManagerService` under `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` in web DI | positional-graph | DI resolves `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` → Plan 034 instance. Existing Plan 019 agent UI token unchanged. No token collision. | Per finding 06. Use distinct tokens: ORCHESTRATION_DI_TOKENS.AGENT_MANAGER for orchestration, existing web agent token for UI. |
| 2.2 | Register `ScriptRunner` and `EventHandlerService` in web DI | positional-graph | DI resolves both tokens without error. EventHandlerService dependency chain (INodeEventService) pre-checked. | Per finding 05 |
| 2.3 | Call `registerOrchestrationServices()` in web DI container | positional-graph | `container.resolve(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE)` returns valid OrchestrationService | Per finding 05 |
| 2.4 | Create `WorkflowExecutionManager` class | positional-graph | TDD: start() returns handle, stop() aborts drive() AND destroys all running pods AND marks running nodes as 'interrupted', restart() stops + clears state + starts fresh, getStatus() returns current state, concurrent starts return idempotent result. **Resume path**: start() on a stopped workflow resets 'interrupted' nodes → 'ready' before calling drive(), so ONBAS can re-dispatch them. | See Workshop 002. DYK #1: ONBAS skips 'interrupted', so resume MUST reset them first. DYK #3: stop AND restart must destroy pods before any state changes. |
| 2.5 | Create `get-manager.ts` globalThis getter | positional-graph | Throws clear error if not initialized | |
| 2.6 | Create `create-execution-manager.ts` factory | positional-graph | Resolves all deps from DI container, returns initialized manager | |
| 2.7 | Bootstrap manager in `instrumentation.ts` | positional-graph | Manager accessible via `getWorkflowExecutionManager()` after server start. HMR-safe: follows ADR-0010 §Bootstrap IMP-003 pattern (globalThis flag set before async, reset on failure). SIGTERM cleanup registered. | Follow ADR-0010 + Plan 027 pattern exactly |

### Acceptance Criteria (Phase 2)
- [ ] `getWorkflowExecutionManager()` returns valid manager after server start
- [ ] `manager.start(ctx, slug)` creates execution handle and begins drive() loop
- [ ] `manager.stop(worktreePath, slug)` aborts drive() and awaits completion
- [ ] `manager.restart(ctx, slug)` clears graph state and starts fresh
- [ ] Calling start() twice for same workflow returns idempotent result

---

### Phase 3: SSE + GlobalState Plumbing

**Objective**: Connect the execution manager's events to the UI via SSE channels and GlobalState routes.
**Domain**: `_platform/events` + `_platform/state` (primary), web app (server actions)
**Delivers**:
- `WorkflowExecution` SSE channel
- `workflowExecutionRoute` ServerEventRouteDescriptor
- 4 server actions: runWorkflow, stopWorkflow, restartWorkflow, getWorkflowExecutionStatus
- DriveEvent → SSE bridge in execution manager's handleEvent()
**Depends on**: Phase 2
**Key risks**: None — follows proven work-unit-state pattern exactly (finding 08).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Add `WorkflowExecution` to `WorkspaceDomain` constants | events | `WorkspaceDomain.WorkflowExecution === 'workflow-execution'`. Value MUST equal SSE channel name exactly (ADR-0010 IMP-001: mismatch causes silent delivery failure). | Per finding 09. 1 line. |
| 3.2 | Add channel to `WORKSPACE_SSE_CHANNELS` in workspace layout | events | Channel registered in MultiplexedSSEProvider | 1 line |
| 3.3 | Create `workflowExecutionRoute` ServerEventRouteDescriptor | state | Descriptor maps events → state paths: status, iterations, lastEventType, lastMessage | Per finding 08, follow work-unit-state-route.ts |
| 3.4 | Add route to `SERVER_EVENT_ROUTES` in GlobalStateConnector | state | ServerEventRoute component mounted for workflow-execution channel | 1 line |
| 3.5 | Implement `handleEvent()` bridge in WorkflowExecutionManager | positional-graph | DriveEvent callback → sseManager.broadcast() + stateService.publish() | See Workshop 002 handleEvent() |
| 3.6 | Add `runWorkflow` server action | workflow-ui | Server action resolves manager, calls start(), returns {ok, error?} | |
| 3.7 | Add `stopWorkflow` server action | workflow-ui | Server action resolves manager, calls stop(), returns {ok} | |
| 3.8 | Add `restartWorkflow` server action | workflow-ui | Server action resolves manager, calls restart(), returns {ok} | |
| 3.9 | Add `getWorkflowExecutionStatus` server action | workflow-ui | Returns {status, iterations} from manager | |

### Acceptance Criteria (Phase 3)
- [ ] Calling runWorkflow server action starts the workflow and broadcasts to 'workflow-execution' SSE channel
- [ ] `useGlobalState('workflow-execution:{key}:status')` updates reactively as workflow progresses
- [ ] stopWorkflow server action halts execution within one iteration
- [ ] restartWorkflow clears state and starts fresh

---

### Phase 4: UI Execution Controls

**Objective**: Build the Run/Stop/Restart button controls, live status display, and node locking in the workflow editor.
**Domain**: `workflow-ui`
**Delivers**:
- Run/Stop/Restart buttons in workflow toolbar
- Live execution status display
- Node locking logic during execution
- Button state management per execution state machine
**Depends on**: Phase 3
**Key risks**: None — UI is a leaf consumer, all data flows through GlobalState.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Subscribe to execution status via `useGlobalState` in workflow editor | workflow-ui | Component re-renders when execution status changes | |
| 4.2 | Implement Run/Stop/Restart button group in `workflow-temp-bar.tsx` | workflow-ui | Buttons call correct server actions. Button visibility follows state machine (spec AC #14). | See Workshop 001 state machine table |
| 4.3 | Add transitional state handling (starting, stopping) | workflow-ui | Buttons disabled during transitions. Loading indicators shown. | |
| 4.4 | Implement node locking during execution | workflow-ui | Running+completed nodes: locked (no drag/remove). Future nodes: editable. Locking derived from GlobalState execution status — no direct dependency on orchestration services. | Extend existing `isLineEditable()` in workflow-line.tsx. Coordination pattern: UI reads state, derives locks. |
| 4.5 | Display execution progress | workflow-ui | Show iteration count, status message, elapsed time in toolbar or status area | |

### Acceptance Criteria (Phase 4)
- [ ] Run button visible when idle/stopped/failed, hidden when running
- [ ] Stop button visible when running, hidden otherwise
- [ ] Restart button visible when stopped/completed/failed
- [ ] Clicking Run starts the workflow, UI shows "Running"
- [ ] Completed and running nodes cannot be dragged or removed
- [ ] Future nodes CAN be edited while workflow is running

---

### Phase 5: Server Restart Recovery

**Objective**: Persist an execution registry so that workflows resume automatically after server restart.
**Domain**: `_platform/positional-graph` (execution manager extension)
**Delivers**:
- `execution-registry.json` persistence (read/write)
- `resumeAll()` method on WorkflowExecutionManager
- Registry updated on start/stop/status-change
- Bootstrap calls resumeAll() after manager init
**Depends on**: Phase 2
**Key risks**: Race condition if resumeAll() triggers drive() before the web app is fully ready to serve requests. Mitigated: instrumentation.ts register() completes before requests are served.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Create `execution-registry.ts` — read/write registry JSON | positional-graph | Reads/writes `~/.chainglass/execution-registry.json`. Atomic writes. | See Workshop 002 file format |
| 5.2 | Persist registry on start/stop/status-change/completion | positional-graph | Registry always reflects current execution state | Debounce iteration progress (every 10 iterations or 30s) |
| 5.3 | Implement `resumeAll()` in WorkflowExecutionManager | positional-graph | TDD: reads registry, calls start() for entries with status 'running'. Skips entries where worktree no longer exists. Cleans stale entries. | |
| 5.4 | Call resumeAll() in instrumentation.ts after manager init | positional-graph | Previously-running workflows resume on server restart | |
| 5.5 | Handle graceful shutdown in SIGTERM handler | positional-graph | Manager.cleanup() called on SIGTERM — persists final state | |

### Acceptance Criteria (Phase 5)
- [ ] Starting a workflow creates a registry entry
- [ ] Restarting the dev server resumes previously-running workflows
- [ ] Completed nodes are not re-executed after resume
- [ ] Registry entries for deleted worktrees are cleaned up

---

### Phase 6: Harness + CLI Tools

**Objective**: Build the harness test-data CLI and `cg unit update/delete` commands for dogfooded test workflow management.
**Domain**: Harness (primary), CLI (secondary)
**Delivers**:
- `harness test-data create units/template/workflow/env` commands
- `harness test-data clean/status/run/stop` commands
- `cg unit update` and `cg unit delete` CLI commands
- `runCg()` helper with command visibility
- `--target local|container` switch
- Patch files for test unit hydration
- Updated harness README
- `docs/how/workflow-execution.md`
**Depends on**: Phase 1 (needs 'stopped' support for run/stop commands)
**Key risks**: CLI build freshness — harness depends on built `apps/cli/dist/cli.cjs`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Add `cg unit update <slug>` CLI command | CLI | Calls WorkUnitService.update() with parsed patch. Supports --description, --version, --set, --add-input, --add-output, --patch, --inputs-json, --outputs-json. | See Workshop 004. Fix create bug too. |
| 6.2 | Add `cg unit delete <slug>` CLI command | CLI | Calls WorkUnitService.delete(). Idempotent. | |
| 6.3 | Create `runCg()` helper in harness | harness | Prints `▸ cg ...` to stderr. Routes to local node or docker exec. Uses `apps/cli/dist/cli.cjs` (never global cg). | See Workshop 003 |
| 6.4 | Create `harness/src/test-data/constants.ts` | harness | Hardcoded slugs: test-agent, test-code, test-user-input, test-workflow-tpl, test-workflow | |
| 6.5 | Implement `create units` command | harness | Creates/resets 3 test work units via cg CLI. Hydrates via --patch files. Validates. | |
| 6.6 | Implement `create template` command | harness | Builds source graph via cg wf commands, saves as template, deletes source | |
| 6.7 | Implement `create workflow` command | harness | Instantiates workflow from template via cg template instantiate | |
| 6.8 | Implement `create env` aggregate command | harness | Runs units + template + workflow in sequence. Single entry point for agents. | |
| 6.9 | Implement `clean`, `status`, `run`, `stop` commands | harness | Clean deletes test data. Status shows what exists. Run/stop execute/halt test workflow. | |
| 6.10 | Register test-data command group in harness CLI | harness | `just harness test-data --help` shows all subcommands | |
| 6.11 | Add `just test-data` recipe to justfile | harness | `just test-data create env` works end-to-end | |
| 6.12 | Create test unit patch files | harness | `harness/test-data/patches/{test-agent,test-code,test-user-input}.yaml` | |
| 6.13 | Update `harness/README.md` with test-data documentation | docs | Test-data commands documented with examples | |
| 6.14 | Create `docs/how/workflow-execution.md` | docs | How-to guide for running workflows from UI, architecture overview, troubleshooting | |

### Acceptance Criteria (Phase 6)
- [ ] `just test-data create env` creates 3 units + template + workflow instance
- [ ] Running `create env` again resets everything to clean state
- [ ] Every cg command is printed with `▸` prefix
- [ ] `--target container` creates test data inside Docker container
- [ ] `cg unit update test-agent --patch patch.yaml` applies patch correctly
- [ ] `cg unit delete test-agent` removes unit idempotently

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AgentManager Plan 019/034 mismatch | High | High | Register Plan 034 for orchestration, keep Plan 019 for web agent UI (Phase 2.1) |
| ONBAS mishandles 'interrupted' nodes | Medium | Critical | TDD with explicit test cases for interrupted status (Phase 1.6) |
| HMR breaks globalThis singleton | Low | High | Follow proven Plan 027 pattern (flag-before-async), test with HMR cycles |
| Interrupted pods stall after server crash | Medium | Medium | MVP: user manually restarts. Future: stale pod detector (documented, not in scope) |
| Harness tests CLI not web path | Low | Medium | Flagged (DYK #4): `test-data run` exercises CLI orchestration, not web WorkflowExecutionManager. Future: add harness HTTP-based workflow execution test + smoke-test agent variant for basic workflow validation via browser. Accepted for Plan 074 scope. |
| Race condition in resumeAll() | Low | Medium | instrumentation.ts register() completes before requests served (Next.js guarantee) |
