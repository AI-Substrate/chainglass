# Component: State (`_platform/state`)

> **Domain Definition**: [_platform/state/domain.md](../../../../domains/_platform/state/domain.md)
> **Source**: `packages/shared/src/state/` + `apps/web/src/lib/state/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: State

Centralized ephemeral runtime state system for cross-domain values (workflow status, active files, execution progress). Uses hierarchical path addressing (e.g., `orchestration:graphId:nodeStatus`), wildcard pattern matching for subscriptions, and SSE transport for server→client state synchronization. The state store is in-memory — not persisted across restarts.

```mermaid
C4Component
    title Component diagram — State (_platform/state)

    Container_Boundary(state, "State") {
        Component(iState, "IStateService", "Interface", "Publish/subscribe contract:<br/>publish, subscribe, get, list,<br/>registerDomain")
        Component(system, "GlobalStateSystem", "Core Implementation", "IStateService implementation:<br/>manages StateStore +<br/>PathMatcher + domain registry")
        Component(store, "StateStore", "Internal Module", "Map of path → StateEntry<br/>+ Map of path → callbacks<br/>in-memory, ephemeral")
        Component(matcher, "PathMatcher", "Internal Module", "Pattern matching engine:<br/>exact, wildcard (*),<br/>domain-all (domain:*:*)")
        Component(provider, "GlobalStateProvider", "React Provider", "React context setup:<br/>provides IStateService<br/>to component tree")
        Component(connector, "GlobalStateConnector", "Client Component", "Invisible wiring component:<br/>bridges SSE events to<br/>state store updates")
        Component(changeLog, "StateChangeLog", "Observable Buffer", "Ring buffer (500 cap)<br/>for state change<br/>observability and debugging")
        Component(useGlobal, "useGlobalState", "Hook", "Single-value subscription:<br/>useGlobalState<T>(path)")
        Component(useList, "useGlobalStateList", "Hook", "Multi-value subscription:<br/>useGlobalStateList(pattern)")
    }

    Rel(system, iState, "Implements")
    Rel(system, store, "Manages entries in")
    Rel(system, matcher, "Matches subscriptions via")
    Rel(system, changeLog, "Records changes to")
    Rel(provider, system, "Provides instance of")
    Rel(connector, system, "Bridges SSE events into")
    Rel(useGlobal, provider, "Reads from context")
    Rel(useList, provider, "Reads from context")
    Rel(useList, matcher, "Evaluates patterns with")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| IStateService | Interface | Publish/subscribe: publish, subscribe, get, list, registerDomain |
| GlobalStateSystem | Core Implementation | IStateService impl managing StateStore + PathMatcher + domain registry |
| StateStore | Internal Module | Map<path, StateEntry> + Map<path, Set<callback>> — ephemeral |
| PathMatcher | Internal Module | Pattern matching: exact, wildcard (`*`), domain-all (`domain:*:*`) |
| GlobalStateProvider | React Provider | Provides IStateService to React component tree |
| GlobalStateConnector | Client Component | Invisible bridge: SSE events → state store updates |
| StateChangeLog | Observable Buffer | Ring buffer (500 cap) for debugging state changes |
| useGlobalState | Hook | Single-value subscription: `useGlobalState<T>(path)` |
| useGlobalStateList | Hook | Multi-value pattern subscription: `useGlobalStateList(pattern)` |

## External Dependencies

Depends on: _platform/events (SSE transport via useSSE), React 19 (useSyncExternalStore).
Consumed by: _platform/positional-graph (publishes), workflow-ui, file-browser, panel-layout, _platform/dev-tools.

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/state/domain.md](../../../../domains/_platform/state/domain.md)
- **Hub**: [C4 Overview](../../README.md)
