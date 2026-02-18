# Phase 1: CodePod Completion and ScriptRunner – Tasks & Alignment Brief

**Spec**: [codepod-and-goat-integration-spec.md](../../codepod-and-goat-integration-spec.md)
**Plan**: [codepod-and-goat-integration-plan.md](../../codepod-and-goat-integration-plan.md)
**Date**: 2026-02-18

---

## Executive Briefing

### Purpose

This phase makes code work units actually work. CodePod currently runs an empty script with no context — after this phase, it receives the real script path, knows which graph and node it's operating on, and uses a real subprocess runner to execute bash scripts.

### What We're Building

- **Real ScriptRunner**: Spawns bash scripts via `child_process.spawn`, captures exit code/stdout/stderr, supports kill()
- **Fixed CodePod**: Receives `scriptPath` and `unitSlug` in constructor, passes `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` as env vars to scripts
- **ODS script path resolution**: ODS loads the work unit config to find the script path, passes it through PodCreateParams to CodePod
- **DI wiring**: Real ScriptRunner replaces FakeScriptRunner in production containers

### User Value

Code work units can now execute real scripts that interact with the workflow system via CLI commands. This is the foundation for the integration testing strategy where scripts simulate agent behavior.

### Example

Before: `CodePod.execute()` → `scriptRunner.run({ script: '' })` → nothing happens
After: `CodePod.execute()` → `scriptRunner.run({ script: '/workspace/.chainglass/units/worker/scripts/simulate.sh', env: { CG_GRAPH_SLUG: 'my-pipeline', CG_NODE_ID: 'worker-1', CG_WORKSPACE_PATH: '/workspace', INPUT_TASK: '...' } })` → real bash execution

---

## Objectives & Scope

### Objective

Fix CodePod, build ScriptRunner, wire ODS with work unit loading for script path resolution. All existing tests must continue to pass after the 29-site cascade update.

### Goals

- ✅ Real ScriptRunner that spawns bash scripts
- ✅ CodePod receives scriptPath + unitSlug
- ✅ CodePod passes CG_GRAPH_SLUG, CG_NODE_ID, CG_WORKSPACE_PATH env vars
- ✅ INPUT_* env vars preserved (existing behavior)
- ✅ ODS resolves script path from work unit config
- ✅ PodCreateParams includes scriptPath for code variant
- ✅ DI containers register real ScriptRunner
- ✅ All 29 cascade call sites updated
- ✅ Contract test for IScriptRunner (fake vs real parity)

### Non-Goals

- ❌ Test graph fixtures (Phase 2-3)
- ❌ Integration tests with real graphs (Phase 3-4)
- ❌ FakeAgentInstance onRun callback (Phase 2)
- ❌ Extension detection (.sh vs .ts vs .js) — bash only, shebangs for other runtimes
- ❌ Configurable timeout per work unit — hardcode 60s for now
- ❌ Windows support — Linux/Mac only

---

## Pre-Implementation Audit

### Summary

| File | Action | Origin | Call Sites | Recommendation |
|------|--------|--------|------------|----------------|
| `pod.code.ts` | MODIFY | Plan 030 | 9 (1 prod + 8 test) | cross-plan-edit |
| `pod-manager.types.ts` | MODIFY | Plan 030/035 | 0 (type-only) | cross-plan-edit |
| `pod-manager.ts` | MODIFY | Plan 030/035 | 1 (prod) | cross-plan-edit |
| `ods.ts` | MODIFY | Plan 030/035 | 20 (1 prod + 19 test/e2e) | cross-plan-edit |
| `ods.types.ts` | MODIFY | Plan 030/035 | 0 (type-only) | cross-plan-edit |
| `script-runner.ts` | CREATE | New | — | plan-scoped |
| `container.ts` (pkg) | MODIFY | Plans 026-036 | 1 ODS site | cross-plan-edit |
| `container.ts` (CLI) | MODIFY | Plans 016-036 | 1 ScriptRunner reg | cross-plan-edit |
| `script-runner.test.ts` | CREATE | New | — | plan-scoped |
| `script-runner.contract.ts` | CREATE | New | — | plan-scoped |

### Key Finding: Script Path Resolution

**GAP-1 from audit**: `IWorkUnitLoader.load()` returns `NarrowWorkUnit` (no `code.script`). ODS needs the full work unit to get the script path.

**Resolution**: ODS uses `IWorkUnitService` (not `IWorkUnitLoader`). `IWorkUnitService.load()` returns the full `WorkUnitInstance` including `code.script` (relative path). ODS resolves the absolute path: `path.join(ctx.worktreePath, '.chainglass', 'units', unitSlug, unit.code.script)`.

This means:
- `ODSDependencies` gets `workUnitService: IWorkUnitService` (not `workUnitLoader`)
- ODS calls `workUnitService.load(ctx, unitSlug)` → extracts `unit.code.script` → resolves absolute path
- No changes to `IWorkUnitLoader` or `NarrowWorkUnit` needed

### Cascade Counts

| Change | Sites | Files |
|--------|-------|-------|
| CodePod constructor (add scriptPath, unitSlug) | 9 | pod-manager.ts + 8 in pod.test.ts |
| ODS dependency (add workUnitService) | 20 | ods.ts, ods.test.ts (12), ods-agent-wiring.test.ts (1), e2e (1), integration (1), container.ts (1), + 4 doc examples (ignore) |
| **Total real sites** | **29** | |

---

## Requirements Traceability

### Coverage Matrix

| AC | Description | Files in Flow | Tasks | Status |
|----|-------------|---------------|-------|--------|
| AC-01 | CodePod receives scriptPath | pod-manager.types.ts, pod.code.ts, pod-manager.ts | T004, T005, T006 | ✅ |
| AC-02 | CG_GRAPH_SLUG/NODE_ID/WORKSPACE_PATH env vars | pod.code.ts | T003, T005 | ✅ |
| AC-03 | INPUT_* env vars preserved | pod.code.ts | T003 (regression test) | ✅ |
| AC-04 | ScriptRunner executes bash via spawn | script-runner.ts | T001, T002 | ✅ |
| AC-05 | ScriptRunner returns exitCode/stdout/stderr | script-runner.ts | T001, T002 | ✅ |
| AC-06 | ScriptRunner supports kill() | script-runner.ts | T001, T002 | ✅ |
| AC-07 | ODS resolves script path via workUnitService | ods.ts, ods.types.ts | T007 | ✅ |
| AC-08 | CodePod stores unitSlug | pod.code.ts | T005 | ✅ |
| AC-31 | just fft clean | all | T010 | ✅ |

### Gaps Found and Resolved

- **GAP-1**: `IWorkUnitLoader` lacks script path → use `IWorkUnitService` instead (see Pre-Implementation Audit)
- **GAP-2**: Plan overestimated cascade at 25 → actual is 29 (9 CodePod + 20 ODS)

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|-------------|-------------------|------------|----------|-------|
| [ ] | T001 | Write RED tests for ScriptRunner: spawns bash `echo "hello"` script, captures exit 0 + stdout. Spawns failing script, captures exit 1 + stderr. kill() terminates running process. Run: `pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts` | 2 | Test | – | `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/030-orchestration/script-runner.test.ts` | Tests written and failing (no real ScriptRunner) | – | RED, AC-04/05/06 |
| [ ] | T002 | Implement `ScriptRunner` class: `spawn('bash', [script], { cwd, env, timeout })`. Buffer stdout/stderr. Return `ScriptRunResult`. Implement `kill()` via `childProcess.kill()`. | 2 | Core | T001 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/script-runner.ts` | All T001 tests pass | – | GREEN, plan-scoped |
| [ ] | T002b | Write contract test for IScriptRunner: parameterized factory running same assertions against both FakeScriptRunner and real ScriptRunner (R-TEST-008) | 2 | Test | T002 | `/home/jak/substrate/033-real-agent-pods/test/contracts/script-runner.contract.ts` | Contract passes for both implementations | – | R-TEST-008 |
| [ ] | T003 | Write RED tests for CodePod env vars: construct CodePod with FakeScriptRunner, call execute(), assert FakeScriptRunner received `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH`, and `INPUT_*` in env. | 2 | Test | – | `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/030-orchestration/pod.test.ts` | Tests fail (CodePod doesn't pass CG_* env vars yet) | – | RED, AC-02/03 |
| [ ] | T004 | Update `PodCreateParams` code variant: add `readonly scriptPath: string` | 1 | Core | – | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts` | Types compile | – | cross-plan-edit |
| [ ] | T005 | Update CodePod constructor: add `scriptPath: string`, `unitSlug: string` params. Add `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` to env in `execute()`. Use `this.scriptPath` instead of `''`. | 2 | Core | T003, T004 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/pod.code.ts` | T003 tests pass. CodePod compiles. | – | GREEN, cross-plan-edit, AC-01/02/08 |
| [ ] | T006 | Update PodManager.createPod(): pass `params.scriptPath` and `params.unitSlug` to CodePod constructor | 1 | Core | T005 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/pod-manager.ts` | PodManager compiles | – | cross-plan-edit |
| [ ] | T007 | Add `workUnitService: IWorkUnitService` to `ODSDependencies`. In `buildPodParams()` for code type: call `workUnitService.load(ctx, unitSlug)` → extract `unit.code.script` → resolve absolute path via `path.join(ctx.worktreePath, '.chainglass', 'units', unitSlug, script)` → set on PodCreateParams | 2 | Core | T004 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/ods.ts`, `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/ods.types.ts` | ODS compiles. Script path resolved correctly. | – | cross-plan-edit, AC-07, GAP-1 resolved |
| [ ] | T008 | Update all cascade call sites: 8 CodePod test sites (add scriptPath + unitSlug placeholder args), 16+ ODS test/e2e/integration sites (add workUnitService to deps). Use FakeWorkUnitService for tests. | 2 | Core | T005, T007 | Multiple test files: `pod.test.ts`, `ods.test.ts`, `ods-agent-wiring.test.ts`, `orchestration-wiring-real.test.ts`, `positional-graph-orchestration-e2e.ts`, `pod-manager.test.ts` | All existing tests compile and pass | – | Cascade fix |
| [ ] | T009 | Register real ScriptRunner in DI: replace `FakeScriptRunner` with `ScriptRunner` in `positional-graph/container.ts` and `cli/container.ts`. Export `ScriptRunner` from package barrel. | 1 | Core | T002 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/container.ts`, `/home/jak/substrate/033-real-agent-pods/apps/cli/src/lib/container.ts`, `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/index.ts`, `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/index.ts` | Containers resolve real ScriptRunner | – | cross-plan-edit |
| [ ] | T010 | Run `just fft`. Fix any lint/format issues. | 1 | Integration | T008, T009 | all | `just fft` exit 0 | – | AC-31 |

---

## Alignment Brief

### Critical Findings Affecting This Phase

| Finding | Constraint | Tasks |
|---------|-----------|-------|
| Finding 01 (Plan 037) | CodePod constructor cascade = 9 sites | T005, T008 |
| Finding 02 (Plan 037) | ODS dependency cascade = 20 sites | T007, T008 |
| Finding 07 (Plan 037) | ODS + workUnitService is acceptable per ADR-0012 | T007 |
| GAP-1 (Audit) | IWorkUnitLoader lacks script path → use IWorkUnitService | T007 |

### ADR Decision Constraints

- **ADR-0012**: ODS depends on `IWorkUnitService` — graph→orchestration dependency is allowed. Same pattern as `graphService`.
- **ADR-0004**: ScriptRunner registered via `useFactory` in DI containers. No decorators.

### Invariants & Guardrails

- CodePod constructor: `scriptPath` and `unitSlug` are required (not optional) — CodePod is broken without them
- `buildScriptEnv()` must preserve all existing `INPUT_*` env vars (regression test in T003)
- ScriptRunner uses `bash` only — scripts use shebangs for other runtimes
- Timeout hardcoded to 60s (configurable per-unit is deferred)

### Test Plan (Full TDD)

**Policy**: Fakes only. FakeScriptRunner for CodePod tests. FakeWorkUnitService for ODS tests.

| Test File | Tests | What's Covered |
|-----------|-------|----------------|
| `script-runner.test.ts` | spawn, exit code, stdout/stderr, kill | ScriptRunner subprocess |
| `script-runner.contract.ts` | Parity: FakeScriptRunner vs real | R-TEST-008 |
| `pod.test.ts` (additions) | CG_* env vars, INPUT_* preserved | CodePod env var contract |

### Commands to Run

```bash
# ScriptRunner tests
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts

# Contract test
pnpm test -- --run test/contracts/script-runner.contract.ts

# All pod tests (check cascade)
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/

# Full quality gate
just fft
```

### Implementation Order

```
T001 (RED: ScriptRunner tests)
  → T002 (GREEN: ScriptRunner impl)
    → T002b (Contract test)
T003 (RED: CodePod env var tests)
  → T004 (PodCreateParams type)
    → T005 (GREEN: CodePod impl)
      → T006 (PodManager)
        → T007 (ODS + workUnitService)
          → T008 (Cascade: all test sites)
            → T009 (DI registration)
              → T010 (just fft)
```

### Risks & Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| 29 cascade call sites | High | Single commit. Placeholder values for tests. |
| ScriptRunner subprocess platform issues | Low | Linux/Mac only. Copy pattern from unix-process-manager.ts. |
| IWorkUnitService not available in ODS context | Medium | Verify DI token exists. May need adding to container registration. |

### Ready Check

- [x] ADR constraints mapped (ADR-0012 → T007, ADR-0004 → T009)
- [ ] Inputs read (implementer reads files before starting)
- [ ] GAP-1 resolved (use IWorkUnitService not IWorkUnitLoader)
- [ ] `just fft` baseline green

---

## Phase Footnote Stubs

| Footnote | Task | Description |
|----------|------|-------------|
| | | |

---

## Evidence Artifacts

- **Execution log**: `docs/plans/037-codepod-and-goat-integration/tasks/phase-1-codepod-completion-and-scriptrunner/execution.log.md`

---

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

---

## Directory Layout

```
docs/plans/037-codepod-and-goat-integration/
  ├── codepod-and-goat-integration-spec.md
  ├── codepod-and-goat-integration-plan.md
  ├── workshops/ (symlinks to 036)
  └── tasks/
      └── phase-1-codepod-completion-and-scriptrunner/
          ├── tasks.md              ← this file
          ├── tasks.fltplan.md      ← generated by /plan-5b
          └── execution.log.md     ← created by /plan-6
```
