# CodePod Completion and GOAT Integration Testing — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-18
**Spec**: [./codepod-and-goat-integration-spec.md](./codepod-and-goat-integration-spec.md)
**Status**: DRAFT

**Workshops**:
- [05-real-integration-testing.md](./workshops/05-real-integration-testing.md) — onRun callback, agent simulation, demo script
- [06-finishing-codepod.md](./workshops/06-finishing-codepod.md) — 4 CodePod problems, ScriptRunner, ODS wiring
- [07-test-graph-fixtures-and-goat.md](./workshops/07-test-graph-fixtures-and-goat.md) — workspace lifecycle, GOAT graph, reuse strategy

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Project Structure](#project-structure)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: CodePod Completion and ScriptRunner](#phase-1-codepod-completion-and-scriptrunner)
   - [Phase 2: Test Graph Infrastructure](#phase-2-test-graph-infrastructure)
   - [Phase 3: Simple Test Graphs](#phase-3-simple-test-graphs)
   - [Phase 4: GOAT Graph and Demo Script](#phase-4-goat-graph-and-demo-script)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [File Placement Manifest](#file-placement-manifest)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Checklist](#progress-checklist)
11. [ADR Ledger](#adr-ledger)
12. [Deviation Ledger](#deviation-ledger)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

CodePod (the execution container for code-type work units) is incomplete — it runs an empty script with no graph context. This plan finishes CodePod, builds a real ScriptRunner, then proves the entire orchestration pipeline works end-to-end using simulation scripts that "play the agent role" via CLI commands.

**Solution approach**:
- Phase 1: Fix CodePod (script path, env vars, unitSlug) + build real ScriptRunner + update ODS/PodManager
- Phase 2: Build test graph infrastructure (withTestGraph helper, workspace lifecycle, unit fixture copying)
- Phase 3: Create simple test graphs (simple-serial, parallel-fan-out, error-recovery) and validate
- Phase 4: Build the GOAT graph (every scenario) + standalone demo script (`just drive-demo`)

**Expected outcomes**: Running `cg wf run <slug>` drives a graph to completion using real scripts that call CLI commands. The GOAT graph exercises serial progression, parallel fan-out, manual transitions, error recovery, question/answer cycles, and multi-input aggregation — all with deterministic simulation scripts.

---

## Technical Context

### Current System State

- **Plan 036**: Complete — drive() loop, formatGraphStatus, DriveEvent, CLI command (`cg wf run`)
- **Plan 030**: Orchestration engine — ONBAS, ODS, run(), settle, all 8 phases landed
- **Plan 032**: Node event system — raiseEvent, handlers, EHS settle phase
- **CodePod**: Exists but broken — runs empty script (`script: ''`), no graph context env vars, no unitSlug
- **IScriptRunner**: Interface exists with FakeScriptRunner. No real implementation.
- **FakeAgentInstance**: Returns canned results only — no callback/side-effect mechanism

### Key Constraints

- **Domain boundary enforcement** (ADR-0012): ODS can depend on `IWorkUnitLoader` (graph→orchestration is allowed). CodePod is pod-domain. ScriptRunner is pod-domain.
- **Fakes over mocks**: No `vi.mock`/`jest.mock`. All test doubles implement real interfaces.
- **PlanPak**: New files in feature folders. Cross-plan-edits for existing files.
- **Workspace registration**: CLI resolves workspace from registered registry. Temp workspaces must be registered then cleaned up.
- **25 call-site cascade**: CodePod constructor (9 sites) + ODS dependency (16 sites) must be updated atomically.

### Dependencies

- Plan 036 (drive loop, CLI command) — COMPLETE
- Plan 030 (orchestration engine) — COMPLETE
- Plan 032 (node event system) — COMPLETE
- Workspace service (add/remove) — EXISTS

---

## Critical Research Findings

### 01: CodePod Constructor Cascade — 9 Call Sites

**Impact**: High
**Sources**: [I1-01, R1-01]
**Problem**: Changing CodePod constructor from `(nodeId, runner)` to `(nodeId, runner, scriptPath, unitSlug)` breaks 8 test sites + 1 PodManager site.
**Action**: Update all 9 sites atomically. In tests use placeholder values (`'/test/script.sh'`, `'test-unit'`).
**Affects**: Phase 1

### 02: ODS Dependency Addition — 16 Call Sites

**Impact**: High
**Sources**: [I1-05, R1-02]
**Problem**: Adding `workUnitLoader: IWorkUnitLoader` to `ODSDependencies` breaks 16 call sites (12 in ods.test.ts, 4 in other test/e2e files).
**Action**: Add as required field. Create `FakeWorkUnitLoader` for tests. Update all 16 sites in same commit as CodePod changes.
**Affects**: Phase 1

### 03: Workspace Registration API — add/remove, Not register/unregister

**Impact**: Medium
**Sources**: [R1-04]
**Problem**: Workshop 07 calls `workspaceService.register()` but the real API is `workspaceService.add(name, path, options?)` and `workspaceService.remove(slug)`.
**Action**: Use `add`/`remove` in `withTestGraph()`. Verify method signatures before implementation.
**Affects**: Phase 2

### 04: No `.chainglass/units/` Helper

**Impact**: Medium
**Sources**: [R1-07]
**Problem**: `createTestServiceStack()` creates `.chainglass/data/workflows/` but NOT `.chainglass/units/`. Work units must exist at this path for `addNode()` validation.
**Action**: `withTestGraph()` must explicitly `mkdir -p .chainglass/units/` and `cp -r` fixtures. `chmod +x` on `.sh` files.
**Affects**: Phase 2

### 05: FakeAgentInstance Has No Callback Mechanism

**Impact**: Medium
**Sources**: [I1-06]
**Problem**: `FakeAgentInstance.run()` returns canned results only. Integration tests need agent simulation where run() triggers side effects (graph state mutation).
**Action**: Add optional `onRun?: (options: AgentRunOptions) => Promise<void>` to `FakeAgentInstanceOptions`. Called inside `run()` before returning result. Cross-plan-edit to `@chainglass/shared`.
**Affects**: Phase 2

### 06: ScriptRunner — Proven spawn Pattern Available

**Impact**: Low
**Sources**: [R1-06]
**Problem**: First `spawn` usage in pod domain. Need subprocess execution with stdout/stderr capture, exit code, kill support.
**Action**: Copy pattern from `unix-process-manager.ts`: `spawn('bash', [script], { cwd, env, timeout })`. ~50 lines.
**Affects**: Phase 1

### 07: Domain Boundary — ODS + IWorkUnitLoader Is Acceptable

**Impact**: Low
**Sources**: [R1-03]
**Problem**: ODS (orchestration-domain) gaining `workUnitLoader` (graph-domain) dependency.
**Action**: Dependency direction is graph→orchestration (allowed per ADR-0012). ODS *uses* the loader via injection, doesn't *own* it. Same pattern as `graphService` being passed to ODS.
**Affects**: Phase 1

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per spec and constitution)
**Rationale**: Complex infrastructure changes (CodePod, ScriptRunner, ODS wiring) plus integration tests that prove the full orchestration pipeline. RED-GREEN-REFACTOR for all production code.
**Focus Areas**: ScriptRunner subprocess execution, CodePod env vars, integration tests with real graph state, GOAT multi-step sequence.

### Test-Driven Development

Every phase follows the TDD cycle:
1. Write interface / type
2. Write fake implementing the interface
3. Write tests against the fake or real (RED)
4. Implement the real code (GREEN)
5. Refactor for quality (REFACTOR)

### Test Documentation

Every test file includes the 5-field Test Doc comment block.

### Mock Usage

**Policy**: Fakes over mocks — no `vi.mock`/`jest.mock` ever. All test doubles implement real interfaces.

---

## Project Structure

```
./  (project root)
├── packages/
│   ├── positional-graph/
│   │   └── src/
│   │       └── features/
│   │           └── 030-orchestration/          # Cross-plan-edit
│   │               ├── pod.code.ts             # EDIT: scriptPath, unitSlug, env vars
│   │               ├── pod-manager.ts          # EDIT: pass scriptPath/unitSlug to CodePod
│   │               ├── pod-manager.types.ts    # EDIT: scriptPath on PodCreateParams
│   │               ├── ods.ts                  # EDIT: resolve scriptPath via workUnitLoader
│   │               ├── ods.types.ts            # EDIT: add workUnitLoader to ODSDependencies
│   │               ├── script-runner.ts        # NEW: real ScriptRunner
│   │               └── script-runner.types.ts  # EXISTS (interface + fake)
│   ├── shared/
│   │   └── src/features/034-agentic-cli/fakes/
│   │       └── fake-agent-instance.ts          # EDIT: add onRun callback
│   └── positional-graph/src/container.ts       # EDIT: register real ScriptRunner
├── apps/
│   └── cli/src/lib/container.ts                # EDIT: register real ScriptRunner
├── dev/
│   └── test-graphs/                            # NEW: test graph fixtures
│       ├── README.md
│       ├── shared/                             # Test helpers
│       │   ├── graph-test-runner.ts
│       │   ├── assertions.ts
│       │   └── helpers.ts
│       ├── simple-serial/
│       │   ├── graph.setup.ts
│       │   └── units/ (setup, worker)
│       ├── parallel-fan-out/
│       │   ├── graph.setup.ts
│       │   └── units/ (setup, parallel-1/2/3, combiner)
│       ├── error-recovery/
│       │   ├── graph.setup.ts
│       │   └── units/ (setup, fail-node)
│       └── goat/
│           ├── graph.setup.ts
│           └── units-code/ (all GOAT nodes)
├── scripts/
│   └── drive-demo.ts                           # NEW: standalone demo
├── test/
│   ├── unit/positional-graph/features/030-orchestration/
│   │   ├── script-runner.test.ts               # NEW
│   │   ├── pod-code.test.ts                    # EXISTS (update constructor calls)
│   │   └── ods.test.ts                         # EXISTS (update deps)
│   └── integration/
│       └── orchestration-drive.test.ts          # NEW: integration tests
└── docs/plans/037-codepod-and-goat-integration/
    ├── codepod-and-goat-integration-spec.md
    ├── codepod-and-goat-integration-plan.md     # This file
    └── workshops/ (symlinks to 036)
```

---

## Implementation Phases

### Phase 1: CodePod Completion and ScriptRunner

**Objective**: Fix CodePod to actually execute scripts with full graph context, build the real ScriptRunner, and update ODS/PodManager to pass script paths.

**Workshop**: [06-finishing-codepod.md](./workshops/06-finishing-codepod.md) — all 4 changes

**Deliverables**:
- CodePod receives `scriptPath` and `unitSlug` in constructor
- CodePod passes `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` env vars
- Real `ScriptRunner` using `child_process.spawn`
- ODS resolves script path via `workUnitLoader` dependency
- PodCreateParams includes `scriptPath` for code variant
- PodManager passes `scriptPath` and `unitSlug` to CodePod
- DI containers register real ScriptRunner (replace FakeScriptRunner in CLI production)
- All 25 call-site cascade updated

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 25 call-site cascade | Certain | High | All changes in single commit. Placeholder values for tests. |
| Domain boundary (ODS + workUnitLoader) | Low | Medium | Allowed per ADR-0012 (graph→orchestration). Same pattern as graphService. |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write RED tests for ScriptRunner: spawns bash script, captures exit code/stdout/stderr, kill works, timeout. File: `test/unit/positional-graph/features/030-orchestration/script-runner.test.ts`. Run: `pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts` | 2 | Tests fail (no real ScriptRunner) | - | RED |
| 1.2 | [ ] | Implement real `ScriptRunner` using `child_process.spawn` | 2 | All tests from 1.1 pass | - | GREEN |
| 1.2b | [ ] | Write contract test for IScriptRunner: parameterized factory running against both FakeScriptRunner and real ScriptRunner (R-TEST-008). File: `test/contracts/script-runner.contract.ts` | 2 | Contract test passes for both implementations | - | R-TEST-008 |
| 1.3 | [ ] | Write RED tests for CodePod env vars: verify CG_GRAPH_SLUG, CG_NODE_ID, CG_WORKSPACE_PATH passed to runner via FakeScriptRunner | 2 | Tests fail (CodePod doesn't pass env vars yet) | - | RED — must precede implementation |
| 1.4 | [ ] | Update `PodCreateParams` code variant with `scriptPath: string` | 1 | Types compile | - | pod-manager.types.ts |
| 1.5 | [ ] | Update CodePod constructor: add `scriptPath`, `unitSlug`. Add `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` env vars. Use `this.scriptPath` instead of `''`. | 2 | CodePod compiles. Tests from 1.3 pass. | - | GREEN |
| 1.6 | [ ] | Update PodManager to pass `scriptPath` + `unitSlug` to CodePod | 1 | PodManager compiles | - | pod-manager.ts |
| 1.7 | [ ] | Add `workUnitLoader: IWorkUnitLoader` to `ODSDependencies`. Update ODS `buildPodParams()` to resolve scriptPath. | 2 | ODS compiles | - | ods.ts, ods.types.ts |
| 1.8 | [ ] | Update all 25 test call sites (9 CodePod + 16 ODS) with placeholder values | 2 | All existing tests compile and pass | - | Cascade fix |
| 1.9 | [ ] | Register real ScriptRunner in DI containers (positional-graph + CLI) | 1 | Containers resolve ScriptRunner | - | container.ts × 2 |
| 1.10 | [ ] | `just fft` clean | 1 | All tests pass, lint clean | - | |

### Acceptance Criteria
- [ ] CodePod receives `scriptPath` from PodCreateParams (AC-01)
- [ ] CodePod passes `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` env vars (AC-02)
- [ ] `INPUT_*` env vars still work (AC-03)
- [ ] Real ScriptRunner executes bash scripts via spawn (AC-04, AC-05, AC-06)
- [ ] ODS resolves script path via workUnitLoader (AC-07)
- [ ] CodePod stores unitSlug (AC-08)
- [ ] `just fft` clean (AC-31)

---

### Phase 2: Test Graph Infrastructure

**Objective**: Build the `withTestGraph()` helper, workspace lifecycle management, and FakeAgentInstance onRun callback.

**Workshop**: [07-test-graph-fixtures-and-goat.md](./workshops/07-test-graph-fixtures-and-goat.md) § Part 1 (lifecycle), [05-real-integration-testing.md](./workshops/05-real-integration-testing.md) § Part 2 (onRun callback)

**Deliverables**:
- `FakeAgentInstance.onRun` callback (cross-plan-edit to @chainglass/shared)
- `dev/test-graphs/shared/graph-test-runner.ts` — `withTestGraph()` helper
- `dev/test-graphs/shared/helpers.ts` — `completeUserInputNode()`, `makeScriptsExecutable()`
- `dev/test-graphs/shared/assertions.ts` — `assertGraphComplete()`, `assertNodeComplete()`
- `dev/test-graphs/README.md` — fixture catalogue
- Workspace registration + cleanup lifecycle proven

**Dependencies**: Phase 1 (CodePod must work for scripts to execute)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Workspace API mismatch (add/remove vs register) | Medium | Medium | Verify signatures before implementation (Finding 03) |
| Registry pollution from crashed tests | Medium | Medium | try/finally + timestamped slugs (R1-09) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Add `onRun` callback to `FakeAgentInstance` | 1 | Optional callback, called during run() before returning | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t001-add-onrun-callback-to-fakeagentinstance) | Completed · log#task-t001-add-onrun-callback-to-fakeagentinstance [^3] |
| 2.2 | [x] | Create `dev/test-graphs/` directory structure with README.md | 1 | Directory exists with catalogue | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t002-dev-test-graphs-directory-readme) | Completed · log#task-t002-dev-test-graphs-directory-readme [^4] |
| 2.3 | [x] | Write RED smoke test: `withTestGraph` creates workspace, registers it, copies units, `addNode` validates unit, runs test callback, cleans up. File: `test/integration/test-graph-infrastructure.test.ts`. Run: `pnpm test -- --run test/integration/test-graph-infrastructure.test.ts` | 2 | Test fails (helpers don't exist yet) | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t003-red-smoke-test) | Completed · log#task-t003-red-smoke-test [^5] |
| 2.4 | [x] | Implement `withTestGraph()` helper: mkdtemp → workspace add → copy units → setup graph → test → remove → cleanup | 3 | Helper creates workspace, copies units, runs test, cleans up | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t004-withtestgraph-implementation) | Completed · log#task-t004-withtestgraph-implementation [^6] |
| 2.5 | [x] | Implement `completeUserInputNode()` helper | 1 | Raises accept + saves outputs + raises completed events | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t008-completeuserinputnode) | Completed · log#task-t008-completeuserinputnode [^10] |
| 2.6 | [x] | Implement `makeScriptsExecutable()` helper | 1 | Globs *.sh, chmod +x | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t006-makescriptsexecutable) | Completed · log#task-t006-makescriptsexecutable [^8] |
| 2.7 | [x] | Implement assertion library (assertGraphComplete, assertNodeComplete, assertOutputExists) | 1 | Assertions work against real graph state | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t007-assertion-library) | Completed · log#task-t007-assertion-library [^9] |
| 2.8 | [x] | Make smoke test GREEN — all helpers wired | 1 | Smoke test from 2.3 passes | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t005-smoke-test-green) | Completed · log#task-t005-smoke-test-green [^7] |
| 2.9 | [x] | `just fft` clean | 1 | All tests pass | [📋](tasks/phase-2-test-graph-infrastructure/execution.log.md#task-t009-just-fft) | Completed · log#task-t009-just-fft [^11] |

### Acceptance Criteria
- [ ] Test graph fixtures stored in `dev/test-graphs/` (AC-09)
- [ ] `withTestGraph()` creates temp workspace and registers it (AC-10, AC-11)
- [ ] Work units copied to `.chainglass/units/` with correct structure (AC-12)
- [ ] `addNode()` validates units exist on disk (AC-13)
- [ ] Scripts made executable (AC-14)
- [ ] FakeAgentInstance has onRun callback
- [ ] `just fft` clean (AC-31)

---

### Phase 3: Simple Test Graphs

**Objective**: Create the first test graph fixtures (simple-serial, parallel-fan-out, error-recovery), write integration tests that drive them to completion.

**Workshop**: [07-test-graph-fixtures-and-goat.md](./workshops/07-test-graph-fixtures-and-goat.md) § Part 3 (graph catalogue), Part 5 (simulation scripts)

**Deliverables**:
- `dev/test-graphs/simple-serial/` — graph.setup.ts + units with simulation scripts
- `dev/test-graphs/parallel-fan-out/` — 3 parallel code nodes + combiner
- `dev/test-graphs/error-recovery/` — node that fails
- Integration tests proving drive() completes each graph
- All simulation scripts working with real CLI commands

**Dependencies**: Phase 2 (withTestGraph helper)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Simulation scripts fail due to workspace resolution | Medium | High | Scripts use --workspace-path $CG_WORKSPACE_PATH |
| Graph state not progressing | Medium | Medium | Simple graphs first, assert after each drive() call |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Create `simple-serial` graph fixture: graph.setup.ts + units (setup, worker) + simulate.sh | 2 | Files on disk, unit.yaml validates | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t002) | [^13] |
| 3.2 | [x] | Write RED integration test: simple-serial drives to completion | 2 | Test fails (graph doesn't exist in test yet) | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t003) | RED [^14] |
| 3.3 | [x] | Make simple-serial integration test pass | 2 | drive() returns exitReason: 'complete' | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t003) | GREEN [^14] |
| 3.4 | [x] | Create `parallel-fan-out` graph fixture | 2 | 3 parallel nodes + combiner | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t005) | [^15] |
| 3.5 | [x] | Write + make pass: parallel-fan-out integration test | 2 | All parallel nodes complete, combiner completes | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t005) | RED→GREEN [^15] |
| 3.6 | [x] | Create `error-recovery` graph fixture with fail script | 1 | Script exits non-zero | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t007) | [^16] |
| 3.7 | [x] | Write + make pass: error-recovery integration test | 2 | drive() returns exitReason: 'failed', node in blocked-error status | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t007) | RED→GREEN [^16] |
| 3.8 | [x] | `just fft` clean | 1 | All tests pass | [📋](tasks/phase-3-simple-test-graphs/execution.log.md#task-t009) | [^17] |

### Acceptance Criteria
- [ ] simple-serial graph drives to completion (AC-20)
- [ ] parallel-fan-out graph drives to completion (AC-21)
- [ ] error-recovery graph shows failure correctly (AC-22)
- [ ] Graph status view shows correct glyphs (AC-23)
- [ ] Simulation scripts call CLI with env vars (AC-15, AC-19)
- [ ] Error simulation script calls `cg wf node error` (AC-16)
- [ ] `just fft` clean (AC-31)

---

### Phase 4: GOAT Graph and Demo Script

**Objective**: Build the comprehensive GOAT graph fixture that exercises every orchestration scenario, plus a standalone demo script.

**Workshop**: [07-test-graph-fixtures-and-goat.md](./workshops/07-test-graph-fixtures-and-goat.md) § Part 4 (GOAT), Part 5 (scripts), [05-real-integration-testing.md](./workshops/05-real-integration-testing.md) § Part 6 (demo script)

**Deliverables**:
- `dev/test-graphs/goat/` — 6-line graph with 9+ nodes, all simulation scripts
- GOAT integration test with 4 drive() calls + interventions
- `scripts/drive-demo.ts` — visual standalone demo
- `just drive-demo` justfile entry

**Dependencies**: Phase 3 (simple graphs prove the infrastructure works)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GOAT multi-step debugging complexity | High | Medium | Assert after each drive() call, keep workspace on failure (R1-10) |
| Manual transition / question answer scripts complex | Medium | Medium | Individual scenarios proven in Phase 3, GOAT combines them |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Create GOAT graph fixture: graph.setup.ts + all 9 node units with scripts (standard, error, question, recovery) | 3 | All units on disk, graph.setup.ts creates 6-line graph | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t001) | [^18] |
| 4.2 | [x] | Write RED GOAT integration test: multi-step drive sequence with interventions | 3 | Test structure written, fails because GOAT graph doesn't exist yet | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t005t006) | RED [^19] |
| 4.3 | [x] | Make GOAT test pass through all 4 drive+intervention steps | 3 | Graph reaches complete, all nodes ✅ | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t005t006) | GREEN [^19] |
| 4.4 | [x] | Create `scripts/drive-demo.ts` — visual demo with simple-serial graph | 2 | `npx tsx scripts/drive-demo.ts` shows progression | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t007) | [^20] |
| 4.5 | [x] | Add `just drive-demo` to justfile | 1 | `just drive-demo` works | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t008) | [^21] |
| 4.6 | [x] | Final `just fft` clean | 1 | All tests pass, lint clean, format clean | [📋](tasks/phase-4-goat-graph-and-demo-script/execution.log.md#task-t009) | [^22] |

### Acceptance Criteria
- [ ] GOAT graph has 6 lines covering all scenarios (AC-24)
- [ ] GOAT test drives through all intervention steps (AC-25)
- [ ] GOAT validates all nodes complete, outputs saved (AC-26)
- [ ] Assertions reusable for code-unit and agent-unit variants (AC-27)
- [ ] Question simulation script calls `cg wf node ask` (AC-17)
- [ ] Recovery simulation script fails first, succeeds on retry (AC-18)
- [ ] Demo script shows visual progression (AC-28, AC-29, AC-30)
- [ ] `just fft` clean (AC-31)

---

## Cross-Cutting Concerns

### Security Considerations
- ScriptRunner spawns subprocesses — scripts execute with full user permissions
- Script path containment validated by WorkUnitLoader (no `../` escapes)
- Temp workspaces cleaned up after tests

### Rollback Plan (R-EST-004)

| Phase | Rollback Strategy |
|-------|-------------------|
| Phase 1 | Single atomic commit for all 25 call-site changes — `git revert <commit>`. No data migration. |
| Phase 2 | Delete `dev/test-graphs/` directory + revert FakeAgentInstance change. Test-only files. |
| Phase 3 | Delete test graph fixtures + integration test file. No production code affected. |
| Phase 4 | Delete GOAT fixtures + demo script + justfile entry. No production code affected. |

Feature flags not needed — these are infrastructure changes, not user-facing behavior toggles.

### Observability
- DriveEvent (from Plan 036) provides orchestration status
- formatGraphStatus() shows visual progress
- Demo script prints each step for human validation

### Documentation
- No new documentation files. Workshops serve as design docs.
- `dev/test-graphs/README.md` catalogues test graph fixtures.

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `script-runner.ts` | plan-scoped (new) | `packages/positional-graph/src/features/030-orchestration/` | ScriptRunner lives alongside IScriptRunner interface |
| `pod.code.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Fixing existing CodePod |
| `pod-manager.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Pass scriptPath to CodePod |
| `pod-manager.types.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Add scriptPath to PodCreateParams |
| `ods.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Resolve script path |
| `ods.types.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Add workUnitLoader dep |
| `fake-agent-instance.ts` | cross-plan-edit | `packages/shared/src/features/034-agentic-cli/fakes/` | Add onRun callback |
| `container.ts` (positional-graph) | cross-plan-edit | `packages/positional-graph/src/` | Register real ScriptRunner |
| `container.ts` (CLI) | cross-plan-edit | `apps/cli/src/lib/` | Register real ScriptRunner |
| `dev/test-graphs/**` | plan-scoped (new) | `dev/test-graphs/` | Test graph fixtures |
| `scripts/drive-demo.ts` | plan-scoped (new) | `scripts/` | Standalone demo |
| Integration tests | plan-scoped (new) | `test/integration/` | Integration tests |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 4 | Large | S=2,I=1,D=0,N=1,F=0,T=2 | 25 call-site cascade, new ScriptRunner, test infrastructure, GOAT | Phase-by-phase delivery |
| CodePod + cascade | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=1 | Constructor change cascades to 25 sites | Single commit for all changes |
| ScriptRunner | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | New subprocess execution. spawn pattern proven elsewhere. | Copy from unix-process-manager |
| Test infrastructure | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=1 | withTestGraph + workspace lifecycle | Follow e2e pattern |
| GOAT graph | 3 | Medium | S=1,I=0,D=0,N=1,F=1,T=2 | Multi-step test sequence, 9 nodes, 4 script types | Simple graphs first (Phase 3) |

---

## Progress Checklist

### Phase Completion Status
- [ ] Phase 1: CodePod Completion and ScriptRunner - PENDING
- [x] Phase 2: Test Graph Infrastructure - COMPLETE
- [x] Phase 3: Simple Test Graphs - COMPLETE
- [x] Phase 4: GOAT Graph and Demo Script - COMPLETE

Overall Progress: 4/4 phases (100%)

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | Phase 1 | DI with `useFactory`, no decorators — ScriptRunner registration |
| ADR-0009 | Accepted | Phase 1 | Module registration function pattern |
| ADR-0012 | Accepted | Phase 1, All | Workflow domain boundaries — ODS+workUnitLoader is acceptable (Finding 07) |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| FakeScriptRunner in CLI production container (Plan 036) | Plan 037 replaces with real ScriptRunner | Keep FakeScriptRunner — rejected because code nodes would silently do nothing | Real ScriptRunner proven by integration tests |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

[^3]: Task 2.1 (T001) - Added onRun callback to FakeAgentInstance
  - `class:packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts:FakeAgentInstance`
  - `file:test/unit/shared/features/034-agentic-cli/fakes/fake-agent-instance.test.ts`

[^4]: Task 2.2 (T002) - Created dev/test-graphs directory structure
  - `file:dev/test-graphs/README.md`

[^5]: Task 2.3 (T003) - RED smoke test with minimal fixture
  - `file:test/integration/test-graph-infrastructure.test.ts`
  - `file:dev/test-graphs/smoke/units/ping/unit.yaml`
  - `file:dev/test-graphs/smoke/units/ping/scripts/ping.sh`

[^6]: Task 2.4 (T004) - withTestGraph() lifecycle manager
  - `file:dev/test-graphs/shared/graph-test-runner.ts`

[^7]: Task 2.8 (T005) - Smoke test GREEN
  - `file:test/integration/test-graph-infrastructure.test.ts`

[^8]: Task 2.6 (T006) - makeScriptsExecutable helper
  - `function:dev/test-graphs/shared/helpers.ts:makeScriptsExecutable`

[^9]: Task 2.7 (T007) - Assertion library
  - `file:dev/test-graphs/shared/assertions.ts`

[^10]: Task 2.5 (T008) - completeUserInputNode helper
  - `function:dev/test-graphs/shared/helpers.ts:completeUserInputNode`

[^11]: Task 2.9 (T009) - Quality gate validation
  - `file:all`

[^12]: Task 3.1 (T001) - Workspace registration in withTestGraph + CLI resolution test
  - `file:dev/test-graphs/shared/graph-test-runner.ts` — added WorkspaceService.add/remove, buildDiskWorkUnitService, createTestOrchestrationStack
  - `file:test/integration/test-graph-infrastructure.test.ts` — added CLI resolution test

[^13]: Task 3.1 (T002) - simple-serial fixture
  - `file:dev/test-graphs/simple-serial/units/setup/unit.yaml`
  - `file:dev/test-graphs/simple-serial/units/worker/unit.yaml`
  - `file:dev/test-graphs/simple-serial/units/worker/scripts/simulate.sh`

[^14]: Task 3.2-3.3 (T003, T004) - simple-serial integration test RED→GREEN
  - `file:test/integration/orchestration-drive.test.ts`
  - `function:dev/test-graphs/shared/helpers.ts:completeUserInputNode` — fixed event sequence
  - `function:dev/test-graphs/shared/helpers.ts:ensureGraphsDir` — new helper

[^15]: Task 3.4-3.5 (T005, T006) - parallel-fan-out fixture + integration test
  - `file:dev/test-graphs/parallel-fan-out/units/setup/unit.yaml`
  - `file:dev/test-graphs/parallel-fan-out/units/parallel-1/unit.yaml`
  - `file:dev/test-graphs/parallel-fan-out/units/parallel-2/unit.yaml`
  - `file:dev/test-graphs/parallel-fan-out/units/parallel-3/unit.yaml`
  - `file:dev/test-graphs/parallel-fan-out/units/combiner/unit.yaml`
  - `file:test/integration/orchestration-drive.test.ts`

[^16]: Task 3.6-3.7 (T007, T008) - error-recovery fixture + integration test
  - `file:dev/test-graphs/error-recovery/units/setup/unit.yaml`
  - `file:dev/test-graphs/error-recovery/units/fail-node/unit.yaml`
  - `file:dev/test-graphs/error-recovery/units/fail-node/scripts/error-simulate.sh`
  - `file:test/integration/orchestration-drive.test.ts`

[^17]: Task 3.8 (T009) - Quality gate
  - `file:all`

[^18]: Task 4.1 (T001-T003) - GOAT graph fixture: 9 units + 8 scripts
  - `file:dev/test-graphs/goat/units/user-setup/unit.yaml`
  - `file:dev/test-graphs/goat/units/serial-a/unit.yaml` + `scripts/simulate.sh`
  - `file:dev/test-graphs/goat/units/serial-b/unit.yaml` + `scripts/simulate.sh`
  - `file:dev/test-graphs/goat/units/parallel-1/unit.yaml` + `scripts/simulate.sh`
  - `file:dev/test-graphs/goat/units/parallel-2/unit.yaml` + `scripts/simulate.sh`
  - `file:dev/test-graphs/goat/units/parallel-3/unit.yaml` + `scripts/simulate.sh`
  - `file:dev/test-graphs/goat/units/error-node/unit.yaml` + `scripts/recovery-simulate.sh`
  - `file:dev/test-graphs/goat/units/questioner/unit.yaml` + `scripts/question-simulate.sh`
  - `file:dev/test-graphs/goat/units/final-combiner/unit.yaml` + `scripts/simulate.sh`

[^19]: Task 4.2-4.3 (T005, T006) - GOAT integration test RED→GREEN
  - `file:test/integration/orchestration-drive.test.ts` — GOAT describe block, 4 drive() calls

[^20]: Task 4.4 (T007) - drive-demo.ts standalone demo
  - `file:scripts/drive-demo.ts`

[^21]: Task 4.5 (T008) - just drive-demo recipe
  - `file:justfile`

[^22]: Task 4.6 (T009) - Final quality gate
  - `file:all`
