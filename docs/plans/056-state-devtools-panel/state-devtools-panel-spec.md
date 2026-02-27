# State DevTools Panel — Live State Inspector

**Mode**: Simple

📚 This specification incorporates findings from `research-dossier.md`

---

## Research Context

Research (76 findings, 8 subagents) established:
- The GlobalStateSystem API is **already sufficient** for full introspection — `listDomains()`, `list(pattern)`, `subscribe()`, `subscriberCount`/`entryCount` cover all devtools needs
- Sidebar Dev section requires **one line** to add a new nav item (`DEV_NAV_ITEMS`)
- Industry UX (Redux DevTools, Chrome Network, Sentry) converges on **master-detail split** with domain filters, pause/resume, and compact event table
- 15 prior learnings from Plan 053 inform performance constraints (DYK-16/17/19 on subscription patterns)

## Summary

**WHAT**: A developer-facing state inspector panel, accessible from the Dev sidebar section, that shows all registered domains, their current state entries, and a live stream of state changes — enabling developers to see what's happening across the GlobalStateSystem in real time.

**WHY**: As domains (worktree, workflow, agents, orchestration) register with GlobalStateSystem, developers need visibility into what's published, what's subscribed, and how state flows. Without this, debugging state issues requires console.log, reading source code, and guesswork. The inspector makes the state system observable — turning an invisible runtime into a visible, filterable, explorable dashboard.

## Goals

- Developers can see **all registered domains** with their schemas (properties, types, singleton vs multi-instance)
- Developers can see **all current state entries** organized by domain, sorted by recency
- Developers can see a **live stream of state changes** as they happen, without page refresh
- Developers can **filter** by domain to focus on specific areas of interest
- Developers can **drill down** into individual entries to see full value, metadata, and domain context
- Developers can **pause/resume** the live stream to analyze a moment in time
- The panel is accessible from the **Dev sidebar section** alongside existing dev tools
- The panel has **zero impact on production** — dev-only, no state system changes needed

## Non-Goals

- ❌ Time-travel replay / undo (log is append-only, not reversible)
- ❌ Write capability (no publishing from devtools — read-only inspector)
- ❌ Production monitoring dashboard (this is a dev tool, not ops tooling)
- ❌ SSE/network-level event inspection (focus on state system, not transport)
- ❌ Subscription graph visualization (future enhancement)
- ❌ Virtual scrolling for massive event lists (defer until volume demands it)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/dev-tools` | **NEW** | **own** | Feature home — `apps/web/src/features/_platform/dev-tools/`. Extensible for future devtools panels. |
| `_platform/state` | existing | **consume** | Primary data source — `IStateService` for introspection, hooks for live data |
| `_platform/panel-layout` | existing | **consume** | May use `Card`/`Table` UI components (no changes to domain) |

File placement: `apps/web/src/features/_platform/dev-tools/` with route at `apps/web/app/(dashboard)/dev/state-inspector/page.tsx`.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=1 → Total P=3
  - **S=1** (Surface Area): ~5-8 new files in one feature folder + 1 nav item + 1 route
  - **I=0** (Integration): Zero external dependencies — all internal state system APIs
  - **D=0** (Data/State): No schema changes — reads existing state store
  - **N=0** (Novelty): Well-specified from research — clear UX patterns from Redux/Chrome DevTools
  - **F=1** (Non-Functional): Must handle high-frequency updates without overwhelming UI — needs throttling
  - **T=1** (Testing): Component tests with FakeGlobalStateSystem injection
- **Confidence**: 0.85
- **Assumptions**: State system API remains stable; shadcn/ui components exist for table/card/tabs
- **Dependencies**: Plan 053 GlobalStateSystem (complete)
- **Risks**: Performance with high-frequency state updates (mitigated by throttling/batching)
- **Phases**: 2 phases — core inspector (domain overview + current state + live stream), then polish (filters, pause/resume, drill-down detail)

## Acceptance Criteria

### Domain Overview

- **AC-01**: Panel displays all registered domains via `listDomains()` with name, description, multiInstance flag, and property count
- **AC-02**: Each domain expands to show its property descriptors (key, description, typeHint)
- **AC-03**: Domain overview shows instance count for multi-instance domains via `listInstances()`

### Current State View

- **AC-04**: Panel displays all current state entries via `list('*')` in a sortable table
- **AC-05**: Each entry shows path, current value (formatted), and time since last update
- **AC-06**: Entries are grouped or filterable by domain
- **AC-07**: Clicking an entry shows full detail: complete value (JSON-formatted), domain descriptor, updatedAt timestamp

### Live Event Stream

- **AC-08**: Panel shows real-time state changes as they occur via `subscribe()`
- **AC-09**: Each change event shows timestamp, domain, property, new value summary, and change type (update/remove)
- **AC-10**: Stream can be filtered by domain
- **AC-11**: Stream can be paused and resumed; paused state shows count of buffered events; "Clear" button wipes the buffer
- **AC-12**: Stream auto-scrolls to newest events (when not paused and not manually scrolled up)

### StateChangeLog (History from Boot)

- **AC-23**: A `StateChangeLog` subscribes to `'*'` at app boot and accumulates `StateChange` entries in a capped ring buffer (default 500)
- **AC-24**: The event stream in the inspector shows historical entries from the log, not just events since panel open
- **AC-25**: Log entries are accessible via a `useStateChangeLog(pattern?, limit?)` hook
- **AC-26**: Log is mounted in `GlobalStateProvider` so it starts accumulating from first render

### Navigation & Integration

- **AC-13**: Panel is accessible from Dev sidebar section via a new nav item
- **AC-14**: Panel route is `/dev/state-inspector`
- **AC-15**: Panel renders correctly when sidebar is collapsed (icon-only mode)

### Diagnostics Footer

- **AC-16**: Panel footer shows live `subscriberCount`, `entryCount`, and registered domain count
- **AC-17**: Footer updates in real-time as state system activity changes

### Detail Panel

- **AC-18**: Clicking a state entry or event opens a detail panel showing the full JSON value
- **AC-19**: Detail panel for events shows previousValue alongside current value for comparison
- **AC-20**: Detail panel shows the domain descriptor context (which domain owns this path)

### Performance

- **AC-21**: High-frequency updates (>50/sec) are throttled/batched so the UI remains responsive
- **AC-22**: Panel does not degrade state system performance for other consumers

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| High-frequency updates overwhelm the event stream UI | Medium | Medium | Throttle rendering to RAF or 100ms intervals; batch updates during bursts |
| Subscribing to `'*'` pattern causes excessive getSnapshot calls | Medium | Medium | Use per-domain subscriptions or poll `list()` instead of global subscribe (per DYK-17) |
| Large JSON values in state entries make table hard to read | Low | Low | Truncate values in table rows; show full JSON only in detail panel |
| Panel memory grows unbounded from event history | Low | Medium | Cap event buffer at configurable limit (e.g., 500 entries); FIFO eviction |

**Assumptions**:
- GlobalStateSystem API (`listDomains`, `list`, `subscribe`, diagnostics) remains stable
- shadcn/ui Table, Card, Tabs, Badge components are available
- Dev sidebar section pattern (collapsible group, DEV_NAV_ITEMS) doesn't change
- No virtualized scrolling needed initially (defer until 1000+ events observed)

## Open Questions

_All resolved — see Clarifications below._

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: User preference — tests first, verified against fakes
- **Mock Usage**: Avoid mocks entirely — fakes only (FakeGlobalStateSystem via StateContext injection)
- **Focus Areas**: Hook behavior (domain listing, entry listing, event stream accumulation), component rendering (table rows, detail panel, pause/resume)
- **Excluded**: E2E browser tests, visual regression

## Documentation Strategy

- **Location**: No new documentation
- **Rationale**: User preference — the dev guide at `docs/how/global-state-system.md` already covers the state system. The devtools panel is self-explanatory UI.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Event Stream UX | UI Pattern | High-frequency event rendering requires careful batching, scroll behavior, and pause/resume mechanics. Getting this wrong causes jank or missed events. | How to batch? What scroll anchor behavior? Pause buffer cap? |

## Clarifications

### Session 2026-02-27

| # | Question | Answer | Spec Update |
|---|----------|--------|-------------|
| Q1 | Workflow Mode | **Simple** — single phase, CS-2 | Added `**Mode**: Simple` to header |
| Q2 | Env gating for inspector | **Always available** — it's just a dev page, no env var needed | Removed env gating from risks; updated non-goals |
| Q3 | Clear button for event stream | **Yes** — show clear button alongside pause/resume | Implicit in AC-11 area |
| Q4 | previousValue display | **Detail panel only** — keep stream compact | Updated AC-19 scope |
| Q5 | File placement | **`_platform/dev-tools`** platform domain — extensible for future devtools | Updated Target Domains |
| — | Testing | **Full TDD, fakes only** (user pre-stated) | Added Testing Strategy section |
| — | Documentation | **No new docs** (user pre-stated) | Added Documentation Strategy section |
| Q6 | Historical events | **Add StateChangeLog** — ring buffer (500 cap) accumulating from boot, mounted in GlobalStateProvider | Added AC-23..AC-26; removed "no history" from non-goals |
