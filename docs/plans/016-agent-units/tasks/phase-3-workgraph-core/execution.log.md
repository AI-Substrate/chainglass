# Phase 3: WorkGraph Core - Execution Log

**Started**: 2026-01-27
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

---

## Task T001: Create workgraph-service.test.ts with fixtures

**Started**: 2026-01-27
**Status**: ✅ Complete

### What I Did

Created test file with comprehensive fixtures and helpers for WorkGraphService testing:
- Sample YAML fixtures for empty, linear, and diverging graphs
- Parsed data equivalents for each YAML fixture
- State.json fixtures including all 6 node status values
- Invalid graph fixture for E132 schema validation testing
- `createTestContext()` helper for fresh test setup
- `setupGraph()` helper for configuring fake filesystem with graph data
- Placeholder tests for all Phase 3 methods (create, load, show, status)

### Evidence

```
 ✓ unit/workgraph/workgraph-service.test.ts (25 tests | 22 skipped) 3ms

 Test Files  1 passed (1)
      Tests  3 passed | 22 todo (25)
```

All setup verification tests pass:
- FakeFileSystem works correctly
- FakeYamlParser works correctly
- All fixtures are accessible

### Files Changed

- `/test/unit/workgraph/workgraph-service.test.ts` — Created with fixtures, helpers, and placeholder tests

**Completed**: 2026-01-27

---

## Task T002: Write failing tests for create()

**Started**: 2026-01-27
**Status**: ✅ Complete

### What I Did

Wrote TDD RED phase tests for WorkGraphService.create():
- Test: create with valid slug returns success
- Test: create with duplicate slug returns E105 error
- Test: create with invalid slug format returns E104 error
- Test: creates work-graph.yaml with start node
- Test: creates state.json with start node complete (per DYK#1)
- Test: rejects path traversal attempts (per Discovery 10)

Created WorkGraphService stub class with all methods throwing "Not implemented".

### Evidence (TDD RED)

```
 ❯ unit/workgraph/workgraph-service.test.ts (26 tests | 6 failed | 17 skipped) 5ms
   × WorkGraphService > create() > should create graph with valid slug → Not implemented
   × WorkGraphService > create() > should return E106 for duplicate slug → Not implemented
   × WorkGraphService > create() > should return E104 for invalid slug format → Not implemented
   × WorkGraphService > create() > should create work-graph.yaml with start node → Not implemented
   × WorkGraphService > create() > should create state.json with start node complete → Not implemented
   × WorkGraphService > create() > should reject path traversal in slug → Not implemented
```

All 6 tests fail with "Not implemented" - ready for GREEN phase.

### Files Changed

- `/test/unit/workgraph/workgraph-service.test.ts` — Added 6 create() tests with Test Doc comments
- `/packages/workgraph/src/services/workgraph.service.ts` — Created stub class
- `/packages/workgraph/src/services/index.ts` — Added WorkGraphService export
- `/packages/workgraph/src/index.ts` — Added WorkGraphService to barrel export

**Completed**: 2026-01-27

---

## Task T003: Implement WorkGraphService.create()

**Started**: 2026-01-27
**Status**: ✅ Complete

### What I Did

Implemented TDD GREEN phase for WorkGraphService.create():
- Slug validation with `/^[a-z][a-z0-9-]*$/` pattern
- Path traversal rejection (per Discovery 10)
- Duplicate detection via fs.exists()
- Directory creation with recursive flag
- work-graph.yaml generation with start node
- state.json generation with start node complete (per DYK#1)

Key implementation details:
- Uses `isValidSlug()` private helper for validation
- Returns E104 (invalidGraphSlugError) for invalid slugs
- Returns E105 (graphAlreadyExistsError) for duplicates
- Creates both files atomically via yamlParser.stringify() and JSON.stringify()

### Evidence (TDD GREEN)

```
 ✓ unit/workgraph/workgraph-service.test.ts (26 tests | 17 skipped) 3ms

 Test Files  1 passed (1)
      Tests  9 passed | 17 todo (26)
```

All 6 create() tests now pass.

### Files Changed

- `/packages/workgraph/src/services/workgraph.service.ts` — Implemented create() method + isValidSlug() helper

**Completed**: 2026-01-27

---

## Tasks T004-T014: Complete Phase 3 Implementation

**Started**: 2026-01-27
**Status**: ✅ All Complete

### Summary

Completed all remaining Phase 3 tasks using Full TDD approach:

**T004-T005**: load() implementation
- TDD RED: 5 failing tests for load() (E101 not found, E130 YAML error, E132 schema error)
- TDD GREEN: Implemented load() with YAML parsing, Zod validation, state.json reading

**T006-T007**: show() implementation
- TDD RED: 5 failing tests for show() (empty, linear, diverging graphs, E101)
- TDD GREEN: Implemented show() with DFS tree building, extractUnitSlug() helper

**T008-T009**: status() implementation
- TDD RED: 5 failing tests for status() (all 6 node states, graph status, E101)
- TDD GREEN: Implemented status() with stored/computed status logic per DYK#1

**T010a**: Added rename() to IFileSystem interface
- Updated interface, NodeFileSystemAdapter, FakeFileSystem

**T010**: Created atomic-file.ts utility
- atomicWriteFile() and atomicWriteJson() functions
- Per DYK#2: Always overwrite .tmp, no recovery logic

**T011-T012**: State management tests
- Tests verify atomic persistence, reload, corruption handling

**T013**: Wired WorkGraphService into DI container
- Replaced FakeWorkGraphService with real implementation

**T014**: Integration tests
- Full create → load → show → status lifecycle test
- Duplicate detection, non-existent graph, slug validation tests

### Evidence (Final)

```
 ✓ integration/workgraph/workgraph-lifecycle.test.ts (4 tests) 14ms
 ✓ unit/workgraph/workgraph-service.test.ts (27 tests) 7ms
 ✓ unit/workgraph/workunit-service.test.ts (15 tests) 5ms
 ✓ integration/workgraph/workunit-lifecycle.test.ts (4 tests) 4ms

 Test Files  4 passed (4)
      Tests  50 passed (50)
```

All 50 workgraph tests pass.

### Files Changed

- `/packages/shared/src/interfaces/filesystem.interface.ts` — Added rename() method
- `/packages/shared/src/adapters/node-filesystem.adapter.ts` — Implemented rename()
- `/packages/shared/src/fakes/fake-filesystem.ts` — Implemented rename()
- `/packages/workgraph/src/services/workgraph.service.ts` — Full implementation
- `/packages/workgraph/src/services/atomic-file.ts` — Created utility
- `/packages/workgraph/src/services/index.ts` — Added exports
- `/packages/workgraph/src/container.ts` — Wired real WorkGraphService
- `/test/unit/workgraph/workgraph-service.test.ts` — 27 tests
- `/test/integration/workgraph/workgraph-lifecycle.test.ts` — 4 integration tests

**Completed**: 2026-01-27

---

## Phase 3 Complete

**Total Tasks**: 15 (T001-T014 + T010a)
**All Tasks**: ✅ Complete
**Test Count**: 50 tests passing
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

### Key Deliverables

1. **WorkGraphService** - Full implementation with:
   - `create()` - Creates graph with start node, state.json
   - `load()` - Parses YAML + JSON, validates schemas
   - `show()` - Returns structured TreeNode tree
   - `status()` - Returns computed/stored node statuses

2. **Atomic File Utility** (`atomic-file.ts`)
   - Write-then-rename pattern per Critical Discovery 03

3. **IFileSystem.rename()** - Added to interface and both implementations

4. **DI Container** - Production container now uses real WorkGraphService

---

## Post-Phase 3: Plan 017 Manual Validation (Agent E2E Testing)

**Started**: 2026-01-28
**Status**: ✅ Complete
**Objective**: Validate WorkGraph agent execution with real Claude Code agents

This section documents the manual validation work done after Phase 3 completion, following Plan 017 "Manual Validation of Agent Graph Execution".

---

### Issue 1: `--with-agent` Mode Not Implemented

**Problem**: The E2E harness (`e2e-sample-flow.ts`) had `--with-agent` mode stubbed but not implemented. Functions `executeNode2WithRealAgent()` and `executeNode3WithRealAgent()` just printed "not implemented" and called mock versions.

**Fix**: Implemented real agent execution:
- Added helper functions to `cli-runner.ts`: `loadPromptTemplate()`, `substitutePromptVars()`, `invokeAgent()`, `pollForNodeCompleteWithQuestions()`
- Implemented streaming event parsing via `--stream` flag on `cg agent run`

**Files Changed**:
- `docs/how/dev/workgraph-run/lib/cli-runner.ts`
- `docs/how/dev/workgraph-run/e2e-sample-flow.ts`

---

### Issue 2: `wg delete` Command Missing

**Problem**: Couldn't clean up existing graphs - `wg delete` command doesn't exist in CLI.

**Workaround**: Added manual directory removal in cleanup function:
```typescript
await fs.rm(graphPath, { recursive: true, force: true });
```

**Note**: This is a known gap in the CLI - may want to add `wg delete` command in future.

---

### Issue 3: `questionId` Missing from `NodeStatusEntry`

**Problem**: Agent asked question successfully, harness detected `waiting-question` status, but couldn't find the `questionId` to answer. The `NodeStatusEntry` interface didn't include `questionId`.

**Root Cause**: Plan 016 spec defined `questionId` but it was never added to the interface.

**Fix**:
1. Added `questionId?: string` to `NodeStatusEntry` interface
2. Added `findPendingQuestionId()` helper method to `WorkGraphService.getStatus()`
3. Reads `data.json` to find questions without corresponding answers

**Files Changed**:
- `packages/workgraph/src/interfaces/workgraph-service.interface.ts`
- `packages/workgraph/src/services/workgraph.service.ts`

---

### Issue 4: Agent Didn't Re-invoke After Answer

**Problem**: After orchestrator answered the question, the agent had already exited. Needed session resumption to continue.

**Fix**: Implemented `runAgentWithQuestionLoop()` with session tracking:
```typescript
async function runAgentWithQuestionLoop(options: {
  prompt: string;
  sessionId?: string;
  timeoutMs: number;
}): Promise<void> {
  while (Date.now() - start < timeoutMs) {
    const result = await invokeAgentAndWait(currentPrompt, sessionId, isVerbose);
    // Check status, answer questions, re-invoke with continuation prompt
  }
}
```

**Files Changed**:
- `docs/how/dev/workgraph-run/e2e-sample-flow.ts`

---

### Issue 5: `cg` Command Not Found

**Problem**: Agent tried to run `cg wg node ...` but `cg` is not globally installed (only works via pnpm/npm scripts).

**Fix**: Updated all prompt templates to use full path:
```bash
node apps/cli/dist/cli.cjs wg node get-input-data $GRAPH $NODE spec
```

**Files Changed**:
- `.chainglass/units/sample-coder/commands/main.md`
- `.chainglass/units/sample-tester/commands/main.md`

---

### Issue 6: Agent Didn't Know When to Stop

**Problem**: After asking a question, agent tried to poll for the answer itself instead of exiting and waiting for orchestrator.

**Fix**: Added instruction message to CLI output after `wg node ask`:
```
[AGENT INSTRUCTION] STOP HERE. Exit now and wait for orchestrator to answer.
The orchestrator will re-invoke you with a continuation prompt containing the answer.
```

**Files Changed**:
- `apps/cli/src/commands/workgraph.command.ts` (after ask command output)

---

### Issue 7: `get-answer` Command Missing (CRITICAL)

**Problem**: Agent was re-invoked after answer but had no way to retrieve the answer value. The `get-answer` command was documented in Plan 016 spec (`workgraph-command-flows.md`) but never implemented.

**Investigation**: Used subagent to scan Plan 016 documents. Found 5 missing commands:
1. `get-answer` (CRITICAL - blocked agent resume flow)
2. `clear`
3. `handover-reason`
4. `question`
5. `error`

**Fix**: Implemented `get-answer`:
1. Added `GetAnswerResult` interface to `worknode-service.interface.ts`
2. Added `getAnswer()` method signature to `IWorkNodeService`
3. Implemented in `WorkNodeService` - reads from `data.json` answers
4. Added to `FakeWorkNodeService`
5. Added CLI command `wg node get-answer <graph> <node> <questionId>`

**Files Changed**:
- `packages/workgraph/src/interfaces/worknode-service.interface.ts`
- `packages/workgraph/src/services/worknode.service.ts`
- `packages/workgraph/src/fakes/fake-worknode-service.ts`
- `apps/cli/src/commands/workgraph.command.ts`

---

### Issue 8: `get-answer` Output Format Wrong

**Problem**: CLI output showed "✓ Operation completed successfully" but not the actual answer value. Agent couldn't parse the answer.

**Root Cause**: Used generic output adapter which didn't have a formatter for `wg.node.get-answer`.

**Fix**: Modified `handleNodeGetAnswer()` to output raw value directly:
```typescript
if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else if (!result.answered) {
  console.log('NOT_ANSWERED');
} else {
  const value = result.answer;
  console.log(typeof value === 'string' ? value : JSON.stringify(value));
}
```

Now `get-answer` outputs just `bash` - the raw value the agent needs.

**Files Changed**:
- `apps/cli/src/commands/workgraph.command.ts`

---

### Final Successful Run

After all fixes, the agent E2E test passed:

**Graph**: `sample-e2e`
**Nodes**: sample-input → sample-coder → sample-tester

**sample-coder-721 (Code Generator)**:
1. First invocation: Read spec, asked language question, exited on instruction
2. Orchestrator answered: `bash`
3. Second invocation: Called `get-answer` → got `bash`, wrote script.sh, saved outputs, completed

**sample-tester-97d (Script Tester)**:
1. Single invocation: Got inputs, ran script, verified output, saved results, completed

**Pipeline Result**:
- `success = true`
- `output = "add(3, 5) = 8"`
- All nodes complete
- TEST PASSED

**Token Usage**:
| Node | Session | Tokens |
|------|---------|--------|
| sample-coder (1st) | ffb158c9... | 93,647 |
| sample-coder (2nd) | a87f5150... | 160,389 |
| sample-tester | afe9191b... | 157,643 |

---

### Key Learnings

1. **Plan Gaps**: 5 CLI commands from Plan 016 spec were never implemented. Need better tracking of spec-to-implementation coverage.

2. **Agent UX**: Agents need explicit instructions (`[AGENT INSTRUCTION]`) in CLI output to know when to stop and wait.

3. **Output Format**: For agent consumption, simpler output is better. Raw values parse easier than formatted messages.

4. **Session Resumption**: The question/answer handover requires careful session tracking and continuation prompts.

5. **Testing Pyramid**: Mock mode tests passed but real agent mode exposed integration gaps. Both are needed.

---

### Test Evidence

See detailed test run log: `docs/how/dev/workgraph-run/logs/agent-e2e-test-run-2026-01-28.md`

**Test Command**:
```bash
cd docs/how/dev/workgraph-run && npx tsx e2e-sample-flow.ts --verbose --with-agent
```

**All Tests Pass**:
```
pnpm test
# 2149 tests passing (including all workgraph tests)
```

