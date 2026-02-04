# Phase 4: Question/Answer Protocol — Execution Log

**Started**: 2026-02-03
**Phase**: Phase 4: Question/Answer Protocol
**Approach**: Full TDD

---

## Task T001: Write tests for askQuestion, answerQuestion, getAnswer (TDD RED)
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Created `question-answer.test.ts` with 17 tests covering:
- `askQuestion`: 6 tests (generates timestamp ID, transitions to waiting-question, stores question, sets pending_question_id, requires running state E176, E153 for unknown node)
- `answerQuestion`: 6 tests (stores answer, sets answered_at, transitions to running, clears pending_question_id, E173 for invalid qId, E177 if not waiting)
- `getAnswer`: 4 tests (returns answered: true with answer, answered: false if unanswered, E173 for invalid qId, E153 for unknown node)
- Multiple questions from same node: 1 test

### Evidence
All 17 tests fail with "service.askQuestion is not a function" (TDD RED phase verified):
```
 Test Files  1 failed (1)
      Tests  17 failed (17)
```

### Files Changed
- `test/unit/positional-graph/question-answer.test.ts` — created (new file, 17 tests)

**Completed**: 2026-02-03

---

## Task T002: Add interface signatures and result types
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Added to `positional-graph-service.interface.ts`:
- `AskQuestionOptions` interface with type, text, options?, default? fields
- `AskQuestionResult` extends BaseResult with nodeId, questionId, status
- `AnswerQuestionResult` extends BaseResult with nodeId, questionId, status
- `GetAnswerResult` extends BaseResult with nodeId, questionId, answered, answer
- 3 method signatures: askQuestion, answerQuestion, getAnswer

Updated `interfaces/index.ts` to export all 4 new types.

### Evidence
Types added correctly. Build fails as expected (service doesn't implement methods yet):
```
src/services/positional-graph.service.ts(78,14): error TS2420: Class 'PositionalGraphService' incorrectly implements interface 'IPositionalGraphService'.
  Type 'PositionalGraphService' is missing the following properties from type 'IPositionalGraphService': askQuestion, answerQuestion, getAnswer
```

### Files Changed
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — added 4 types + 3 signatures
- `packages/positional-graph/src/interfaces/index.ts` — exported new types

**Completed**: 2026-02-03

---

## Tasks T003, T005, T007: Implement askQuestion, answerQuestion, getAnswer
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Implemented all three Q&A service methods in `positional-graph.service.ts`:

**askQuestion** (~50 lines):
- Validates node exists and is in running state (E176 if not)
- Generates timestamp-based question ID (`YYYY-MM-DDTHH:mm:ss.sssZ_xxxxxx`)
- Creates Question object with type, text, options, asked_at
- Stores question in state.questions[] array
- Updates node status to 'waiting-question' and sets pending_question_id
- Single atomic write via persistState

**answerQuestion** (~45 lines):
- Validates node exists and is in waiting-question state (E177 if not)
- Finds question by ID (E173 if not found)
- Stores answer and answered_at timestamp
- Updates node status to 'running' and clears pending_question_id
- Single atomic write via persistState

**getAnswer** (~30 lines):
- Validates node exists (E153 if not)
- Finds question by ID (E173 if not found)
- Returns {answered: true, answer} if answered
- Returns {answered: false} if not yet answered (per Critical Insight #5)

Also added:
- Private `generateQuestionId()` helper
- Imports for new types and error factories

### Evidence
All 17 question-answer tests pass:
```
 ✓ test/unit/positional-graph/question-answer.test.ts (17 tests) 38ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
```

Package builds successfully:
```
pnpm --filter @chainglass/positional-graph build
> tsc
(no errors)
```

### Files Changed
- `packages/positional-graph/src/services/positional-graph.service.ts` — added askQuestion, answerQuestion, getAnswer methods + generateQuestionId helper

**Completed**: 2026-02-03

---

## Tasks T004, T006, T008: Add CLI commands ask, answer, get-answer
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Added three CLI command handlers and registrations to `positional-graph.command.ts`:

**handleNodeAsk** (~40 lines):
- Validates question type (text, single, multi, confirm)
- Builds AskQuestionOptions from CLI flags
- Calls service.askQuestion
- Outputs JSON result

**handleNodeAnswer** (~25 lines):
- Parses answer as JSON (falls back to string)
- Calls service.answerQuestion
- Outputs JSON result

**handleNodeGetAnswer** (~20 lines):
- Calls service.getAnswer
- Outputs JSON result with answered status

Command registrations:
- `cg wf node ask <graph> <nodeId> --type <type> --text <text> [--options <values...>]`
- `cg wf node answer <graph> <nodeId> <questionId> <answer>`
- `cg wf node get-answer <graph> <nodeId> <questionId>`

Also added:
- `AskQuestionOptions` type import from @chainglass/positional-graph
- `AskOptions` interface for CLI options
- Updated file header comment to include Phase 4 commands

### Evidence
All 3083 tests pass:
```
 Test Files  213 passed | 5 skipped (218)
      Tests  3083 passed | 41 skipped (3124)
```

`just fft` passes (lint, format, test).

### Files Changed
- `apps/cli/src/commands/positional-graph.command.ts` — added 3 handlers + 3 command registrations

**Completed**: 2026-02-03

---

## Phase 4 Complete

All 8 tasks completed:
- T001: Write tests (TDD RED) — 17 tests
- T002: Add interface signatures — 4 types + 3 signatures
- T003: Implement askQuestion — service method
- T004: Add ask CLI — handler + command
- T005: Implement answerQuestion — service method
- T006: Add answer CLI — handler + command
- T007: Implement getAnswer — service method
- T008: Add get-answer CLI — handler + command

**Summary**:
- 17 new unit tests
- 3 new service methods
- 3 new CLI commands
- 339 total positional-graph tests passing
- 3083 total project tests passing

**Acceptance Criteria Met**:
- AC-5: ✅ `cg wf node ask` transitions to waiting-question, returns question ID
- AC-6: ✅ `cg wf node answer` stores answer, transitions to running
- AC-7: ✅ `cg wf node get-answer` returns stored answer
- AC-18: ✅ Invalid question ID returns E173

---
