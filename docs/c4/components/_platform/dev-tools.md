# Component: Dev Tools (`_platform/dev-tools`)

> **Domain Definition**: [_platform/dev-tools/domain.md](../../../../domains/_platform/dev-tools/domain.md)
> **Source**: `apps/web/src/features/_platform/dev-tools/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: Dev Tools

Developer-facing observability tooling — inspector panels and diagnostic displays for debugging platform state at runtime. Pure observer: reads state but never modifies it. Provides a tabbed inspector with domain overview, state snapshot, and live event stream views.

```mermaid
C4Component
    title Component diagram — Dev Tools (_platform/dev-tools)

    Container_Boundary(devTools, "Dev Tools") {
        Component(inspector, "StateInspector", "Client Component", "Main inspector panel:<br/>tabbed UI with Domains,<br/>Snapshot, and Stream views")
        Component(domainView, "DomainOverview", "Client Component", "Domain list with<br/>expandable schemas,<br/>registered domain summary")
        Component(entriesTable, "StateEntriesTable", "Client Component", "State entries sorted<br/>by updatedAt, shows<br/>path + value + metadata")
        Component(stream, "EventStream", "Client Component", "Live change stream<br/>with pause, resume,<br/>clear, and filtering")
        Component(useChangeLog, "useStateChangeLog", "Hook", "Subscribes to StateChangeLog:<br/>(pattern?, limit?) →<br/>StateChange[]")
        Component(useInspector, "useStateInspector", "Composing Hook", "Combines state queries<br/>+ change log into<br/>inspector-ready data")
    }

    Rel(inspector, domainView, "Renders Domains tab with")
    Rel(inspector, entriesTable, "Renders Snapshot tab with")
    Rel(inspector, stream, "Renders Stream tab with")
    Rel(inspector, useInspector, "Gets data from")
    Rel(useInspector, useChangeLog, "Composes with")
    Rel(stream, useChangeLog, "Subscribes to changes via")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| StateInspector | Client Component | Main inspector: tabbed UI with Domains, Snapshot, Stream views |
| DomainOverview | Client Component | Registered domain list with expandable schemas |
| StateEntriesTable | Client Component | State entries sorted by updatedAt with path/value/metadata |
| EventStream | Client Component | Live change stream with pause/resume/clear and filtering |
| useStateChangeLog | Hook | `(pattern?, limit?) → StateChange[]` from StateChangeLog ring buffer |
| useStateInspector | Composing Hook | Combines state queries + change log for inspector data |

## External Dependencies

Depends on: _platform/state (IStateService, StateChangeLog, useStateSystem hooks).
Consumed by: (pure observer — no downstream dependents).

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/dev-tools/domain.md](../../../../domains/_platform/dev-tools/domain.md)
- **Hub**: [C4 Overview](../../README.md)
