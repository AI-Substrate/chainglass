# Plan 037: CodePod Completion and GOAT Integration Testing

**Status**: Ready for Implementation
**Spec**: [codepod-and-goat-integration-spec.md](./codepod-and-goat-integration-spec.md)
**Workshops**: Plan 036 Workshops [05](../036-cli-orchestration-driver/workshops/05-real-integration-testing.md), [06](../036-cli-orchestration-driver/workshops/06-finishing-codepod.md), [07](../036-cli-orchestration-driver/workshops/07-test-graph-fixtures-and-goat.md)

---

## Implementation Discoveries

### I1-01: CodePod Constructor Needs scriptPath + unitSlug

**Impact**: HIGH — Core change, cascades everywhere
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/pod.code.ts` (lines 16-19: constructor)
- `packages/positional-graph/src/features/030-orchestration/pod.code.ts` (line 28: `script: ''`)

**What needs to change**:
- Add `scriptPath: string` and `unitSlug: string` to CodePod constructor
- Change line 28 from `script: ''` to `script: this.scriptPath`
- Constructor: `constructor(nodeId, scriptRunner, scriptPath, unitSlug)`

**Affects phases**: Phase 1

---

### I1-02: CodePod Missing Graph Context Env Vars

**Impact**: HIGH — Scripts cannot call CLI without these
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/pod.code.ts` (lines 21-32: execute method)

**What needs to change**:
- Add `CG_GRAPH_SLUG: options.graphSlug`, `CG_NODE_ID: this.nodeId`, `CG_WORKSPACE_PATH: options.ctx.worktreePath` to the `env` object (line 24-25)
- Spread after `buildScriptEnv()` so graph context is always present

**Affects phases**: Phase 1

---

### I1-03: PodCreateParams Needs scriptPath for Code Variant

**Impact**: MEDIUM — Type change cascades to FakePodManager and PodManager
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts` (lines 25-29: code variant)

**What needs to change**:
- Add `readonly scriptPath: string` to the code variant of PodCreateParams union (line 28)
- Current: `{ unitType: 'code'; unitSlug: string; runner: IScriptRunner }`
- New: `{ unitType: 'code'; unitSlug: string; runner: IScriptRunner; scriptPath: string }`

**Affects phases**: Phase 1

---

### I1-04: PodManager.createPod() Must Pass scriptPath + unitSlug to CodePod

**Impact**: MEDIUM — Wiring change
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/pod-manager.ts` (lines 35-36: code case)

**What needs to change**:
- Line 36: Change `pod = new CodePod(nodeId, params.runner)` to `pod = new CodePod(nodeId, params.runner, params.scriptPath, params.unitSlug)`

**Affects phases**: Phase 1

---

### I1-05: ODS.buildPodParams() Needs workUnitLoader to Resolve scriptPath

**Impact**: HIGH — Dependency change to ODS, affects DI containers
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/ods.ts` (lines 160-165: code case in buildPodParams)
- `packages/positional-graph/src/features/030-orchestration/ods.types.ts` (lines 51-57: ODSDependencies)
- `packages/positional-graph/src/container.ts` (line 112: ODS construction)
- `apps/cli/src/lib/container.ts` (implicit via registerOrchestrationServices)

**What needs to change**:
- Add `readonly workUnitLoader: IWorkUnitLoader` to `ODSDependencies` (ods.types.ts line 57)
- ODS.buildPodParams code case (ods.ts lines 161-165): load work unit, extract `code.script`, resolve full path
- NarrowWorkUnit (positional-graph-service.interface.ts line 47-52) needs `code?: { script: string }` field — currently only has `slug`, `type`, `inputs`, `outputs`
- Container: pass `workUnitLoader` to ODS deps (container.ts line 112)

**Critical finding**: `NarrowWorkUnit` doesn't include `code.script`. Either:
  - (A) Widen NarrowWorkUnit with optional `code` field — minimal, targeted
  - (B) Add a separate interface for script path resolution
  - **Recommendation**: Option A — add `code?: { script: string }` to NarrowWorkUnit

**Affects phases**: Phase 1

---

### I1-06: FakeAgentInstance Needs onRun Callback

**Impact**: MEDIUM — Cross-package edit to @chainglass/shared
**Source files**:
- `packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts` (lines 20-29: options, lines 115-145: run method)

**What needs to change**:
- Add `onRun?: (options: AgentRunOptions) => Promise<void>` to FakeAgentInstanceOptions (line 28)
- Store as `private _onRun` in constructor
- Call `await this._onRun(options)` inside `run()` before returning result (after line 141, before line 142)
- Add `setOnRun(fn)` test helper method (after line 200)

**Affects phases**: Phase 2

---

### I1-07: Existing Tests That Will Break from CodePod/ODS Changes

**Impact**: HIGH — Must update to maintain green baseline
**Source files with breakage**:

| File | Breakage Count | Reason |
|------|---------------|--------|
| `test/unit/.../pod.test.ts` | 8 call sites | `new CodePod('code-1', runner)` → needs scriptPath + unitSlug args |
| `test/unit/.../pod-manager.test.ts` | ~2 call sites (via makeCodeParams) | PodCreateParams needs scriptPath |
| `test/unit/.../ods.test.ts` | 10 call sites | ODSDependencies needs workUnitLoader field |
| `test/unit/.../ods-agent-wiring.test.ts` | 3 call sites | ODSDependencies needs workUnitLoader field |
| `test/integration/orchestration-wiring-real.test.ts` | 1 call site | ODSDependencies needs workUnitLoader field |
| `test/e2e/positional-graph-orchestration-e2e.ts` | 1 call site | ODS construction needs workUnitLoader |

**Total**: ~25 call sites need updating across 6 files

**Mitigation**: All changes are additive — add new params, existing behavior preserved. Fix in Phase 1 immediately after production code changes.

**Affects phases**: Phase 1

---

### I1-08: Real ScriptRunner Implementation Needed

**Impact**: MEDIUM — New file, no existing code to change
**Source files**:
- NEW: `packages/positional-graph/src/features/030-orchestration/script-runner.ts` (~50 lines)
- `packages/positional-graph/src/features/030-orchestration/script-runner.types.ts` (no change — interface already correct)

**What needs to change**:
- Create `ScriptRunner` class implementing `IScriptRunner`
- Uses `child_process.spawn('bash', [script], { cwd, env, timeout })`
- `kill()` calls `child.kill()`
- Register in CLI DI container (apps/cli/src/lib/container.ts lines 234-238: replace `FakeScriptRunner` with real `ScriptRunner`)

**Affects phases**: Phase 1

---

### I1-09: DI Container Wiring Updates

**Impact**: MEDIUM — Two containers need updating
**Source files**:
- `packages/positional-graph/src/container.ts` (line 112: ODS construction)
- `apps/cli/src/lib/container.ts` (lines 234-238: ScriptRunner registration)

**What needs to change**:
- `container.ts` line 112: Add `workUnitLoader` to ODS deps. The container already resolves `IWorkUnitLoader` at line 72 — but it's not passed to ODS currently. Need to resolve it inside `registerOrchestrationServices` and pass to ODS.
- `apps/cli/src/lib/container.ts` lines 234-238: Replace `new FakeScriptRunner()` with `new ScriptRunner()` (import the real one)

**Affects phases**: Phase 1

---

### I1-10: ODS Gets unitSlug from NodeReality (Already Available)

**Impact**: LOW — Positive finding, no blocker
**Source files**:
- `packages/positional-graph/src/features/030-orchestration/reality.types.ts` (line 57: `unitSlug`)
- `packages/positional-graph/src/features/030-orchestration/ods.ts` (line 163: `node.unitSlug`)

**Finding**: ODS already accesses `node.unitSlug` from `NodeReality` for both agent and code cases (ods.ts lines 157 and 163). The unit slug flows from graph node → reality builder → NodeReality. No change needed for unitSlug availability.

**Affects phases**: None — already working

---

### I1-11: Workspace Registration/Unregistration APIs Exist

**Impact**: LOW — Positive finding, APIs ready for use
**Source files**:
- `packages/workflow/src/interfaces/workspace-service.interface.ts`: `IWorkspaceService.add()` and `IWorkspaceService.remove()`
- `packages/workflow/src/interfaces/workspace-registry-adapter.interface.ts`: `IWorkspaceRegistryAdapter.save()` and `.remove()`
- `apps/cli/src/commands/workspace.command.ts`: CLI `cg workspace add` / `cg workspace remove`
- `packages/workflow/src/fakes/fake-workspace-registry-adapter.ts`: Fake available for testing

**Finding**: Full workspace registration system exists:
- `IWorkspaceService.add(name, path, options?)` → registers workspace
- `IWorkspaceService.remove(slug)` → unregisters workspace
- Real adapter writes to `~/.config/chainglass/workspaces.json`
- `FakeWorkspaceRegistryAdapter` available for tests
- Workshop 07 recommends using the service directly (not CLI subprocess)

**For integration tests**: Use `IWorkspaceService.add()` / `.remove()` in `withTestGraph()` setup/teardown. Tests that need real CLI resolution from scripts will need real registry (not fake).

**Affects phases**: Phase 2

---

### I1-12: NarrowWorkUnit Missing code.script Field

**Impact**: HIGH — Blocks script path resolution in ODS
**Source files**:
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` (lines 47-52: NarrowWorkUnit)
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts` (line 182: `data.code.script` already used)

**What needs to change**:
- Add `code?: { script: string }` to `NarrowWorkUnit` interface
- The full work unit schema already has `code.script` — `workunit.classes.ts` uses it for validation
- The `IWorkUnitLoader.load()` implementations need to populate this field when returning NarrowWorkUnit
- `createTestServiceStack` helper (e2e-helpers.ts line 142-148) returns a fake loader — needs updating for code units

**Key detail**: The real `WorkUnitService.load()` already has the full work unit data including `code.script`. The NarrowWorkUnit just needs to carry it through. The fake loader in tests currently returns minimal data — needs to optionally include `code.script` when testing code units.

**Affects phases**: Phase 1

---

## Phase Breakdown

### Phase 1: CodePod Completion + ScriptRunner (CS-3)

**Goal**: Make code work units actually execute scripts with full graph context.

**AC Coverage**: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-33

**Changes** (in dependency order):

| # | File | Change | Discoveries |
|---|------|--------|-------------|
| 1 | `positional-graph-service.interface.ts` | Add `code?: { script: string }` to NarrowWorkUnit | I1-12 |
| 2 | `workunit.classes.ts` or `WorkUnitService` | Populate `code.script` in NarrowWorkUnit on load | I1-12 |
| 3 | `pod-manager.types.ts` | Add `scriptPath: string` to code variant of PodCreateParams | I1-03 |
| 4 | `pod.code.ts` | Add `scriptPath` + `unitSlug` to constructor, add graph context env vars | I1-01, I1-02 |
| 5 | `pod-manager.ts` | Pass `scriptPath` + `unitSlug` to CodePod constructor | I1-04 |
| 6 | `ods.types.ts` | Add `workUnitLoader: IWorkUnitLoader` to ODSDependencies | I1-05 |
| 7 | `ods.ts` | Resolve scriptPath in buildPodParams code case via workUnitLoader | I1-05 |
| 8 | `script-runner.ts` | NEW — Real ScriptRunner using child_process.spawn | I1-08 |
| 9 | `container.ts` (positional-graph) | Pass workUnitLoader to ODS | I1-09 |
| 10 | `container.ts` (CLI) | Replace FakeScriptRunner with real ScriptRunner | I1-09 |
| 11 | `fake-pod-manager.ts` | Accept scriptPath in createPod (already ignores extra params) | I1-07 |
| 12 | 6 test files | Update CodePod constructors, ODS deps, PodCreateParams | I1-07 |

**Success criteria**: `just fft` green. CodePod.execute() passes script path and graph context to runner.

**Estimated changes**: ~120 lines production + ~30 lines test fixups

---

### Phase 2: FakeAgentInstance onRun + Test Infrastructure (CS-2)

**Goal**: Enable integration test agent simulation and build withTestGraph helper.

**AC Coverage**: AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-31

**Changes**:

| # | File | Change | Discoveries |
|---|------|--------|-------------|
| 1 | `fake-agent-instance.ts` | Add `onRun` callback to options + run() + setOnRun() helper | I1-06 |
| 2 | `dev/test-graphs/shared/graph-test-runner.ts` | NEW — `withTestGraph()` helper | — |
| 3 | `dev/test-graphs/shared/helpers.ts` | NEW — `completeUserInputNode()`, `completeAgentNode()` | — |
| 4 | `dev/test-graphs/shared/assertions.ts` | NEW — `assertGraphComplete()`, `assertNodeComplete()` | — |
| 5 | `dev/test-graphs/README.md` | NEW — Test graph catalogue | — |
| 6 | `test/helpers/positional-graph-e2e-helpers.ts` | May need updates for workspace registration | I1-11 |

**Dependencies**: Phase 1 complete (CodePod works, ScriptRunner exists)

**Success criteria**: `withTestGraph()` successfully creates temp workspace, registers it, copies units, creates graph, and cleans up.

---

### Phase 3: Simple Test Graphs + Simulation Scripts (CS-2)

**Goal**: Build simple-serial, parallel-fan-out, error-recovery test graphs and prove them.

**AC Coverage**: AC-15, AC-16, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-32

**Changes**:

| # | File | Change |
|---|------|--------|
| 1 | `dev/test-graphs/simple-serial/` | graph.setup.ts + units/ (setup + worker) |
| 2 | `dev/test-graphs/simple-serial/units/worker/scripts/simulate.sh` | Standard simulation script |
| 3 | `dev/test-graphs/two-serial-chain/` | graph.setup.ts + units/ (setup + worker-a + worker-b) |
| 4 | `dev/test-graphs/parallel-fan-out/` | graph.setup.ts + units/ (setup + 3 parallel + combiner) |
| 5 | `dev/test-graphs/error-recovery/` | graph.setup.ts + units/ with error script |
| 6 | `test/integration/test-graph-integration.test.ts` | Integration tests using withTestGraph |

**Dependencies**: Phase 2 complete (withTestGraph works, simulation scripts can execute)

**Success criteria**: All simple integration tests pass. Scripts call CLI commands successfully.

---

### Phase 4: GOAT Graph + Demo Script (CS-3)

**Goal**: Build the comprehensive GOAT graph and standalone demo script.

**AC Coverage**: AC-17, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30

**Changes**:

| # | File | Change |
|---|------|--------|
| 1 | `dev/test-graphs/goat/graph.setup.ts` | 6-line graph with all scenarios |
| 2 | `dev/test-graphs/goat/units-code/` | All code unit fixtures + scripts |
| 3 | `dev/test-graphs/goat/units-code/error-node/scripts/simulate.sh` | Recovery script |
| 4 | `dev/test-graphs/goat/units-code/questioner/scripts/simulate.sh` | Question script |
| 5 | `test/integration/goat-integration.test.ts` | Multi-step GOAT test |
| 6 | `scripts/drive-demo.ts` | Standalone visual demo |
| 7 | `justfile` | Add `drive-demo` recipe |

**Dependencies**: Phase 3 complete (simple graphs proven, script execution works)

**Success criteria**: GOAT test drives through all 4 intervention steps. Demo shows visual progression. `just fft` green.

---

## AC → Phase Mapping

| AC | Description | Phase |
|----|-------------|-------|
| AC-01 | CodePod receives scriptPath via PodCreateParams | 1 |
| AC-02 | CodePod passes CG_GRAPH_SLUG, CG_NODE_ID, CG_WORKSPACE_PATH env vars | 1 |
| AC-03 | INPUT_* env vars preserved | 1 |
| AC-04 | Real ScriptRunner executes bash scripts | 1 |
| AC-05 | ScriptRunner returns exitCode, stdout, stderr | 1 |
| AC-06 | ScriptRunner supports kill() | 1 |
| AC-07 | ODS resolves script path via workUnitLoader | 1 |
| AC-08 | CodePod stores unitSlug | 1 |
| AC-09 | Test graphs stored in dev/test-graphs/ | 2 |
| AC-10 | withTestGraph() helper lifecycle | 2 |
| AC-11 | Workspace registered via service | 2 |
| AC-12 | Work units copied to temp workspace | 2 |
| AC-13 | addNode() validates units exist | 2 |
| AC-14 | .sh scripts made executable | 2 |
| AC-15 | Standard simulation script | 3 |
| AC-16 | Error simulation script | 3 |
| AC-17 | Question simulation script | 4 |
| AC-18 | Recovery simulation script | 3 |
| AC-19 | Scripts pass --workspace-path | 3 |
| AC-20 | simple-serial drives to completion | 3 |
| AC-21 | parallel-fan-out drives to completion | 3 |
| AC-22 | error-recovery test | 3 |
| AC-23 | Graph status glyphs correct | 3 |
| AC-24 | GOAT graph 6 lines, all scenarios | 4 |
| AC-25 | GOAT 4 intervention steps | 4 |
| AC-26 | GOAT validates all nodes complete | 4 |
| AC-27 | GOAT assertions reusable | 4 |
| AC-28 | scripts/drive-demo.ts | 4 |
| AC-29 | just drive-demo | 4 |
| AC-30 | Demo shows visual progression | 4 |
| AC-31 | just fft clean | 1, 2, 3, 4 |
| AC-32 | No vi.mock / jest.mock | 3, 4 |
| AC-33 | ADR-0012 domain boundaries | 1 |

---

## Dependency Graph

```
Phase 1: CodePod + ScriptRunner
    │
    ├── NarrowWorkUnit.code field
    ├── PodCreateParams.scriptPath
    ├── CodePod constructor + env vars
    ├── PodManager wiring
    ├── ODSDependencies + workUnitLoader
    ├── Real ScriptRunner
    ├── DI containers
    └── Test fixups (25 call sites)
    │
    v
Phase 2: Test Infrastructure
    │
    ├── FakeAgentInstance.onRun
    ├── withTestGraph() helper
    ├── Workspace registration lifecycle
    └── Shared assertions
    │
    v
Phase 3: Simple Test Graphs
    │
    ├── simple-serial graph + test
    ├── parallel-fan-out graph + test
    ├── error-recovery graph + test
    └── Simulation scripts (standard, error, recovery)
    │
    v
Phase 4: GOAT + Demo
    │
    ├── GOAT graph (6 lines, all scenarios)
    ├── Question simulation script
    ├── Multi-step GOAT test
    └── scripts/drive-demo.ts + just recipe
```

---

## Risk Register

| Risk | Phase | Severity | Mitigation |
|------|-------|----------|------------|
| NarrowWorkUnit widening breaks downstream consumers | 1 | Medium | Optional field (`code?:`), existing consumers unaffected |
| 25 test call sites need updating | 1 | Medium | Changes are additive, can be mechanical |
| ScriptRunner subprocess platform issues | 1 | Low | Linux/Mac only, Windows deferred |
| Workspace registry pollution from test crashes | 2 | Medium | finally block cleanup, unique slugs with timestamps |
| Scripts can't resolve workspace from temp dir | 3 | Medium | `--workspace-path` flag on all CLI calls |
| GOAT multi-step sequence hard to debug | 4 | Medium | Intermediate assertions, keep workspace option |
| raiseNodeEvent inside run() causes state race | 3 | Low | Events persist atomically, run() reloads each iteration |
