# Review: Phase 5 — Service Method Wrappers (INodeEventService + HandlerContext)

**Plan**: 032-node-event-system
**Phase**: 5 of 8
**Reviewed**: 2026-02-08
**Status**: PASS — all workshop assertions verified, all tests green

---

## Test Results

- **241 test files**, **3634 tests passed**, 0 failures
- `just fft` equivalent clean (pnpm test, full suite)
- 5 test files skipped (unrelated web hooks/page tests)

---

## Workshop Assertion Verification

### Workshop 06: raiseEvent/handleEvents Separation

| Assertion | Verified | Evidence |
|-----------|----------|----------|
| `raiseEvent()` is record-only (no handler invocation) | PASS | `raise-event.ts` — no handler imports, no handler calls. Pipeline: validate -> create -> append -> persist. |
| `handleEvents()` caller persists (Q7 Option A) | PASS | PGS wrappers (`endNode`, `askQuestion`, `answerQuestion`) all call `persistState()` after `handleEvents()`. |
| Subscriber stamps model: `stamps: Record<string, EventStamp>` | PASS | `node-event.schema.ts` line: `stamps: z.record(z.string(), EventStampSchema).optional()` |
| CLI calls raise then handleEvents | PASS | All three PGS wrappers follow raise -> loadState -> handleEvents -> persist sequence. |
| `question:answer` transitions to `starting` | PASS | `handleQuestionAnswer` in `event-handlers.ts`: `ctx.node.status = 'starting'` |

### Workshop 09: First-Class Node Event Service (INodeEventService)

| Assertion | Verified | Evidence |
|-----------|----------|----------|
| `INodeEventService` interface with raise, handleEvents, query, stamp | PASS | `node-event-service.interface.ts` — all 6 methods defined |
| `HandlerContext` with `node`, `event`, `events`, `subscriber`, `nodeId`, `stamp()`, `stampEvent()`, `findEvents()` | PASS | `handler-context.interface.ts` — all 8 members present |
| `EventHandler` type changed to `(ctx: HandlerContext) => void` | PASS | `handler-context.interface.ts` — type exported |
| Handler signature: no raw `(state, nodeId, event)` | PASS | All 6 handlers in `event-handlers.ts` take `(ctx: HandlerContext)` |
| `NodeEventService` constructor takes deps + handler registry | PASS | `node-event-service.ts` — `constructor(deps: NodeEventServiceDeps, handlerRegistry: EventHandlerRegistry)` |
| `FakeNodeEventService` with test helpers | PASS | `fake-node-event-service.ts` — `addEvent()`, `getRaiseHistory()`, `getHandleEventsHistory()`, `getStampHistory()`, `reset()`, `setRaiseError()` |
| No public DI token (internal to positional-graph) | PASS | No DI token in `packages/shared/src/di-tokens.ts`; service created via `createEventService()` factory method on PGS |
| `raise()` persists internally; `handleEvents()`, `stamp()`, queries do not | PASS | `raise()` delegates to `raiseEvent()` which calls `persistState`. Other methods mutate state in-place only. |

### Workshop 10: Event Processing in the Orchestration Loop

| Assertion | Verified | Evidence |
|-----------|----------|----------|
| `handleEvents()` accepts `context: 'cli' \| 'web'` parameter | PASS | Interface and implementation both include `context` param |
| `EventHandlerRegistry` with `on()` and `getHandlers(eventType, context)` | PASS | `event-handler-registry.ts` — both methods implemented |
| `EventHandlerContextTag = 'cli' \| 'web' \| 'both'` type | PASS | Exported from `node-event-service.interface.ts` |
| All 6 Phase 5 handlers registered as `context: 'both'` | PASS | `createEventHandlerRegistry()` in `event-handlers.ts` — all use `{ context: 'both' }` |
| Multi-handler per event type supported | PASS | `EventHandlerRegistry` stores arrays per event type; tested in `event-handler-registry.test.ts` |
| Registration order preserved | PASS | Test: "preserves registration order" in registry test file |

### DYK Critical Insights

| # | Insight | Verified | Evidence |
|---|---------|----------|----------|
| DYK #1 | `endNode()` retains `canEnd()` as pre-flight guard | PASS | PGS `endNode()` lines 1921-1935: checks `canEnd()` before `eventService.raise()` |
| DYK #1b | `answerQuestion()` returns `{ status: 'starting' }`, not `'agent-accepted'` | PASS | Handler sets `ctx.node.status = 'starting'`; PGS returns `{ status: 'starting' }` |
| DYK #2 | `handleEvents()` JSDoc warns about stale-state | PASS | JSDoc on both interface and implementation: "state must be loaded AFTER `raise()` returns" |
| DYK #3 | `QuestionAskPayloadSchema` includes `question_id` field | PASS | `event-payloads.schema.ts`: `question_id: z.string().min(1)` |
| DYK #4 | Stamps replace `markHandled()` entirely; no writes to `event.status`/`handled_at`/`handler_notes` | PASS | `markHandled` deleted (grep returns 0 results). No handler writes legacy fields. |
| DYK5 #1 | `handleQuestionAnswer` uses `ctx.findEvents()` + `ctx.stampEvent()` for answer-linking | PASS | Handler calls `ctx.findEvents()` to locate ask event, then `ctx.stampEvent(askEvent, 'answer-linked')` |
| DYK5 #5 | Two registries with distinct concerns (INodeEventRegistry for validation, EventHandlerRegistry for dispatch) | PASS | `NodeEventService` constructor takes `deps.registry` (INodeEventRegistry) and `handlerRegistry` (EventHandlerRegistry) separately |

### ADR-0011: First-Class Domain Concepts

| Assertion | Verified | Evidence |
|-----------|----------|----------|
| Service with interface, fake, contract tests | PASS | `INodeEventService` interface, `NodeEventService` impl, `FakeNodeEventService` fake, `service-wrapper-contracts.test.ts` + `fake-node-event-service.test.ts` |
| Handlers are 2-5 lines of business logic (POS-004) | PASS | All 6 handlers are 2-4 lines of logic each (no casting, no plumbing) |

---

## Design Decision Verification

| Decision | Status | Notes |
|----------|--------|-------|
| DD-1: Service wraps existing raiseEvent logic | PASS | `raise()` delegates to `raiseEvent()` function |
| DD-2: HandlerContext constructed by handleEvents, not handlers | PASS | `buildHandlerContext()` private method in `NodeEventService` |
| DD-3: Stamps replace markHandled; legacy fields preserved in schema only | PASS | Schema retains `status`, `handled_at`, `handler_notes`; handlers don't write them |
| DD-4: handleQuestionAnswer gains starting transition | PASS | `ctx.node.status = 'starting'` in handler |
| DD-5: Service methods call raise() but NOT handleEvents() | PASS | PGS wrappers orchestrate both; the event service `raise()` itself is record-only |
| DD-6: state.questions[] remains service-written | PASS | Both `askQuestion` and `answerQuestion` write to `state.questions[]` directly |

---

## File Inventory

### New Files (Phase 5)

| File | Present | Lines |
|------|---------|-------|
| `event-stamp.schema.ts` | Yes | ~20 |
| `node-event-service.interface.ts` | Yes | ~65 |
| `handler-context.interface.ts` | Yes | ~50 |
| `event-handler-registry.ts` | Yes | ~55 |
| `node-event-service.ts` | Yes | ~130 |
| `fake-node-event-service.ts` | Yes | ~120 |

### Modified Files

| File | Change | Verified |
|------|--------|----------|
| `node-event.schema.ts` | `stamps` field added | PASS |
| `event-payloads.schema.ts` | `question_id` added to QuestionAskPayloadSchema | PASS |
| `event-handlers.ts` | HandlerContext signature, `createEventHandlerRegistry()` replaces `createEventHandlers()` | PASS |
| `raise-event.ts` | Handler invocation removed (record-only) | PASS |
| `positional-graph.service.ts` | `endNode`, `askQuestion`, `answerQuestion` delegate to eventService | PASS |
| `index.ts` | New exports added | PASS |

### Test Files

| File | Focus | Tests |
|------|-------|-------|
| `node-event-service.test.ts` | Service unit tests | raise, handleEvents, query, stamp |
| `event-handler-registry.test.ts` | Registry unit tests | registration, context filtering, ordering |
| `event-stamp.test.ts` | Schema validation | valid/invalid stamps |
| `fake-node-event-service.test.ts` | Fake behavior | history tracking, reset, configured errors |
| `service-wrapper-contracts.test.ts` | Contract tests | endNode, askQuestion, answerQuestion via event system |
| `event-handlers.test.ts` | Handler + E2E tests | 6 handlers + 4 walkthroughs |

---

## Issues Found

None.

---

## Summary

Phase 5 correctly implements the `INodeEventService` first-class domain service per Workshop 09 and ADR-0011. All 15 workshop assertions, 7 DYK critical insights, and 6 design decisions are verified in the implementation. The handler refactoring from raw `(state, nodeId, event)` to `HandlerContext` eliminates casting and plumbing. `markHandled()` is fully deleted in favor of subscriber stamps. The `EventHandlerRegistry` with context tags prepares the system for multi-handler per event type in web/CLI contexts. All 3634 tests pass.
