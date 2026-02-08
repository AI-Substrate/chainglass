# Phase 5: Service Method Wrappers — Execution Log

**Plan**: 032-node-event-system
**Phase**: 5 of 8
**Started**: 2026-02-08

---

## Task T001: EventStampSchema + stamps field + question_id payload
**Started**: 2026-02-08T15:57
**Status**: Complete

### What I Did
1. Created `event-stamp.schema.ts` with `EventStampSchema` Zod schema (`stamped_at`, `action`, `data?`) and `EventStamp` type.
2. Added optional `stamps: z.record(z.string(), EventStampSchema).optional()` to `NodeEventSchema` in `node-event.schema.ts`.
3. Added `question_id: z.string().min(1)` to `QuestionAskPayloadSchema` in `event-payloads.schema.ts`.
4. Updated barrel exports in `index.ts` for `EventStampSchema` and `EventStamp`.
5. Created `event-stamp.test.ts` with 6 schema validation tests.
6. Updated 4 test files to include `question_id` in `question:ask` payload fixtures.
7. Added new `rejects missing question_id` test to payload tests.

### Evidence
- `just fft` clean: 3586 tests passed, 0 failures (was 3579 — +7 new tests)
- All 155 event system tests pass (was 148 — +6 stamp tests, +1 question_id rejection test)

### Files Changed
- `packages/positional-graph/src/features/032-node-event-system/event-stamp.schema.ts` — NEW
- `packages/positional-graph/src/features/032-node-event-system/node-event.schema.ts` — added stamps field + EventStampSchema import
- `packages/positional-graph/src/features/032-node-event-system/event-payloads.schema.ts` — added question_id to QuestionAskPayloadSchema
- `packages/positional-graph/src/features/032-node-event-system/index.ts` — added EventStampSchema/EventStamp exports
- `test/unit/positional-graph/features/032-node-event-system/event-stamp.test.ts` — NEW (6 tests)
- `test/unit/positional-graph/features/032-node-event-system/event-payloads.test.ts` — updated fixtures + new rejection test
- `test/unit/positional-graph/features/032-node-event-system/node-event-registry.test.ts` — updated fixture
- `test/unit/positional-graph/features/032-node-event-system/raise-event.test.ts` — updated fixture
- `test/unit/positional-graph/features/032-node-event-system/event-handlers.test.ts` — updated E2E walkthrough fixture

**Completed**: 2026-02-08T16:01
---

## Task T002: INodeEventService + HandlerContext interfaces
**Started**: 2026-02-08T16:01
**Status**: Complete

### What I Did
1. Created `handler-context.interface.ts` with `HandlerContext` interface (node, event, events, subscriber, nodeId, stamp, stampEvent, findEvents) and new `EventHandler` type `(ctx: HandlerContext) => void`.
2. Created `node-event-service.interface.ts` with `INodeEventService` interface (raise, handleEvents, getEventsForNode, findEvents, getUnstampedEvents, stamp), plus `RaiseResult`, `EventHandlerContextTag` types.
3. Updated barrel exports in `index.ts` — exported new types. Aliased new `EventHandler` as `ContextEventHandler` to avoid collision with Phase 4's old `EventHandler` (will be cleaned up in T006).

### Evidence
- TypeScript compiles clean: `npx tsc --noEmit` passes
- All 155 event system tests pass (no test changes needed — interfaces only)

### Files Changed
- `packages/positional-graph/src/features/032-node-event-system/handler-context.interface.ts` — NEW
- `packages/positional-graph/src/features/032-node-event-system/node-event-service.interface.ts` — NEW
- `packages/positional-graph/src/features/032-node-event-system/index.ts` — added interface exports

**Completed**: 2026-02-08T16:03
---

## Task T003: EventHandlerRegistry + context tags
**Started**: 2026-02-08T16:03
**Status**: Complete

### What I Did
1. Created `event-handler-registry.ts` with `EventHandlerRegistry` class: `on(eventType, handler, {context, name})` and `getHandlers(eventType, context)`. `EventHandlerRegistration` type exported.
2. Created `event-handler-registry.test.ts` with 11 tests covering registration, context filtering (both/cli/web), ordering preservation, return shape.
3. Updated barrel exports.

### Evidence
- 11/11 tests pass

### Files Changed
- `packages/positional-graph/src/features/032-node-event-system/event-handler-registry.ts` — NEW
- `test/unit/positional-graph/features/032-node-event-system/event-handler-registry.test.ts` — NEW
- `packages/positional-graph/src/features/032-node-event-system/index.ts` — added exports

**Completed**: 2026-02-08T16:04
---

## Task T004: FakeNodeEventService + test helpers
**Started**: 2026-02-08T16:04
**Status**: Complete

### What I Did
1. Created `fake-node-event-service.ts` implementing `INodeEventService` with test helpers: `addEvent()`, `getRaiseHistory()`, `getHandleEventsHistory()`, `getStampHistory()`, `setRaiseError()`, `reset()`.
2. Created `fake-node-event-service.test.ts` with 12 tests covering raise, handleEvents, query methods, stamp, and reset.
3. Updated barrel exports.

### Evidence
- 12/12 tests pass

### Files Changed
- `packages/positional-graph/src/features/032-node-event-system/fake-node-event-service.ts` — NEW
- `test/unit/positional-graph/features/032-node-event-system/fake-node-event-service.test.ts` — NEW
- `packages/positional-graph/src/features/032-node-event-system/index.ts` — added exports

**Completed**: 2026-02-08T16:05
---

