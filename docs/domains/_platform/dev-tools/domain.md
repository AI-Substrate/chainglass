# Domain: Dev Tools (`_platform/dev-tools`)

**Slug**: _platform/dev-tools
**Type**: infrastructure
**Created**: 2026-02-28
**Created By**: Plan 056 — State DevTools Panel
**Parent**: `_platform`
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/dev-tools.md)

---

## Purpose

Developer-facing observability tooling for the Chainglass platform. Provides inspector panels, diagnostic displays, and debug utilities that consume other domains' public contracts without modifying them.

---

## Boundary

### Owns

- **StateInspector** — live state system inspector panel (domains, snapshot, stream)
- **useStateChangeLog** — hook for reading state change history
- **useStateInspector** — composing hook for inspector panel data
- **UI components** — DomainOverview, StateEntriesTable, EventStream, EntryDetail

### Does NOT Own

- **StateChangeLog** — owned by `_platform/state` (state observability primitive)
- **IStateService** — owned by `_platform/state`
- **State types** — owned by `_platform/state`

---

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `StateInspector` | Component | Page route | Main inspector panel |
| `useStateChangeLog` | Hook | Any component needing change history | `useStateChangeLog(pattern?, limit?) → StateChange[]` |
| `useStateInspector` | Hook | StateInspector component | Composing hook for all inspector data |

---

## Source Location

Primary: `apps/web/src/features/_platform/dev-tools/`

| File | Role | Notes |
|------|------|-------|
| `components/state-inspector.tsx` | Main panel | Tabs, footer, demo generator |
| `components/domain-overview.tsx` | Domain list | Expandable property schemas |
| `components/state-entries-table.tsx` | State table | Sorted by updatedAt |
| `components/event-stream.tsx` | Event stream | Pause/resume/clear |
| `components/entry-detail.tsx` | Detail panel | Discriminated union (DYK-34) |
| `hooks/use-state-change-log.ts` | Log hook | useSyncExternalStore on log |
| `hooks/use-state-inspector.ts` | Inspector hook | Composing hook |
| `index.ts` | Barrel exports | Public API |

---

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/state` | IStateService, StateChangeLog, StateChangeLogContext, useStateSystem | All state introspection |

### Domains That Depend On This

None — pure consumer/observer.

---

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 056 | Domain created. StateInspector panel (Domains/Snapshot/Stream tabs), detail panel, diagnostics footer, demo generator. 18 tests. | 2026-02-28 |
