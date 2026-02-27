# GlobalStateSystem — Centralized Runtime State

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md`, `workshops/001-hierarchical-state-addressing.md`, and `workshops/002-developer-experience.md`.

---

## Research Context

**76 findings** across 8 research subagents confirmed that the codebase already contains all building blocks for this system:
- **FileChangeHub** (Plan 045): pattern-based pub/sub with subscribe/unsubscribe
- **SettingsStore** (Plan 047): key-value with onChange + useSyncExternalStore
- **SSE pipeline** (Plan 027): three-layer event transport (adapter → notifier → broadcaster)
- **DI container**: singleton registration with fakes for testing
- **15 prior learnings** (PL-01 through PL-15): store-first ordering, error isolation, stable references, subscription cleanup, bootstrap error handling

The system is a composition of proven patterns, not a new architectural invention. Zero new npm dependencies required.

---

## Summary

Runtime state in Chainglass is scattered across ad-hoc React hooks, SSE connections, and polling intervals. Components needing cross-domain state (e.g., a menu item that blinks when an agent needs attention) must understand internal implementation details of the publishing domain.

GlobalStateSystem provides a centralized, ephemeral runtime state registry. Domains publish runtime values (workflow status, alert counts, active files) to named state paths. Any consumer subscribes by path or pattern without coupling to the publisher's internals. State is always readable, changes propagate as events.

**The one-liner**: Runtime settings. SDK settings let domains publish user configuration; GlobalStateSystem does the same for ephemeral runtime values that change during a session.

---

## Goals

- **Decouple state producers from state consumers** — a menu badge reads `worktree:alert-count` without importing workflow or agent code
- **Provide always-readable state** — unlike fire-and-forget events, state has a current value accessible at any time via `get()`
- **Support multi-instance state domains** — 10 concurrent workflows, each with their own status, progress, and phase
- **Offer pattern-based subscriptions** — subscribe to `workflow:*:status` to watch all workflow statuses
- **Follow established codebase patterns** — mirror SDK settings DX (useSDKSetting → useGlobalState), FileChangeHub subscription pattern, DI container registration
- **Enable discoverability** — domains register descriptors so consumers can introspect available state via `listDomains()` and `listInstances()`
- **Make the system self-documenting** — domain registration requires description and property descriptors

---

## Non-Goals

- **Not a database** — state is ephemeral, lives in memory, gone on page refresh
- **Not a replacement for SSE** — server events arrive via SSE; client-side publishers translate them into state
- **Not a replacement for SDK settings** — settings are persisted user configuration; state is runtime values set by code
- **Not a replacement for React local state** — component-local UI state (open/closed, hover) stays in `useState`
- **Not server-side state** — the state system is client-side only (v1). Server state arrives via existing SSE pipeline
- **No agent state domains** — agent state is a future enhancement, not part of this plan
- **No state persistence** — state is not saved to disk or server. Refreshing the page clears all state
- **No automatic expiry / TTL** — publishers explicitly clean up their instances
- **No runtime schema validation** — TypeScript generics provide compile-time safety; `typeHint` in descriptors is for documentation only

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/state` | existing (docs only) | **create** | The new domain — owns all state system infrastructure |
| `_platform/events` | existing | **consume** | State system consumes SSE hooks for server→client state transport |
| `_platform/sdk` | existing | **consume** | Pattern exemplar only — useGlobalState mirrors useSDKSetting DX |
| `_platform/positional-graph` | existing | **consume** | Future publisher of orchestration state (not modified in this plan) |
| `workflow-ui` | existing | **consume** | Future consumer of workflow state (not modified in this plan) |
| `_platform/panel-layout` | existing | **consume** | Future consumer of alert state (not modified in this plan) |
| `file-browser` | existing | **consume** | Future consumer of worktree state (not modified in this plan) |

### Domain Notes

`_platform/state` was extracted in Plan 053 pre-work. Full domain definition exists at `docs/domains/_platform/state/domain.md`. Domain map and registry already updated.

This plan implements the `_platform/state` domain infrastructure plus a worktree publisher/consumer exemplar (AC-38..41) as a reference implementation.

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**: S=1, I=0, D=1, N=0, F=1, T=1 → Total P=4 → CS-3 (rounding up due to pattern complexity)

- **S=1 (Surface Area)**: Multiple files across `packages/shared/` and `apps/web/`, but contained within one new domain
- **I=0 (Integration)**: No external dependencies — uses only React 19 built-ins and existing event hooks
- **D=1 (Data/State)**: New in-memory data structures (Map-based store, path parsing, pattern matching) — no migrations
- **N=0 (Novelty)**: Well-specified by two workshops with resolved design decisions. All patterns proven in codebase.
- **F=1 (Non-Functional)**: Stable reference requirement for useSyncExternalStore. Error isolation per subscriber. List cache invalidation.
- **T=1 (Testing)**: Contract tests (real + fake parity), unit tests, hook tests with jsdom — all proven patterns

**Confidence**: 0.90

**Assumptions**:
- Client-side only (no server-side state system in v1)
- No consumer domain wiring in this plan (separate plans for workflow/worktree publishers)
- Colon-delimited path scheme as designed in Workshop 001
- Unidirectional data flow: publishers → state → consumers (consumers never write)

**Dependencies**:
- React 19 `useSyncExternalStore` (already in use)
- Existing `_platform/events` SSE hooks (for future connector wiring)

**Risks**:
- List cache invalidation for pattern subscriptions must maintain stable references (PL-12)
- Bootstrap error must not crash provider tree (PL-13) — mitigated by existing fallback pattern

**Phases** (high-level):
1. Types + interface + path matching (packages/shared)
2. Implementation + fake (packages/shared + apps/web)
3. React integration (provider, hooks)
4. Contract + unit tests
5. Worktree exemplar — real publisher (file change count, git data) + real consumer (left panel)
6. Developer guide + domain documentation + quality gate

---

## Acceptance Criteria

### Core State Operations

- **AC-01**: `IStateService.publish(path, value)` stores a value at the given path and notifies all matching subscribers synchronously
- **AC-02**: `IStateService.get(path)` returns the current value for a path, or `undefined` if no value has been published
- **AC-03**: `IStateService.get(path)` returns stable object references — consecutive calls with no intervening `publish()` return `Object.is`-equal values
- **AC-04**: `IStateService.remove(path)` removes a state entry and notifies subscribers with `removed: true` in the StateChange
- **AC-05**: `IStateService.removeInstance(domain, instanceId)` removes all entries matching `domain:instanceId:*` and notifies subscribers for each removed entry

### Domain Registration

- **AC-06**: `IStateService.registerDomain(descriptor)` registers a state domain with name, description, multiInstance flag, and property descriptors
- **AC-07**: Calling `registerDomain()` twice with the same domain name throws (fail-fast, single-owner)
- **AC-08**: `publish()` to an unregistered domain throws with a descriptive error message
- **AC-09**: `IStateService.listDomains()` returns all registered domain descriptors
- **AC-10**: `IStateService.listInstances(domain)` returns all known instance IDs for a multi-instance domain

### Path Addressing

- **AC-11**: Paths use colon-delimited segments: `domain:property` (singleton) or `domain:instanceId:property` (multi-instance)
- **AC-12**: Path segments are validated: domains and properties match `[a-z][a-z0-9-]*`, instance IDs match `[a-zA-Z0-9_-]+`
- **AC-13**: Publishing to a singleton domain with an instance ID in the path throws
- **AC-14**: Publishing to a multi-instance domain without an instance ID in the path throws
- **AC-15**: Paths have 2 or 3 segments only — 4+ segments are rejected with a descriptive error

### Pattern Subscriptions

- **AC-16**: Exact pattern `workflow:wf-1:status` matches only that path
- **AC-17**: Domain wildcard `workflow:*:status` matches any instance with that property
- **AC-18**: Instance wildcard `workflow:wf-1:*` matches all properties of that instance
- **AC-19**: Domain-all `workflow:**` matches everything in the domain
- **AC-20**: Global wildcard `*` matches all state changes
- **AC-21**: `subscribe()` returns an unsubscribe function; calling it removes the subscription
- **AC-22**: Subscriber errors are isolated — one throwing subscriber does not prevent other subscribers from receiving the change

### State Change Notifications

- **AC-23**: StateChange includes: path, domain, instanceId, property, value, previousValue, timestamp, and optional `removed` flag
- **AC-24**: Store is updated BEFORE subscribers are notified (store-first ordering)
- **AC-25**: `IStateService.list(pattern)` returns all entries matching a pattern as `StateEntry[]`
- **AC-26**: `list()` returns a stable array reference when no matching values have changed since the last call

### React Integration

- **AC-27**: `useGlobalState<T>(path, default?)` returns the current value and re-renders on change, using `useSyncExternalStore`
- **AC-28**: `useGlobalState` returns the default value when the path has no published value
- **AC-29**: `useGlobalStateList(pattern)` returns all matching `StateEntry[]` and re-renders when any matching value changes
- **AC-30**: `GlobalStateProvider` creates the state system once (via `useState` initializer) and provides it via React context
- **AC-31**: `GlobalStateProvider` gracefully degrades on bootstrap error — returns a no-op state system instead of crashing the component tree
- **AC-32**: `useStateSystem()` hook returns `IStateService` from context; throws if used outside `GlobalStateProvider`

### Testability

- **AC-33**: `FakeGlobalStateSystem` implements `IStateService` with inspection methods: `getPublished(path)`, `getSubscribers()`, `wasPublishedWith(path, value)`, `reset()`
- **AC-34**: Contract tests run against both `GlobalStateSystem` (real) and `FakeGlobalStateSystem` (fake) to ensure behavioral parity
- **AC-35**: All core operations (publish, subscribe, get, list, remove, removeInstance) have unit tests

### Diagnostics

- **AC-36**: `IStateService.subscriberCount` returns the total number of active subscriptions
- **AC-37**: `IStateService.entryCount` returns the total number of stored state entries

### Worktree Exemplar (End-to-End)

- **AC-38**: A `worktree` state domain is registered at bootstrap with properties including changed file count and git branch info
- **AC-39**: A publisher wires into the existing file change events (FileChangeHub or SSE) and publishes worktree state (e.g., `worktree:changed-file-count`, `worktree:branch`) that updates live as files change
- **AC-40**: A consumer in the left panel top area (near worktree/workspace name) reads worktree state via `useGlobalState` and displays it, updating live without page refresh
- **AC-41**: The exemplar demonstrates both the publisher pattern and the consumer pattern as reference implementations for other domains

### Developer Guide

- **AC-42**: A developer guide exists at `docs/how/global-state-system.md` covering consumer quick-start, publisher quick-start, pattern cheatsheet, and the worktree exemplar walkthrough

---

## Risks & Assumptions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| List cache invalidation breaks useSyncExternalStore | High | Low | Version counter pattern per entry; proven in SettingsStore |
| Bootstrap error crashes provider tree | High | Low | try/catch + no-op fallback (proven in SDKProvider) |
| Pattern subscription O(n) per publish becomes slow | Medium | Low | Expected scale ~50-200 entries, 20-50 subscriptions — well within acceptable range |
| Memory leak from forgotten subscriptions | Medium | Low | Same cleanup pattern as useSDKSetting (useEffect return); proven in multiple hooks |

### Assumptions

1. Client-side only — no server-side state system needed for v1
2. All publishers and consumers are within the same browser tab — no cross-tab sync
3. State is ephemeral — refreshing the page resets all state, which is acceptable
4. Domain registration at bootstrap time — domains don't register/unregister dynamically during a session
5. Publishers are trusted internal code — no input sanitization beyond path format validation
6. The existing SSE pipeline can transport state change notifications when GlobalStateConnector wires publishers (future plan)

---

## Open Questions

All open questions have been resolved:

- **OQ-01**: ~~Should `publish()` skip notification if value unchanged?~~ **RESOLVED**: No — always notify (Workshop 002). Consumers can check `previousValue` if needed.
- **OQ-02**: ~~Should GlobalStateConnector be part of this plan?~~ **RESOLVED**: Yes — build a real worktree exemplar with publisher + consumer as reference implementation (Clarification Q6/Q7).

---

## Workshop Opportunities

Both workshop opportunities identified during research have been **completed**:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Hierarchical State Addressing & Instance Management | Data Model | ✅ Complete | `workshops/001-hierarchical-state-addressing.md` |
| Developer Experience — Consuming & Publishing State | API Contract | ✅ Complete | `workshops/002-developer-experience.md` |

No additional workshops needed — design decisions are resolved.

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: Core logic (path parsing, pattern matching, store dispatch, error isolation) is pure functions — ideal for test-first. Contract tests ensure real/fake parity. Hook tests mirror proven useSDKSetting test patterns.

**Focus Areas**:
- Contract tests: `globalStateContractTests(factory)` runs against both real and fake
- Path matcher: all 5 pattern types (exact, domain wildcard, instance wildcard, domain-all, global)
- Store operations: publish, get, remove, removeInstance, list, listInstances
- Error isolation: throwing subscriber doesn't block others
- Store-first ordering: values updated before subscribers notified
- Stable references: get() and list() return Object.is-equal refs when unchanged
- React hooks: useGlobalState, useGlobalStateList with FakeGlobalStateSystem injection

**Mock Usage**: Avoid mocks entirely — real data/fixtures only. Use FakeGlobalStateSystem (implements IStateService) as the test double. No vi.mock or vi.spyOn.

**Excluded**: No E2E browser tests. No SSE integration tests (SSE transport is existing, not modified).

---

## Documentation Strategy

**Location**: `docs/how/`
**Rationale**: Workshop 002 has comprehensive DX documentation but lives in the plan folder. A permanent developer guide in `docs/how/` provides ongoing reference for engineers consuming and publishing state.

**Deliverable**: `docs/how/global-state-system.md` — developer guide covering:
- The vibe (one-liner, mental model, when to use vs alternatives)
- Consumer quick-start (useGlobalState, useGlobalStateList, subscribe)
- Publisher quick-start (registerDomain, publish, removeInstance)
- Pattern cheatsheet
- Worktree exemplar walkthrough

---

## Clarifications

### Session 2026-02-26

**Q1: Workflow Mode** → **Full**. CS-3 with 37 ACs across packages/shared + apps/web. Multi-phase plan with dossiers and all gates.

**Q2: Testing Strategy** → **Full TDD**. Core logic is pure functions, ideal for test-first. Contract tests for real/fake parity.

**Q3: Mock Usage** → **Avoid mocks entirely**. FakeGlobalStateSystem is the test double. No vi.mock — matches codebase convention (FakeUSDK, FakeFileChangeHub pattern).

**Q4: Documentation Strategy** → **docs/how/ guide**. Permanent developer guide at `docs/how/global-state-system.md` for consuming and publishing state.

**Q5: Domain Review** → **Confirmed as-is**. Only `_platform/state` is created. All other domains noted for future integration but not modified in this plan.

**Q6: GlobalStateConnector Scope (OQ-02)** → **Provider + real exemplar**. Build a real worktree state domain as an end-to-end example with both publisher and consumer.

**Q7: Exemplar Location** → **Real worktree domain**. Register a `worktree` state domain with real properties (changed file count, git data). Wire a publisher from file change events. Wire a consumer into the left panel top area (where worktree/workspace name is). Must update live. Serves as exemplar of both a publisher and a consumer.
