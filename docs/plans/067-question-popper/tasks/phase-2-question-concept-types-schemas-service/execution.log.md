# Phase 2: Question Concept — Execution Log

**Phase**: Phase 2: Question Concept — Types, Schemas, Service
**Started**: 2026-03-07T07:27:00Z
**Status**: Complete

---

## T001-T003: Payload Schemas
**Completed**: 2026-03-07T07:29:00Z
Created `packages/shared/src/question-popper/schemas.ts` with QuestionPayloadSchema (4 question types), AnswerPayloadSchema (union answer), ClarificationPayloadSchema, AlertPayloadSchema. All use `.strict()`. QuestionTypeEnum exported as reusable enum.

## T004: Composed Types
**Completed**: 2026-03-07T07:30:00Z
Created `packages/shared/src/question-popper/types.ts`. QuestionIn/AlertIn (caller inputs), QuestionOut/AlertOut (caller outputs), StoredQuestion/StoredAlert (disk records), QuestionStatus/AlertStatus enums, StoredEvent union.

## T005: IQuestionPopperService Interface + DI Token
**Completed**: 2026-03-07T07:31:00Z
Created `packages/shared/src/interfaces/question-popper.interface.ts`. 10 methods: askQuestion, getQuestion, answerQuestion, dismissQuestion, requestClarification, listQuestions, sendAlert, getAlert, acknowledgeAlert, listAll, getOutstandingCount. Added `QUESTION_POPPER_SERVICE` to `WORKSPACE_DI_TOKENS` in di-tokens.ts.

## T006: FakeQuestionPopperService
**Completed**: 2026-03-07T07:32:00Z
Created `packages/shared/src/fakes/fake-question-popper.ts`. Map-based storage. Inspection helpers: getPendingQuestions, getAnsweredCount, getAlertCount, simulateAnswer, simulateAcknowledge, reset. Fake ID counter for deterministic ordering.

## T007: Contract + Companion Tests
**Completed**: 2026-03-07T07:33:00Z
Created `test/contracts/question-popper.contract.ts` (12 contract tests: C01-C12). Created `test/contracts/question-popper.contract.test.ts` (runner with fake + real + 5 companion SSE tests: B01-B05). Discovery: listAll sort instability when timestamps are identical — fixed with ID tiebreaker.

## T008: QuestionPopperService (Real)
**Completed**: 2026-03-07T07:34:00Z
Created `apps/web/src/features/067-question-popper/lib/question-popper.service.ts`. Disk persistence under `.chainglass/data/event-popper/{id}/`. Atomic rename for out.json (DYK-02). Per-entry try/catch rehydration (DYK-03). Type discriminator filter (DYK-05). Outstanding count in SSE payloads. 29/29 tests passing.

## T009: DI Registration
**Completed**: 2026-03-07T07:35:00Z
Added `IQuestionPopperService` registration to both production and test containers in `apps/web/src/lib/di-container.ts`. Production: singleton factory resolving notifier + worktreePath. Test: FakeQuestionPopperService value.

## T010: Barrel Exports
**Completed**: 2026-03-07T07:28:00Z (created early for import resolution)
Created `packages/shared/src/question-popper/index.ts`. Added `./question-popper` subpath to `packages/shared/package.json`. Added exports to `fakes/index.ts` and `interfaces/index.ts`.

---

## Evidence

- Build: `pnpm --filter @chainglass/shared build` — clean (0 errors)
- Tests: 61/61 passing (32 Phase 1 infra + 12 contract×2 + 5 companion)
- Full suite: 4853 passing, 24 pre-existing failures (MCP server tests, unrelated)
- Lint: biome auto-fixed `!.` → `?.` in 5 files

## Discoveries

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-07 | T007 | gotcha | `listAll` sort unstable when all timestamps are identical (same-ms in-memory fake) | Added `b.id.localeCompare(a.id)` as tiebreaker — fake IDs are monotonic |
| 2026-03-07 | T007 | insight | Contract tests run against BOTH fake and real in same runner — 12×2 = 24 tests | Pattern from central-event-notifier.contract.test.ts works perfectly |
| 2026-03-07 | T010 | decision | Created barrel exports early (before T007) so contract test imports resolve | No issue — just task ordering flexibility |
