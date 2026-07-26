# Domain: First-Class pij

**Slug**: 089-first-class-pij
**Type**: business
**Created**: 2026-07-26
**Created By**: Plan 089 — First-Class pij Support in the Chainglass UI
**Status**: active

## Purpose

A **read-only observatory** over the pij agent platform (`~/.pij` registry + spine) and the
`/builder` flight-plan work spine (`docs/plans/*/the-flow.json`), joined and delivered live to the
browser over the existing multiplexed SSE transport.

The governing doctrine, ruled repeatedly during discovery: **report what was observed, never what it
means.** Every field this domain surfaces is either read verbatim from a ruled contract or derived by
a rule written down in that contract — never guessed, never estimated.

## Boundary

### Owns
- **Spine cursor** (`server/spine-cursor.ts`) — an exclusive-`--since` file cursor over
  `~/.pij/spine/events.ndjson`; the only path this domain binds to by *file*
- **CLI record reads** (`server/pij-records.ts`) — `pij list/tree/node show/state --json` via
  `execFile` with fixed argv and a per-call `cwd`; record *paths* are explicitly not stable, so
  records are never read from disk
- **Flow reader** (`server/flow-reader.ts`) — the five ruled absence states of a plan folder
  (`live` · `legacy` · `untracked` · `not-started` · `corrupt`) plus the phase rail, activations and
  review state derived from a live flight plan
- **The join** (`server/join.ts`) — seat↔workspace (descriptor `folder` under workspace `path`) and
  flow↔project (`provenance.plan_id` first, plan-folder convention second, with the join's own
  provenance recorded)
- **Two-loop poller** (`server/pij-poller.service.ts`) — the single server-side reader: a fast spine
  loop and a slow CLI loop, filtering before fan-out
- **The `pij` SSE channel vocabulary** (`types.ts` — `PijChannelEvent`)
- **Snapshot API routes** (`app/api/pij/{fleet,tree,flow,status}`)

### Does NOT Own
- **SSE transport** — belongs to `lib/sse` (mux route, `sseManager`, `useChannelEvents`). This domain
  is a producer on one channel and modifies nothing there.
- **File-watching machinery** (045) — deliberately *not* used against `~/.pij`: descriptors rewrite
  every daemon tick × ~180 seats, so a watcher there is the naive design relocated server-side (C-04).
- **Pane viewing** (064-terminal, 088-remote-view) — a pij pane is never pointed at 064's attach path;
  attaching reflows panes and corrupts the daemon's own liveness classifier.
- **Any mutation of any store.** Nothing owns this *because it must not exist* (C-02).

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `ISpineCursor` | Interface | poller, tests | `read()` → events with `seq >` cursor, advancing it; `seq` getter for restart |
| `createFileSpineCursor()` | Factory | bootstrap | File-backed cursor over a spine directory |
| `IPijRecords` | Interface | poller, routes | `list()`, `tree()`, `nodeShow()`, `state()` — read verbs only |
| `createPijRecords()` | Factory | bootstrap | `execFile`-backed adapter; injectable `PijExecutor` |
| `IFlowReader` | Interface | poller, routes | `read(planDir)` → `FlowSummary`; `scan(plansDir)` → all plan folders |
| `createFlowReader()` | Factory | bootstrap | fs-backed adapter |
| `PijChannelEvent` | Type | poller, browser | The `pij` channel union: `fleet-delta` · `flow-delta` · `poller-status` |
| `FleetRow` | Type | routes, views | One seat. Keyed by `PijId` — carries **no** `paneId` and **no** `pid` |
| `FlowSummary` | Type | routes, views | One plan folder's ruled state |
| `PollerStatus` | Type | routes, views | What AC-08's empty-state trichotomy renders |
| `PijPollerService` | Class | bootstrap, routes | The single reader; `start()`/`stop()`/`snapshot()` |
| `startPijPoller()` | Function | `instrumentation.ts` | HMR-safe bootstrap; idempotent |
| `handlePijFleetRequest` etc. | Handlers | route files, tests | Injectable-deps route cores (`PijRouteDeps`) |

## Ruled Constraints (bind every line in this domain)

| # | Constraint |
|---|---|
| C-01 | No close/`--force`/reap, no daemon restart, no keystrokes to panes, no auto-refreshing pane content |
| C-02 | **Sole-writer fences, one policy**: never write `~/.pij/**`, never write `the-flow.json` / `the-flow.md` / `.the-flow-state.json`. Proven by `test/unit/web/pij/fence.test.ts` |
| C-03 | Never key a row on `paneId` or `pid` (both recycle). pij ids may be single-segment; never pattern-match id shapes |
| C-04 | Never file-watch `~/.pij`. Poll on our clock. (Flow files are the opposite — watching them is intended, Phase 3) |
| C-05 | `effort`/`boundModel` render as *pinned* until observed; context gauge is a value or an honest `unknown`, never an estimate |
| C-06 | tmux window focus only as a direct response to a deliberate human click (Phase 4) |
| C-07 | A vanished record path is a **tier migration**, not a deletion; filter `*.tmp-*` in every directory scan |
| C-08 | Spine `--since` is exclusive; `system-state` events dominate ~100:1 — filter server-side *before* fan-out |
| C-09 | Flow: filter `type == "phase"` (never id patterns); walk `next[]`/`branch_of` (never a rendered chain); tolerate unknown statuses/types; completion is `nav.bag.status`, never the file set; ignore `*.legacy.*` |
| C-10 | Two loops: spine cursor (1–2s) carries transitions; the slow loop (5–10s) carries the freshness axis + context gauges, which have **no** spine events |

## Dependencies

### This Domain Depends On
| Domain | Contract Used | Why |
|--------|-------------|-----|
| `lib/sse` (mux) | `sseManager.broadcast(channelId, eventType, data)` | The only egress to the browser |
| `_platform/auth` | `auth()` | Every `/api/pij/*` route is session-gated, exactly as the mux route is |
| app shell | `instrumentation.ts` `register()` | The bootstrap slot for the fourth singleton |

### Domains That Depend On This
_None yet — Phases 2–4 add the views inside this domain._

## External Contracts Consumed

| Contract | Owner | Bound surface |
|----------|-------|---------------|
| `~/.pij/spine/events.ndjson` + record schema | pij (`pij-platform.md`, § Path stability) | Spine **file** is path-stable and bindable; individual record paths are **not** — read those through the CLI |
| `pij list/tree/node show/state --json` | pij | Read verbs only; chainglass is a registered named read-only consumer |
| `docs/plans/*/the-flow.json` | harness `/builder` flow CLI | The Q2 "safe subset": `schema_version, kind, slug, provenance.{branch,repo,agent,plan_id,created_at}, nav.{now,next,bag}, nodes[].{id,type,label,status,next,branch_of,phase,chore}`, `events[]` |

## Source Location

```
apps/web/src/features/089-first-class-pij/
├── domain.md                       # This file
├── index.ts                        # Barrel exports (contracts)
├── types.ts                        # Channel union + view types (contract)
└── server/
    ├── spine-cursor.interface.ts   # ISpineCursor, SpineEvent (contract)
    ├── spine-cursor.ts             # File-backed cursor (internal)
    ├── pij-records.interface.ts    # IPijRecords, PijExecutor, row shapes (contract)
    ├── pij-records.ts              # execFile adapter (internal)
    ├── flow-reader.interface.ts    # IFlowReader, FlowSummary (contract)
    ├── flow-reader.ts              # fs adapter (internal)
    ├── join.ts                     # seat↔workspace, flow↔project (internal)
    ├── pij-poller.service.ts       # Two-loop poller (internal)
    └── start-pij-poller.ts         # HMR-safe bootstrap (contract)

apps/web/app/api/pij/
├── fleet/route.ts                  # GET snapshot: fleet rows
├── tree/route.ts                   # GET snapshot: session tree
├── flow/route.ts                   # GET snapshot: plan-folder flow states
└── status/route.ts                 # GET poller status (AC-08 trichotomy)

test/
├── fakes/fake-pij-executor.ts      # FakePijExecutor test double
├── fixtures/pij/**                 # Synthetic store (one ruled hazard per fixture)
├── fixtures/flows/**               # Five ruled flow states + kitchen-sink
└── unit/web/pij/*.test.ts          # TDD suites incl. the fence proof
```

## Deliberate Absences (do not "fix" these)

| Not shown | Why |
|-----------|-----|
| `stalled` badge | The string means two different mechanisms today |
| Anomaly badges | The advisory surface has live defects and an open vocabulary |
| Archive tier | 1,988 of ~2,184 seats are archived; a history view is a separate product |
| Pane id / pid | Both recycle — they are not identity (C-03) |
| Seat/agent column in flow views | The dimension does not exist in flow data; `agents[]` is unpopulated until `harness flow agent` lands |
| Estimated context gauge | A value or an honest `unknown` — never an estimate (C-05) |

## History

| Plan | Change | Date |
|------|--------|------|
| 089 Phase 1 | Domain created: spine cursor, CLI record reader, flow reader, join, two-loop poller, `pij` channel, snapshot routes, bootstrap, fence proof | 2026-07-26 |
