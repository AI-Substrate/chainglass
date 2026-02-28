# Research Report: State DevTools Panel

**Generated**: 2026-02-27
**Research Query**: "Dev panel for GlobalStateSystem — live event inspector under Dev sidebar section"
**Mode**: Pre-Plan
**Location**: docs/plans/056-state-devtools-panel/research-dossier.md
**FlowSpace**: Available
**Findings**: 76 across 8 subagents

## Executive Summary

### What We're Building
A developer-facing state inspector panel accessible from the Dev sidebar section. Shows all registered domains, live state entries, real-time change events, and subscription diagnostics — enabling developers to see what's happening across the GlobalStateSystem without reading code.

### Business Purpose
As more domains register with GlobalStateSystem (currently just `worktree`, but workflow, agents, and others will follow), developers need visibility into what's published, what's subscribed, and how state flows. Without this, debugging state issues requires console.log and code reading.

### Key Insights
1. **The API is already sufficient** — `listDomains()`, `list(pattern)`, `subscribe()`, `subscriberCount/entryCount` provide everything needed for a full inspector. No state system changes required.
2. **Sidebar Dev section is trivially extensible** — adding one entry to `DEV_NAV_ITEMS` array and a page component is all that's needed for navigation.
3. **Industry best practice** is a master-detail split pane with filterable event list, color-coded diffs, pause/resume, and virtualized scrolling for high-volume streams.

### Quick Stats
- **New files**: ~5-8 (page, components, hooks)
- **Dependencies**: Zero new — all existing shadcn/ui + state system hooks
- **API changes**: None — pure consumer
- **Prior Learnings**: 15 relevant discoveries from Plan 053
- **Domains**: 1 new (`_platform/dev-tools` or inline in feature folder)

## How It Currently Works (State System)

### Entry Points for Devtools

| Method | Type | Location | Purpose |
|--------|------|----------|---------|
| `listDomains()` | Introspection | IStateService | Enumerate all registered domains with metadata |
| `list(pattern)` | Query | IStateService | Get all entries matching a pattern |
| `listInstances(domain)` | Query | IStateService | Get all instance IDs for a domain |
| `get<T>(path)` | Query | IStateService | Read single value |
| `subscribe(pattern, cb)` | Live | IStateService | Real-time change notifications |
| `subscriberCount` | Diagnostic | IStateService | Active subscription count |
| `entryCount` | Diagnostic | IStateService | Total entries in store |

### Data Available for Display

**StateDomainDescriptor** (self-documenting):
```typescript
{ domain: 'worktree', description: '...', multiInstance: true,
  properties: [{ key: 'branch', description: '...', typeHint: 'string' }] }
```

**StateEntry** (queryable):
```typescript
{ path: 'worktree:chainglass:branch', value: 'main', updatedAt: 1735289123456 }
```

**StateChange** (live stream):
```typescript
{ path: '...', domain: 'worktree', instanceId: 'chainglass', property: 'branch',
  value: 'main', previousValue: 'develop', timestamp: 1735289123456 }
```

### Current Dev Sidebar

Dev section is in `dashboard-sidebar.tsx` lines 207-244, toggled via `devOpen` state. Items come from `DEV_NAV_ITEMS` in `navigation-utils.ts` (7 existing items). Adding the state inspector requires one new entry.

## Architecture & Design Recommendations

### UX Patterns (from Industry Research)

| Pattern | Source | Recommendation |
|---------|--------|----------------|
| Master-detail split pane | Redux DevTools, Chrome Network | Event list on left/top, detail panel on right/bottom |
| Faceted domain filters | Sentry, Datadog | Toggle chips for domain filtering, text search with `domain:workflow` syntax |
| Color-coded diffs | Redux DevTools | Green/red/yellow for added/removed/changed values |
| Virtualized scrolling | Chrome Network | Use `@tanstack/react-virtual` for high-volume lists |
| Pause/Resume | Chrome DevTools, Datadog | Buffer events when paused, badge count, batch flush on resume |
| Throttled rendering | Datadog | RAF batching for >100 events/sec, aggregate indicators during bursts |
| Compact table default | Chrome, Sentry | Sortable table with timestamp, domain, property, value summary |
| Keyboard navigation | Redux DevTools | Arrow keys through list, Enter to expand detail |

### Suggested Panel Layout

```
┌─────────────────────────────────────────────────────┐
│ State Inspector           [Pause ▶] [Clear] [Export]│
│ ┌─────────────────────┐ ┌──────────────────────────┐│
│ │ Filter: [________]  │ │ domain:worktree          ││
│ │ [worktree] [all]    │ │ instance: chainglass     ││
│ │                     │ │ property: branch         ││
│ │ 12:03:01 worktree   │ │                          ││
│ │   branch → main     │ │ Value: "main"            ││
│ │ 12:03:01 worktree   │ │ Previous: "develop"      ││
│ │   file-count → 3    │ │ Updated: 12:03:01.456    ││
│ │ 12:03:05 worktree   │ │                          ││
│ │   file-count → 5    │ │ Domain Info:             ││
│ │                     │ │  multiInstance: true      ││
│ │                     │ │  properties: 2           ││
│ └─────────────────────┘ └──────────────────────────┘│
│ Domains: 1  Entries: 2  Subscribers: 3              │
└─────────────────────────────────────────────────────┘
```

### Two Views

1. **Live Event Stream** (default): Scrolling list of StateChange events, newest at top, with domain/instance/property columns. Click to expand detail panel showing full value, previous value, diff.

2. **Current State Snapshot**: Tree view organized by domain → instance → properties, showing current values. Like React DevTools component tree but for state paths.

## Dependencies & Integration

### What Devtools Depends On

| Dependency | Type | Purpose |
|------------|------|---------|
| `_platform/state` | Required | `IStateService` — all introspection methods |
| `@/lib/state` (hooks) | Required | `useStateSystem()`, `useGlobalStateList()` |
| shadcn/ui Table | Required | Event list display |
| shadcn/ui Card | Required | Detail panel container |
| shadcn/ui Tabs | Required | Stream vs Snapshot view toggle |
| shadcn/ui Badge | Optional | Domain filter chips |
| `navigation-utils.ts` | Required | DEV_NAV_ITEMS entry |
| `@tanstack/react-virtual` | Optional | Virtualized scrolling (may defer) |

### Nothing Depends on Devtools
Pure consumer — zero reverse dependencies. Can be tree-shaken from production builds.

## Prior Learnings (From Plan 053)

### Critical for Devtools

| ID | Type | Insight | Action |
|----|------|---------|--------|
| DYK-16 | gotcha | Inline defaults cause infinite re-renders | Pin defaults with `useRef` in any devtools hooks |
| DYK-17 | gotcha | Subscribe with `'*'` causes unnecessary getSnapshot calls | Use pattern-scoped subscriptions per domain tab |
| DYK-19 | gotcha | Unstable subscribe/getSnapshot causes unsub/resub per render | Wrap in `useCallback` with stable deps |
| PL-07 | design | Subscriber errors isolated via try/catch | Devtools panel won't crash if state system errors |
| PL-12 | perf | list() returns stable refs when unchanged | Devtools can safely poll `list()` without extra renders |
| DYK-20 | testing | StateContext exported for test injection | Test devtools with FakeGlobalStateSystem |

### Performance Considerations

- **DYK-17 is critical**: A devtools panel naively subscribing to `'*'` will cause `getSnapshot` on every publish across all domains. Instead, subscribe per-domain or use `list()` polling on a timer.
- **Throttled rendering**: If 100+ events/sec, batch updates on RAF or 100ms interval.
- **Virtualized scrolling**: Only needed if event history grows to 1000+ entries. Defer initially.

## Domain Context

### Placement Decision

The Domain & Boundary Scout recommends **NOT** placing this in `_platform/state` (violates consumer separation). Two options:

1. **Feature folder**: `apps/web/src/features/056-state-devtools/` — simple, co-located with plan
2. **Dev-tools domain**: `apps/web/src/features/_platform/dev-tools/` — extensible for future devtools (event inspector, positional-graph viewer)

**Recommendation**: Start with feature folder (option 1). Extract to `_platform/dev-tools` domain later if more devtools panels emerge.

### Route

`/dev/state-inspector` — fits under existing Dev sidebar section.

## Modification Considerations

### ✅ Safe to Build
- Pure consumer of existing IStateService contract
- Zero changes to state system code
- One-line addition to DEV_NAV_ITEMS
- New page route under `/dev/`
- Standard React component patterns

### ⚠️ Watch For
- Performance with high-frequency updates (throttle/batch)
- Memory growth in event history buffer (cap at N entries)
- Don't subscribe to `'*'` in hooks — use pattern-scoped subscriptions

### Extension Points
- History/timeline requires a new `StateChangeLog` accumulator (not in scope)
- Subscription graph visualization could be a future tab
- Could extend to inspect other domains (events, SDK settings)

## Recommendations

### Phase 1 (MVP)
1. Add `State Inspector` to DEV_NAV_ITEMS
2. Create page at `/dev/state-inspector/page.tsx`
3. **Domain Overview**: List registered domains with property schemas
4. **Current State**: Table of all entries sorted by `updatedAt`
5. **Live Stream**: Subscribe to changes, display in scrolling list
6. **Detail Panel**: Click entry to see full value + metadata
7. **Stats Bar**: subscriber count, entry count, domain count

### Phase 2 (Polish)
1. Domain filter chips
2. Pattern search input
3. Pause/resume with buffered catch-up
4. Value diff display (previousValue vs value)
5. Keyboard navigation

### Phase 3 (Advanced — future)
1. Virtualized scrolling for high volume
2. StateChangeLog accumulator for history
3. Subscription graph visualization
4. Export/import state snapshots

## External Research Opportunities

No critical external research gaps identified. The codebase has all patterns needed (shadcn/ui components, state system API, sidebar infrastructure). Industry UX patterns are well-documented in ER-01 through ER-08 findings above.

## Next Steps

1. Run `/plan-1b-v2-specify` to create the feature specification
2. Run `/plan-2-v2-clarify` to resolve scope questions (MVP vs full)
3. Run `/plan-3-v2-architect` to create implementation phases

---

**Research Complete**: 2026-02-27
**Report Location**: docs/plans/056-state-devtools-panel/research-dossier.md
