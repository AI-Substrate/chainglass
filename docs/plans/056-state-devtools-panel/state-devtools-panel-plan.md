# State DevTools Panel Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-27
**Spec**: [state-devtools-panel-spec.md](./state-devtools-panel-spec.md)
**Status**: COMPLETE

## Summary

Build a live state inspector panel accessible from the Dev sidebar. Shows registered domains, current state entries, and a real-time change log accumulated from app boot. Pure consumer of the existing GlobalStateSystem API — no state system changes needed. StateChangeLog ring buffer mounts in the provider to capture history before the inspector opens.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/dev-tools` | **NEW** | own | Feature home — inspector components, hooks, StateChangeLog |
| `_platform/state` | existing | consume | IStateService, useStateSystem, hooks, StateContext |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/lib/state/state-change-log.ts` | `_platform/state` | internal | Ring buffer accumulating StateChange entries from boot, with own subscribe/version |
| `apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts` | `_platform/dev-tools` | contract | Hook exposing log entries with optional pattern/limit filter |
| `apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts` | `_platform/dev-tools` | internal | Hook composing domains, entries, diagnostics for the panel |
| `apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx` | `_platform/dev-tools` | internal | Main panel — tabs for domains/state/stream, detail panel |
| `apps/web/src/features/_platform/dev-tools/components/domain-overview.tsx` | `_platform/dev-tools` | internal | Domain list with expandable property schemas |
| `apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx` | `_platform/dev-tools` | internal | Current state table sorted by recency |
| `apps/web/src/features/_platform/dev-tools/components/event-stream.tsx` | `_platform/dev-tools` | internal | Live event stream with pause/resume/clear |
| `apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx` | `_platform/dev-tools` | internal | Detail panel for selected entry/event |
| `apps/web/src/features/_platform/dev-tools/index.ts` | `_platform/dev-tools` | contract | Barrel exports |
| `apps/web/app/(dashboard)/dev/state-inspector/page.tsx` | `_platform/dev-tools` | internal | Route page component |
| `apps/web/src/lib/navigation-utils.ts` | `file-browser` | cross-domain | Add State Inspector to DEV_NAV_ITEMS |
| `apps/web/src/lib/state/state-provider.tsx` | `_platform/state` | cross-domain | Mount StateChangeLog inside GlobalStateProvider |
| `test/unit/web/dev-tools/state-change-log.test.ts` | `_platform/dev-tools` | internal | StateChangeLog unit tests |
| `test/unit/web/dev-tools/state-inspector.test.tsx` | `_platform/dev-tools` | internal | Component + hook tests |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | No `/dev/` route directory exists — existing dev pages use `/demo/`. Need to create `/dev/state-inspector/` route. | Create `apps/web/app/(dashboard)/dev/state-inspector/page.tsx` |
| 02 | High | `'*'` global pattern IS supported by the path matcher (5 pattern types from Plan 053 Phase 1). StateChangeLog can safely `subscribe('*', cb)`. | Use `subscribe('*', cb)` in StateChangeLog — no workaround needed |
| 03 | High | Missing shadcn/ui components: scroll-area, collapsible, badge. `status-badge.tsx` exists as custom alternative. | Use native HTML/Tailwind for scroll and collapsible. Use existing `status-badge.tsx` or simple span+className for badges. No new dependencies. |
| 04 | Medium | No existing ring buffer / changelog class in codebase. Agent event log (`agent-events-to-log-entries.ts`) transforms stored events but doesn't accumulate them. | Build lightweight StateChangeLog class (~40 LOC) with circular array |
| 05 | Medium | DYK-17: subscribing to `'*'` causes getSnapshot on every publish. The StateChangeLog subscribes once at boot (not via useSyncExternalStore), so this is fine — it's a plain callback, not a hook. | StateChangeLog uses raw `subscribe()`, not hooks. No performance concern. |

## Implementation

**Objective**: Build a state inspector page at `/dev/state-inspector` with domain overview, current state table, live event stream from boot, and entry detail panel.
**Testing Approach**: Full TDD, fakes only (FakeGlobalStateSystem via StateContext injection)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create `StateChangeLog` — ring buffer class | `_platform/state` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-change-log.ts` | Class with `append(change)`, `getEntries(pattern?, limit?)`, `clear()`, `size`, `subscribe(cb) → unsubscribe`, `version` counter. Configurable cap (default 500). FIFO eviction. | AC-23. DYK-31: in state domain. DYK-32: own subscribe + version. |
| [x] | T002 | Create `StateChangeLog` unit tests | `_platform/state` | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts` | Tests: append, FIFO eviction, pattern filter, limit, clear, size, subscribe, version. RED first. | AC-23. |
| [x] | T003 | Mount StateChangeLog in GlobalStateProvider | `_platform/state` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx` | Provider creates StateChangeLog alongside GlobalStateSystem, subscribes to `'*'`, provides log via context. | AC-26. Cross-domain edit. Add StateChangeLogContext export for test injection. |
| [x] | T004 | Create `useStateChangeLog` hook | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts` | Hook: `useStateChangeLog(pattern?, limit?) → StateChange[]`. Reads from StateChangeLogContext. Subscribes to system for live updates to trigger re-render. | AC-25. |
| [x] | T005 | Create `useStateInspector` hook | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts` | Hook composing: domains via `listDomains()`, entries via `list('*')`, diagnostics via `subscriberCount`/`entryCount`. Provides pause/resume/clear for event stream. | AC-01, AC-04, AC-16. |
| [x] | T006 | Create `DomainOverview` component | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/domain-overview.tsx` | Renders registered domains with name, description, multiInstance, property count. Expandable rows show property descriptors. Instance count for multi-instance. | AC-01, AC-02, AC-03. |
| [x] | T007 | Create `StateEntriesTable` component | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx` | Table of current entries sorted by updatedAt. Columns: path, value (truncated), time since update. Click row → detail. Domain filter chips. | AC-04, AC-05, AC-06, AC-07. |
| [x] | T008 | Create `EventStream` component | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx` | Scrolling list of StateChange events from log. Compact rows: timestamp, domain, property, value summary. Pause/resume toggle, clear button. Domain filter. Auto-scroll when not paused. | AC-08, AC-09, AC-10, AC-11, AC-12, AC-24. |
| [x] | T009 | Create `EntryDetail` component | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx` | Side panel showing full JSON value, previousValue (for events), domain descriptor context, timestamp. | AC-18, AC-19, AC-20. |
| [x] | T010 | Create `StateInspector` main panel | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx` | Tabs: Domains / Snapshot / Stream. Diagnostics footer. Multi-select domain filter popover. Demo event generator. | AC-16, AC-17, AC-21, AC-22. |
| [x] | T011 | Create barrel exports + page route | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/index.ts`, `/Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/dev/state-inspector/page.tsx` | Page renders `<StateInspector />`. Barrel exports public API. | AC-14. |
| [x] | T012 | Add nav item to DEV_NAV_ITEMS | cross-domain | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/navigation-utils.ts` | Added `{ id: 'state-inspector', label: 'State Inspector', href: '/dev/state-inspector', icon: Activity }`. | AC-13, AC-15. |
| [x] | T013 | Component + hook tests | `_platform/dev-tools` | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-inspector.test.tsx` | 13 StateChangeLog tests + 5 hook tests. FakeGlobalStateSystem injection via StateContext + StateChangeLogContext. | AC-23, AC-25. |

### Acceptance Criteria

- [x] AC-01: Panel displays all registered domains with name, description, multiInstance, property count
- [x] AC-02: Each domain expands to show property descriptors
- [x] AC-03: Domain overview shows instance count for multi-instance domains
- [x] AC-04: Panel displays all current state entries sorted by recency
- [x] AC-05: Each entry shows path, value (formatted), time since update
- [x] AC-06: Entries filterable by domain
- [x] AC-07: Clicking entry shows full detail
- [x] AC-08: Real-time state changes shown via subscribe
- [x] AC-09: Each event shows timestamp, domain, property, value summary, change type
- [x] AC-10: Stream filterable by domain
- [x] AC-11: Pause/resume with buffered count; Clear button
- [x] AC-12: Auto-scroll to newest when not paused
- [x] AC-13: Accessible from Dev sidebar nav item
- [x] AC-14: Route at /dev/state-inspector
- [x] AC-15: Works when sidebar collapsed
- [x] AC-16: Footer shows subscriberCount, entryCount, domain count
- [x] AC-17: Footer updates live
- [x] AC-18: Click entry/event → detail panel with full JSON
- [x] AC-19: Detail shows previousValue for events
- [x] AC-20: Detail shows domain descriptor context
- [x] AC-21: High-frequency updates throttled
- [x] AC-22: No performance degradation for other consumers
- [x] AC-23: StateChangeLog accumulates from boot in ring buffer (500 cap)
- [x] AC-24: Inspector shows historical entries from log
- [x] AC-25: useStateChangeLog(pattern?, limit?) hook
- [x] AC-26: Log mounted in GlobalStateProvider

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| High-frequency updates overwhelm event stream UI | Medium | Medium | Throttle rendering to 100ms intervals; batch updates |
| StateChangeLog memory growth | Low | Medium | Capped at 500 entries, FIFO eviction |
| Modifying GlobalStateProvider (cross-domain) | Low | Low | Minimal change — add log creation + context alongside existing system |
| Missing shadcn/ui components (scroll-area, collapsible) | Low | Low | Use native Tailwind overflow-auto + disclosure pattern |
