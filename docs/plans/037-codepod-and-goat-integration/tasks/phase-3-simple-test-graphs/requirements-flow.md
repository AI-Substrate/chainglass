# Phase 3: Simple Test Graphs — Requirements Flow Trace

**Plan**: codepod-and-goat-integration-plan.md
**Phase**: 3 — Simple Test Graphs
**Traced**: 2026-02-18

---

## Coverage Matrix

| AC | Description | Files in Flow | Covered by Task(s) | Verdict |
|----|-------------|---------------|---------------------|---------|
| AC-15 | Standard simulate.sh calls `cg wf node accept`, `save-output-data`, `end` via env vars | simulate.sh, pod.code.ts, script-runner.ts, CLI positional-graph.command.ts | 3.1, 3.3, 3.5 | COVERED — but see GAP-1 (CLI resolution) |
| AC-16 | Error simulate.sh calls `cg wf node error`, exits non-zero | error-simulate.sh, pod.code.ts, script-runner.ts, CLI | 3.6, 3.7 | COVERED — but see GAP-1 |
| AC-19 | All scripts pass `--workspace-path "$CG_WORKSPACE_PATH"` | All simulate.sh scripts, pod.code.ts (sets CG_WORKSPACE_PATH env) | 3.1, 3.4, 3.6 | COVERED |
| AC-20 | simple-serial drives to completion (exit 0) | graph.setup.ts, withTestGraph, orch stack, ODS, ONBAS, PodManager, CodePod, ScriptRunner, simulate.sh, CLI, EventHandlerService | 3.2, 3.3 | COVERED — full flow traced below |
| AC-21 | parallel-fan-out drives to completion (all parallel nodes run) | graph.setup.ts, addNode(execution:'parallel'), ONBAS parallel walk, ODS multi-dispatch, 3× simulate.sh, combiner | 3.4, 3.5 | COVERED — see GAP-2 (combiner wiring) |
| AC-22 | error-recovery: node fails, drive exits, error visible in status | error-simulate.sh, CodePod→error outcome, event propagation, graph status | 3.6, 3.7 | COVERED |
| AC-23 | Graph status shows correct glyphs at each stage | console-output.adapter.ts statusIcon(), CLI `cg wf status` | 3.7 (assertions) | PARTIALLY COVERED — see GAP-3 |
| AC-31 | `just fft` clean | all files | 3.8 | COVERED (gating task) |

---

## Critical Flow Details

### Flow 1: AC-20 — simple-serial graph drives to completion

**Complete execution sequence (14 steps):**

```
TEST SETUP
──────────
1. withTestGraph('simple-serial', async (tgc) => { ... })
   ├─ Validates fixture name (regex: ^[a-z0-9_-]+$)
   ├─ Resolves: dev/test-graphs/simple-serial/units/
   ├─ Creates tmpDir: /tmp/tg-simple-serial-XXXX/
   ├─ Creates .chainglass/units/ and .chainglass/data/workflows/
   ├─ Copies units/{setup,worker}/ → tmpDir/.chainglass/units/
   ├─ makeScriptsExecutable() → chmod 0o755 all .sh files
   ├─ buildDiskLoader(tmpDir) → IWorkUnitLoader reading unit.yaml
   └─ createTestServiceStack('tg-simple-serial', loader) → {service, ctx}

2. graph.setup.ts (MUST BE CREATED — Task 3.1)
   ├─ service.create(ctx, 'simple-serial')         → { graphSlug, lineId: line-000 }
   ├─ service.addLine(ctx, 'simple-serial')         → { lineId: line-001 }
   ├─ service.addNode(ctx, slug, line-000, 'setup') → { nodeId: setup-id }
   ├─ service.addNode(ctx, slug, line-001, 'worker')→ { nodeId: worker-id }
   └─ service.setInput(ctx, slug, worker-id, 'task',
        { from_node: setup-id, from_output: 'instructions' })

ORCHESTRATION STACK COMPOSITION (in test, NOT in withTestGraph)
──────────────────────────────────────────────────────────────
3. Compose orchestration stack:
   ├─ FakeNodeEventRegistry + registerCoreEventTypes()
   ├─ NodeEventService (registry, loadState, persistState)
   ├─ EventHandlerService(nodeEventService)
   ├─ ONBAS()
   ├─ AgentContextService()
   ├─ PodManager(nodeFs)
   ├─ FakeAgentManagerService()   — NOT USED (no agent nodes)
   ├─ ScriptRunner()              — REAL, not fake!
   ├─ WorkUnitService or FakeWorkUnitService (for script path resolution)
   ├─ ODS({ graphService, podManager, contextService, agentManager, scriptRunner, workUnitService })
   └─ OrchestrationService({ graphService, onbas, ods, eventHandlerService, podManager })

USER-INPUT NODE COMPLETION
──────────────────────────
4. completeUserInputNode(service, ctx, slug, setup-id, { instructions: 'test data' })
   ├─ raiseNodeEvent('node:accepted', {}, 'human')   → waiting → accepted
   ├─ saveOutputData(slug, setup-id, 'instructions', 'test data')
   └─ raiseNodeEvent('node:completed', {}, 'human')  → accepted → complete

FIRST DRIVE (processes worker node)
────────────────────────────────────
5. const handle = orchestrationService.get(ctx, 'simple-serial')
6. const result = await handle.drive()

   SETTLE PHASE:
   7. EventHandlerService processes pending events (setup completion)

   DECIDE PHASE:
   8. ONBAS.getNextAction(reality)
      ├─ Walks lines: line-000 all complete ✓
      ├─ Walks line-001: worker node status=pending, ready=true
      │   (serialNeighborComplete=true [pos 0], precedingLinesComplete=true)
      └─ Returns: { type: 'start-node', nodeId: worker-id }

   ACT PHASE:
   9. ODS.execute('start-node', ctx, reality)
      ├─ handleStartNode → handleAgentOrCode
      ├─ buildPodParams: unitType='code', loads unit.yaml → script='scripts/simulate.sh'
      │   scriptPath = {tmpDir}/.chainglass/units/worker/scripts/simulate.sh
      ├─ podManager.createPod(worker-id, { unitType:'code', runner, scriptPath, unitSlug:'worker' })
      │   → new CodePod(worker-id, scriptRunner, scriptPath, 'worker')
      └─ pod.execute({ inputs: { task: 'test data' }, ctx, graphSlug })  ← FIRE AND FORGET

SCRIPT EXECUTION (in subprocess)
─────────────────────────────────
10. CodePod.execute()
    ├─ Sets env: CG_GRAPH_SLUG=simple-serial, CG_NODE_ID=worker-id,
    │   CG_WORKSPACE_PATH={tmpDir}, INPUT_TASK='test data'
    └─ scriptRunner.run({ script: scriptPath, env, cwd: tmpDir, timeout: 60000 })

11. simulate.sh executes:
    ├─ cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
    │   → CLI resolveOrOverrideContext(CG_WORKSPACE_PATH) → raiseNodeEvent('node:accepted')
    ├─ cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '"done"' --workspace-path "$CG_WORKSPACE_PATH"
    │   → CLI handleSaveOutputData → service.saveOutputData()
    └─ cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
        → CLI handleNodeEnd → raiseNodeEvent('node:completed')

12. ScriptRunner returns: { exitCode: 0, stdout, stderr, outputs }
13. CodePod returns: { outcome: 'completed' }

DRIVE COMPLETES
───────────────
14. Next settle phase finds worker complete → ONBAS returns no-action → drive exits
    Returns: { exitReason: 'complete', iterations: N, totalActions: 1 }

ASSERTIONS
──────────
15. assertGraphComplete(service, ctx, 'simple-serial')
16. assertNodeComplete(service, ctx, 'simple-serial', worker-id)
17. assertOutputExists(service, ctx, 'simple-serial', worker-id, 'result')
```

**Files touched in this flow (17 files):**

| # | File | Role | Exists? |
|---|------|------|---------|
| 1 | `dev/test-graphs/simple-serial/units/setup/unit.yaml` | Unit fixture definition | NO — Task 3.1 |
| 2 | `dev/test-graphs/simple-serial/units/worker/unit.yaml` | Unit fixture definition | NO — Task 3.1 |
| 3 | `dev/test-graphs/simple-serial/units/worker/scripts/simulate.sh` | Standard simulation script | NO — Task 3.1 |
| 4 | `dev/test-graphs/simple-serial/graph.setup.ts` | Graph structure definition | NO — Task 3.1 |
| 5 | `dev/test-graphs/shared/graph-test-runner.ts` | withTestGraph lifecycle | YES ✅ |
| 6 | `dev/test-graphs/shared/helpers.ts` | completeUserInputNode, makeScriptsExecutable | YES ✅ |
| 7 | `dev/test-graphs/shared/assertions.ts` | assertGraphComplete, etc. | YES ✅ |
| 8 | `test/helpers/positional-graph-e2e-helpers.ts` | createTestServiceStack | YES ✅ |
| 9 | `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` | OrchestrationService | YES ✅ |
| 10 | `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | drive() loop | YES ✅ |
| 11 | `packages/positional-graph/src/features/030-orchestration/onbas.ts` | Decide phase | YES ✅ |
| 12 | `packages/positional-graph/src/features/030-orchestration/ods.ts` | Act phase (dispatch) | YES ✅ |
| 13 | `packages/positional-graph/src/features/030-orchestration/pod.code.ts` | CodePod execution | YES ✅ |
| 14 | `packages/positional-graph/src/features/030-orchestration/script-runner.ts` | Process spawn | YES ✅ |
| 15 | `packages/positional-graph/src/features/030-orchestration/pod-manager.ts` | Pod lifecycle | YES ✅ |
| 16 | `packages/positional-graph/src/features/032-node-event-system/*.ts` | Event system | YES ✅ |
| 17 | `apps/cli/src/commands/positional-graph.command.ts` | CLI commands called by scripts | YES ✅ |
| 18 | `apps/cli/src/commands/command-helpers.ts` | resolveOrOverrideContext | YES ✅ |
| 19 | **Integration test file** (e.g., `test/e2e/simple-test-graphs-e2e.test.ts`) | Test code | NO — Task 3.2 |

---

### Flow 2: AC-21 — parallel-fan-out drives to completion

**Differences from simple-serial:**

```
GRAPH STRUCTURE (graph.setup.ts)
────────────────────────────────
- Line 0: setup (user-input)
- Line 1: parallel-1, parallel-2, parallel-3 (all code, execution:'parallel')
- Line 2: combiner (code, serial — waits for line 1 complete)

service.addNode(ctx, slug, line-1, 'parallel-1', { orchestratorSettings: { execution: 'parallel' } })
service.addNode(ctx, slug, line-1, 'parallel-2', { orchestratorSettings: { execution: 'parallel' } })
service.addNode(ctx, slug, line-1, 'parallel-3', { orchestratorSettings: { execution: 'parallel' } })
service.addNode(ctx, slug, line-2, 'combiner')

ONBAS PARALLEL WALK
───────────────────
- ONBAS visits line-1: all 3 parallel nodes ready=true (serialNeighborComplete=true for parallel)
- Returns first: { type: 'start-node', nodeId: parallel-1 }
- Next iteration: { type: 'start-node', nodeId: parallel-2 }
- Next iteration: { type: 'start-node', nodeId: parallel-3 }
(Each drive iteration starts one node — need drive() to loop multiple times)

COMBINER GATE
─────────────
- Combiner on line-2 blocked until ALL line-1 nodes complete (precedingLinesComplete check)
- Once all 3 parallel done → combiner starts → combiner completes → graph complete
```

**Additional files:**

| # | File | Exists? |
|---|------|---------|
| 1 | `dev/test-graphs/parallel-fan-out/units/setup/unit.yaml` | NO — Task 3.4 |
| 2 | `dev/test-graphs/parallel-fan-out/units/parallel-1/unit.yaml` + `scripts/simulate.sh` | NO — Task 3.4 |
| 3 | `dev/test-graphs/parallel-fan-out/units/parallel-2/unit.yaml` + `scripts/simulate.sh` | NO — Task 3.4 |
| 4 | `dev/test-graphs/parallel-fan-out/units/parallel-3/unit.yaml` + `scripts/simulate.sh` | NO — Task 3.4 |
| 5 | `dev/test-graphs/parallel-fan-out/units/combiner/unit.yaml` + `scripts/simulate.sh` | NO — Task 3.4 |
| 6 | `dev/test-graphs/parallel-fan-out/graph.setup.ts` | NO — Task 3.4 |

---

### Flow 3: AC-22 — error-recovery node fails, error visible

```
GRAPH STRUCTURE
───────────────
- Line 0: setup (user-input)
- Line 1: error-node (code)

ERROR SIMULATION SCRIPT (error-simulate.sh)
────────────────────────────────────────────
#!/bin/bash
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" --code DELIBERATE_FAIL --message "test failure" --workspace-path "$CG_WORKSPACE_PATH"
exit 1

CODE PATH
─────────
1. ODS dispatches → CodePod.execute → ScriptRunner.run(error-simulate.sh)
2. Script calls `cg wf node error` → CLI handleNodeError() → raiseNodeEvent('node:error')
3. Script exits 1 → ScriptRunner returns { exitCode: 1 }
4. CodePod returns { outcome: 'error', error: { code: 'DELIBERATE_FAIL' } }
5. Settle phase: node status → 'blocked-error'
6. ONBAS.getNextAction: diagnoseStuckLine returns stuck reason → no-action
7. drive() exits: { exitReason: 'stuck' | 'no-action' }

ASSERTIONS
──────────
- drive() does NOT return 'complete'
- service.getNodeStatus(error-node) === 'blocked-error'
- Status glyph shows ✗
```

**Additional files:**

| # | File | Exists? |
|---|------|---------|
| 1 | `dev/test-graphs/error-recovery/units/setup/unit.yaml` | NO — Task 3.6 |
| 2 | `dev/test-graphs/error-recovery/units/error-node/unit.yaml` | NO — Task 3.6 |
| 3 | `dev/test-graphs/error-recovery/units/error-node/scripts/error-simulate.sh` | NO — Task 3.6 |
| 4 | `dev/test-graphs/error-recovery/graph.setup.ts` | NO — Task 3.6 |

---

### Flow 4: AC-15/AC-19 — Simulation script CLI calls with env vars

```
ENV VARS SET BY CodePod.execute() (pod.code.ts):
─────────────────────────────────────────────────
CG_GRAPH_SLUG    ← options.graphSlug
CG_NODE_ID       ← this.nodeId
CG_WORKSPACE_PATH ← ctx.worktreePath
INPUT_*          ← transformed from inputs (uppercased keys)

SCRIPT USAGE PATTERN:
─────────────────────
#!/bin/bash
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
  --workspace-path "$CG_WORKSPACE_PATH"

cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
  result '"output value"' \
  --workspace-path "$CG_WORKSPACE_PATH"

cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
  --workspace-path "$CG_WORKSPACE_PATH"

CLI RESOLUTION:
───────────────
--workspace-path → resolveOrOverrideContext(path) → WorkspaceService.resolveContext(path)
Bypasses CWD-based registry lookup — uses explicit path.
```

---

### Flow 5: AC-23 — Graph status glyphs

```
GLYPH MAP (console-output.adapter.ts):
───────────────────────────────────────
pending:          ○
ready:            ◉
running:          ▶
waiting-question: ?
blocked-error:    ✗
complete:         ✓

TEST VERIFICATION (via CLI call):
─────────────────────────────────
cg wf status <graphSlug> --workspace-path <path> --json
→ Parse JSON → assert node statuses contain expected glyphs
OR
→ Capture text output → match glyph patterns
```

---

## Gaps Found

### GAP-1: CLI Binary Must Be Pre-Built and Accessible (CRITICAL)

**Problem**: Simulation scripts call `cg wf node accept ...` as a shell command. The `cg` binary must be:
1. **Built** (`apps/cli/dist/cli.cjs` must exist)
2. **In PATH** (via `pnpm link --global` from `just install`)

**Current codebase pattern**: Existing scripts use `node $PROJECT_ROOT/apps/cli/dist/cli.cjs` instead of bare `cg`. E2E tests use a resolved CLI_PATH constant.

**Options**:
- **Option A**: Scripts call `cg` directly — requires `just install` or `pnpm link --global` before tests
- **Option B**: Scripts call `node $CLI_PATH` — requires env var like `CG_CLI_PATH` from CodePod
- **Option C**: withTestGraph or test setup adds `apps/cli/dist/` to PATH before driving

**Recommendation**: Add a `CG_CLI_PATH` env var to CodePod.execute() pointing to the CLI binary path, and have simulate.sh use `node "$CG_CLI_PATH"` instead of bare `cg`. This matches the existing pattern in the codebase. Alternatively, define `CG_BIN` as `node /absolute/path/to/apps/cli/dist/cli.cjs` and have scripts use `$CG_BIN wf node accept ...`.

**Impact**: ALL simulation scripts (AC-15, AC-16, AC-19) are affected. Without this, scripts will fail with `cg: command not found`.

**Task gap**: The plan's Task 3.1 says "Create simulate.sh" but does NOT specify how `cg` is resolved. The plan should add: "ensure test setup makes `cg` available to script subprocess" as a pre-condition or wiring step.

---

### GAP-2: Orchestration Stack Composition Not in withTestGraph (MODERATE)

**Problem**: `withTestGraph()` returns `{ service, ctx, workspacePath }` but NO orchestration components. Phase 3 tests need the full stack: ODS, ONBAS, PodManager, OrchestrationService, EventHandlerService, NodeEventService.

**Current e2e pattern**: `test/e2e/positional-graph-orchestration-e2e.ts` has a local `createOrchestrationStack()` function — but it's NOT exported.

**Options**:
- **Option A**: Extract `createOrchestrationStack()` to a shared helper (e.g., `test/helpers/orchestration-e2e-helpers.ts`)
- **Option B**: Add optional `wiring` callback to `withTestGraph()` (comment at line 106 hints at this)
- **Option C**: Inline the stack composition in each Phase 3 test

**Recommendation**: Option A — extract to shared helper. Phase 3 needs it, Phase 4 (GOAT) will too. The existing `createOrchestrationStack` already exists in the e2e test; just move and export it.

**Impact**: Task 3.2 (write RED test) needs this stack. Not a file gap per se, but a composition gap.

---

### GAP-3: AC-23 Glyph Testing Approach Unclear (MINOR)

**Problem**: AC-23 says "graph status view shows correct glyphs at each stage." The plan tasks (3.2–3.7) don't explicitly mention a glyph assertion step. The glyphs are rendered by `console-output.adapter.ts` which is a formatting layer.

**Options**:
- **Option A**: Call CLI `cg wf status --json` and assert status field values (not glyphs directly)
- **Option B**: Call CLI `cg wf status` (text mode), capture stdout, grep for glyphs
- **Option C**: Use service.getStatus() and assert programmatic status values, trust glyph mapping is correct (already unit tested)

**Recommendation**: Option C is most pragmatic. The glyph mapping is a pure function in console-output.adapter.ts — test the status values programmatically. Add one smoke assertion for text output if desired.

**Impact**: Minor — existing assertions already verify status values.

---

### GAP-4: ODS Fire-and-Forget vs Drive Loop Timing (MODERATE)

**Problem**: ODS executes `pod.execute()` as fire-and-forget (NOT awaited). The script runs in a subprocess, calls CLI commands that write to disk, then ScriptRunner resolves. The drive() loop must pick up the state changes written by the CLI commands.

**Flow concern**: The drive() loop calls settle → decide → act. After `act` fires the script, the drive loop re-enters settle. Will the script have finished by then? For fast scripts, probably yes. For slow scripts, drive() may need to poll/wait.

**Analysis**: Looking at `graph-orchestration.ts`, `drive()` appears to handle this via:
1. Fire-and-forget execution → node enters `running` state
2. Next iteration: settle phase reloads state from disk
3. If script completed and wrote events: settle picks them up
4. If script still running: ONBAS sees `running` node → no-action → drive exits with `idle`

**For Phase 3**: Scripts are simple (3 CLI calls) — should complete in <1 second. But the test might need to **drive multiple times** or use `drive()` with appropriate options to handle the async gap.

**Recommendation**: Verify that `drive()` polls/waits for running nodes, or plan for multiple `drive()` calls in tests. The e2e test pattern shows `handle.run()` called multiple times — Phase 3 may need the same.

---

### GAP-5: graph.setup.ts Import/Invocation Pattern (MINOR)

**Problem**: The plan says "graph.setup.ts" creates the graph, but `withTestGraph()` doesn't execute it automatically. The test must import and call it.

**Recommended pattern**:
```typescript
// dev/test-graphs/simple-serial/graph.setup.ts
export async function setup(service: IPositionalGraphService, ctx: WorkspaceContext) {
  const { graphSlug } = await service.create(ctx, 'simple-serial');
  // ... addLine, addNode, setInput ...
  return { graphSlug, nodeIds: { setup: ..., worker: ... } };
}
```

```typescript
// Integration test
import { setup } from '../../../dev/test-graphs/simple-serial/graph.setup.js';
await withTestGraph('simple-serial', async (tgc) => {
  const { graphSlug, nodeIds } = await setup(tgc.service, tgc.ctx);
  // ... orchestration ...
});
```

**Impact**: None if followed — just documenting the expected invocation pattern.

---

### GAP-6: FakeWorkUnitService vs Real IWorkUnitService in ODS (MODERATE)

**Problem**: ODS uses `IWorkUnitService.load()` to resolve the script path for code units. In Phase 3 tests with REAL script execution, FakeWorkUnitService must return correct unit configs pointing to the actual script files on disk.

**Analysis**: `FakeWorkUnitService` appears to have empty maps by default. Either:
- Register units in FakeWorkUnitService before driving, or
- Use a real WorkUnitService backed by the disk loader that withTestGraph creates

**Recommendation**: Use FakeWorkUnitService with pre-registered units matching the fixtures, OR use the real disk-based WorkUnitService (if available). The script path resolution is: `{worktreePath}/.chainglass/units/{unitSlug}/{relative_script_path}` — so the FakeWorkUnitService needs to return `code.script: 'scripts/simulate.sh'` for each code unit.

**Impact**: Without this, ODS will fail to resolve script paths → CodePod won't know what script to run.

---

## Summary

### Task Table Completeness Assessment

| Task | Files Created | Dependencies Met | Notes |
|------|--------------|-----------------|-------|
| 3.1 | 4 fixture files (2 unit.yaml, 1 simulate.sh, 1 graph.setup.ts) | Phase 2 ✅ | Must address GAP-1 (CLI path) |
| 3.2 | 1 test file | 3.1, orchestration stack helper (GAP-2) | Extract createOrchestrationStack |
| 3.3 | 0 (make test pass) | 3.2 | Address GAP-4 (drive timing), GAP-6 (WorkUnitService) |
| 3.4 | 6 fixture files (5 unit.yaml, 4 simulate.sh, 1 graph.setup.ts) | 3.3 | Parallel wiring needs orchestratorSettings |
| 3.5 | 0 (test code in same file as 3.2) | 3.4 | Multiple drive() calls likely needed |
| 3.6 | 4 fixture files (2 unit.yaml, 1 error-simulate.sh, 1 graph.setup.ts) | 3.5 | Error script pattern documented |
| 3.7 | 0 (test code in same file) | 3.6 | Assert blocked-error status, not complete |
| 3.8 | 0 (quality gate) | 3.7 | `just fft` |

### Critical Pre-Conditions Not in Task Table

1. **CLI binary must be built** — `pnpm build` for apps/cli BEFORE running tests
2. **`cg` must be resolvable** by simulate.sh subprocess — needs PATH or CG_CLI_PATH env var (GAP-1)
3. **Orchestration stack composition** must be available as shared helper (GAP-2)
4. **FakeWorkUnitService registration** or real WorkUnitService for ODS script resolution (GAP-6)

### Files Not in Plan But Needed

| File | Purpose | Task |
|------|---------|------|
| `test/helpers/orchestration-e2e-helpers.ts` (or similar) | Extracted createOrchestrationStack | Pre-req for 3.2 |
| Modification to pod.code.ts OR test setup | CLI path resolution for scripts | Pre-req for 3.1 |

---

## Verdict

**6 of 8 ACs fully traced with clear file-to-AC mapping. 2 ACs (AC-15/AC-19 CLI resolution, AC-23 glyph testing) have minor implementation ambiguity. 6 gaps identified — GAP-1 (CLI resolution) and GAP-2 (orchestration stack extraction) are the most impactful and should be resolved in task planning before implementation begins.**
