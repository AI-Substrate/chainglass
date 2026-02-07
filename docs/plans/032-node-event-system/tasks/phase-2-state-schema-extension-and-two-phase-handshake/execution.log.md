# Execution Log: Phase 2 — State Schema Extension and Two-Phase Handshake

**Plan**: [node-event-system-plan.md](../../node-event-system-plan.md)
**Phase**: Phase 2
**Started**: 2026-02-07

---

## Task T001+T002: Update state.schema.ts (enum + events array)
**Started**: 2026-02-07
**Dossier Task**: T001+T002 | **Plan Task**: 2.1, 2.2
**Status**: COMPLETE

### What I Did
1. Removed `'running'` from `NodeExecutionStatusSchema`, added `'starting'` and `'agent-accepted'`
2. Imported `NodeEventSchema` from Phase 1 feature folder
3. Added `events: z.array(NodeEventSchema).optional()` to `NodeStateEntrySchema`
4. Ran `pnpm typecheck` — 11 errors (all expected cascading from the enum change):
   - 10 in `positional-graph.service.ts` (lines 1148, 1447, 1518, 1730, 1791, 1883, 1913, 1963, 2002, 2068)
   - 1 in `reality.builder.ts` (line 55 — type mismatch between interface and reality ExecutionStatus)

### Evidence
```
pnpm typecheck → 11 errors (all 'running' references in service + reality builder)
```

### Files Changed
- `packages/positional-graph/src/schemas/state.schema.ts` — removed 'running', added 'starting' + 'agent-accepted', added events array

**Completed**: 2026-02-07

---

## Task T003: Write predicate tests (RED)
**Started**: 2026-02-07
**Dossier Task**: T003 | **Plan Task**: 2.3a
**Status**: COMPLETE

### What I Did
Created `event-helpers.test.ts` with 10 tests covering:
- `isNodeActive()`: true for `starting`, `agent-accepted`; false for `waiting-question`, `blocked-error`, `complete`
- `canNodeDoWork()`: true only for `agent-accepted`; false for `starting`, `waiting-question`, `blocked-error`, `complete`

### Evidence
```
RED: Tests fail — Cannot find module 'event-helpers.js' (file doesn't exist yet)
Test Files  1 failed (1)
```

### Files Changed
- `test/unit/positional-graph/features/032-node-event-system/event-helpers.test.ts` — new file, 10 tests

**Completed**: 2026-02-07

---

## Task T004: Implement predicates (GREEN)
**Started**: 2026-02-07
**Dossier Task**: T004 | **Plan Task**: 2.3b
**Status**: COMPLETE

### What I Did
1. Created `event-helpers.ts` with `isNodeActive()` and `canNodeDoWork()` predicates
2. Exported both from barrel `index.ts`
3. Ran tests — all 10 pass

### Evidence
```
✓ event-helpers.test.ts (10 tests) 8ms
Test Files  1 passed (1)
Tests  10 passed (10)
```

### Files Changed
- `packages/positional-graph/src/features/032-node-event-system/event-helpers.ts` — new file
- `packages/positional-graph/src/features/032-node-event-system/index.ts` — added predicate exports

**Completed**: 2026-02-07

---

## Task T005: Update positional-graph.service.ts
**Started**: 2026-02-07
**Dossier Task**: T005 | **Plan Task**: 2.4
**Status**: COMPLETE

### What I Did
Replaced all 10 `'running'` references in `positional-graph.service.ts`:
1. Imported `canNodeDoWork` and `isNodeActive` from 032 feature
2. `getLineStatus()`: runningNodes filter uses `'starting' || 'agent-accepted'` check
3. `saveOutputData()`: guard uses `canNodeDoWork(status)` instead of `!== 'running'`
4. `saveOutputFile()`: same guard pattern
5. `transitionNodeState()`: timestamp set on `'starting'` instead of `'running'`
6. `startNode()`: transitions to `'starting'`, returns `status: 'starting'`
7. `endNode()`: guard uses `canNodeDoWork()`, transition from `['agent-accepted']`
8. `askQuestion()`: guard uses `canNodeDoWork()`, dead-code fallback changed to `'agent-accepted'`
9. `answerQuestion()`: sets status to `'starting'` (DYK #1), returns `status: 'starting'`

### Evidence
```
pnpm typecheck → 3 errors remaining (all interface type mismatches — fixed in T009):
- reality.builder.ts line 55 (ExecutionStatus mismatch)
- service.ts line 1807 (StartNodeResult.status: 'running' → 'starting')
- service.ts line 2084 (AnswerQuestionResult.status: 'running' → 'starting')
```

### Files Changed
- `packages/positional-graph/src/services/positional-graph.service.ts` — 10 sites updated

**Completed**: 2026-02-07

---

## Task T006: Update transitionNodeState() valid-states map
**Started**: 2026-02-07
**Dossier Task**: T006 | **Plan Task**: 2.5
**Status**: COMPLETE

### What I Did
Verified transition validity already encoded in callers (T005 changes):
- `startNode()`: `['pending'] → 'starting'`
- `endNode()`: `['agent-accepted'] → 'complete'`
- `answerQuestion()`: direct mutation `'waiting-question' → 'starting'`
- Remaining transitions (`starting→agent-accepted`, `*→blocked-error`) handled by Phase 3-4 `raiseEvent()` event handlers

### Discovery
`transitionNodeState()` is not a map-based validator — it's a generic helper that accepts `validFromStates` from each caller. The "valid transitions map" is distributed across the callers rather than centralized. This is fine for Phase 2 scope.

### Files Changed
None additional (transitions already updated in T005)

**Completed**: 2026-02-07

---

## Task T008: Update ONBAS switch cases
**Started**: 2026-02-07
**Dossier Task**: T008 | **Plan Task**: 2.7
**Status**: COMPLETE

### What I Did
1. `visitNode` switch: replaced `case 'running': return null;` with `case 'starting': case 'agent-accepted': return null;`
2. `diagnoseStuckLine` switch: replaced `case 'running': hasRunning = true;` with `case 'starting': case 'agent-accepted': hasRunning = true;`

### Files Changed
- `packages/positional-graph/src/features/030-orchestration/onbas.ts` — 2 switch cases updated

**Completed**: 2026-02-07

---

## Task T009: Update FakeONBAS, reality, interfaces
**Started**: 2026-02-07
**Dossier Task**: T009 | **Plan Task**: 2.8
**Status**: COMPLETE

### What I Did
1. `reality.types.ts`: replaced `'running'` with `'starting' | 'agent-accepted'` in ExecutionStatus union
2. `reality.schema.ts`: updated ExecutionStatusSchema enum
3. `fake-onbas.ts`: updated `runningNodeIds` filter to match both `'starting'` and `'agent-accepted'`
4. Interface: updated `StartNodeResult.status` to `'starting'`, `AnswerQuestionResult.status` to `'starting'`
5. Updated `ExecutionStatus` comment in interface

### Evidence
```
pnpm typecheck → 0 errors (clean)
```

### Files Changed
- `packages/positional-graph/src/features/030-orchestration/reality.types.ts`
- `packages/positional-graph/src/features/030-orchestration/reality.schema.ts`
- `packages/positional-graph/src/features/030-orchestration/fake-onbas.ts`
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts`

**Completed**: 2026-02-07

---

## Task T007: Migrate test fixtures
**Started**: 2026-02-07
**Dossier Task**: T007 | **Plan Task**: 2.6
**Status**: COMPLETE

### What I Did
Replaced all `'running'` status references across 9 test files using two parallel subagents:

**Batch 1 (unit tests)**:
- `schemas.test.ts`: replaced `'running'` with `'starting'`/`'agent-accepted'`, added rejection test for `'running'`
- `status.test.ts`: `'running'` → `'agent-accepted'` in writeState
- `execution-lifecycle.test.ts`: startNode result `'running'` → `'starting'`, double-start error message updated
- `execution-errors.test.ts`: 3 invalidStateTransitionError target statuses `'running'` → `'starting'`
- `question-answer.test.ts`: answerQuestion result `'running'` → `'starting'` (DYK #1)
- `can-run.test.ts`: stored status `'running'` → `'agent-accepted'`, test name updated
- `collate-inputs.test.ts`: 2 writeState calls `'running'` → `'agent-accepted'`

**Batch 2 (integration + E2E)**:
- `cli-workflow.test.ts`: startResult `'running'` → `'starting'`, answerResult `'running'` → `'starting'`
- `positional-graph-execution-e2e.test.ts`: step 6.5 post-answer status `'running'` → `'starting'`

### Discovery
Subagents initially set `answerResult.status` assertions to `'agent-accepted'` in integration and E2E tests. Per DYK #1, `answerQuestion()` returns `'starting'` (orchestrator must not set agent-accepted). Fixed manually after subagent completion.

### Files Changed
- `test/unit/positional-graph/schemas.test.ts`
- `test/unit/positional-graph/status.test.ts`
- `test/unit/positional-graph/execution-lifecycle.test.ts`
- `test/unit/positional-graph/execution-errors.test.ts`
- `test/unit/positional-graph/question-answer.test.ts`
- `test/unit/positional-graph/can-run.test.ts`
- `test/unit/positional-graph/collate-inputs.test.ts`
- `test/integration/workgraph/cli-workflow.test.ts`
- `test/e2e/positional-graph-execution-e2e.test.ts`

**Completed**: 2026-02-07

---

## Task T010: Backward compatibility test
**Started**: 2026-02-07
**Dossier Task**: T010 | **Plan Task**: 2.9
**Status**: COMPLETE

### What I Did
Created `backward-compat.test.ts` with 6 tests:
1. Parses NodeStateEntry without events field (old format)
2. Parses NodeStateEntry with empty events array (new format)
3. Parses full old-format state.json without events on any node
4. Parses new-format state.json with events on one node (mixed state)
5. Rejects old `'running'` status value
6. Accepts all new status values

### Evidence
```
✓ backward-compat.test.ts (6 tests)
Test Files  1 passed (1)
Tests  6 passed (6)
```

### Files Changed
- `test/unit/positional-graph/features/032-node-event-system/backward-compat.test.ts` — new file

**Completed**: 2026-02-07

---

## Task T011: Final verification (just fft)
**Started**: 2026-02-07
**Dossier Task**: T011 | **Plan Task**: 2.10
**Status**: COMPLETE

### What I Did
1. First `just fft` run: 3 lint errors (import sorting in service.ts, formatting in backward-compat.test.ts and service.ts). Fixed with `pnpm biome check --write .`.
2. Second `just fft` run: lint passed, but 39 test failures across 4 files:
   - `execution-lifecycle.test.ts` (8 failures)
   - `output-storage.test.ts` (5 failures)
   - `input-retrieval.test.ts` (7 failures)
   - `question-answer.test.ts` (19 failures)
3. Root cause: `startNode()` now puts nodes in `'starting'` state, but tests then do work (saveOutput, askQuestion, endNode) which requires `canNodeDoWork()` → only true for `'agent-accepted'`. No `acceptNode()` API exists yet (Phase 3-4).
4. Fix: Added `simulateAgentAccept()` helper to each test file — directly modifies state.json to transition `'starting' → 'agent-accepted'`. Used 4 parallel subagents.
5. Special case: `question-answer.test.ts` "stores multiple questions" test needed re-accept after `answerQuestion()` (DYK #1: answer returns to `'starting'`).
6. Final `just fft` run: all green.

### Evidence
```
Test Files  234 passed | 5 skipped (239)
     Tests  3541 passed | 41 skipped (3582)
```

### Discovery
The two-phase handshake creates a systematic test gap: every test that calls `startNode()` then does work now needs a `simulateAgentAccept()` step. This is a temporary pattern — once Phase 3-4 delivers `acceptNode()`, tests can use the real API.

### Files Changed
- `test/unit/positional-graph/execution-lifecycle.test.ts` — added simulateAgentAccept helper + ~10 accept calls
- `test/unit/positional-graph/output-storage.test.ts` — added simulateAgentAccept helper + 4 beforeEach blocks
- `test/unit/positional-graph/input-retrieval.test.ts` — added simulateAgentAccept helper + ~8 accept calls
- `test/unit/positional-graph/question-answer.test.ts` — added acceptNodeInState helper + 4 beforeEach blocks + 1 mid-test re-accept

**Completed**: 2026-02-07

---
