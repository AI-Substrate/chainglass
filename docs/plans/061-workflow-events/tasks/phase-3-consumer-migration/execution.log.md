# Execution Log: Phase 3 — Consumer Migration

## T001: CLI DI + WorkflowEventError + Service throws

**Status**: Complete
**Duration**: ~5 min

**What was done**:
1. Created `packages/shared/src/workflow-events/errors.ts` — `WorkflowEventError` class extending Error with `errors: readonly ResultError[]` property (DYK-P3-02)
2. Updated `packages/shared/src/workflow-events/index.ts` — exported WorkflowEventError
3. Updated `packages/positional-graph/src/workflow-events/workflow-events.service.ts` — all 4 `throw new Error(...)` sites replaced with `throw new WorkflowEventError(message, result.errors)` preserving structured errors
4. Added `createWorkflowEventsService(ctx: WorkspaceContext)` helper to `apps/cli/src/commands/positional-graph.command.ts` — per-request construction per DYK-P3-01
5. Updated CLI imports: added IWorkflowEvents, WorkflowEventsService, WorkflowEventObserverRegistry, WorkflowEventError, WorkspaceContext; removed AskQuestionOptions (no longer needed)

**Evidence**: `pnpm --filter @chainglass/shared build` ✅, `pnpm --filter @chainglass/positional-graph build` ✅

**Discovery**: The `answerQuestion` partial failure path (line 183 — restart fails after answer recorded) still throws plain Error, not WorkflowEventError, because the restart failure comes from a caught exception not a result.errors array. This is acceptable — it's an edge case with a descriptive message.

---

## T002-T004: Migrate CLI handlers (ask, answer, get-answer)

**Status**: Complete
**Duration**: ~5 min (all 3 done in single batch)

**What was done**:
1. Replaced `handleNodeAsk` — uses `createWorkflowEventsService(ctx)`, try/catch with WorkflowEventError extraction for structured JSON output
2. Replaced `handleNodeAnswer` — single `wfEvents.answerQuestion()` call. Fixes Finding 02: CLI answer now includes node:restart. JSON parse logic preserved.
3. Replaced `handleNodeGetAnswer` — handles `AnswerResult | null` return type (vs old `GetAnswerResult`)
4. Removed `AskQuestionOptions` import (no longer needed)

---

## T005: Migrate web answerQuestion action

**Status**: Complete
**Duration**: ~3 min

**What was done**:
1. Added imports: WorkflowEventsService, WorkflowEventObserverRegistry, IWorkflowEvents, WorkflowEventError
2. Added `createWorkflowEventsService(ctx)` per-request factory (same pattern as CLI)
3. Replaced 2-call pattern (svc.answerQuestion + svc.raiseNodeEvent restart) with single `wfEvents.answerQuestion()`
4. Error handling: WorkflowEventError → structured errors, plain Error → generic error

---

## T006: Migrate helper answerNodeQuestion

**Status**: Complete
**Duration**: ~3 min

**What was done**:
1. Added imports: WorkflowEventsService, WorkflowEventObserverRegistry from @chainglass/positional-graph
2. Replaced 2-call body (service.answerQuestion + service.raiseNodeEvent) with internal WorkflowEventsService construction + delegation
3. Kept original function signature `(service: IPositionalGraphService, ctx, ...)` — callers unchanged
4. `completeUserInputNode` and `clearErrorAndRestart` left untouched (non-Q&A lifecycle ops)

**Discovery**: Kept signature unchanged rather than clean-breaking to IWorkflowEvents. The helper IS the migration boundary — it internally constructs WorkflowEventsService from the PGService+ctx it receives. 37 importers don't change. TypeScript still enforces correct types.

---

## T007: QnA CLI integration tests

**Status**: Complete
**Duration**: ~8 min (including state discovery fix)

**What was done**:
1. Added `simulateAgentAccepted()` helper — `question:ask` requires agent-accepted state, not starting
2. Added 5 integration tests:
   - Full ask→answer→get-answer cycle with state assertions
   - getAnswer returns null for unknown questionId
   - askQuestion throws WorkflowEventError on wrong state (ready node)
   - answerQuestion throws for invalid questionId
   - Choice options round-trip (single type with options array)
3. Added imports: WorkflowEventsService, WorkflowEventObserverRegistry, WorkflowEventError

**Evidence**: 16 tests pass (11 existing + 5 new)

**Discovery**: `question:ask` requires `agent-accepted` state, not `starting`. Added `simulateAgentAccepted()` that calls simulateStart() + raiseNodeEvent('node:accepted'). Existing tests unaffected — they raise accepted themselves.

---

## T008: Delete PGService Q&A methods

**Status**: Complete
**Duration**: ~10 min

**What was done**:
1. Deleted from interface: `askQuestion`, `answerQuestion`, `getAnswer` method signatures + `AskQuestionOptions`, `AskQuestionResult`, `AnswerQuestionResult`, `GetAnswerResult` types
2. Deleted from PositionalGraphService: ~240 lines of Q&A implementation + `generateQuestionId()` helper
3. Deleted from FakePositionalGraphService: 3 Q&A stubs
4. Deleted from interfaces/index.ts barrel: 4 type exports
5. Deleted `test/unit/positional-graph/question-answer.test.ts` entirely (17 tests)
6. Trimmed `service-wrapper-contracts.test.ts`: removed T009 (askQuestion) + T010 (answerQuestion) sections (~150 lines)
7. Cleaned unused imports: `nodeNotWaitingError`, `questionNotFoundError`, type imports

**Evidence**: 334 files pass, 4722 tests, 0 failures. Test count: 4741 → 4722 (delta: -19 = 17 deleted + ~2 from wrapper contracts)

**Discovery**: `workgraph` package defines its own `GetAnswerResult` in `IWorkNodeService` — completely independent, not affected by PGService deletion.

---
