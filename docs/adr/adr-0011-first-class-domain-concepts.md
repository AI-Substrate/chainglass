---
title: "ADR-0011: First-Class Domain Concepts Over Diffuse Functions"
status: "Accepted"
date: "2026-02-08"
authors: "Core development team"
tags: ["architecture", "decision", "domain-concepts", "services", "adapters", "interfaces", "testability"]
supersedes: ""
superseded_by: ""
---

# ADR-0011: First-Class Domain Concepts Over Diffuse Functions

## Status

Accepted

## Context

During implementation of the Node Event System (Plan 032, Phase 5), six standalone functions grew organically around a single domain concept: `raiseEvent()`, `handleEvents()`, `stampEvent()`, `createEventHandlers()`, `markHandled()`, and associated helpers. These functions shared the same parameters (state, nodeId, events array), operated on the same data structures (`NodeEvent`, `EventStatus`), and lived across 7+ files — yet no unifying abstraction existed. Consumers had to:

1. Manually import 4-6 functions and wire them together with correct parameters
2. Cast raw state objects in every handler (`state.nodes as NonNullable<typeof state.nodes>`)
3. Repeat the same plumbing code (get node, access events, find events by predicate, stamp)
4. Discover available operations by reading barrel exports, not via IDE autocomplete on a service

This pattern — domain logic scattered across standalone functions with no owning service — is an **anti-pattern** we term "diffuse functions." It produces code that is difficult to discover, difficult to test via fakes (per constitution: fakes over mocks), and impossible to inject as a dependency. The diffuse approach violates the project's interface-first principle (constitution Section 2, Principle 2) and the services-depend-on-interfaces architecture (R-ARCH-001, R-ARCH-002).

The project already has established patterns for first-class domain concepts: `IPositionalGraphService` (Plan 026), `IWorkflowService` (Plan 003), `ICentralEventNotifier` (ADR-0010). These services are discoverable (autocomplete), injectable (DI container), and testable (fake implementations). The diffuse-functions approach is inconsistent with this established architecture.

## Decision

When a domain concept has **multiple operations, shared state, and multiple callers**, it MUST be represented as a first-class service with an interface. Standalone functions remain appropriate for stateless utilities (ID generation, pure validation, format conversion) but NOT for domain concepts with behavior.

### The Litmus Test

> "If I'm explaining this concept to a new developer, do I say 'call these 4 functions with the right parameters' or 'use the event service'?"
>
> If the answer is the latter, it should be a service.

### Six Signals That a Concept Needs Elevation

| Signal | Meaning | Threshold |
|--------|---------|-----------|
| Multiple functions share same parameters | They are methods on a missing object | 3+ functions with 2+ shared params |
| Consumers do manual plumbing | API is too low-level | Same setup/casting code in 2+ callers |
| Concept has a name in domain language | It is a domain object that deserves representation | You say it in conversation ("the event service") |
| Multiple callers need same setup | Construction should be centralized | 2+ distinct call sites (CLI, ODS, tests) |
| Concept crosses multiple files | It needs a home | 3+ source files, no owning module |
| About to add MORE functions to same group | The group is a service | Growing from N to N+1 functions |

### When NOT to Elevate

| Signal | Meaning | Example |
|--------|---------|---------|
| Single function, single caller | Simple utility | `generateEventId()` |
| No shared state between operations | No object to bind | Pure validation helpers |
| Service would have one method | It is a function | `isNodeActive()` |
| Creating service "for the future" | YAGNI | `IEventArchivalService` before any archival need |

### Required Structure for First-Class Concepts

A first-class domain concept MUST follow the project's established interface-adapter-fake layering (constitution Section 2, R-ARCH-001, R-ARCH-002):

```
1. Interface    → defines contract (method signatures, return types)
2. Fake         → implements interface + adds test helpers (addXxx, setErrors, getHistory, reset)
3. Tests        → use fake to verify consumer behavior
4. Adapter/Impl → real implementation of the interface
5. Contract     → tests verify fake and real implementation agree
```

Dependencies are injected via constructor, resolved from DI container using `useFactory` (ADR-0004). Services that are internal to a single package (e.g., `INodeEventService` within `positional-graph`) may omit a public DI token — they are constructed by the owning service and not exposed through the container.

### Golden Example: INodeEventService

**Before** (diffuse functions — 6 standalone exports):

```typescript
// Consumers must import and wire everything manually
import { raiseEvent } from './raise-event.js';
import { handleEvents, createEventHandlers } from './event-handlers.js';
import { stampEvent, markHandled } from './event-stamps.js';
import { getEventsForNode } from './event-queries.js';

// Every handler casts and plumbs manually
function handleNodeAccepted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  nodes[nodeId].status = 'agent-accepted';
  markHandled(event);
}
```

**After** (first-class service with HandlerContext):

```typescript
// Single injection point — all operations discoverable
interface INodeEventService {
  raise(graphSlug: string, nodeId: string, eventType: string,
        payload: unknown, source: EventSource): Promise<RaiseEventResult>;
  handleEvents(state: State, nodeId: string, subscriber: string): void;
  getEventsForNode(state: State, nodeId: string): NodeEvent[];
  findEvents(state: State, nodeId: string, predicate: (e: NodeEvent) => boolean): NodeEvent[];
  getUnstampedEvents(state: State, nodeId: string, subscriber: string): NodeEvent[];
  stamp(event: NodeEvent, subscriber: string, action: string, data?: Record<string, unknown>): void;
}

// Handlers receive structured context — no casting, no plumbing
function handleNodeAccepted(ctx: HandlerContext): void {
  ctx.node.status = 'agent-accepted';
  ctx.stamp('state-transition');
}
```

**HandlerContext** eliminates per-handler boilerplate:

```typescript
interface HandlerContext {
  readonly node: NodeStateEntry;    // Mutable ref, no casting needed
  readonly event: NodeEvent;
  readonly events: NodeEvent[];     // For cross-event lookups
  readonly subscriber: string;
  readonly nodeId: string;
  stamp(action: string, data?: Record<string, unknown>): void;         // Current event
  stampEvent(event: NodeEvent, action: string, data?: Record<string, unknown>): void;  // Other event
  findEvents(predicate: (e: NodeEvent) => boolean): NodeEvent[];
}
```

## Consequences

### Positive

- **POS-001**: Discoverability — `eventService.` shows all operations in IDE autocomplete. Developers find capabilities without reading barrel exports or documentation.
- **POS-002**: Testability via fakes — `FakeNodeEventService` implements the interface with test helpers (`addEvent`, `getHistory`, `reset`), eliminating any temptation to reach for `vi.mock()`. Aligns with constitution Principle 4.
- **POS-003**: Encapsulation — Dependencies (registry, persistence, handler map) bound at construction, not passed per call. Changing dependency shape does not cascade to every call site.
- **POS-004**: Handler ergonomics — `HandlerContext` eliminates 5+ lines of boilerplate per handler (casting, null guards, array traversal, manual stamping). New handlers are 2-5 lines of business logic.
- **POS-005**: Consistent architecture — Follows established `IPositionalGraphService`, `IWorkflowService`, `ICentralEventNotifier` pattern. Codebase readers recognize the shape immediately.
- **POS-006**: Extensibility — New handler behaviors (async handlers, context enrichment, middleware) can be added without changing the `EventHandler` type signature.

### Negative

- **NEG-001**: Upfront interface design cost — Defining interface + fake + contract tests requires more initial work than adding a standalone function. Justified only when the signals in the litmus test are present.
- **NEG-002**: Migration effort — Existing standalone functions must be refactored into service methods. Handlers must adopt `HandlerContext` signature. This is a one-time cost per concept.
- **NEG-003**: Potential over-abstraction — Developers may pre-emptively create services for concepts that don't meet the threshold. The "when NOT to elevate" signals guard against this, but require judgment.

## Alternatives Considered

### Alternative 1: Keep Standalone Functions (Status Quo)

- **ALT-001**: **Description**: Continue with standalone exported functions (`raiseEvent()`, `handleEvents()`, etc.) connected only by barrel exports. Each function takes explicit parameters. No unifying service.
- **ALT-002**: **Rejection Reason**: Failed the litmus test — developers describe the concept as "the event service" in conversation but must import 4-6 functions and manually wire them. Violates interface-first principle. Cannot produce a `FakeNodeEventService` for testing. Handler plumbing duplicated across every handler function.

### Alternative 2: Namespace Object (Module Pattern)

- **ALT-003**: **Description**: Group functions under a namespace object (`NodeEvents.raise()`, `NodeEvents.handle()`, etc.) without a formal interface. Provides discoverability via dot-completion without DI overhead.
- **ALT-004**: **Rejection Reason**: Namespace objects are not injectable — they are singletons with no interface contract. Cannot create fakes for testing. Dependencies remain passed per-call (no constructor binding). Looks organized but provides none of the architectural guarantees of interface + DI.

### Alternative 3: Class Without Interface

- **ALT-005**: **Description**: Create a `NodeEventService` class with methods, but skip the interface definition. Consumers depend directly on the class.
- **ALT-006**: **Rejection Reason**: Violates R-ARCH-001 (services depend on interfaces, not concretions) and R-ARCH-002 (interface before implementation). Fakes would need to extend the concrete class rather than implement a clean contract. Breaks the constitution's interface-first development sequence.

## Implementation Notes

- **IMP-001**: **Evaluation during design** — When introducing a new concept (schema, function, module), evaluate against the six signals table. If 3+ signals are present, design as a first-class service from the start. Do not wait until the concept has diffused across files.
- **IMP-002**: **Migration pattern** — For existing diffuse functions: (1) define interface from existing function signatures, (2) create fake with test helpers, (3) migrate tests to use fake, (4) wrap existing functions in service class, (5) update call sites to use injected service, (6) contract tests verify parity.
- **IMP-003**: **Internal vs public services** — Services internal to a single package (e.g., `INodeEventService` within `positional-graph`) do NOT need a public DI token. They are constructed by the owning service and accessed via internal wiring. Public DI tokens are for cross-package dependencies only.
- **IMP-004**: **HandlerContext as sub-pattern** — When a service delegates to multiple handler functions (event handlers, middleware, plugins), provide a structured context object instead of passing raw parameters. This eliminates plumbing and makes the handler contract extensible without signature changes.
- **IMP-005**: **Code review checkpoint** — During review, flag any PR that introduces 3+ standalone functions operating on the same domain data. Ask: "Should these be methods on a service?" Reference this ADR.

## References

- **REF-001**: [Plan 032 Spec — Node Event System](../plans/032-node-event-system/node-event-system-spec.md)
- **REF-002**: [Plan 032 Plan — Node Event System](../plans/032-node-event-system/node-event-system-plan.md)
- **REF-003**: [Workshop 09 — First-Class Node Event Service](../plans/032-node-event-system/workshops/09-first-class-node-event-service.md) — Origin of this decision, with override matrix from WS06, handler before/after examples, and full INodeEventService design
- **REF-004**: [ADR-0004: Dependency Injection Container Architecture](./adr-0004-dependency-injection-container-architecture.md) — `useFactory` pattern, decorator-free DI
- **REF-005**: [ADR-0009: Module Registration Function Pattern](./adr-0009-module-registration-function-pattern.md) — `registerXxxServices()` composition
- **REF-006**: [Constitution — Interface-First Development](../project-rules/constitution.md) — Principle 2: interface, fake, tests, adapter, contract tests
- **REF-007**: [Architecture Rules — Dependency Direction](../project-rules/rules.md) — R-ARCH-001, R-ARCH-002: services depend on interfaces
- **REF-008**: [Architecture — Service/Adapter/Interface Layering](../project-rules/architecture.md) — Clean architecture diagram, dependency flow
