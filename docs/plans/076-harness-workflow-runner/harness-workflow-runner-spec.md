# Harness Workflow Runner

**Mode**: Full
📚 This specification incorporates findings from research-dossier.md (75+ findings across 8 subagents)
📐 Workshop 001 (Harness Workflow Experience) informed the design philosophy

## Research Context

Plan 074 built all 6 phases of workflow execution (orchestration contracts, web DI, SSE+GlobalState, UI controls, restart recovery, harness test-data CLI). But the implementing agent never physically validated the system worked end-to-end — nodes got stuck at "starting", SSE events failed silently, PodManager paths were wrong. These bugs were only discovered when a human clicked Run in the browser.

Meanwhile, `scripts/test-advanced-pipeline.ts` proves the orchestration engine works perfectly — 23 assertions pass with real agents, Q&A loops, parallel fan-out, and session chains. The gap is between "unit tests pass" and "it actually works when you use it."

The harness already has `test-data` commands for creating units/templates/workflows (Plan 074 Phase 6). What's missing is the tooling that lets an agent **run a workflow, see what the orchestration engine is doing at every step, diagnose failures from structured output, fix the code, and re-run** — all in a tight loop.

## Problem Context (Read This First)

> **Every phase dossier and task brief MUST reference this section.** If you are an agent picking up a phase without prior context, read this before doing anything.

### The Problem We're Solving

Plan 074 built workflow execution for the web UI. An agent implemented all 6 phases, all unit tests passed (5568 tests), code reviews passed, commits were clean. But when a human clicked Run in the browser:

1. **Nodes stuck at "starting"** — ODS dispatched pods but `pod.execute()` either hung or silently failed. No events written to disk. No `node:accepted` event. Drive loop at 0 iterations.
2. **SSE route processing errors** — `[ServerEventRoute] Failed to process event` with `error: {}` on the workflow-execution channel. All events at indices 0-3+ failed.
3. **PodManager path bug** — Sessions path was `.chainglass/graphs/` but should be `.chainglass/data/workflows/`. Fixed in commit `0e453aae` but required package rebuild to take effect.
4. **Restart ENOENT** — Restart button threw `ENOENT` because the pod-sessions directory didn't exist. Fixed with `mkdir({recursive: true})`.

**Root cause**: The agent relied on unit tests with fakes (FakeFileSystem, FakeOrchestration) that don't check directory existence or real subprocess execution. No physical validation was done at any phase.

### Why the Harness Fixes This

The harness creates the feedback loop that was missing: **build → run → observe → fix → repeat**. Each phase of this plan should be validated by actually running a workflow through the harness and checking the output. If the harness says it works, it works. If the harness says it's broken, you have structured telemetry telling you exactly where and why.

### The Dogfooding Contract

Every phase of this plan must:
1. **Use the harness to validate** — don't just run unit tests. Run `harness workflow run` (or the available equivalent at that phase) and check real output.
2. **Improve the harness as you go** — if you discover a gap in the harness tooling while fixing a bug, fix the harness too. The harness gets better because you used it.
3. **Leave structured evidence** — the phase execution log must include actual harness output (not just "tests pass").

### Known Runtime Bugs (as of 2026-03-16)

| Bug | Status | Details |
|-----|--------|---------|
| Nodes stuck at "starting" | **UNFIXED** | ODS dispatches pods but execute() hangs/fails silently. No events written. |
| SSE route processing errors | **UNFIXED** | `[ServerEventRoute] Failed to process event` with empty error objects on workflow-execution channel. |
| PodManager path | **FIXED** | Commit `0e453aae`. Was `.chainglass/graphs/`, now `.chainglass/data/workflows/`. Requires `pnpm --filter @chainglass/positional-graph build` after changes. |
| Restart ENOENT | **FIXED** | Added `mkdir({recursive: true})` before atomic write in PodManager. |
| Package rebuild required | **ONGOING** | Turbopack uses compiled dist/ from packages. After changing package source, must rebuild for dev server to pick up changes. |

## Summary

Add a `harness workflow` command group that **guides agents through running, observing, and debugging full workflow pipelines**. The harness doesn't do the work for the agent — it provides the commands, the telemetry, and the feedback loops that make the agent effective at doing the work itself.

The philosophy: **guide, don't automate away.** The harness gives the agent sharp tools and good lighting. The agent decides what to run, reads the output, diagnoses problems, and fixes them. An agent that uses these commands learns how the orchestration system works, because the structured output at every step IS the documentation.

This is one of many things the harness can do — it already handles health checks, screenshots, browser console logs, agent execution, and test data management. Workflow execution extends the harness with the ability to see the orchestration engine's internals: what ONBAS decided, what ODS dispatched, where pods are in their lifecycle, and what went wrong when things break.

## Goals

- **High-fidelity, short feedback loops** — every harness workflow command returns structured, actionable information. Not "it failed" — but "node X stuck at 'starting' because pod.execute() threw ENOENT at iteration 7." The agent reads that, knows exactly what to fix, fixes it, and re-runs in seconds.
- **Guide the agent through orchestration** — the harness shows the agent what the system is doing at every stage (ONBAS decisions, ODS dispatches, pod status, node transitions). The agent learns the system by using these tools, not by reading architecture docs.
- **Close the validation gap** — agents implementing workflow features should use the harness to physically validate their work, creating the feedback loop that was missing in Plan 074.
- **Mirror the proven test-pipeline** — use the same graph topology (6-node, 4-line, parallel fan-out, Q&A, session chains) that `test-advanced-pipeline.ts` already validates with 23 assertions
- **Dogfood the CG CLI** — workflow manipulation (create, run, stop, status) goes through `cg` CLI commands, because that's the product. Test data setup uses the harness because that's external tooling.
- **Progressive disclosure** — Level 1 (run → pass/fail), Level 2 (status → which node, what state), Level 3 (logs → full event timeline), Level 4 (logs --node → single node forensics). Each level adds detail without overwhelming.
- **Support both local and container execution** — harness commands work against the local dev server or inside the Docker container

## Non-Goals

- **No changes to the orchestration engine** — ONBAS, ODS, PodManager, GraphOrchestration stay as-is. This plan consumes existing contracts.
- **No new domains** — the harness is external tooling per ADR-0014. No domain registry changes.
- **No GUI test runner** — this is CLI-first for agent consumption. Browser validation is a bonus, not the goal.
- **No real agent execution in CI** — real agents require auth tokens and cost money. The harness workflow runner is for local development and agent-driven iteration.
- **No scheduling or multi-user support** — single workflow at a time, single user
- **No changes to ONBAS/ODS algorithms** — if the orchestration engine has bugs, those are fixed in positional-graph, not here
- **No hiding complexity from the agent** — the harness shows the agent what's happening, not abstracts it away. The agent should understand node lifecycles, drive iterations, and pod execution by seeing them in the output.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/positional-graph | existing | **consume** | All orchestration contracts: IOrchestrationService, IGraphOrchestration, DriveEvent, IWorkUnitService, INodeEventService, PodManager |
| workflow-ui | existing | **consume** | Leaf consumer — no contracts exported. Web execution path (WorkflowExecutionManager) is the UI-side consumer we validate. |
| agents | existing | **consume** | IAgentAdapter, IAgentManagerService — agent execution is triggered by ODS, observed by harness |
| _platform/events | existing | **consume** | ICentralEventNotifier, ISSEBroadcaster, WorkspaceDomain channels — SSE telemetry pipeline |
| _platform/state | existing | **consume** | GlobalState paths for workflow-execution status — harness can poll these via REST |
| workflow-events | existing | **consume** | IWorkflowEvents for Q&A lifecycle observation |
| _(harness — external tooling)_ | existing | **modify** | Add `workflow` command group, extend `test-data` environment, add telemetry collection |

No new domains needed. The harness is external tooling per ADR-0014.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=0, T=2
  - Surface Area (S=2): Touches harness CLI, CG CLI (new subcommands), possibly web API routes for detailed status
  - Integration (I=1): External dependency on CG CLI subprocess + possibly SSE endpoint
  - Data/State (D=0): No schema changes; reads existing graph state files
  - Novelty (N=1): Some ambiguity in telemetry depth — how much should the harness see?
  - Non-Functional (F=0): Standard performance expectations
  - Testing/Rollout (T=2): The whole feature IS a testing tool; needs to prove itself by running real workflows
- **Total P**: 6 → CS-3
- **Confidence**: 0.80
- **Assumptions**:
  - CG CLI `cg wf run` and `cg wf show` work correctly for the test workflow
  - The orchestration engine is functional (test-pipeline proves this)
  - GH_TOKEN is available in the environment for agent execution
- **Dependencies**:
  - Plan 074 runtime bugs (nodes stuck at "starting") should be fixed, OR this plan includes fixing them as a prerequisite phase
  - CG CLI must be built (`pnpm --filter @chainglass/cli build`)
- **Risks**:
  - Agent execution requires real API tokens — tests can't run in environments without them
  - Fire-and-forget pod execution makes pod failures invisible without explicit telemetry hooks
- **Phases**: 
  1. Fix runtime bugs + add telemetry (dogfood the harness as we go — each fix improves the harness experience). **Validated by**: running `cg wf run` and seeing nodes progress past "starting".
  2. Add `cg wf show --detailed` for node-level telemetry via CLI. **Validated by**: calling it mid-execution and seeing accurate node states.
  3. Add `harness workflow` command group (run, status, logs, reset). **Validated by**: `harness workflow run` returns structured pass/fail for a real workflow.
  4. Validate end-to-end: CLI workflow run + web UI workflow run both work, agent nodes visible in existing agent system. **Validated by**: clicking Run in browser, watching nodes complete, seeing agents in agent system.

## Acceptance Criteria

1. `harness workflow run` creates test data (if missing), executes the workflow, collects per-iteration telemetry, and reports pass/fail with structured HarnessEnvelope JSON
2. During execution, the harness provides per-node status transitions (ready → starting → accepted → complete/error) that the agent can inspect at any time
3. The harness exposes what ONBAS decided at each iteration (start-node, resume, no-action, graph-complete) so the agent can understand orchestration decisions
4. The harness exposes what ODS dispatched (pod creation, agent adapter selection, execution result) so the agent can trace execution paths
5. Pod failures are visible in harness output (not silently swallowed by fire-and-forget .catch()) — the agent can see exactly which pod failed and why
6. `harness workflow status` returns current node-level status, active pods, session IDs, and iteration count — answering "where is it stuck?" in one command
7. `harness workflow reset` cleans all workflow state and re-creates fresh test data (idempotent) — the agent can get a clean slate in one command
8. The test workflow topology matches test-advanced-pipeline: multi-line, parallel fan-out, Q&A handling, session chains
9. All `harness workflow` commands return structured HarnessEnvelope JSON that agents can parse and act on
10. An agent can iterate on orchestration bugs using the cycle: `workflow reset` → `workflow run` → read output → fix code → repeat
11. `harness workflow logs` captures the execution timeline including server-side orchestration output (ODS pod failures, drive events, errors)
12. The harness workflow commands work against the local dev server (not just container mode)
13. After fixing runtime bugs, clicking Run in the browser UI also works — nodes progress through the full lifecycle, not stuck at "starting"
14. `cg wf show --detailed` returns node-level status including per-node state, timing, and pod session info via the CG CLI product
15. Progressive disclosure works: Level 1 (run → summary), Level 2 (status → node detail), Level 3 (logs → timeline), Level 4 (logs --node → forensics)

## Risks & Assumptions

### Risks
- **Agent execution cost**: Real workflow runs consume API credits (Copilot SDK / Claude). Guard against unintended repeated runs.
- **Fire-and-forget observability**: ODS `.catch()` only logs to stderr. Without changes to the error reporting path, pod failures may remain invisible to the harness unless it captures server output.
- **Web DI wiring differences**: The web DI builds the orchestration stack differently from test-advanced-pipeline.ts. Bugs specific to web wiring won't be caught by CLI-only harness testing.
- **Token availability**: GH_TOKEN must be in the environment. Missing tokens cause silent agent failures.

### Assumptions
- The orchestration engine is fundamentally correct (test-pipeline proves this)
- CG CLI commands (`cg wf run`, `cg wf show`, `cg unit create`) are stable
- The harness can capture server stdout/stderr during workflow execution
- Existing test-data commands (Plan 074 Phase 6) work correctly

## Open Questions

_All resolved — see Clarifications below._

## Testing Strategy

- **Approach**: Hybrid — TDD for harness command logic, real workflow run as integration test
- **Rationale**: The feature IS a testing tool, so its own testing must be grounded in reality. Unit tests for command parsing/envelope formatting. The real proof is running an actual workflow and checking the output matches expectations.
- **Focus Areas**: Command envelope formatting, telemetry collection, progressive disclosure output levels
- **Mock Usage**: Avoid mocks entirely — real data/fixtures only. Aligns with the harness philosophy of high-fidelity feedback.
- **Excluded**: No mocking CG CLI responses. No fake orchestration engine. If it doesn't work with the real system, the test should fail.

## Documentation Strategy

- **Location**: Hybrid — harness/README.md section + docs/how/ guide
- **Rationale**: README gets a quick-reference command table (matches existing pattern). docs/how/ gets a detailed workflow execution guide for agents and humans.
- **Deliverables**:
  - `harness/README.md` — new "Workflow Execution" section with command table
  - `docs/how/harness-workflow.md` — detailed guide with examples, debugging escalation, common failure patterns

## Clarifications

### Session 2026-03-16

**Q1: Workflow Mode** → **Full Mode**
Multi-phase plan with required dossiers and all gates. CS-3 feature warrants full treatment.

**Q2: Testing Strategy** → **Hybrid**
TDD for command logic, real workflow run as integration test. No mocks — real data only.

**Q3: Execution Path** → **Both CLI and Web, harness enables both**
The harness doesn't "validate a path" — it enables agents to USE both paths. The harness provides commands for CLI execution (`cg wf run`) AND guidance/tooling for web execution (browser automation to interact with the UI). The key insight: the harness opens paths for the agent, it doesn't test paths on the agent's behalf. When writing harness agents (like a smoke-test agent), then yes, those agents do validate through the harness.

**Q4: Runtime Bug Fixing** → **Integrated, dogfood as we go**
Don't separate bug fixing from harness building. The process of building the harness IS the process of finding and fixing bugs. Work the problem and improve the harness simultaneously — each iteration makes life easier for the current agent and future agents. This is the harness feedback loop in action.

**Q5: Agent Output Level** → **Log everything, use existing agent system**
Workflow agent nodes should use the **same agent system** that already exists in the `agents` domain. Users can already create agents, see agent history, attach to running agents, and see events streaming. Workflow nodes running agents should be indistinguishable from user-created agents — same registration, same event streaming, same overlay panel. "Why wouldn't that work for this? They should be the same system under the hood."

**Q6: Documentation Strategy** → **Hybrid (README + docs/how/)**
README gets command table, docs/how/ gets detailed guide.

**Q7: Domain Review** → **Confirmed**
All domains consume-only. No contract changes. Harness stays external per ADR-0014.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ~~Harness Workflow UX~~ | ~~CLI Flow~~ | **DONE** — Workshop 001 completed | See `workshops/001-harness-workflow-experience.md` |
| ~~Telemetry Architecture~~ | ~~Integration Pattern~~ | **DONE** — Workshop 002 completed | See `workshops/002-telemetry-architecture.md` |
| ~~CG CLI Status Enhancement~~ | ~~API Contract~~ | **DONE** — Workshop 003 completed | See `workshops/003-cg-cli-status-enhancement.md` |

---

**Spec Location**: `docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md`
**Completed Workshops**: `workshops/001-harness-workflow-experience.md` (Harness Workflow UX)
**Clarifications**: Session 2026-03-16 — 7 questions resolved, 0 remaining
**Next**: `/plan-3-v2-architect` to generate the implementation plan
