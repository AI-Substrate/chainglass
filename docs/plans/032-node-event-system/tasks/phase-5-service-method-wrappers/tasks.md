# Phase 5: Service Method Wrappers — INodeEventService + HandlerContext

**Plan**: 032-node-event-system
**Phase**: 5 of 8
**Status**: In Progress (Subtask 001 complete; main phase regenerated)
**Created**: 2026-02-08 (regenerated from scratch per WS09/ADR-0011)
**Workshops**: [06-inline-handlers-and-subscriber-stamps.md](../../workshops/06-inline-handlers-and-subscriber-stamps.md), [09-first-class-node-event-service.md](../../workshops/09-first-class-node-event-service.md), [10-event-processing-in-the-orchestration-loop.md](../../workshops/10-event-processing-in-the-orchestration-loop.md)
**ADR**: [ADR-0011: First-Class Domain Concepts Over Diffuse Functions](../../../../adr/adr-0011-first-class-domain-concepts.md)
**Subtask 001**: [001-subtask-drop-backward-compat.md](./001-subtask-drop-backward-compat.md) — COMPLETE

---

## Executive Briefing

Phase 5 elevates node event operations from six diffuse standalone functions into a first-class service (`INodeEventService`) per Workshop 09 and ADR-0011. The service owns the complete event lifecycle: raise (record-only), process (handleEvents with subscriber stamps), query, and stamp. Handlers receive a structured `HandlerContext` that eliminates casting and manual plumbing. Service methods (`endNode`, `askQuestion`, `answerQuestion`) become thin wrappers delegating to `INodeEventService.raise()`. The `markHandled()` pattern is replaced by subscriber stamps on `EventStampSchema`.

This phase is the bridge between Phase 4's standalone handlers and Phase 6's CLI commands. After Phase 5, every node state change flows through `INodeEventService`, multiple subscribers can independently process the same events via `EventHandlerRegistry` (multi-handler per event type with `'cli' | 'web' | 'both'` context tags), and handlers are clean single-purpose functions operating on `HandlerContext`.

### What Changed Since the Original Dossier

The original Phase 5 dossier targeted standalone functions (`raiseEvent()`, `handleEvents()`, `stampEvent()`) per Workshop 06. Workshop 09 (2026-02-08) elevated these into `INodeEventService` with `HandlerContext`, and ADR-0011 established the architectural principle. The old dossier was deleted and this regenerated version targets the service-based architecture. Subtask 001 (drop backward compat layer) is complete and its artifacts are preserved.

---

## Objectives

### Goals

1. **EventStampSchema + stamps field**: Add `EventStampSchema` to `node-event.schema.ts` and a `stamps` field on `NodeEventSchema` per Workshop 06 subscriber stamps model.
2. **INodeEventService interface**: Define the service contract with methods: `raise()`, `handleEvents(state, nodeId, subscriber, context)` (with `context: 'cli' | 'web'` parameter per WS10), `getEventsForNode()`, `findEvents()`, `getUnstampedEvents()`, `stamp()`.
3. **HandlerContext interface**: Structured context for handlers with `node`, `event`, `events`, `subscriber`, `nodeId`, `stamp()`, `stampEvent()`, `findEvents()`.
4. **NodeEventService implementation**: Real implementation delegating to existing `raiseEvent()` logic for `raise()`, new `handleEvents()` logic for processing, query methods for read access, stamp method for mutations.
5. **FakeNodeEventService**: Test fake with `addEvent()`, `getHistory()`, `getRaiseHistory()`, `getHandleEventsHistory()`, `reset()` helpers.
6. **Handler refactoring**: Change handler signature from `(state, nodeId, event) => void` to `(ctx: HandlerContext) => void`. Replace `markHandled()` with `ctx.stamp('state-transition')`. Fix `handleQuestionAnswer` to add `starting` transition (T003 fix).
7. **raiseEvent becomes record-only**: Remove handler invocation from `raise-event.ts`. `raiseEvent()` validates, creates, appends, persists. No handler calls.
8. **Service method wrappers**: `endNode()`, `askQuestion()`, `answerQuestion()` delegate to `eventService.raise()`. Contract tests prove behavioral parity.
9. **All existing tests pass**: Regression verification via `just fft`.

### Non-Goals

- CLI command implementation (Phase 6)
- ONBAS adaptation (Phase 8)
- Event Handler Service / graph-wide event processing (Plan 030 Phase 7)
- Public DI token for `INodeEventService` (internal to `positional-graph`)
- Web/CLI wiring of the event service

---

## Scope

### New Files

| File | Purpose |
|------|---------|
| `event-stamp.schema.ts` | `EventStampSchema` Zod schema + `EventStamp` type |
| `node-event-service.interface.ts` | `INodeEventService` interface |
| `handler-context.interface.ts` | `HandlerContext` interface + `EventHandler` type (new signature) |
| `event-handler-registry.ts` | `EventHandlerRegistry` class with `on()` and `getHandlers()` methods, `EventHandlerRegistration` and `EventHandlerContextTag` types (WS10) |
| `node-event-service.ts` | `NodeEventService` class implementing `INodeEventService` |
| `fake-node-event-service.ts` | `FakeNodeEventService` with test helpers |
| Test files (see task table) | Unit tests, contract tests, handler refactor tests |

### Modified Files

| File | Changes |
|------|---------|
| `node-event.schema.ts` | Add optional `stamps` field: `z.record(z.string(), EventStampSchema).optional()` |
| `event-handlers.ts` | Handler signature → `(ctx: HandlerContext) => void`; `markHandled()` → `ctx.stamp()`; `handleQuestionAnswer` gains `starting` transition |
| `raise-event.ts` | Remove handler invocation (lines 163-167). `raiseEvent()` becomes record-only |
| `index.ts` | Add new exports: `INodeEventService`, `NodeEventService`, `FakeNodeEventService`, `HandlerContext`, `EventStampSchema`, `EventStamp`, updated `EventHandler` type |
| `event-payloads.schema.ts` | Add `question_id: z.string()` to `QuestionAskPayloadSchema` (DYK #3 — handler needs payload-sourced ID, not `event_id`) |
| `positional-graph.service.ts` | Construct `NodeEventService` internally; `endNode()`, `askQuestion()`, `answerQuestion()` delegate to `eventService.raise()` |

### Files NOT Modified

| File | Why |
|------|-----|
| `event-source.schema.ts` | No changes to source enum |
| `event-status.schema.ts` | `EventStatus` schema unchanged. Stamps become the authoritative processed-by tracking; `event.status`/`handled_at` become legacy fields no longer written by handlers |
| `node-event-registry.ts` / `node-event-registry.interface.ts` | Registry unchanged |
| `core-event-types.ts` | Core type registrations unchanged |
| `event-id.ts` | ID generation unchanged |
| `event-helpers.ts` | `canNodeDoWork()`, `isNodeActive()` unchanged |
| `event-errors.ts` | Error factories unchanged |
| Output methods (`saveOutputData`, `saveOutputFile`) | Not event-routed per spec |

---

## Prior Phase Review Summary

### Phase 1: Event Types, Schemas, and Registry
- 12 source files, 94 tests across 4 test files
- Delivered: `INodeEventRegistry`, `FakeNodeEventRegistry`, 6 payload schemas, `registerCoreEventTypes()`, `generateEventId()`, E190-E195 error factories
- Key: Registry validates payload shape; source enforcement deferred to `raiseEvent()`
- Key: `NodeEventSchema.payload` is open-shaped (`z.record(z.unknown())`)

### Phase 2: State Schema Extension and Two-Phase Handshake
- 22 files modified, 16 new tests
- Delivered: Status enum migration (`running` removed, `starting` + `agent-accepted` added), `events: z.array(NodeEventSchema).optional()` on `NodeStateEntrySchema`, `canNodeDoWork()` and `isNodeActive()` predicates
- Key: `answerQuestion()` returns `'starting'` not `'agent-accepted'` (DYK #1)
- Key: `simulateAgentAccept()` temporary test helpers in 4 test files (technical debt for Phase 5)

### Phase 3: raiseEvent Core Write Path
- 1 source file (174 lines), 22 tests
- Delivered: `raiseEvent()` function, `RaiseEventDeps`/`RaiseEventResult` interfaces, `VALID_FROM_STATES` map (6 entries)
- Key: 5-step validation pipeline is fail-fast, state loaded lazily at step 4
- Key: `createFakeStateStore()` test helper with `structuredClone()` isolation

### Phase 4: Event Handlers and State Transitions (+ Subtask 001)
- 6 handlers, `createEventHandlers()` factory, 23 handler tests + 4 E2E walkthroughs
- Delivered: `EventHandler` type `(state, nodeId, event) => void`, `markHandled()` helper, inline handler invocation in `raiseEvent()` at lines 163-167
- Subtask 001: Deleted `deriveBackwardCompatFields()` — zero test failures confirmed redundancy
- Key: `handleQuestionAnswer` does NOT transition to `starting` — fix needed in Phase 5 (T003)
- Key: `question:ask` handler stays `new` (not `handled`) — deferred processing for ODS
- Key: Handlers mutate state in-place via JS reference aliasing

### Phase 5 Subtask 001: Drop Backward Compat Layer
- COMPLETE. Deleted `derive-compat-fields.ts` and tests. Updated AC-15 wording. Regenerated flight plan.
- 3579 total tests, 0 failures after removal.

---

## Critical Findings Applied

| Finding | Source | Application in Phase 5 |
|---------|--------|------------------------|
| **DYK #1**: `endNode()` retains `canEnd()` as pre-flight guard | WS10 DYK session | `canEnd()` stays as validation before `eventService.raise()`. NOT moved into raise validation pipeline. |
| **DYK #1b**: `answerQuestion()` → `'starting'`, not `'agent-accepted'` | Workshop 01, Phase 2 | `handleQuestionAnswer` refactored to add `ctx.node.status = 'starting'` transition. Service wrapper `answerQuestion()` returns `{ status: 'starting' }`. |
| **DYK #2**: `handleEvents` stale-state warning | WS10 DYK session | `handleEvents()` JSDoc MUST warn: "state must be loaded AFTER `raise()` returns to avoid stale-state bugs." Add stale-state no-op test in T004. |
| **DYK #3**: `QuestionAskPayloadSchema` needs `question_id` | WS10 DYK session | Handler reads `question_id` from payload, NOT `event.event_id`. Add `question_id: z.string()` to `QuestionAskPayloadSchema`. |
| **DYK #4**: Stamps replace `markHandled()` entirely | WS10 DYK session | `ctx.stamp()` writes ONLY to `event.stamps[subscriber]`. Does NOT write `event.status`, `handled_at`, or `handler_notes`. These legacy fields are preserved in schema but no longer written by handlers. |
| **WS10**: EventHandlerRegistry with context tags | Workshop 10 | Multi-handler per event type. `EventHandlerRegistry` with `on()` and `getHandlers(eventType, context)`. `handleEvents()` takes `context: 'cli' \| 'web'` parameter to filter handlers. All 6 Phase 5 handlers register as `context: 'both'`. |
| **Finding 03**: Backward-compat fields are handler-written | Phase 4 WS04, Subtask 001 | RESOLVED. Compat layer deleted. Handlers write `pending_question_id` and `error` directly. No derivation. |
| **Finding 08**: Atomic state persistence | Research dossier | `raise()` persists internally. `handleEvents()` caller persists. Workshop 06 Q7 Option A confirmed. |
| **ADR-0011**: First-class domain concepts | Workshop 09 | INodeEventService is the golden example. Service with interface, fake, contract tests. No public DI token (internal to positional-graph). |

---

## Architecture

### Before Phase 5 (Current State)

```
┌─────────────────────────────────────────────────┐
│ PositionalGraphService                          │
│  endNode() ─┐                                   │
│  askQuestion() ──> direct state mutation         │
│  answerQuestion() ──> direct state mutation      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ raiseEvent() [standalone function]              │
│  validate → create → append → HANDLE → persist  │
│  ↑ RaiseEventDeps injected per-call             │
│  ↑ EVENT_HANDLERS module singleton              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ event-handlers.ts [standalone functions]         │
│  markHandled(event) — sets status + handled_at   │
│  handleNodeAccepted(state, nodeId, event)        │
│  handleQuestionAnswer(state, nodeId, event)      │
│  ... (6 handlers, raw state access, casting)     │
└─────────────────────────────────────────────────┘
```

### After Phase 5

```
┌─────────────────────────────────────────────────┐
│ PositionalGraphService                          │
│  endNode() ──> eventService.raise(...)           │
│  askQuestion() ──> eventService.raise(...)       │
│  answerQuestion() ──> eventService.raise(...)    │
│  ↑ constructs NodeEventService internally        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ INodeEventService [interface]                   │
│  raise(graph, node, type, payload, source)       │
│    → validate → create → append → persist        │
│    → record-only, NO handler invocation          │
│  handleEvents(state, nodeId, subscriber, context) │
│    → scan unstamped → filter handlers by context  │
│    → build HandlerContext → run handlers → stamp  │
│    → caller persists                              │
│  getEventsForNode(state, nodeId)                 │
│  findEvents(state, nodeId, predicate)            │
│  getUnstampedEvents(state, nodeId, subscriber)   │
│  stamp(event, subscriber, action, data?)         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ NodeEventService [implementation]               │
│  constructor(deps: NodeEventServiceDeps,         │
│              registry: EventHandlerRegistry)      │
│  deps bound at construction: event registry,     │
│    handler registry, loadState, persistState     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ event-handlers.ts [refactored]                  │
│  handleNodeAccepted(ctx: HandlerContext)          │
│  handleQuestionAnswer(ctx: HandlerContext)        │
│  ... (6 handlers, HandlerContext, no casting)    │
│  ctx.stamp('state-transition') replaces          │
│    markHandled(event)                            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ NodeEventSchema [extended]                      │
│  + stamps: Record<string, EventStamp>            │
│    { stamped_at, action, data? }                 │
│  event.status / handled_at / handler_notes       │
│    preserved in schema (no longer written by     │
│    handlers — stamps are the authority)           │
└─────────────────────────────────────────────────┘
```

### Persistence Rules (Workshop 06 Q7, WS09)

| Method | Persists? | Why |
|--------|-----------|-----|
| `raise()` | Yes — internally | Atomic: validate → create → append → persist |
| `handleEvents()` | No — caller persists | Composable with other mutations |
| `stamp()` | No — caller persists | State mutation, caller batches |
| `getEventsForNode()` | No — read-only | Pure query |
| `findEvents()` | No — read-only | Pure query |
| `getUnstampedEvents()` | No — read-only | Pure query |

### CLI Flow (Post-Phase 5)

```
CLI command: cg wf node end --graph g --node task-1
  1. service.endNode(ctx, g, task-1)
     → validates canEnd (output check)
     → eventService.raise(g, task-1, 'node:completed', {}, 'agent')
     → event recorded + persisted
  2. state = loadState(g)
  3. eventService.handleEvents(state, task-1, 'cli', 'cli')
     → handler runs, stamps event, mutates state
  4. persistState(g, state)
  5. Return EndNodeResult
```

---

## Tasks

### Implementation Order Rationale

Tasks follow the constitution's interface-first sequence: schema → interface → registry → fake → tests → implementation → contract tests. The handler refactor (T006) comes after the service implementation (T005) because handlers need `HandlerContext` which is constructed by the service's `handleEvents()` method. The `EventHandlerRegistry` (T003) must exist before `NodeEventService` (T005) because the service constructor accepts the registry.

| # | Task | CS | Success Criteria | Dep | AC |
|---|------|----|------------------|-----|-----|
| T001 | EventStampSchema + stamps field + question_id payload | 1 | `EventStampSchema` Zod schema exported. `NodeEventSchema` has `stamps: z.record(z.string(), EventStampSchema).optional()`. Add `question_id: z.string()` to `QuestionAskPayloadSchema` (DYK #3). Existing tests still parse events without stamps. `just fft` clean. | — | — |
| T002 | INodeEventService interface + HandlerContext interface | 1 | Interfaces defined in separate `.interface.ts` files. `EventHandler` type changed to `(ctx: HandlerContext) => void`. `HandlerContext` exposes: `node`, `event`, `events`, `subscriber`, `nodeId`, `stamp(action, data?)`, `stampEvent(event, action, data?)`, `findEvents(predicate)`. `handleEvents` signature includes `context: 'cli' \| 'web'` parameter (WS10). No implementation yet. TypeScript compiles. | T001 | — |
| T003 | EventHandlerRegistry + context tags | 2 | `EventHandlerRegistry` class with `on(eventType, handler, { context, name })` and `getHandlers(eventType, context)` methods. Types: `EventHandlerRegistration`, `EventHandlerContextTag = 'cli' \| 'web' \| 'both'`. `createEventHandlerRegistry()` factory registers all 6 handlers as `context: 'both'`. Unit tests: registration, context filtering, ordering preserved. | T002 | — |
| T004 | FakeNodeEventService + test helpers | 2 | `FakeNodeEventService` implements `INodeEventService`. Test helpers: `addEvent()`, `getRaiseHistory()`, `getHandleEventsHistory()`, `getStampHistory()`, `reset()`. Unit tests for fake behavior. | T002 | — |
| T005 | NodeEventService implementation + unit tests | 3 | `NodeEventService` implements `INodeEventService`. Constructor takes `deps: NodeEventServiceDeps` (includes `INodeEventRegistry` for event type validation, `loadState`, `persistState`) and `handlerRegistry: EventHandlerRegistry` (for handler dispatch) — two registries, distinct concerns (DYK5 #5). `raise()` delegates to existing raiseEvent logic (deps bound at construction). `handleEvents()` scans unstamped events, filters handlers by context via `handlerRegistry.getHandlers(eventType, context)`, constructs `HandlerContext`, runs handlers, writes stamps. `handleEvents()` JSDoc warns: "state must be loaded AFTER `raise()` returns" (DYK #2). Stale-state no-op test included. Query methods read from state. `stamp()` writes to `event.stamps[subscriber]`. Unit tests for all methods. | T003, T004 | AC-15 |
| T006 | Refactor handlers to HandlerContext signature | 2 | All 6 handlers take `(ctx: HandlerContext) => void`. `markHandled()` REMOVED — `ctx.stamp('state-transition')` writes only to `event.stamps[subscriber]`, NOT to `event.status`/`handled_at`/`handler_notes` (DYK #4). `handleQuestionAnswer` adds `ctx.node.status = 'starting'` transition (DYK #1b), reads `question_id` from payload (DYK #3), uses `ctx.findEvents()` to locate the original ask event by `question_event_id`, and calls `ctx.stampEvent(askEvent, 'answer-linked')` to cross-stamp it (DYK5 #1). `createEventHandlerRegistry()` replaces `createEventHandlers()`. Handler unit tests updated. | T005 | AC-6, AC-7 |
| T007 | Make raiseEvent record-only | 2 | Remove handler invocation from `raise-event.ts` (lines 163-167). Remove `createEventHandlers()` import and module singleton. `raiseEvent()` now: validate → create → append → persist. No handler calls. Phase 3 unit tests updated (event status expectations change from `'handled'` back to `'new'`). | T006 | AC-15 |
| T008 | Service wrapper: endNode() delegates to eventService.raise() | 2 | `endNode()` checks `canEnd()` pre-flight guard (DYK #1) then calls `eventService.raise(graphSlug, nodeId, 'node:completed', {}, 'agent')`. Return type `EndNodeResult` preserved. Contract test: verify correct node status, `completed_at`, events recorded, stamps present after raise + handleEvents. | T007 | AC-15 |
| T009 | Service wrapper: askQuestion() delegates to eventService.raise() | 2 | `askQuestion()` builds `question:ask` payload (includes `question_id`), calls `eventService.raise()`. `pending_question_id` set by handler (via handleEvents). `state.questions[]` still written by service for backward compat. Contract test: verify correct node status (`waiting-question`), `pending_question_id` set, event recorded with stamps. | T007 | AC-15 |
| T010 | Service wrapper: answerQuestion() delegates to eventService.raise() | 2 | `answerQuestion()` builds `question:answer` payload, calls `eventService.raise()`. Node transitions to `'starting'` (DYK #1b) via handler. `pending_question_id` cleared by handler. Contract test: verify node status (`starting`), `pending_question_id` cleared, original ask event cross-stamped, answer event recorded with stamps. | T007 | AC-15 |
| T011 | Update E2E walkthrough tests | 2 | Phase 4 E2E tests updated: raise + handleEvents (with context param) instead of raise-with-inline-handlers. All 4 walkthroughs pass. `simulateAgentAccept()` helpers in service-level test files updated to use `raiseEvent` + `handleEvents`. | T010 | AC-17 |
| T012 | Regression verification | 1 | `just fft` clean. All existing tests pass. No new lint errors. Total test count verified. | T011 | — |

### Complexity Summary

| Metric | Value |
|--------|-------|
| Total tasks | 12 |
| Total complexity score | 22 |
| New source files | ~6 (stamp schema, 2 interfaces, handler registry, service, fake) |
| Modified source files | ~5 (node-event schema, handlers, raise-event, index, PGS) |
| New test files | ~3 (service unit, handler refactor, contract) |
| Modified test files | ~4 (Phase 3 raise-event, Phase 4 E2E, service-level lifecycle, question-answer) |

---

## Design Decisions

### DD-1: Service Wraps Existing raiseEvent Logic

`NodeEventService.raise()` delegates to the existing `raiseEvent()` function internals rather than duplicating them. The standalone `raiseEvent()` function is preserved as an internal implementation detail. The service constructs `RaiseEventDeps` from its constructor-injected deps.

**Rationale**: Avoids duplicating the 5-step validation pipeline. The logic is proven by 22 Phase 3 tests.

### DD-2: HandlerContext Constructed by handleEvents, Not by Handlers

The `handleEvents()` method constructs a `HandlerContext` for each unstamped event before calling the handler. Handlers never touch raw state — they use context methods.

**Rationale**: Eliminates per-handler plumbing (casting `state.nodes`, null guards, array traversal). Makes handlers 2-5 lines of business logic (ADR-0011 POS-004).

### DD-3: Stamps Replace markHandled() — Legacy Fields Preserved in Schema Only

Handlers write stamps via `ctx.stamp()` ONLY. They do NOT write `event.status`, `handled_at`, or `handler_notes`. These legacy fields are preserved in the schema for backward compatibility (old state files still parse), but the new handler path does not write them. Events raised by `raiseEvent()` start as `status: 'new'` and stay `'new'` — the status field becomes inert. Phase 3-4 tests that assert `event.status === 'handled'` will be updated in T006/T007.

**Rationale**: DYK #4 (WS10 session). Stamps are the single source of truth for "has this subscriber processed this event." Writing to both stamps and `event.status` creates two competing sources of truth. Workshop 06's original "coexist" decision is superseded by Workshop 10's stamps-only model.

### DD-4: handleQuestionAnswer Gains Starting Transition

The current `handleQuestionAnswer` handler does NOT transition the node to `'starting'`. Per DYK #1 and Workshop 06, it should. Phase 5 adds `ctx.node.status = 'starting'` to the handler.

**Rationale**: The `answerQuestion()` service method currently does this transition directly. When it becomes a thin wrapper, the handler must do it.

### DD-5: Service Methods Call raise() But NOT handleEvents()

Service methods (`endNode`, `askQuestion`, `answerQuestion`) call `eventService.raise()` only. They do NOT call `handleEvents()`. The caller (CLI layer or test) is responsible for calling `handleEvents()` separately.

**Rationale**: Workshop 06 separation principle. `raise()` is record-only. Processing is composable — the caller decides when and how to process.

### DD-6: state.questions[] Remains Service-Written

The `askQuestion()` service wrapper still writes to `state.questions[]` array directly (not via events). The event system records the event; the service maintains the legacy questions array.

**Rationale**: `state.questions[]` is consumed by `getAnswer()` and the CLI `answer` command. Migrating these consumers to event-based queries is Phase 6+ scope.

---

## Acceptance Criteria Traceability

| AC | Description | Tasks |
|----|-------------|-------|
| AC-6 | Two-phase handshake status transitions work | T006 (handler gains `starting` transition) |
| AC-7 | Question lifecycle works through events | T006, T009, T010 |
| AC-15 | raiseEvent is the single write path for all node state changes | T005, T007, T008, T009, T010 |
| AC-17 | State schema backward compatible | T001, T011 |
| WS10-1 | `handleEvents()` accepts `context: 'cli' \| 'web'` and filters handlers via `EventHandlerRegistry` | T002, T003, T005 |
| WS10-2 | `ctx.stamp()` writes ONLY to `event.stamps[subscriber]`; does NOT write `event.status`/`handled_at`/`handler_notes` | T006 |
| WS10-3 | `QuestionAskPayloadSchema` includes `question_id` field | T001 |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Handler signature change breaks Phase 4 tests | High | Medium | T005 updates all handler tests atomically with the signature change |
| raiseEvent record-only breaks Phase 3 test expectations | High | Medium | T006 updates Phase 3 tests: `event.status` expectations change from `'handled'` to `'new'` for event types that previously had inline handlers |
| Service wrapper return type mismatch | Medium | Medium | Contract tests in T007-T009 verify old path vs new path produce identical results |
| handleEvents + stamps interaction complexity | Medium | Medium | T004 unit tests cover: empty events, already-stamped events, mixed stamped/unstamped |
| `state.questions[]` divergence from event log | Low | Low | DD-6: service still writes questions[] directly, event is additive record |

---

## Test Plan

### New Test Files

1. **`node-event-service.test.ts`** — Unit tests for `NodeEventService`:
   - Construction with deps and `EventHandlerRegistry`
   - `raise()` delegates to raiseEvent logic, returns `RaiseEventResult`
   - `handleEvents()` processes unstamped events, constructs `HandlerContext`, stamps
   - `handleEvents()` skips already-stamped events
   - `handleEvents()` no-op for empty events array
   - `getEventsForNode()` returns events for existing/missing nodes
   - `findEvents()` filters by predicate
   - `getUnstampedEvents()` returns events without subscriber stamp
   - `stamp()` writes to `event.stamps[subscriber]` with ISO-8601 timestamp

2. **`event-stamp.test.ts`** — Schema tests for `EventStampSchema`:
   - Valid stamp parses
   - Missing required fields rejected
   - Optional `data` field accepted

3. **`service-wrapper-contracts.test.ts`** — Contract tests for service method wrappers:
   - `endNode()` via raise + handleEvents → correct status (`complete`), `completed_at` set, event recorded, stamps present
   - `askQuestion()` via raise + handleEvents → correct status (`waiting-question`), `pending_question_id` set, event recorded, stamps present
   - `answerQuestion()` via raise + handleEvents → correct status (`starting`), `pending_question_id` cleared, original ask cross-stamped, event recorded, stamps present

### Modified Test Files

4. **`event-handlers.test.ts`** — Handler tests updated for `HandlerContext` signature
5. **`raise-event.test.ts`** — Phase 3 tests updated: events stay `'new'` after raise (no inline handler)
6. **`raise-event-e2e.test.ts`** (Phase 4 E2E) — Walkthrough tests updated: raise + handleEvents sequence
7. Service-level tests with `simulateAgentAccept()` — Updated to use event-based accept

### Test Helpers Needed

- `createTestHandlerContext(overrides)` — Builds a `HandlerContext` with test defaults and records `stamp()` calls for assertions
- Existing `createFakeStateStore()` from Phase 3 — reused as-is
- Existing `createE2EDeps()` pattern from Phase 4 — adapted for `NodeEventService`

---

## Critical Warnings

1. **DYK #1**: `answerQuestion()` must return `{ status: 'starting' }`, not `'agent-accepted'`. The handler transitions to `'starting'`. The agent must re-accept. This was the most common subagent error in Phase 2.

2. **Handler invocation order**: `raiseEvent()` STOPS calling handlers in T006. From that point, tests that call `raiseEvent()` directly must follow with `handleEvents()` to get state transitions. This is the most disruptive change in Phase 5.

3. **Stamps replace markHandled()**: `ctx.stamp()` writes ONLY to `event.stamps[subscriber]`. It does NOT write `event.status`, `handled_at`, or `handler_notes`. The `markHandled()` function is REMOVED. Tests that assert `event.status === 'handled'` are updated in T006/T007 to assert stamp presence instead. (DYK #4)

4. **`handleQuestionAnswer` T003 fix**: The current handler does NOT set `node.status = 'starting'`. Phase 5 adds this transition. This means after Phase 5, the `answerQuestion()` service wrapper no longer needs to set status directly — the handler does it.

5. **Stale-state trap**: `handleEvents()` MUST be called with state loaded AFTER `raise()` returns. `raise()` persists internally, so the state before raise is stale. JSDoc on `handleEvents()` must document this. (DYK #2)

6. **No public DI token**: `INodeEventService` is internal to `positional-graph`. It's constructed by `PositionalGraphService` in its constructor or factory. Tests construct it directly. Do NOT add a DI token to `packages/shared/src/di-tokens.ts`.

---

## Evidence Artifacts

| Artifact | Location |
|----------|----------|
| Workshop 06: Separation design | `docs/plans/032-node-event-system/workshops/06-inline-handlers-and-subscriber-stamps.md` |
| Workshop 09: INodeEventService design | `docs/plans/032-node-event-system/workshops/09-first-class-node-event-service.md` |
| ADR-0011: First-class domain concepts | `docs/adr/adr-0011-first-class-domain-concepts.md` |
| Phase 3 raiseEvent source | `packages/positional-graph/src/features/032-node-event-system/raise-event.ts` |
| Phase 4 event handlers source | `packages/positional-graph/src/features/032-node-event-system/event-handlers.ts` |
| Phase 4 E2E walkthroughs | `test/unit/positional-graph/features/032-node-event-system/event-handlers.test.ts` |
| Phase 3 raiseEvent tests | `test/unit/positional-graph/features/032-node-event-system/raise-event.test.ts` |
| Service lifecycle methods | `packages/positional-graph/src/services/positional-graph.service.ts` (endNode: 1878-1930, askQuestion: 1953-2021, answerQuestion: 2031-2085) |
| Service interface result types | `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` (EndNodeResult: 399, AskQuestionResult: 418, AnswerQuestionResult: 425) |
| Subtask 001 execution log | `docs/plans/032-node-event-system/tasks/phase-5-service-method-wrappers/001-subtask-drop-backward-compat.execution.log.md` |

---

## Discoveries & Learnings

_To be populated during implementation._

| # | Discovery | Impact | Resolution |
|---|-----------|--------|------------|
| | | | |

---

## Critical Insights — DYK5 (2026-02-08)

| # | Insight | Decision |
|---|---------|----------|
| 1 | T006 undersells `handleQuestionAnswer` refactor — needs `ctx.findEvents()` + `ctx.stampEvent()` for answer-linking | Expanded T006 to document cross-event stamping via `findEvents` and `stampEvent(askEvent, 'answer-linked')` |
| 2 | `handleQuestionAsk` deliberately skips `markHandled()` in Phase 4 — stamps model makes this unnecessary | Confirmed: all 6 handlers call `ctx.stamp('state-transition')` uniformly. Per-subscriber stamping preserves the "orchestrator hasn't seen this" signal. |
| 3 | T002 success criteria didn't list `stampEvent()` or `findEvents()` on `HandlerContext` | Expanded T002 to explicitly list all 3 methods: `stamp()`, `stampEvent()`, `findEvents()` |
| 4 | T008-T010 "old path vs new path" contract tests not executable — T007 destroys old path before T008 runs | Reworded to correctness tests: verify expected state after raise + handleEvents, not side-by-side comparison |
| 5 | `NodeEventService` constructor needs two registries (`INodeEventRegistry` for validation, `EventHandlerRegistry` for dispatch) — same word "registry", different concepts | Expanded T005 to name both explicitly with distinct parameter names (`deps` includes `INodeEventRegistry`, separate `handlerRegistry: EventHandlerRegistry`) |

Action items: None — all updates applied inline.
