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
- **The observatory views** (Phase 2–3) — the Fleet / Repo tree / Flows tabs, prime shells, seat rows,
  phase rails and the designed absence states behind each
- **The flow watcher** (`server/flow-watcher.ts`, Phase 3) — watches `docs/plans/**` flow documents
  ONLY, and refuses a `~/.pij`-shaped path by throwing (C-04 at runtime, not just statically)
- **The workspace PIJ rail** (Plan 090) — the file-browser left-panel mode, contract-backed
  status/role/question rendering, and the route-aware `pij:toggle` listener used by the explorer,
  sidebar, and ADR-0009 SDK contribution (`pij.toggleOverlay`, `$mod+Shift+KeyF`)
- **`POST /api/pij/focus`** (Phase 4) — **the one and only mutation in this domain.** See the manifest
  entry below; everything else here reads.

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
| `PijChannelEvent` | Type | poller, browser | The `pij` channel union: `fleet-delta` · `flow-delta` · `status-delta` · `poller-status` |
| `FleetRow` | Type | routes, views | One seat. Keyed by `PijId` — carries **no** `paneId` and **no** `pid` |
| `FlowSummary` | Type | routes, views | One plan folder's ruled state |
| `PollerStatus` | Type | routes, views | What AC-08's empty-state trichotomy renders |
| `PijPollerService` | Class | bootstrap, routes | The single reader; `start()`/`stop()`/`snapshot()` |
| `startPijPoller()` | Function | `instrumentation.ts` | HMR-safe bootstrap; idempotent |
| `handlePijFleetRequest` etc. | Handlers | route files, tests | Injectable-deps route cores (`PijRouteDeps`) |
| `usePijFleet()` | Hook | page, rail | The browser's ONE data path: three snapshots + the `pij` channel |
| `createFlowWatcher()` / `notePijFlowWorkspace()` | Factory / fn | bootstrap, flow route | `docs/plans` watch → `refreshFlows`; lazy watch-once registration |
| `PijRailContractSeams` | Interface | poller, grouping, rail hooks/views | The JC-1/2/3 adapter flip point for status, role, and question reads |
| `PijRailView` / `PijRailPanel` | Components | file browser | Dense left-rail roster and its main-checkout-scoped data acquisition |
| `PijRailToggleListener` | Component | workspace layout | Routes `pij:toggle` to `panel=pij`, preserving browser query state or navigating from another workspace route |
| `registerPijSDK()` | Function | `registerAllDomains()` | ADR-0009 command + keybinding registration |
| `handlePijFocusRequest` | Handler | focus route, tests | **The one mutating handler.** `FocusReason` union; `FocusExecutor` seam |

### The one mutation — `POST /api/pij/focus`

| Property | Value |
|----------|-------|
| Effect | `execFile('tmux', ['select-window', '-t', windowId])` — fixed argv, no shell, 3s timeout |
| Trigger | A human clicking the row's focus button. **Nothing else** — no effect, timer, or self-firing handler may reach it, statically asserted at both ends |
| Window id | Resolved server-side from a FRESH `node show` at click time; never accepted from the request |
| Containment | `detail.cwd` (NOT `folder` — `node show` has no such key) against the `workspace` param, same relative-path rule as the fleet join |
| Refusals | `unknown-seat` 404 · `out-of-workspace` 409 · `not-live` 409 · `no-window` 409 · `store-unreadable` 503, each with a fixed observation wording the client renders verbatim |
| Fence | The single carve-out in the C-02 tmux assertion, replaced by a stricter companion (`fence.test.ts`) — proven with planted offenders |

## Ruled Constraints (bind every line in this domain)

| # | Constraint |
|---|---|
| C-01 | No close/`--force`/reap, no daemon restart, no keystrokes to panes, no auto-refreshing pane content |
| C-02 | **Sole-writer fences, one policy**: never write `~/.pij/**`, never write `the-flow.json` / `the-flow.md` / `.the-flow-state.json`. Proven by `test/unit/web/pij/fence.test.ts` |
| C-03 | Never key a row on `paneId` or `pid` (both recycle). pij ids may be single-segment; never pattern-match id shapes |
| C-04 | Never file-watch `~/.pij`. Poll on our clock. (Flow files are the opposite — watching them is intended, Phase 3) |
| C-05 | `effort`/`boundModel` render as *pinned* until observed; context gauge is a value or an honest `unknown`, never an estimate |
| C-06 | tmux window focus only as a direct response to a deliberate human click. **Shipped Phase 4** — both halves audit-tested; `select-window` is the only tmux verb the domain may name, and only in the focus route |
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
| Domain | What it takes | Why |
|--------|---------------|-----|
| app shell (`workspaces/[slug]/layout.tsx`) | `PijRailToggleListener` | One route-aware listener serves every `pij:toggle` trigger |
| app shell (`dashboard-sidebar.tsx`) | nothing — a `pij:toggle` CustomEvent | The sidebar is OUTSIDE the overlay providers; the event is the only seam |
| app shell (`sdk-domain-registrations.ts`) | `registerPijSDK` | ADR-0009 |

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
├── server/
│   ├── spine-cursor.interface.ts   # ISpineCursor, SpineEvent (contract)
│   ├── spine-cursor.ts             # File-backed cursor (internal)
│   ├── pij-records.interface.ts    # IPijRecords, PijExecutor, PijTreeScope, row shapes (contract)
│   ├── pij-records.ts              # execFile adapter; read-verb allowlist (internal)
│   ├── flow-reader.interface.ts    # IFlowReader, FlowSummary (contract)
│   ├── flow-reader.ts              # fs adapter — the five ruled states (internal)
│   ├── flow-watcher.ts             # docs/plans watch → refreshFlows; C-04 refusal (Phase 3)
│   ├── join.ts                     # seat↔workspace, flow↔project, toFleetRow (internal)
│   ├── route-deps.ts               # PijRouteDeps, FocusExecutor, shared responses
│   ├── pij-poller.service.ts       # Two-loop poller (internal)
│   └── start-pij-poller.ts         # HMR-safe bootstrap + watcher singleton (contract)
├── hooks/
│   ├── use-pij-fleet.ts            # the browser's ONE data path (Phase 2–3)
│   ├── use-pij-status.ts           # JC-1 snapshot + live status-delta consumer (Plan 090)
│   ├── use-pij-rail-toggle.tsx     # route-aware pij:toggle listener (Plan 090)
│   └── use-seat-focus.tsx          # the ONLY client-side focus fetch (Phase 4, C-06)
├── components/                     # page shell, fleet view, PIJ rail, prime shells, seat rows,
│   │                               #   flows tab, phase rail,
│   │                               #   global-tree.tsx + pij-global-client.tsx (Phase 4)
│   └── …
├── lib/                            # folder containment, fleet grouping, relative time
└── sdk/
    ├── contribution.ts             # ADR-0009 static manifest (pij.toggleOverlay, $mod+Shift+KeyF)
    └── register.ts                 # registerPijSDK — dispatches the pij:toggle CustomEvent

apps/web/app/api/pij/
├── fleet/route.ts                  # GET snapshot: fleet rows
├── tree/route.ts                   # GET snapshot: session tree — ?workspace= OR ?global=1
├── flow/route.ts                   # GET snapshot: plan-folder flow states
├── status/route.ts                 # GET poller status (AC-08 trichotomy)
└── focus/route.ts                  # POST — THE ONE MUTATION (C-06). The fence's single carve-out.

apps/web/app/(dashboard)/
├── pij/page.tsx                    # the machine-wide view — OUTSIDE the workspace layout,
│                                   #   therefore no SSE and snapshot-only by design
└── workspaces/[slug]/browser/      # left-panel PIJ mode; main checkout path is server-threaded

test/
├── fakes/fake-pij-executor.ts      # the pij CLI double
├── fakes/fake-focus-executor.ts    # the tmux double — records argv, and silence
├── fakes/fake-pij-api.ts           # the three snapshot routes, scriptable + deferrable
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
| tmux attach / keystrokes / resize | R-01: an attached client's size clamps and reflows an agent's pane and corrupts the daemon's own liveness read. Focus changes which window is *visible* and touches none of that |
| Auto-focus of any kind | C-06. A focus nobody asked for moves the human's screen out from under them |
| A removal signal on `flow-delta` | The poller broadcasts what it FOUND; snapshot refetch is the deletion path |
| A second mutating route | v1 has exactly one, by ruling, and the fence is written to make a second one fail |

## History

| Plan | Change | Date |
|------|--------|------|
| 089 Phase 1 | Domain created: spine cursor, CLI record reader, flow reader, join, two-loop poller, `pij` channel, snapshot routes, bootstrap, fence proof | 2026-07-26 |
| 089 Phase 2 | The fleet page: prime shells, containment, seat rows, provenance, the four empty states | 2026-07-26 |
| 089 Phase 3 | The flow view: Flows tab, phase rails, five plan states + three tab absences, the flow watcher, additive `receivedCount` on `useChannelEvents` | 2026-07-26 |
| 089 Phase 4 | Global tree read (`tree --global`) + `--badge` adoption; the machine-wide `/pij` page (snapshot-only by design); the overlay (5th F-14 sibling + ADR-0009); **`POST /api/pij/focus`, the one mutation**, with its fence carve-out and both-ends audit | 2026-07-26 |
| 090 | Replaced the workspace overlay with the file-browser PIJ rail; added JC-1/2/3 seams, live PM status, role-aware grouping, main-checkout scoping, row focus, and route-aware toggle navigation | 2026-07-29 |
