# Workshop: First-Class Node Event Service (INodeEventService)

**Type**: Data Model / Integration Pattern
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-08
**Status**: Draft

**Related Documents**:
- [Workshop 06: raiseEvent/handleEvents Separation](./06-inline-handlers-and-subscriber-stamps.md) — Separation design, subscriber stamps
- [Workshop 08: Concept Drift and Remediation](./08-concept-drift-and-remediation.md) — Drift audit
- Phase 5 Subtask 002 dossier — Will be rewritten to reflect this workshop

---

## Purpose

Elevate node event operations from diffuse standalone functions into a proper first-class service (`INodeEventService`). This workshop establishes the service interface, explains why first-class concepts matter, and overrides the standalone-function approach from Workshop 06 for event recording, processing, querying, and stamping.

## Key Questions Addressed

- Q1: Why must events be a first-class service rather than standalone functions?
- Q2: What is the interface for `INodeEventService`?
- Q3: How does `INodeEventService` relate to the existing `IPositionalGraphService`?
- Q4: What does a handler receive — raw args or a structured context?
- Q5: Where does persistence responsibility live?
- Q6: What are the general principles for identifying first-class concepts in a system?

---

## The Problem: Diffuse Functions Are Not Architecture

### What We Had Before This Workshop

Workshop 06 designed the raiseEvent/handleEvents separation as **standalone functions**:

```typescript
// Standalone functions — no unifying abstraction
async function raiseEvent(deps, graphSlug, nodeId, ...): Promise<RaiseEventResult>
function handleEvents(state, nodeId, subscriber, handlers): void
function stampEvent(event, subscriber, action, data?): void
function markHandled(event): void  // to be deleted
function createEventHandlers(): Map<string, EventHandler>
```

Each function is independently defined, independently exported, independently tested. There is no single thing that says "this is the event system." A developer looking at the barrel export sees:

```
raiseEvent, handleEvents, stampEvent, createEventHandlers, EventHandler,
RaiseEventDeps, RaiseEventResult, NodeEvent, EventStamp...
```

That's a **parts list**, not an API.

### What Handlers Had to Do

Every handler manually destructured raw state:

```typescript
function handleNodeAccepted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;  // casting
  nodes[nodeId].status = 'agent-accepted';                       // raw access
  markHandled(event);                                             // separate helper
}
```

The `handleQuestionAnswer` handler was worse — it dug through the events array manually:

```typescript
const nodeEvents = nodes[nodeId].events ?? [];
const askEvent = nodeEvents.find(
  (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
);
if (askEvent) {
  markHandled(askEvent);                                          // cross-event mutation
  askEvent.handler_notes = `answered by ${event.source}...`;     // raw field write
}
```

Every handler reinvented the same plumbing: get node, cast away nullability, access events, stamp. This is the hallmark of a missing abstraction.

### The Smell Test

If multiple functions all need:
1. The same state reference
2. The same node ID
3. Access to the same events array
4. The same mutation capabilities (stamp, transition, query)

...then those functions are methods on an object that doesn't exist yet.

---

## First-Class Concept Principles

### What Makes a Concept "First-Class"?

A concept is first-class when it has its own **identity** (interface), **behavior** (methods), and **lifecycle** (creation, use, disposal). It's not defined by the code that uses it — it defines the contract that users must follow.

### The Rules

#### DO: Make it first-class when...

| Signal | What It Means | Example in Our System |
|--------|--------------|----------------------|
| Multiple functions share the same parameters | They're methods on a missing object | `raiseEvent(deps, graph, node, ...)`, `handleEvents(state, node, ...)`, `stampEvent(event, ...)` all operate on events-for-a-node |
| Consumers do manual plumbing to use it | The API is too low-level | Every handler casts `state.nodes`, digs through arrays |
| The concept has a name in your domain language | It's a domain object that deserves representation | "Node events" is a real thing — you say it in conversation |
| Multiple callers need the same setup | Construction should be centralized | CLI, ODS, and tests all create handler maps, pass deps, wire persistence |
| The concept crosses more than 2 files | It needs a home | `raise-event.ts`, `event-handlers.ts`, `event-status.schema.ts` — events span 7+ files |
| You're about to add MORE functions to the same bag | The bag is a service | Workshop 06 added `stampEvent`, `handleEvents` to the pile |

#### DON'T: Make it first-class when...

| Signal | What It Means | Example |
|--------|--------------|---------|
| Only one function, one caller | Simple utility, not a concept | `generateEventId()` — standalone is fine |
| No shared state between operations | No object to hold state | Pure validation helpers |
| The "service" would have one method | It's a function, not a service | Don't wrap `isNodeActive()` in a service |
| You're creating the service "for the future" | YAGNI — wait for the second caller | Don't create `IEventArchivalService` before we need archival |

#### The Litmus Test

> "If I'm explaining this concept to a new developer, do I say 'call these 4 functions with the right parameters' or 'use the event service'?"

If the answer is the latter, it should be a service.

### Anti-Patterns

1. **The Function Bag**: A barrel export of 10+ standalone functions that all operate on the same concept. Discoverable only by reading docs. No IDE autocomplete guidance.

2. **The Implicit Dependency Graph**: `handleEvents` depends on `stampEvent`, which depends on `EventStampSchema`, which depends on `NodeEventSchema`. The dependency chain exists but isn't expressed as a single constructable unit.

3. **The Manual Plumber**: Every caller writes the same setup code — create deps, load state, call function, persist. The ceremony is the same everywhere but there's no abstraction to eliminate it.

4. **The Concept Without a Home**: You have `NodeEvent` (the data), `NodeEventSchema` (the validation), `raiseEvent` (the creator), `handleEvents` (the processor), `stampEvent` (the mutator) — but no `NodeEventService` (the owner).

---

## The Design: INodeEventService

### Interface

```typescript
/**
 * First-class service for all node event operations.
 *
 * Owns the complete event lifecycle: raise, process, query, stamp.
 * Constructed with persistence deps bound at creation time.
 * Handlers receive a HandlerContext with everything they need.
 */
export interface INodeEventService {
  // ── Recording ─────────────────────────────────────────

  /**
   * Validate and record a new event on a node.
   * Record-only: does NOT run handlers or mutate node state.
   * Persists the event to the node's events array.
   */
  raise(
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: unknown,
    source: EventSource
  ): Promise<RaiseEventResult>;

  // ── Processing ────────────────────────────────────────

  /**
   * Process unhandled events for a node as a given subscriber.
   * Scans the node's events, runs handlers for unstamped events,
   * writes subscriber stamps. Mutates state in-place.
   * Caller must persist state after this returns.
   */
  handleEvents(
    state: State,
    nodeId: string,
    subscriber: string
  ): void;

  // ── Querying ──────────────────────────────────────────

  /** Get all events for a node. */
  getEventsForNode(state: State, nodeId: string): NodeEvent[];

  /** Find events matching a predicate. */
  findEvents(
    state: State,
    nodeId: string,
    predicate: (event: NodeEvent) => boolean
  ): NodeEvent[];

  /** Get events not yet stamped by a subscriber. */
  getUnstampedEvents(
    state: State,
    nodeId: string,
    subscriber: string
  ): NodeEvent[];

  // ── Stamping ──────────────────────────────────────────

  /**
   * Write a subscriber stamp on an event.
   * Used by handlers (via HandlerContext) and by external callers
   * (e.g., the stamp-event CLI command).
   */
  stamp(
    event: NodeEvent,
    subscriber: string,
    action: string,
    data?: Record<string, unknown>
  ): void;
}
```

### Why These Methods and Not More

| Method | Justification |
|--------|---------------|
| `raise` | The single write path (AC-15, Workshop 06). Replaces standalone `raiseEvent()`. |
| `handleEvents` | The processing half of the separation (Workshop 06). Replaces standalone `handleEvents()`. |
| `getEventsForNode` | Every handler and every query needs this. Eliminates `state.nodes?.[nodeId]?.events ?? []` everywhere. |
| `findEvents` | Cross-event lookups (e.g., `handleQuestionAnswer` finding the ask event). Eliminates manual `.find()` with casting. |
| `getUnstampedEvents` | Core of handleEvents logic, but also useful for CLI `events --status new` and ODS discovery. |
| `stamp` | Replaces standalone `stampEvent()`. Exposed for CLI `stamp-event` command. |

Methods NOT on the service:
- `createEventHandlers()` — this returns a handler map, which is a configuration concern, not a service operation. Keep as standalone.
- `generateEventId()` — pure utility. Standalone is fine.
- Persistence (`loadState`, `persistState`) — injected as deps, not exposed. Callers of `handleEvents` persist themselves (Workshop 06 Q7: Option A).

### HandlerContext

Instead of passing raw `(state, nodeId, event, subscriber)` to each handler, the service constructs a `HandlerContext` before invoking each handler:

```typescript
/**
 * Everything a handler needs to do its work.
 * Constructed by INodeEventService.handleEvents() before each handler call.
 * Handlers never touch raw state — they use context methods.
 */
export interface HandlerContext {
  /** The node entry (mutable reference — handler mutates in place). */
  readonly node: NodeStateEntry;

  /** The event being handled. */
  readonly event: NodeEvent;

  /** All events on this node (for cross-event lookups). */
  readonly events: NodeEvent[];

  /** The subscriber processing this event. */
  readonly subscriber: string;

  /** The node ID. */
  readonly nodeId: string;

  /** Stamp the current event. */
  stamp(action: string, data?: Record<string, unknown>): void;

  /** Stamp a different event (e.g., handleQuestionAnswer stamps the ask event). */
  stampEvent(event: NodeEvent, action: string, data?: Record<string, unknown>): void;

  /** Find events by predicate (convenience for cross-event lookups). */
  findEvents(predicate: (event: NodeEvent) => boolean): NodeEvent[];
}
```

### Handler Signature Change

```typescript
// BEFORE (current):
type EventHandler = (state: State, nodeId: string, event: NodeEvent) => void;

// AFTER (this workshop):
type EventHandler = (ctx: HandlerContext) => void;
```

### Handlers Become Clean

```typescript
// BEFORE:
function handleNodeAccepted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  nodes[nodeId].status = 'agent-accepted';
  markHandled(event);
}

// AFTER:
function handleNodeAccepted(ctx: HandlerContext): void {
  ctx.node.status = 'agent-accepted';
  ctx.stamp('state-transition');
}
```

```typescript
// BEFORE:
function handleQuestionAnswer(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const payload = event.payload as { question_event_id: string };
  const nodeEvents = nodes[nodeId].events ?? [];
  const askEvent = nodeEvents.find(
    (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
  );
  if (askEvent) {
    markHandled(askEvent);
    askEvent.handler_notes = `answered by ${event.source} via ${event.event_id}`;
  }
  nodes[nodeId].pending_question_id = undefined;
  markHandled(event);
}

// AFTER:
function handleQuestionAnswer(ctx: HandlerContext): void {
  const payload = ctx.event.payload as { question_event_id: string };

  const askEvent = ctx.findEvents(
    (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
  )[0];

  if (askEvent) {
    ctx.stampEvent(askEvent, 'answer-linked', {
      answer_event_id: ctx.event.event_id,
      answered_by: ctx.event.source,
    });
  }

  ctx.node.pending_question_id = undefined;
  ctx.node.status = 'starting';
  ctx.stamp('state-transition');
}
```

No casting. No null guards on `state.nodes`. No manual array traversal. The context provides everything.

---

## Service Construction and DI

### Construction

```typescript
export interface NodeEventServiceDeps {
  readonly registry: INodeEventRegistry;
  readonly loadState: (graphSlug: string) => Promise<State>;
  readonly persistState: (graphSlug: string, state: State) => Promise<void>;
}

export class NodeEventService implements INodeEventService {
  constructor(
    private readonly deps: NodeEventServiceDeps,
    private readonly handlers: Map<string, EventHandler>
  ) {}

  // ... implementation
}
```

### DI Registration

The service is **internal to `positional-graph`** — no public DI token. It's constructed by `IPositionalGraphService` (or by tests directly) during service initialization:

```typescript
// Inside PositionalGraphService constructor or factory
const registry = new NodeEventRegistry();
registerCoreEventTypes(registry);

const eventService = new NodeEventService(
  { registry, loadState: this.loadState, persistState: this.persistState },
  createEventHandlers()  // CLI handler map
);
```

Tests construct it directly:

```typescript
const eventService = new NodeEventService(
  { registry: fakeRegistry, loadState: store.loadState, persistState: store.persistState },
  createEventHandlers()
);
```

### Why No Public DI Token

Same rationale as `NodeEventRegistry` (plan deviation ledger): the event service has no consumers outside `positional-graph`. It's an internal collaborator of `IPositionalGraphService`, not a cross-package dependency.

---

## Relationship to IPositionalGraphService

`IPositionalGraphService` already has lifecycle methods (`startNode`, `endNode`, `askQuestion`, `answerQuestion`). These become thin wrappers that delegate to `INodeEventService.raise()`:

```typescript
// IPositionalGraphService.endNode — thin wrapper
async endNode(ctx, graphSlug, nodeId): Promise<EndNodeResult> {
  const canEndResult = await this.canEnd(ctx, graphSlug, nodeId);
  if (!canEndResult.canEnd) return missingOutputError(...);
  return this.eventService.raise(graphSlug, nodeId, 'node:completed', {}, 'agent');
}
```

The CLI layer orchestrates the raise-then-handle sequence:

```typescript
// CLI command handler
const result = await service.endNode(ctx, graphSlug, nodeId);
if (!result.ok) return result;
const state = await loadState(graphSlug);
service.eventService.handleEvents(state, nodeId, 'cli');
await persistState(graphSlug, state);
```

**Key insight**: `IPositionalGraphService` doesn't expose `eventService` publicly. The CLI layer gets the event service through a separate internal accessor (or the service methods return enough information for the CLI to call handleEvents). The exact wiring pattern is deferred to the Phase 5 parent tasks (T007-T009).

---

## Persistence Responsibility

### The Rule

| Method | Persists? | Why |
|--------|-----------|-----|
| `raise()` | Yes — persists internally | raiseEvent is an atomic operation: validate → create → append → persist. Self-contained. |
| `handleEvents()` | No — caller persists | Processing is composable. Caller may batch with other changes. Workshop 06 Q7: Option A confirmed. |
| `stamp()` | No — caller persists | Same as handleEvents — it's a state mutation. |
| `getEventsForNode()` | No — read-only | Pure query. |
| `findEvents()` | No — read-only | Pure query. |
| `getUnstampedEvents()` | No — read-only | Pure query. |

This split is deliberate: `raise()` owns its persistence because it's an end-to-end operation with validation. `handleEvents()` mutates in-place because callers compose it with other operations.

---

## Impact on Workshop 06 Decisions

This workshop **overrides** the following Workshop 06 decisions:

| Workshop 06 Decision | Override | Rationale |
|---------------------|----------|-----------|
| `raiseEvent()` is a standalone async function | `INodeEventService.raise()` — method on service | Deps bound at construction, not passed per call |
| `handleEvents()` is a standalone function with `(state, nodeId, subscriber, handlers)` | `INodeEventService.handleEvents(state, nodeId, subscriber)` — handlers are bound at construction | Service owns its handler map |
| `stampEvent()` is a standalone function | `INodeEventService.stamp()` — method on service | Consistent API surface |
| Handlers receive `(state, nodeId, event, subscriber)` | Handlers receive `HandlerContext` | Eliminates plumbing, provides query/stamp helpers |
| `EventHandler` type is `(state, nodeId, event, subscriber) => void` | `EventHandler` type is `(ctx: HandlerContext) => void` | Clean, extensible contract |

These overrides do **NOT** change:

| Workshop 06 Decision | Status |
|---------------------|--------|
| raiseEvent is record-only (no handler invocation) | **Unchanged** |
| handleEvents is node-scoped | **Unchanged** |
| Subscriber stamps model (`stamps: Record<string, EventStamp>`) | **Unchanged** |
| VALID_FROM_STATES stays status-based (no rewrite) | **Unchanged** |
| CLI calls raiseEvent then handleEvents | **Unchanged** |
| ODS calls handleEvents with subscriber 'ods' | **Unchanged** |
| ONBAS is read-only (no stamps) | **Unchanged** |
| progress:update has no CLI handler | **Unchanged** |
| question:answer transitions to starting (T003) | **Unchanged** |
| Event.status/handled_at/handler_notes coexist with stamps | **Unchanged** |
| handleEvents mutates in-place, caller persists | **Unchanged** |

---

## Impact on Subtask 002

The Subtask 002 dossier (`002-subtask-raiseevent-handleevents-separation.md`) must be rewritten to:

1. **ST001**: Schema extension — unchanged (EventStampSchema + stamps field)
2. **ST002**: `INodeEventService` interface + `HandlerContext` interface — replaces standalone `stampEvent()`
3. **ST003**: `NodeEventService` implementation (raise, handleEvents, query, stamp methods) + tests — replaces standalone `handleEvents()`
4. **ST004**: Refactor handlers to `(ctx: HandlerContext) => void` signature — replaces `(state, nodeId, event, subscriber)` + manual plumbing
5. **ST005**: Move `raiseEvent()` logic into `NodeEventService.raise()` — replaces standalone function
6. **ST006**: Update E2E walkthrough tests to use service — same assertion changes
7. **ST007**: `just fft` — unchanged

The flight plan and dossier need regeneration. Use `/plan-5 --subtask` to recreate.

---

## Testing the Service

### Unit Tests for Service Methods

```typescript
describe('INodeEventService', () => {
  // Construction
  it('constructs with deps and handler map');

  // raise()
  it('validates and persists events (delegates to existing raiseEvent logic)');
  it('returns events with status new');

  // handleEvents()
  it('processes unstamped events for subscriber');
  it('skips already-stamped events');
  it('constructs HandlerContext for each handler');
  it('no-op for empty events array');

  // getEventsForNode()
  it('returns events array for existing node');
  it('returns empty array for missing node');

  // findEvents()
  it('filters events by predicate');

  // getUnstampedEvents()
  it('returns events without subscriber stamp');

  // stamp()
  it('writes subscriber stamp with ISO-8601 timestamp');
  it('creates stamps object if absent');
});
```

### Handler Tests with HandlerContext

```typescript
describe('handleNodeAccepted', () => {
  it('transitions node status to agent-accepted', () => {
    const ctx = createTestHandlerContext({
      nodeStatus: 'starting',
      eventType: 'node:accepted',
      subscriber: 'cli',
    });

    handleNodeAccepted(ctx);

    expect(ctx.node.status).toBe('agent-accepted');
    expect(ctx.stampCalls).toHaveLength(1);
    expect(ctx.stampCalls[0].action).toBe('state-transition');
  });
});
```

The `createTestHandlerContext` helper is a fake that records stamp calls for assertion. This replaces the current pattern of constructing raw state, passing to handler, then inspecting state.

---

## Fake Strategy

### FakeNodeEventService

```typescript
export class FakeNodeEventService implements INodeEventService {
  // Test helpers
  private _raiseHistory: Array<{ graphSlug: string; nodeId: string; eventType: string }> = [];
  private _handleEventsHistory: Array<{ nodeId: string; subscriber: string }> = [];
  private _errors: RaiseEventResult | null = null;

  // INodeEventService implementation (records calls, returns configurable results)
  async raise(...): Promise<RaiseEventResult> { /* record + return */ }
  handleEvents(...): void { /* record */ }
  getEventsForNode(...): NodeEvent[] { /* return from configured state */ }
  findEvents(...): NodeEvent[] { /* delegate to predicate */ }
  getUnstampedEvents(...): NodeEvent[] { /* filter by stamps */ }
  stamp(...): void { /* mutate event */ }

  // Test helpers
  getRaiseHistory() { return this._raiseHistory; }
  getHandleEventsHistory() { return this._handleEventsHistory; }
  setErrors(errors: RaiseEventResult) { this._errors = errors; }
  reset() { /* clear all */ }
}
```

---

## Open Questions

### Q1: Should the handler map be constructor-injected or method-injected?

**RESOLVED**: Constructor-injected. The service binds its handler map at creation time. Different callers (CLI, ODS) create different service instances with different handler maps. This is cleaner than passing handlers on every `handleEvents()` call.

```typescript
// CLI context
const cliEventService = new NodeEventService(deps, createCliHandlers());

// ODS context (future)
const odsEventService = new NodeEventService(deps, createOdsHandlers());
```

### Q2: Does INodeEventService need a FakeNodeEventService?

**RESOLVED**: Yes, per constitution (fakes over mocks). The fake records calls and returns configurable results. Contract tests verify fake/real parity.

### Q3: Should HandlerContext be an interface or a concrete class?

**RESOLVED**: Interface. The real implementation is constructed inside `NodeEventService.handleEvents()`. Tests can create a lightweight test double. No class hierarchy needed.

### Q4: Where does HandlerContext.stamp() delegate to?

**RESOLVED**: To `INodeEventService.stamp()`. The context holds a reference to the service (or just the stamp function). This keeps stamp logic in one place.

---

## ADR Seed: First-Class Domain Concepts

This workshop seeds ADR-0011: "First-Class Domain Concepts Over Diffuse Functions."

**Decision**: When a domain concept (events, nodes, graphs) has multiple operations, shared state, and multiple callers, it MUST be represented as a first-class service with an interface. Standalone functions are appropriate for utilities (ID generation, validation helpers) but not for domain concepts with behavior.

**Decision Drivers**:
- Discoverability: `eventService.` shows all operations in autocomplete
- Encapsulation: Deps bound at construction, not passed per call
- Testability: Interface enables fakes, not raw function mocking
- Handler ergonomics: HandlerContext eliminates plumbing
- Consistency: Matches existing `IPositionalGraphService` pattern

**Evidence**: Node event operations grew from 2 functions (Phase 3-4) to 6+ (Phase 5) without a unifying abstraction. Each addition required more barrel exports, more parameter passing, more manual wiring. The HandlerContext change alone eliminates 5 lines of boilerplate per handler.

---

## Summary

| Before | After |
|--------|-------|
| `raiseEvent(deps, graph, node, ...)` | `eventService.raise(graph, node, ...)` |
| `handleEvents(state, node, sub, handlers)` | `eventService.handleEvents(state, node, sub)` |
| `stampEvent(event, sub, action, data)` | `eventService.stamp(event, sub, action, data)` |
| `handler(state, nodeId, event)` | `handler(ctx: HandlerContext)` |
| Manual `state.nodes[id].events` access | `ctx.events`, `ctx.findEvents(...)` |
| Manual `state.nodes[id]` casting | `ctx.node` (typed, no cast) |
| No service, no interface, no fake | `INodeEventService` + `FakeNodeEventService` + contract tests |

The event system becomes a proper domain service. Handlers become clean. The barrel export tells a story instead of listing parts.
