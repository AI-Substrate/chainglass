---
title: "ADR-0010: Central Domain Event Notification Architecture"
status: "Accepted"
date: "2026-02-03"
authors: "Core development team"
tags: ["architecture", "decision", "sse", "events", "domain-adapters", "notifications", "real-time"]
supersedes: ""
superseded_by: ""
---

# ADR-0010: Central Domain Event Notification Architecture

## Status

Accepted

## Context

The Chainglass web application had two independent, ad-hoc notification systems with no shared abstraction:

1. **Agent notifications**: `AgentNotifierService` (Plan 019) — a fully wired service that broadcasts agent status, intent, and event updates via SSE to the `agents` channel.
2. **Workgraph notifications**: `broadcastGraphUpdated()` (Plan 022) — a standalone function that broadcasts graph-updated events via SSE to the `workgraphs` channel.

These systems share identical mechanics (SSE broadcast via `SSEManager`) but were designed independently with no common interface, no shared domain identity model, and no template for future domains. Critically, external filesystem changes to workgraph `state.json` files — written by CLI tools, agent processes, or manual edits — never reached the browser UI because `CentralWatcherService` (Plan 023) existed but was never wired into the DI container or started at boot. Users saw stale UI and had to manually refresh.

The core challenge was threefold: (a) unify the notification model so new domains follow a standard pattern, (b) bridge filesystem events to SSE without coupling adapters to a single event source, and (c) do this within existing architectural constraints — decorator-free DI (ADR-0004), notification-fetch SSE payloads (ADR-0007), and fakes-only testing.

## Decision

Adopt a **central domain event notification architecture** with three layers:

1. **Filesystem Layer** — `CentralWatcherService` watches `<worktree>/.chainglass/data/` directories via chokidar. It dispatches raw filesystem events to registered **watcher adapters** (e.g., `WorkGraphWatcherAdapter`), which filter and parse paths into domain-specific events (e.g., `WorkGraphChangedEvent`).

2. **Domain Adapter Layer** — Abstract `DomainEventAdapter<TEvent>` base class provides a template method: subclasses implement `extractData(event)` to produce a minimal payload (identifiers only, per ADR-0007). The adapter calls `ICentralEventNotifier.emit(domain, eventType, data)` to route events to SSE. Adapters are **not coupled to filesystem changes** — any source (API route, programmatic call, test harness) can invoke `handleEvent()`.

3. **Notification Hub Layer** — `CentralEventNotifierService` implements `ICentralEventNotifier`. It delegates to `ISSEBroadcaster.broadcast(channel, eventType, data)` where the channel name equals the `WorkspaceDomain` value (e.g., `'workgraphs'`). This single-method interface is the only contract between domain adapters and SSE infrastructure.

**Domain identity** uses a `WorkspaceDomain` const-object pattern (not a TypeScript enum):

```typescript
export const WorkspaceDomain = {
  Workgraphs: 'workgraphs',
  Agents: 'agents',
} as const;
```

Values are the SSE channel names — no mapping table, no indirection. Adding a domain means adding one property.

**Bootstrap** uses Next.js `instrumentation.ts` for async server startup. A `globalThis.__centralNotificationsStarted` flag gates initialization to survive HMR reloads. On failure, the flag resets to allow retry on next request cycle.

**Client-side deduplication** uses an `isRefreshing` guard in the SSE hook — when the UI initiates a save, it suppresses the echo event from the filesystem watcher. No server-side suppression is needed.

## Consequences

**Positive**

- **POS-001**: New workspace domains follow a repeatable 5-step pattern: extend `WorkspaceDomain`, create watcher adapter, create domain event adapter, register in DI, wire into bootstrap. No SSE plumbing to reinvent.
- **POS-002**: External filesystem changes (CLI tools, agent processes, manual edits) automatically produce browser notifications within ~2 seconds, eliminating stale-UI refresh cycles.
- **POS-003**: Domain adapters are decoupled from their event source — the same `WorkgraphDomainEventAdapter` handles both filesystem-originated and API-originated events, satisfying the open-closed principle.
- **POS-004**: The `ICentralEventNotifier` interface has a single method (`emit`), keeping the contract minimal and testable with a trivial `FakeCentralEventNotifier` that records calls.
- **POS-005**: Aligns with ADR-0004 (decorator-free DI via `useFactory`/`useValue`), ADR-0007 (notification-fetch with identifier-only payloads), and ADR-0009 (module registration pattern).

**Negative**

- **NEG-001**: Two adapter types per domain (watcher adapter + domain event adapter) increases the file count for each new domain, though each file is small (~20-30 lines).
- **NEG-002**: `globalThis` singleton pattern for HMR survival is a development-time workaround that leaks process-level state; not idiomatic for production Node.js but necessary for Next.js dev mode.
- **NEG-003**: `CentralWatcherService` has 6 constructor dependencies, making manual wiring verbose in the DI container — a consequence of the decorator-free constraint from ADR-0004.
- **NEG-004**: Client-side deduplication via `isRefreshing` relies on timing (~3-second window); edge cases with very fast filesystem echoes could still produce brief duplicate toasts.

## Alternatives Considered

### A) Event Bus / Pub-Sub Middleware

- **ALT-001**: **Description**: Introduce a shared event bus (e.g., `EventEmitter` or a custom pub/sub system) that all domains publish to, with SSE as one subscriber among potentially many.
- **ALT-002**: **Rejection Reason**: Adds an abstraction layer that doesn't carry its weight — the application has exactly one consumer (SSE broadcast) and no foreseeable need for multiple subscribers. An event bus also introduces ordering and backpressure concerns that the direct adapter-to-notifier call avoids. The existing `Set<Callback>` convention in the codebase already handles the pub/sub need at the watcher level.

### B) Domain-Specific Notifier Services (Status Quo Extended)

- **ALT-003**: **Description**: Keep each domain's notifier as a standalone service (like `AgentNotifierService`) and add a `WorkgraphNotifierService` following the same pattern. No shared base class or central hub.
- **ALT-004**: **Rejection Reason**: Duplicates SSE wiring across every domain. Each new domain would need its own service class, its own DI registration, its own broadcaster injection — identical boilerplate with no shared contract. The filesystem-to-SSE bridge would need to be solved per-domain rather than centrally.

### C) Server-Side Event Suppression

- **ALT-005**: **Description**: Add `suppressDomain()` / `isSuppressed()` methods to `ICentralEventNotifier` to handle deduplication server-side when API routes trigger filesystem changes that echo back through the watcher.
- **ALT-006**: **Rejection Reason**: Implemented in early phases but removed during Phase 3. The existing client-side `isRefreshing` guard already deduplicates effectively, and server-side suppression added 3 methods, timing logic, and test complexity for no user-visible benefit. Simpler interface (1 method vs 4) won.

## Implementation Notes

- **IMP-001**: The `WorkspaceDomain` value IS the SSE channel name — `WorkspaceDomain.Workgraphs === 'workgraphs'` maps directly to `/api/events/workgraphs`. A mismatch causes silent event delivery failure (events go to wrong channel with no error). This is by design to eliminate mapping tables, but requires discipline when adding domains.
- **IMP-002**: SSE uses **unnamed events** (no `event:` line in the SSE frame). Browser `EventSource.onmessage` only receives unnamed events; named events require explicit `addEventListener`. The event type is embedded in the JSON data payload as a `type` field. This matches the existing `useSSE` hook contract.
- **IMP-003**: Bootstrap sequence is: `instrumentation.ts` (Next.js hook) → `startCentralNotificationSystem()` → resolve from DI → construct adapters → wire subscriptions → `watcher.start()`. The `globalThis` flag prevents double-start during HMR. On failure, the flag resets so the next server request cycle can retry.
- **IMP-004**: `CentralEventNotifierService` is registered as `useValue` singleton (not `useFactory`) because it wraps a stateless broadcaster reference that must be shared across all domain adapters. `CentralWatcherService` uses `useFactory` because it resolves 6 dependencies from the container.
- **IMP-005**: Adding a new domain adapter requires: (1) extend `WorkspaceDomain` const, (2) create `XxxWatcherAdapter` for filesystem filtering, (3) create `XxxDomainEventAdapter extends DomainEventAdapter<TEvent>`, (4) register in DI container, (5) wire subscription in `startCentralNotificationSystem()`. See `docs/how/dev/central-events/3-adapters.md` for the full walkthrough.

## References

- **REF-001**: [Feature Specification](../plans/027-central-notify-events/central-notify-events-spec.md)
- **REF-002**: [Implementation Plan](../plans/027-central-notify-events/central-notify-events-plan.md)
- **REF-003**: [ADR-0004: Dependency Injection Container Architecture](./adr-0004-dependency-injection-container-architecture.md) — decorator-free DI, `useFactory` pattern, child container isolation
- **REF-004**: [ADR-0007: SSE Single-Channel Event Routing Pattern](./adr-0007-sse-single-channel-routing.md) — notification-fetch pattern, identifier-only SSE payloads
- **REF-005**: [ADR-0009: Module Registration Function Pattern](./adr-0009-module-registration-function-pattern.md) — `registerXxxServices()` composition
- **REF-006**: Developer Guide — `docs/how/dev/central-events/`:
  - [1-overview.md](../how/dev/central-events/1-overview.md) — architecture, components, key concepts
  - [2-usage.md](../how/dev/central-events/2-usage.md) — triggering events, verifying delivery, debugging
  - [3-adapters.md](../how/dev/central-events/3-adapters.md) — adding new domain adapters step-by-step
  - [4-testing.md](../how/dev/central-events/4-testing.md) — testing with FakeCentralEventNotifier
