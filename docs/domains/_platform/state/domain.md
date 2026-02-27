# Domain: State (`_platform/state`)

**Slug**: _platform/state
**Type**: infrastructure
**Created**: 2026-02-26
**Created By**: Plan 053 — GlobalStateSystem
**Parent**: `_platform`
**Status**: active

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
| `StateChange` | Type | All state subscribers | Change notification payload: path, value, previousValue, timestamp, removed? |
| `StateEntry` | Type | All state readers | Stored state entry: path, value, updatedAt |
| `StateDomainDescriptor` | Type | Domain publishers (at registration) | Domain declaration: name, description, multiInstance, properties |
| `StateChangeCallback` | Type | All state subscribers | `(change: StateChange) => void` |
| `useGlobalState<T>` | Hook | React components reading single values | `useGlobalState(path, default?) → T` — re-renders on change |
| `useGlobalStateList` | Hook | React components reading multiple values | `useGlobalStateList(pattern) → StateEntry[]` — re-renders on any match change |
| `useStateSystem` | Hook | React components needing direct IStateService access | Returns IStateService from context |
| `GlobalStateProvider` | Component | App root (mounted once) | React context provider for state system |
| `GlobalStateConnector` | Component | Workspace layout | Invisible component that wires domain registrations and SSE→state publishers |
| `FakeGlobalStateSystem` | Fake | All tests | Test double implementing IStateService with inspection methods |
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
| GlobalStateConnector | Workspace-scoped wiring: registers domains, connects SSE publishers | IStateService, SSE hooks |
| useGlobalState | Single-value subscription hook via useSyncExternalStore | IStateService (from context) |
| useGlobalStateList | Multi-value pattern subscription hook via useSyncExternalStore | IStateService (from context) |
| FakeGlobalStateSystem | Test double with getPublished(), getSubscribers(), wasPublishedWith() | IStateService interface |

---

## Source Location

Primary: `packages/shared/src/state/` (types + interface) + `apps/web/src/lib/state/` (implementation + hooks)

*Note: Implementation files (apps/web) exist. React hooks + provider (Phase 4) and exemplar (Phase 5) not yet created.*

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
| `apps/web/src/lib/state/state-connector.tsx` | GlobalStateConnector | Workspace wiring |
| `apps/web/src/lib/state/use-global-state.ts` | useGlobalState<T> hook | ✅ Created Phase 4 |
| `apps/web/src/lib/state/use-global-state-list.ts` | useGlobalStateList hook | ✅ Created Phase 4 |
| `apps/web/src/lib/state/index.ts` | Barrel exports | ✅ Created Phase 4 |
| `test/contracts/state-system.contract.ts` | Contract test factory | ✅ Created Phase 2 |
| `test/contracts/state-system.contract.test.ts` | Contract test runner | ✅ Created Phase 3 |
| `test/unit/web/state/global-state-system.test.ts` | Unit tests | ✅ Created Phase 3 |
| `test/unit/web/state/use-global-state.test.tsx` | Hook tests | ✅ Created Phase 4 |

---

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/events` | useSSE, useWorkspaceSSE, FileChangeHub pattern | State change transport from server; GlobalStateConnector subscribes to SSE and translates events to state |
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
