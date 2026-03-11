# Domain: State (`_platform/state`)

**Slug**: _platform/state
**Type**: infrastructure
**Created**: 2026-02-26
**Created By**: Plan 053 — GlobalStateSystem
**Parent**: `_platform`
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/state.md)

---

## Purpose

Centralized ephemeral runtime state system. Domains publish runtime values (workflow status, alert counts, active files) to named state paths; any consumer subscribes by path or pattern without coupling to the publisher's internals. Like SDK settings, but for runtime values that change during a session and aren't persisted.

**The one-liner**: Runtime settings. Settings let domains publish configuration; GlobalStateSystem does the same for ephemeral runtime values that change during a session.

---

## Boundary

### Owns

- **IStateService interface** — publish, subscribe, get, list, registerDomain, removeInstance
- **State value types** — StateChange, StateEntry, StateDomainDescriptor, StateChangeCallback
- **Path addressing scheme** — colon-delimited hierarchical paths (`domain:instanceId:property`)
- **Pattern matching engine** — exact, domain wildcard (`domain:*:property`), instance wildcard (`domain:id:*`), domain-all (`domain:**`)
- **GlobalStateSystem implementation** — in-memory store with Map<path, entry>, subscriber dispatch, error isolation
- **React integration** — GlobalStateProvider context, useStateSystem, useGlobalState, useGlobalStateList hooks
- **GlobalStateConnector** — invisible component that wires domain publishers at workspace mount
- **DI tokens** — STATE_DI_TOKENS for container registration
- **FakeGlobalStateSystem** — test double with inspection methods (getPublished, getSubscribers, reset)
- **Contract tests** — parity tests running against both real and fake implementations

### Does NOT Own

- **Domain-specific publishers** — each domain (workflow, worktree, etc.) owns its own publish calls. The state system provides the mechanism; domains provide the content.
- **SSE transport / event pipeline** — owned by `_platform/events`. State system sits ON TOP of events as a consumer, not a replacement.
- **SDK settings** — owned by `_platform/sdk`. Settings are persisted user configuration; state is ephemeral runtime values. Different concerns.
- **Domain-specific state types** — e.g., workflow status enums, agent status types. Owned by their respective domains.
- **Server-side state** — state system is client-side only. Server events arrive via SSE; client-side publishers translate them to state.

---

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IStateService` | Interface | All domains needing cross-domain runtime state | Core facade: publish, subscribe, get, list, registerDomain, removeInstance |
| `StateChange` | Type | All state subscribers | Change notification payload: path, value, previousValue, timestamp, removed?, source? |
| `StateEntry` | Type | All state readers | Stored state entry: path, value, updatedAt, source? |
| `StateEntrySource` | Type | ServerEventRoute, dev-tools | Origin metadata: origin ('client'/'server'), channel?, eventType? |
| `StateDomainDescriptor` | Type | Domain publishers (at registration) | Domain declaration: name, description, multiInstance, properties |
| `StateChangeCallback` | Type | All state subscribers | `(change: StateChange) => void` |
| `useGlobalState<T>` | Hook | React components reading single values | `useGlobalState(path, default?) → T` — re-renders on change |
| `useGlobalStateList` | Hook | React components reading multiple values | `useGlobalStateList(pattern) → StateEntry[]` — re-renders on any match change |
| `useStateSystem` | Hook | React components needing direct IStateService access | Returns IStateService from context |
| `GlobalStateProvider` | Component | App root (mounted once) | React context provider for state system |
| `GlobalStateConnector` | Component | Workspace layout | Invisible component that wires domain registrations, SSE→state publishers, and ServerEventRoute instances |
| `ServerEventRoute` | Component | GlobalStateConnector | Invisible bridge: subscribes to SSE channel, maps events to state paths via route descriptor |
| `ServerEventRouteDescriptor` | Type | Domains opting into server→state routing | Route config: channel, stateDomain, multiInstance, properties, mapEvent |
| `FakeGlobalStateSystem` | Fake | All tests | Test double implementing IStateService with inspection methods |
| `StateChangeLog` | Class | `_platform/dev-tools`, any observer | Ring buffer accumulating StateChange entries from boot (500 cap, own subscribe/version) |
| `StateChangeLogContext` | Context | `_platform/dev-tools` hooks | React context providing StateChangeLog instance |
| `STATE_DI_TOKENS` | Const | DI container | Token constants for service resolution |

---

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| StateStore (internal) | In-memory Map<path, StateEntry> + Map<path, Set<callback>> + Set<PatternSubscription> | — |
| PathMatcher | createStateMatcher(pattern) → (path) => boolean | — |
| PathParser | parsePath(path) → ParsedPath (domain, instanceId, property) | — |
| GlobalStateSystem | IStateService implementation composing store + matcher + dispatch | StateStore, PathMatcher |
| GlobalStateProvider | React context provider, bootstraps GlobalStateSystem | GlobalStateSystem |
| GlobalStateConnector | Workspace-scoped wiring: registers domains, connects multiplexed SSE publishers, mounts ServerEventRoutes | IStateService, useChannelEvents, ServerEventRoute |
| ServerEventRoute | Invisible bridge: subscribes muxed channel events → maps events → publishes to state with source metadata | useChannelEvents, IStateService, ServerEventRouteDescriptor |
| useGlobalState | Single-value subscription hook via useSyncExternalStore | IStateService (from context) |
| useGlobalStateList | Multi-value pattern subscription hook via useSyncExternalStore | IStateService (from context) |
| FakeGlobalStateSystem | Test double with getPublished(), getSubscribers(), wasPublishedWith() | IStateService interface |

---

## Source Location

Primary: `packages/shared/src/state/` (types + interface) + `apps/web/src/lib/state/` (implementation + hooks)

*Note: Phase 5 added GlobalStateConnector (wiring component) to this domain.*

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/interfaces/state.interface.ts` | IStateService interface | ✅ Created Phase 1 |
| `packages/shared/src/state/types.ts` | StateChange, StateEntry, StateDomainDescriptor, StateChangeCallback, ParsedPath, StateMatcher | ✅ Created Phase 1 |
| `packages/shared/src/state/path-parser.ts` | parsePath() | ✅ Created Phase 1 |
| `packages/shared/src/state/path-matcher.ts` | createStateMatcher() | ✅ Created Phase 1 |
| `packages/shared/src/state/tokens.ts` | STATE_DI_TOKENS | ✅ Created Phase 1 |
| `packages/shared/src/state/index.ts` | Barrel exports | ✅ Created Phase 1 |
| `packages/shared/src/fakes/fake-state-system.ts` | FakeGlobalStateSystem | ✅ Created Phase 3 |
| `apps/web/src/lib/state/global-state-system.ts` | GlobalStateSystem class | ✅ Created Phase 3 |
| `apps/web/src/lib/state/state-provider.tsx` | GlobalStateProvider + useStateSystem + StateContext | ✅ Created Phase 4 |
| `apps/web/src/lib/state/state-connector.tsx` | GlobalStateConnector | ✅ Created Phase 5, extended Plan 059 (ServerEventRoute mounting) |
| `apps/web/src/lib/state/server-event-router.ts` | ServerEventRouteDescriptor, ServerEvent, StateUpdate types | ✅ Created Plan 059 Subtask 001 |
| `apps/web/src/lib/state/server-event-route.tsx` | ServerEventRoute component (SSE→state bridge) | ✅ Created Plan 059 Subtask 001 |
| `apps/web/src/lib/state/state-change-log.ts` | StateChangeLog ring buffer | ✅ Created Plan 056 |
| `apps/web/src/lib/state/use-global-state.ts` | useGlobalState<T> hook | ✅ Created Phase 4 |
| `apps/web/src/lib/state/use-global-state-list.ts` | useGlobalStateList hook | ✅ Created Phase 4 |
| `apps/web/src/lib/state/index.ts` | Barrel exports | ✅ Created Phase 4 |
| `test/contracts/state-system.contract.ts` | Contract test factory | ✅ Created Phase 2 |
| `test/contracts/state-system.contract.test.ts` | Contract test runner | ✅ Created Phase 3 |
| `test/unit/web/state/global-state-system.test.ts` | Unit tests | ✅ Created Phase 3 |
| `test/unit/web/state/use-global-state.test.tsx` | Hook tests | ✅ Created Phase 4 |
| `test/unit/web/state/worktree-publisher.test.tsx` | Publisher tests | ✅ Created Phase 5 |

---

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Publish Runtime State | `state.publish('domain:id:property', value)` | Domain publishers write ephemeral values to colon-delimited paths. Subscribers are notified synchronously with error isolation. |
| Subscribe to State | `useGlobalState<T>(path, default)` | React components read single values with concurrent-safe re-renders via useSyncExternalStore. |
| Server Event Bridge | `ServerEventRoute` + `ServerEventRouteDescriptor` | Invisible component subscribes to an SSE channel, maps events to state paths via mapEvent(). Optional `channel` metadata in ServerEvent identifies which SSE channel the event came from (Plan 072). |
| Domain Registration | `state.registerDomain(descriptor)` | Domains declare their state shape (properties, multi-instance) at mount time via useState initializer for synchronous availability. |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/events` | useChannelEvents, MultiplexedSSEProvider, FileChangeHub pattern | State change transport from server; GlobalStateConnector subscribes to multiplexed channel events and translates them to state |
| React 19 | useSyncExternalStore | Concurrent-safe subscription hooks |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/positional-graph` | IStateService (publish) | Publishes orchestration/workflow execution state |
| `workflow-ui` | useGlobalState, useGlobalStateList | Subscribes to workflow execution state for canvas/dashboard |
| `_platform/panel-layout` | useGlobalState | Subscribes to alert counts, UI state for menu badges |
| `file-browser` | useGlobalState | Subscribes to worktree-level state (active file, dirty files) |
| *(future: agent-ui)* | useGlobalState, useGlobalStateList | Per-agent run state |

---

## Design Principles

1. **Publishers own the contract** — they declare what they publish via registerDomain(), and they decide when to publish and clean up
2. **Consumers are decoupled** — they subscribe by path pattern, never import publisher code
3. **State is always readable** — unlike events (fire-and-forget), state has a current value accessible via get()
4. **Error isolation** — one throwing subscriber never blocks others (try/catch per callback)
5. **Store-first, then broadcast** — internal Map is updated before subscribers are notified
6. **No automatic expiry** — publishers clean up their own instances via removeInstance()
7. **Stable references** — get() and list() return structurally-stable references for useSyncExternalStore compatibility

---

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 053 | Domain extracted and designed from workshops. Research dossier + 2 workshops (hierarchical addressing, developer experience). | 2026-02-26 |
| 053-P1 | Phase 1 implemented: types, IStateService interface, path parser (2/3 segments), path matcher (5 patterns), DI tokens, barrel exports + package.json `./state` entry. | 2026-02-26 |
| 053-P2 | Phase 2 implemented: path parser tests (25), path matcher tests (22), contract test factory (19 cases C01-C19). All imports via `@chainglass/shared/state`. | 2026-02-27 |
| 053-P3 | Phase 3 implemented: GlobalStateSystem (real, Map-based store + dispatch), FakeGlobalStateSystem (full behavioral fake + inspection methods), contract test runner (44 tests pass — 22 real + 22 fake), unit tests (31). Total: 122 state tests. | 2026-02-27 |
| 053-P4 | Phase 4 implemented: React hooks (useGlobalState, useGlobalStateList via useSyncExternalStore), GlobalStateProvider + useStateSystem + exported StateContext, barrel exports, mounted in providers.tsx. AC-31 dropped (fail-fast, no no-op fallback). 9 hook tests. Total: 137 state tests. | 2026-02-27 |
| 053-P5 | Phase 5 implemented: Worktree exemplar. registerWorktreeState() multi-instance domain, WorktreeStatePublisher (useFileChanges), WorktreeStateSubtitle consumer, GlobalStateConnector wiring. Wired into browser-client.tsx + dashboard-sidebar.tsx. Idempotent registration for StrictMode. 7 publisher tests. Total: 145 state tests. | 2026-02-27 |
| 053-P6 | Phase 6: Developer guide at docs/how/global-state-system.md. Domain docs finalized. Quality gate passed. Plan 053 complete. | 2026-02-27 |
| 059-ST001 | Plan 059 Subtask 001: Added StateEntrySource type (origin metadata for server/client tagging), extended publish() with optional source param across IStateService + GlobalStateSystem + FakeGlobalStateSystem, added getPublishedSource() to fake. Created ServerEventRoute component + ServerEventRouteDescriptor types. Extended GlobalStateConnector to mount server event routes. Added WorkUnitState to WorkspaceDomain. | 2026-03-01 |
| 072-P1 | Plan 072 Phase 1: Added optional `channel?: string` metadata to ServerEvent interface for multiplexed SSE delivery. Non-breaking — existing ServerEventRoute consumers unaffected. | 2026-03-08 |
| 072-P4 | Plan 072 Phase 4: Migrated ServerEventRoute from `useSSE` to `useChannelEvents` (multiplexed). Re-enabled GlobalStateConnector in browser-client.tsx. Updated connection limit comment — "future fix" is now reality. Zero additional SSE connections. | 2026-03-08 |
