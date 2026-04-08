# Workflow Execution from Web UI

**Mode**: Full
**Plan**: 074-workflow-execution

📚 This specification incorporates findings from `research-dossier.md` (73 findings, 8 subagents), two deep research reports, and three workshops (`001-execution-wiring-architecture`, `002-central-orchestration-host`, `003-harness-test-data-cli`).

## Research Context

The orchestration engine (`OrchestrationService` → `GraphOrchestration.drive()`) is fully built, tested, and used by the CLI (`cg wf run`). It implements a Settle → Decide → Act loop (ONBAS/ODS/EHS) with real agent and code pods. The web UI can edit workflows and observe file-change SSE events but **cannot start, stop, or restart execution**. The existing SSE multiplexing, GlobalState system, and file-watcher pipelines are all operational — the gap is entirely integration plumbing and a central execution host.

Key research findings:
- ~80% of the system is built; ~20% is integration wiring
- `drive()` lacks an abort/cancellation mechanism (no signal, no 'stopped' exit reason)
- `OrchestrationService` is not registered in the web DI container
- Workflow SSE doesn't route through GlobalState (bypasses the reactive state system)
- The `OrchestrationService` handle cache keys by `graphSlug` only — needs compound key for multi-worktree isolation
- Existing `scripts/dope-workflows.ts` creates test data outside the harness, not dogfooding the `cg` CLI

## Summary

Enable users to **run, stop, and restart** workflow pipelines directly from the browser. A central orchestration host manages all running workflows across all worktrees, publishes live execution state via SSE and GlobalState, survives server restarts, and keeps the UI updated in real-time. Running and completed nodes are locked while future nodes remain editable. A harness test-data CLI provides deterministic, repeatable workflow test environments that dogfood the `cg` CLI.

## Goals

- **Run workflows from the UI**: A "Run" button starts the orchestration loop for the current workflow graph
- **Immediately stop a running workflow**: A "Stop" button halts the orchestration loop cooperatively — running pods finish naturally, the loop stops issuing new work
- **Resume a stopped workflow**: Clicking "Run" on a stopped workflow picks up where it left off — completed nodes are skipped, pending nodes are processed
- **Restart from scratch**: A "Restart" button clears all progress and starts the workflow fresh from the beginning
- **Live UI updates**: The workflow editor updates in real-time as nodes progress through their lifecycle, without manual refresh
- **Central orchestration host**: A single process-level manager owns all running workflows across all worktrees — workflows don't need to emit their own state
- **Server restart recovery**: If the dev server restarts (HMR or crash), previously running workflows resume automatically
- **Node locking during execution**: Running and completed nodes are locked from editing; future nodes remain editable so users can rearrange while the workflow is in progress
- **Cross-worktree isolation**: Multiple worktrees can run workflows simultaneously without interference
- **Events flow through GlobalState**: Execution status enters the reactive state system, enabling any component to subscribe to workflow status
- **Harness test-data CLI**: A harness command group that creates, resets, and manages test workflow environments by dogfooding the `cg` CLI — units, templates, and workflow instances

## Non-Goals

- **Modifying the orchestration engine algorithm**: ONBAS, ODS, EHS, PodManager are not changed — only the wiring around them
- **Worker threads or child processes**: The `drive()` loop runs on the main Node.js event loop (cooperative multitasking via async/await); no worker thread offloading
- **Web-based pod terminal/log viewer**: Viewing pod output and agent logs in the browser is a separate feature
- **Workflow scheduling or triggers**: Running workflows on a schedule, via webhooks, or on git events is out of scope
- **Multi-user concurrent editing**: No collaboration features during execution (single-user assumption)
- **Custom test data names**: The harness test-data CLI uses hardcoded, deterministic names — no user-customizable slugs
- **Replacing the existing file-watcher SSE path**: The existing `workflows` SSE channel (file-change notifications → UI refresh) continues to work alongside the new `workflow-execution` channel

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/positional-graph` | existing | **modify** | Add AbortSignal support to `drive()`, compound cache key in OrchestrationService, register orchestration services in web DI |
| `_platform/events` | existing | **modify** | Add `WorkflowExecution` SSE channel to `WorkspaceDomain`, add to mux channel list |
| `_platform/state` | existing | **modify** | Add `workflowExecutionRoute` ServerEventRouteDescriptor to GlobalStateConnector |
| `workflow-ui` | existing | **modify** | Add Run/Stop/Restart controls, execution status display, node locking during execution |
| `workflow-events` | existing | **consume** | Q&A during execution uses existing contracts (no changes) |
| `work-unit-state` | existing | **consume** | Per-node status display uses existing route (no changes) |
| Harness (dev tooling) | existing | **modify** | Add `test-data` command group with workflow environment management |

No new domains are created. The central `WorkflowExecutionManager` lives within `_platform/positional-graph` as the web-side consumer of the existing orchestration service (parallel to the CLI driver).

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=2
  - **Surface Area (S=2)**: ~15 files across 4 domains + harness, spanning packages/positional-graph, apps/web, and harness/
  - **Integration (I=1)**: One new integration surface — globalThis singleton bootstrapped in instrumentation.ts
  - **Data/State (D=1)**: New execution registry JSON file, new SSE channel, new GlobalState route — no schema migrations
  - **Novelty (N=1)**: Architecture is well-understood from 3 workshops and 2 deep research reports, but AbortSignal integration in the existing drive() loop is novel for this codebase
  - **Non-Functional (F=1)**: Concurrent workflow execution, server restart recovery, and cooperative cancellation require careful handling but are standard patterns
  - **Testing/Rollout (T=2)**: Requires new harness test-data CLI, integration testing of full run/stop/restart cycle, multi-worktree validation
- **Confidence**: 0.85
- **Assumptions**:
  - The existing `drive()` polling loop can be extended with AbortSignal without changing the run() contract
  - `globalThis` singleton in `instrumentation.ts` survives HMR reliably (validated by existing `startCentralNotificationSystem` pattern)
  - Fire-and-forget pod semantics are acceptable for stop behavior (pods finish naturally, not killed)
- **Dependencies**:
  - Orchestration engine must be wired into web DI (prerequisite for everything else)
  - Web CLI must be built (`apps/cli/dist/cli.cjs`) for harness test-data commands to work
- **Risks**:
  - AgentManager interface mismatch (Plan 019 vs Plan 034) may require adapter or dual registration
  - Interrupted pods (server crash during pod execution) leave nodes in ambiguous status
- **Phases** (suggested):
  1. Contract changes: AbortSignal in drive(), compound cache key
  2. Web DI wiring + WorkflowExecutionManager singleton
  3. Server actions + SSE channel + GlobalState route
  4. UI controls (Run/Stop/Restart, status, node locking)
  5. Server restart recovery
  6. Harness test-data CLI

## Acceptance Criteria

1. **Run**: User clicks "Run" on a workflow → orchestration loop starts → nodes begin executing → UI shows "Running" status and live node progress
2. **Stop**: User clicks "Stop" on a running workflow → orchestration loop halts within one iteration boundary → running pods are terminated → running nodes marked 'interrupted' → UI shows "Stopped"
3. **Resume**: User clicks "Run" on a stopped workflow → `drive()` resumes from current graph state → completed nodes are skipped → pending/ready nodes are processed
4. **Restart**: User clicks "Restart" → all progress is cleared → graph resets to initial state → execution starts from the beginning
5. **Live updates**: As a node transitions (starting → agent-accepted → complete), the workflow editor reflects the change within ~1-3 seconds without manual refresh
6. **Node locking**: While running, completed and in-progress nodes cannot be dragged, removed, or rearranged. Future nodes (not yet reached) CAN be edited.
7. **Multi-worktree**: Two different worktrees can each run a workflow simultaneously. Each workflow's state is independent — no cross-contamination.
8. **Server restart**: Dev server restarts (HMR or `SIGTERM`) → previously running workflows resume automatically after restart → completed nodes are not re-executed
9. **Execution status in GlobalState**: Any React component can subscribe to `workflow-execution:{key}:status` via `useGlobalState` and receive reactive updates
10. **Harness test-data create env**: Running `just test-data create env` creates 3 test work units, a workflow template, and a workflow instance — all via `cg` CLI commands. Running it again resets everything to a clean state.
11. **Harness test-data run/stop**: Running `just test-data run` starts the test workflow via `cg wf run`. Running `just test-data stop` halts it.
12. **Harness visibility**: Every `cg` command invoked by the harness is printed to stderr with a `▸` prefix so agents can see exactly what's happening
13. **Harness local/container**: `just test-data create env --target container` creates test data inside the Docker container via `docker exec`
14. **Button states**: Run button visible when idle/stopped/failed. Stop button visible when running. Restart button visible when stopped/completed/failed. Correct button is disabled during transitional states (starting, stopping).

## Risks & Assumptions

### Risks
- **AgentManager mismatch**: ODS expects Plan 034 `IAgentManagerService` (getNew/getWithSessionId). Web has Plan 019 (createAgent). Must adapt or register Plan 034 separately for orchestration.
- **Interrupted pod ambiguity**: If the server crashes while a pod is mid-execution, the node is left in 'starting' or 'agent-accepted'. ONBAS skips in-flight nodes, so they effectively stall. MVP: user manually restarts affected nodes. Future: stale pod detector.
- **HMR singleton stability**: `instrumentation.ts` singletons are "mostly" HMR-safe but not guaranteed by Next.js docs. Mitigated by the existing `startCentralNotificationSystem` pattern proving it works in practice.
- **CLI build freshness**: Harness test-data depends on `apps/cli/dist/cli.cjs` being built. If the CLI is stale, test-data commands fail. Mitigated by the harness pre-checking build status.

### Assumptions
- The existing file-watcher → SSE → UI pipeline delivers node-level status changes (starting, complete, error). The new `workflow-execution` channel adds execution-level status (running, stopped, completed) on top.
- Fire-and-forget pod semantics are acceptable — stopping a workflow means "stop starting new work", not "kill running pods".
- The `scratch/harness-test-workspace/` directory exists (created by `harness seed`) before test-data commands target it.
- `drive()` is inherently resumable — ONBAS skips completed nodes, EHS idempotently settles events, PodManager loads sessions from disk. "Just call drive() again" is the resume strategy.

## Open Questions

All resolved — see Clarifications session below.

## Clarifications

### Session 2026-03-14

**Q1: Workflow Mode** → **Full**. CS-4 with 6 phases across 4 domains + harness. All gates required.

**Q2: Testing Strategy** → **Hybrid**. TDD for orchestration contract changes (AbortSignal, compound cache key, execution manager state transitions). Lightweight for wiring and UI. Integration via harness test-data end-to-end.

**Q3: Mock Usage** → **Avoid mocks entirely**. Use real data/fixtures and existing fakes (codebase convention).

**Q4: Documentation Strategy** → **Hybrid (README + docs/how/)**. Update harness README with test-data commands. Create `docs/how/workflow-execution.md`.

**Q5: Domain Review** → **Confirmed**. All 7 domain assignments correct. No new domains. No contract-breaking changes.

**Q6: Harness Readiness** → **Sufficient**. Current harness (L3+) is adequate as base. test-data commands added as part of this plan.

**Q7: Interrupted node status** → **Option C: New 'interrupted' status**. Add `'interrupted'` to `ExecutionStatus` union type. When a workflow is stopped, nodes in 'starting' or 'agent-accepted' are transitioned to 'interrupted'. On resume, interrupted nodes can be re-dispatched. This is a schema change in `reality.types.ts` and `state.schema.ts` but provides clean semantics.

**Q8: `cg unit update` scope** → **Workshop separately**. Direct file write for MVP. A dedicated workshop will design the `cg unit update` command — how to set inputs/outputs and how units relate to templates (referenced vs copied). See Workshop 004.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Execution wiring architecture | Integration Pattern | Map what's built vs missing, clarify event flow, define state machine | What needs wiring? What's the minimal path? | ✅ Complete (Workshop 001) |
| Central orchestration host | Integration Pattern | Design the singleton manager, multi-worktree isolation, server restart recovery | How does one process manage N workflows? How does state survive restart? | ✅ Complete (Workshop 002) |
| Harness test-data CLI | CLI Flow | Design the command group, dogfooding strategy, local vs container | What commands? How to invoke local CLI? What test data? | ✅ Complete (Workshop 003) |
| cg unit update CLI | CLI Flow | Design CLI for setting inputs/outputs on units, patch file format | How to express complex arrays from CLI? How does harness use it? | ✅ Complete (Workshop 004) |

All workshops are complete. No further workshop opportunities identified — proceed to `/plan-2-clarify` or `/plan-3-architect`.

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Orchestration contract changes (AbortSignal in drive(), 'stopped' exit reason, compound cache key) are safety-critical and get TDD. Wiring (DI registration, SSE channel, GlobalState route) and UI (buttons, status display) get lightweight coverage — verify existing tests pass + targeted integration tests via harness.
- **Focus Areas**:
  - TDD: `drive()` with AbortSignal — abort mid-loop, abort during sleep, already-aborted signal
  - TDD: `OrchestrationService.get()` compound key — same slug different worktrees return different handles
  - TDD: `WorkflowExecutionManager.start/stop/restart` — state transitions, concurrent workflows, idempotent start
  - Lightweight: Server actions return correct shape
  - Lightweight: SSE channel registration and event flow
  - Integration: `harness test-data create env` → `harness test-data run` → `harness test-data stop` end-to-end
- **Excluded**: Existing orchestration engine internals (ONBAS, ODS, EHS, PodManager) — already well-tested
- **Mock Usage**: Avoid mocks entirely — use real data/fixtures and existing fakes (FakeWorkflowEventsService, FakeGlobalStateSystem, etc.)

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **Rationale**: Harness README needs test-data command documentation for agents. A workflow execution guide in docs/how/ helps future agents understand the run/stop/restart architecture.
- **Deliverables**:
  - Update `harness/README.md` with test-data command group documentation
  - Create `docs/how/workflow-execution.md` — how to run workflows from the UI, architecture overview, troubleshooting
  - Update `CLAUDE.md` if new conventions emerge (CLI invocation note already added)
