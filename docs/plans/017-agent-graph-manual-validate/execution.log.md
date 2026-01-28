# Execution Log: Plan 017 - Manual Validation of Agent Graph Execution

**Plan**: [agent-graph-manual-validate-plan.md](./agent-graph-manual-validate-plan.md)
**Dossier**: [tasks/implementation/tasks.md](./tasks/implementation/tasks.md)
**Started**: 2026-01-28
**Mode**: Simple (single phase, inline tasks)

---

## Session Start

Beginning implementation of E2E validation harness for WorkGraph system.

**Testing Approach**: Hybrid
- Unit tests for service changes (T001-T005b) per Constitution Principle 3
- E2E harness validates complete flow

**Expectation**: System will need shakedown - bugs in Plan 016 code expected and in-scope.

---

## Task T001: Modify `end()` to accept PENDING state when outputs present
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

Modified the state check in `end()` method (line 447) to accept both `running` AND `pending` states. This enables the "direct output pattern" where an orchestrator can save outputs to a pending node and call `end()` without first calling `start()`.

**Before**:
```typescript
if (nodeStatus.status !== 'running') {
```

**After**:
```typescript
if (nodeStatus.status !== 'running' && nodeStatus.status !== 'pending') {
```

Also updated the error message to reflect the new valid states.

### Evidence

```
$ pnpm typecheck
> tsc --noEmit
(no errors)
```

### Files Changed
- `packages/workgraph/src/services/worknode.service.ts` — Lines 446-460: Added `pending` to allowed states

### Discoveries
- The output validation logic (lines 480-542) runs AFTER the state check, so allowing `pending` state doesn't bypass validation - if outputs are missing, `end()` will still fail with "missing outputs" error

**Completed**: 2026-01-28

---

## Task T002: Modify `canEnd()` to accept PENDING state
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

Applied same pattern as T001 to the `canEnd()` method (line 629). This ensures `canEnd()` correctly reports `true` for pending nodes with outputs present.

**Before**:
```typescript
if (nodeStatus.status !== 'running') {
```

**After**:
```typescript
if (nodeStatus.status !== 'running' && nodeStatus.status !== 'pending') {
```

### Evidence

```
$ pnpm typecheck
> tsc --noEmit
(no errors)
```

### Files Changed
- `packages/workgraph/src/services/worknode.service.ts` — Lines 628-642: Added `pending` to allowed states

**Completed**: 2026-01-28

---

## Tasks T003-T005: Add GetOutputDataResult interface and implementation
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

1. **T003**: Added `GetOutputDataResult` interface to `worknode-service.interface.ts`
2. **T004**: Added `getOutputData()` method signature to `IWorkNodeService` interface
3. **T005**: Implemented `getOutputData()` in `WorkNodeService`
   - Reads from node's own `data/data.json` outputs (not upstream like getInputData)
   - Returns E118 error code for missing outputs
   - Added docstring explaining semantic asymmetry with getInputData
4. Also implemented in `FakeWorkNodeService` for testing

### Evidence

```
$ pnpm typecheck
> tsc --noEmit
(no errors)

$ pnpm test
Test Files  146 passed | 2 skipped (148)
Tests       2144 passed | 19 skipped (2163)
Duration    53.08s
```

### Files Changed
- `packages/workgraph/src/interfaces/worknode-service.interface.ts` — Added GetOutputDataResult interface + method signature
- `packages/workgraph/src/interfaces/index.ts` — Added export
- `packages/workgraph/src/services/worknode.service.ts` — Implemented getOutputData()
- `packages/workgraph/src/fakes/fake-worknode-service.ts` — Added fake implementation

### Discoveries
- Used E118 as new error code (E117 is for input not available)
- Semantic asymmetry documented: getInputData reads upstream, getOutputData reads self

**Completed**: 2026-01-28

---

## Task T005a: Unit tests for `end()` PENDING state transition
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

Added 2 new tests to `test/unit/workgraph/worknode-service.test.ts`:

1. **`should transition PENDING node to complete when outputs present`**
   - Tests the "direct output pattern" where orchestrator saves outputs without start()
   - Verifies PENDING + outputs → complete succeeds

2. **`should return E113 when PENDING node has missing outputs`**
   - Tests that output validation still applies for pending nodes
   - Verifies PENDING + no outputs → E113 (missing outputs error)

Also updated existing test description from "should return E112 when node is not in running state" to "should return E112 when node is not in running or pending state" to reflect the new allowed states.

### Evidence

```
$ pnpm test -- --run test/unit/workgraph/worknode-service.test.ts
Test Files  1 passed (1)
Tests       55 passed (55)

$ pnpm test
Test Files  146 passed | 2 skipped (148)
Tests       2146 passed | 19 skipped (2165)
```

### Files Changed
- `test/unit/workgraph/worknode-service.test.ts` — Added 2 new tests for Plan 017 PENDING state behavior

### Discoveries
- **Error code clarification**: Plan originally said PENDING + no outputs → E112, but actual behavior is E113 (missing outputs). This is correct semantically: E112 = wrong state, E113 = missing outputs. PENDING is now a valid state, so if outputs are missing, E113 is returned (same as running node with missing outputs).
- **Build requirement**: Tests run against compiled JS, so `pnpm build` was needed after code changes.

**Completed**: 2026-01-28

---

## Task T005b: Unit tests for `getOutputData()` method
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

Added 3 new tests to `test/unit/workgraph/worknode-service.test.ts`:

1. **`should return saved output value successfully`**
   - Tests happy path: node has saved output → getOutputData returns value
   - Verifies nodeId, outputName, and value in result

2. **`should return E118 when output is not available`**
   - Tests error path: no data.json exists → returns E118
   - E118 = outputNotAvailable

3. **`should return E107 when node does not exist`**
   - Tests error path: nonexistent node → returns E107
   - E107 = nodeNotFoundError

### Evidence

```
$ pnpm test -- --run test/unit/workgraph/worknode-service.test.ts
Test Files  1 passed (1)
Tests       58 passed (58)

$ pnpm test
Test Files  146 passed | 2 skipped (148)
Tests       2149 passed | 19 skipped (2168)
```

### Files Changed
- `test/unit/workgraph/worknode-service.test.ts` — Added 3 new tests for getOutputData()

**Completed**: 2026-01-28

---

## Tasks T006-T008: Add `get-output-data` CLI command
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

1. **T006**: Added `handleNodeGetOutputData` handler function in `workgraph.command.ts`
   - Follows same pattern as `handleNodeGetInputData`
   - Calls `service.getOutputData()`, formats with adapter, exits 1 on error

2. **T007**: Registered `get-output-data` CLI command
   - Command: `cg wg node get-output-data <graph> <node> <name> [--json]`
   - Description clarifies "reads this node's own saved outputs" (vs get-input-data which reads upstream)

3. **T008**: Added output format handler in `console-output.adapter.ts`
   - Added `WgGetOutputDataResult` interface
   - Added case handlers in `formatSuccessWithCommand` and `formatFailureWithCommand`
   - Added `formatWgNodeGetOutputDataSuccess` and `formatWgNodeGetOutputDataFailure` methods

### Evidence

```
$ pnpm typecheck
> tsc --noEmit
(no errors)

$ node apps/cli/dist/cli.cjs wg node get-output-data --help
DESCRIPTION
  Get output data value from this node's own saved outputs

$ pnpm test
Test Files  146 passed | 2 skipped (148)
Tests       2149 passed | 19 skipped (2168)
```

### Files Changed
- `apps/cli/src/commands/workgraph.command.ts` — Added handler + command registration
- `packages/shared/src/adapters/console-output.adapter.ts` — Added interface + formatters

**Completed**: 2026-01-28

---

## Tasks T009-T019: Harness Directory, Fixtures, and Orchestrator
**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did

1. **T009**: Created directory structure at `docs/how/dev/workgraph-run/`
2. **T010**: Created `lib/cli-runner.ts` with runCli(), pollForStatus(), getLatestQuestionId()
3. **T011**: Created `lib/types.ts` with all CLI result interfaces
4. **T012**: Created `fixtures/units/sample-input/unit.yaml`
5. **T013**: Created `fixtures/units/sample-coder/unit.yaml` and `commands/main.md`
6. **T014**: Created `fixtures/units/sample-tester/unit.yaml` and `commands/main.md`
7. **T015**: Created `e2e-sample-flow.ts` orchestrator script with:
   - Mock mode (default): simulates agent behavior, uses real ask/answer CLI
   - Real agent mode (--with-agent): placeholder for future implementation
8. **T016**: Polling helper included in cli-runner.ts with 30s elapsed logging
9. **T017**: Mock mode uses real `ask`/`answer` CLI commands per didyouknow insight #3
10. **T018**: Created README.md with usage instructions
11. **T019**: Moved `manual-wf-run/` to `_old/`

### Files Created
- `docs/how/dev/workgraph-run/e2e-sample-flow.ts`
- `docs/how/dev/workgraph-run/lib/cli-runner.ts`
- `docs/how/dev/workgraph-run/lib/types.ts`
- `docs/how/dev/workgraph-run/fixtures/units/sample-input/unit.yaml`
- `docs/how/dev/workgraph-run/fixtures/units/sample-coder/unit.yaml`
- `docs/how/dev/workgraph-run/fixtures/units/sample-coder/commands/main.md`
- `docs/how/dev/workgraph-run/fixtures/units/sample-tester/unit.yaml`
- `docs/how/dev/workgraph-run/fixtures/units/sample-tester/commands/main.md`
- `docs/how/dev/workgraph-run/README.md`
- `docs/how/dev/_old/manual-wf-run/` (moved)

**Completed**: 2026-01-28

---

## Task T020: Run Harness and Fix Bugs
**Started**: 2026-01-28
**Status**: ✅ Complete

### Pre-Run Issues Discovered

Before the harness could run, several issues needed fixing:

#### Issue 1: Units in wrong location
**Problem**: Units were created in `fixtures/units/` but `WorkUnitService` looks in `.chainglass/units/`
**Fix**: Moved units to `.chainglass/units/sample-input/`, `.chainglass/units/sample-coder/`, `.chainglass/units/sample-tester/`
**Verified**: `cg unit list` and `cg unit validate` confirmed all 3 units valid

#### Issue 2: CLI not in PATH
**Problem**: `cg` command not found - harness spawned `cg` but it wasn't globally linked
**Fix**: Updated `cli-runner.ts` to use full path: `node apps/cli/dist/cli.cjs`

#### Issue 3: CLI JSON output wrapper
**Problem**: CLI returns `{success, command, timestamp, data: {...}}` but types expected flat structure
**Fix**: Updated `runCli()` to unwrap: `parsed.data ? { ...parsed.data, errors: [] } : parsed`

### Initial Run Results

First successful run hit a real issue:

```
STEP 4: Execute generate-code (Agent with Question)
  ✓ can-run: true (get-spec is complete)
  ✓ Started: generate-code -> running
  ✓ Asked question: "Which programming language should I use?"
  ✓ Auto-answered: "bash"
  ✓ Generated mock script: add.sh
  ✓ Saved output: language = "bash"
  ✓ Saved output: script = add.sh

=================================================================
                    TEST ERROR
=================================================================
Assertion failed: Failed to end generate-code
```

#### Issue 4: Absolute path rejected by PATH_TRAVERSAL security check
**Problem**: Harness wrote script to `/tmp/add.sh` but `save-output-file` has FIX-004 security check that rejects absolute paths
**Root cause**: This is correct security behavior, not a Plan 016 bug
**Fix**: Changed harness to write to relative path `docs/how/dev/workgraph-run/.mock-outputs/add.sh`

### Final Successful Run

```
=================================================================
           E2E Test: Sample Code Generation Flow
=================================================================
Mode: Mock (no real agents)

STEP 1: Create Graph
  ✓ Created graph: sample-e2e

STEP 2: Add Nodes
  ✓ Added node: sample-input-226 (sample-input)
  ✓ Added node: sample-coder-851 (sample-coder) -> after sample-input-226
  ✓ Added node: sample-tester-e53 (sample-tester) -> after sample-coder-851

STEP 3: Execute get-spec (Direct Output)
  ✓ can-run: true (no upstream dependencies)
  ✓ Saved output: spec = "Write a function add(a, b) that returns the sum of two numbers"
  ✓ can-end: true (spec output present)
  ✓ Completed: get-spec -> complete (no start needed!)

STEP 4: Execute generate-code (Agent with Question)
  ✓ can-run: true (get-spec is complete)
  ✓ Started: generate-code -> running
  ✓ Asked question: "Which programming language should I use?"
  ✓ Auto-answered: "bash"
  ✓ Generated mock script: add.sh
  ✓ Saved output: language = "bash"
  ✓ Saved output: script = add.sh
  ✓ Completed: generate-code -> complete

STEP 5: Execute run-verify (Agent Runs Script)
  ✓ can-run: true (generate-code is complete)
  ✓ Started: run-verify -> running
  ✓ Got input: language = "bash"
  ✓ Got input: script = ".chainglass/work-graphs/sample-e2e/nodes/sample-coder-851/data/outputs/script.sh"
  ✓ Executed script, output: "5"
  ✓ Saved output: success = true
  ✓ Saved output: output = "5"
  ✓ Completed: run-verify -> complete

STEP 6: Read Pipeline Result
  ✓ success = true
  ✓ output = "5"

STEP 7: Validate Final State
  ✓ All nodes complete
  ✓   start: complete
  ✓   sample-input-226: complete
  ✓   sample-coder-851: complete
  ✓   sample-tester-e53: complete

=================================================================
                    TEST PASSED
=================================================================
```

### What Was Validated

| Operation | Tested | Notes |
|-----------|--------|-------|
| `wg create` | ✅ | Graph creation |
| `wg node add-after` with input mappings | ✅ | `-i spec:node1.spec` etc. |
| `wg node can-run` | ✅ | Upstream dependency checking |
| `wg node start` | ✅ | PENDING → RUNNING |
| `wg node ask` | ✅ | Question creation |
| `wg node answer` | ✅ | Question answering |
| `wg node save-output-data` | ✅ | Data output storage |
| `wg node save-output-file` | ✅ | File output storage (copied to node) |
| `wg node get-input-data` | ✅ | Read upstream data via mapping |
| `wg node get-input-file` | ✅ | Read upstream file via mapping |
| `wg node get-output-data` | ✅ | Read node's own output (new in Plan 017) |
| `wg node can-end` | ✅ | Output completeness check |
| `wg node end` | ✅ | RUNNING → COMPLETE |
| Direct output pattern | ✅ | PENDING → COMPLETE (node 1) |
| `wg status` | ✅ | Graph status |
| `wg delete` | ✅ | Cleanup |

### Data Flow Verified

```
Node 1 (sample-input)
  └─ output: spec = "Write a function add(a, b)..."
        ↓ (input mapping: spec:node1.spec)
Node 2 (sample-coder)
  ├─ input: spec ← reads from Node 1 ✅
  ├─ output: language = "bash"
  └─ output: script = add.sh (file)
        ↓ (input mappings)
Node 3 (sample-tester)
  ├─ input: language ← reads "bash" ✅
  ├─ input: script ← reads file path ✅
  ├─ output: success = true
  └─ output: output = "5"
        ↓ (read by orchestrator)
Orchestrator reads: success=true, output="5" ✅
```

### Plan 016 Bugs Found

**None.** All issues discovered were harness bugs, not Plan 016 implementation bugs:
- Unit location (harness setup issue)
- CLI path (harness environment issue)
- JSON unwrapping (harness parsing issue)
- Absolute path (harness should use relative paths)

The PATH_TRAVERSAL security check (FIX-004) correctly rejected absolute paths - this is expected behavior.

**Completed**: 2026-01-28

---

## Commit History

| Commit | Description |
|--------|-------------|
| `319cb32` | feat(workgraph): Plan 017 implementation - E2E harness and service changes |
| `7b757c8` | feat(workgraph): E2E harness fixes and flow diagram |

---

## Session Summary

**Plan 017 Status**: ✅ Complete

All tasks T001-T020 completed successfully. The E2E harness validates:
- Direct output pattern (PENDING → COMPLETE without start)
- Agent question/answer flow
- Cross-node data and file flow
- Orchestrator output reading

No Plan 016 bugs were discovered - the implementation is solid.

### Artifacts Created

1. **Service changes**: `getOutputData()` method, PENDING state support for `end()`/`canEnd()`
2. **CLI command**: `cg wg node get-output-data`
3. **E2E harness**: `docs/how/dev/workgraph-run/e2e-sample-flow.ts`
4. **Sample units**: `.chainglass/units/sample-{input,coder,tester}/`
5. **Flow diagram**: `docs/plans/017-agent-graph-manual-validate/e2e-flow-diagram.md`

### Test Coverage

- 2149 unit/integration tests pass
- E2E harness passes in mock mode (7 steps, all operations validated)
- Real agent mode (`--with-agent`) stubbed for future implementation

---

