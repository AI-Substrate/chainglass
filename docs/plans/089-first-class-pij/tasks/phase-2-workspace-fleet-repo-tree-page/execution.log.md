# Phase 2 — Workspace fleet + repo tree page · execution log

**Coder**: pij-miserable-nigel · **Branch**: `main` (no commits — the orchestrator owns git)
**Dossier**: `tasks.md` (T001–T007, validated; roadrunner rulings applied mid-build — see T002/T004)
**Design reference**: `scratch/pij-observatory-poc.html` (ratified 2026-07-26)

---

## T001 — Wiring: channel, page shell, nav row

Three additive edits and two new files.

| File | Change |
|------|--------|
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | `'pij'` appended to `WORKSPACE_SSE_CHANNELS` (6 → 7 of MAX_CHANNELS 20) |
| `apps/web/src/lib/navigation-utils.ts` | one `WORKSPACE_NAV_ITEMS` row (`pij` → `/pij`, `Radar` icon) + its import |
| `apps/web/app/(dashboard)/workspaces/[slug]/pij/page.tsx` | new server component |
| `apps/web/src/features/089-first-class-pij/components/pij-page-client.tsx` | new client shell, two tabs |

`dashboard-sidebar.tsx` untouched — it renders `WORKSPACE_NAV_ITEMS`, so the row is enough.

**The workspace PATH.** `WorkspaceProvider` does not expose the workspace's filesystem path (its context
carries slug, name, emoji, colour and a worktree *identity*, not a path), and the dossier's fence caps
app-shell edits at the two rows above — so adding a field to the provider was not available. The page
therefore resolves the path exactly as the layout does, through
`WORKSPACE_SERVICE.list()` → `.toJSON().path`, and prefers a `?worktree=` search param when present.
That parameter is an already-resolved absolute path (the sibling `workflows/page.tsx` reads it the same
way), so honouring it is *narrowing to a more specific real path*, never rebuilding one from the slug.
A workspace with no recorded path renders a designed state rather than guessing.

`test/unit/web/pij/page-wiring.test.ts` pins all of it, including the negative: the page must not
contain `workspacePath={slug}`. The channel-list assertion exists because its failure mode is silent —
without `'pij'` in that array `useChannelEvents('pij', …)` receives nothing, forever, with no error.

---

## T002 — `use-pij-fleet` (TDD, RED first)

The one ordering contract. Written test-first against a deliberately naive first cut (fetch, then
apply every delta unfiltered) so the two required tests could be seen failing for the stated reason.

### RED — verbatim

```
 RUN  v3.2.4 /Users/jordanknight/substrate/chainglass

 ❯ test/unit/web/pij/use-pij-fleet.test.tsx (15 tests | 4 failed) 1752ms
   ✓ usePijFleet — acquisition > asks each route for the workspace PATH, never the slug 61ms
   ✓ usePijFleet — acquisition > exposes the snapshot rows, tree and status 54ms
   ✓ usePijFleet — acquisition > reports a failed fleet read as degraded, with the pij code kept verbatim 53ms
   × usePijFleet — the ordering contract > neither loses nor double-applies a delta that arrives before the snapshot (the race) 7ms
     → expected { id: 'pij-pm-cheetah', …(17) } to deeply equal { id: 'pij-pm-cheetah', …(14) }
   ✓ usePijFleet — the ordering contract > drops a buffered delta the snapshot already reflects (seq <= snapshot.seq) 3ms
   ✓ usePijFleet — the ordering contract > keeps applying live deltas that repeat a seq — the slow loop does not advance the cursor 54ms
   ✓ usePijFleet — the ordering contract > replaces rows whole — a field the replacement omits is gone, never merged 54ms
   ✓ usePijFleet — the ordering contract > applies `removed` unconditionally, without consulting the workspace 53ms
   ✓ usePijFleet — the ordering contract > updates status from a poller-status event 54ms
   × usePijFleet — workspace containment of global deltas > keeps foreign rows out and says so: zero BY FILTER, not zero by absence 54ms
     → expected [ …(2) ] to deeply equal []
   ✓ usePijFleet — workspace containment of global deltas > counts nothing as filtered when the delta belongs here 53ms
   × usePijFleet — workspace containment of global deltas > rejects a sibling directory that shares the workspace prefix 54ms
     → expected [ { id: 'pij-sibling-lark', …(12) } ] to deeply equal []
   × usePijFleet — tree freshness > refetches the tree, debounced, when a delta introduces an id the tree has never seen 1060ms
     → expected 1 to be 2 // Object.is equality

 Test Files  1 failed (1)
      Tests  4 failed | 11 passed (15)
```

The race failure is the contract violation itself: the raced delta's row (`currentTask: 'raced task'`)
was **lost** — the snapshot overwrote it, and the received value is the snapshot's own row. The two
containment failures are foreign rows entering `rows` with `filteredOut` stuck at 0, i.e. zero-by-absence
where the ruling requires zero-by-filter.

### What the real implementation does

1. **Subscribe before fetch, replay from a mark.** `useChannelEvents`' effect registers first (hook
   order); the fetch effect follows. The message index is captured *before* the request leaves, and the
   snapshot rewinds the applied index to that mark, so everything that raced the fetch is replayed.
2. **The seq guard is a replay guard only.** A correction found while going green: `tickSlow` stamps
   deltas with the *current cursor seq*, which record-only changes never advance, so consecutive record
   refreshes carry the SAME seq. Applying `seq <= snapshot.seq` to live events would drop every record
   refresh after the first — gauges frozen, page looking healthy. The guard is therefore asked only of
   events inside the replay window (`replayUntilRef`).
3. **Containment on the client**, because deltas are global by ruling — with the rejects *counted*
   (`filteredOut`) so T004 can tell "filter dropped everything" from "nothing here".
4. **A replay trigger, not a seq, drives the effect.** `snapshotToken` is bumped per applied snapshot:
   a refresh often returns the same seq, React would bail out of the state update, and the deltas
   buffered during that refetch would never be replayed.

### GREEN

```
 ✓ test/unit/web/pij/use-pij-fleet.test.tsx (17 tests) 896ms
```

(15 at RED; +2 for the global-scope pair added with T003's toggle.)

**New browser-safe containment.** `node:path` does not exist in the browser, so
`lib/folder-containment.ts` reimplements the rule. Two copies of one rule drift, so
`test/unit/web/pij/folder-containment.test.ts` runs BOTH implementations over the same 13-case hazard
table and fails on any disagreement — sibling-with-shared-prefix, trailing slashes, `..` traversal,
case, empty input. The live smoke below confirms they also agree on the real 179-row fleet.

---

## T003 — Fleet view per the ratified POC

`fleet-view.tsx` + `prime-shell.tsx` · `team-section.tsx` · `seat-row.tsx` · `stage-strip.tsx` ·
`role-chip.tsx`, with the grouping extracted to `lib/fleet-grouping.ts` so placement is testable
without a DOM.

- **Grouping comes only from the tree.** A row claiming `prime: true` gets no shell — the test
  `takes structure from the tree alone` pins it.
- **Unplaced rows are shown**, marked `unplaced`, under "Outside any prime". The two reads are taken at
  different instants; hiding a just-spawned seat blanks the screen at exactly the moment someone is
  looking for it.
- **Idle filter**: `lastEventAt` within 48h; **absent/null is SHOWN**; the hidden count is reported
  rather than silently dropped.
- **Role chips are exactly `Prime` | `PM` | `Worker`** — Coder/Reviewer are not rendered, because no
  record attests them (see § Role chips deviation).
- **Scope toggle**: `global` drops the `workspace` parameter *and* the containment filter together, and
  renders a flat list — the tree read is repo-scoped and would place almost none of a machine-wide
  fleet, so drawing sections would imply structure that was never read.
- **The daemon's `stalled` verdict is not printed.** The POC's ratified relabel is used: the seat shows
  `quiet 30m`, the observation underneath the verdict. Asserted negatively (`not.toContain('stalled')`).

### Seat→flow join: the rung-1 evidence (measured live 2026-07-26)

`joinTeamToFlow` was added to `server/join.ts` with the `via`/`confident` doctrine of
`joinFlowToProject`, and rung 1 is implemented. Against today's store it resolves to `via: 'none'` for
every team, and here is exactly why:

| Source | Command | What it carries |
|--------|---------|-----------------|
| the fleet's own source | `pij list --json` (179 rows) | keys are `activity bindHealth boundModel boundProvider dataDir degraded effort failureReason folder id lastEventAt liveness oldPrime pid prime state terminal unadopted watchdog` — **no plan, flow, project, assignment or task field at all** |
| the grouping source | `pij tree --json` | `currentAssignment` (an assignment *id*) and `currentTask` — **no project slug**, so the chain stops one hop short |
| per seat | `pij node show <id> --json` | `assignments[].projectSlug` — a *project* link, reachable only at one process spawn **per seat** (179 per slow loop, against a design whose whole point is ONE) |
| per project | `pij project list --json` | `planPath`, populated for **3 of 17** projects — and **null for `first-class-pij-support-in-the-chainglass-ui`**, this stream's own project |
| the spine | `~/.pij/spine/events.ndjson` | 302 of 19,380 events carry `project`, and **zero of those also carry a peer or `node:` ref** — the fast loop cannot attribute one to a seat either |

So a plan linkage does exist in the pij data model (`pij project set <slug> --plan <path>` →
`project.planPath`), but nothing on the seat side reaches it at acceptable cost, and the one project
this work runs under has not set it. Rung 2 applies: `via: 'none'`, `confident: false`, and the view
draws the POC-ratified "⛭ no flow" with no stage strip. **No name-similarity rung was added** — the
tempting `first-class-pij-support-in-the-chainglass-ui` ≈ `089-first-class-pij` match is the exact join
that is wrong precisely when it is confident, and `never joins on the resemblance…` in `join.test.ts`
makes its absence executable. When a `projectSlug` reaches a row, rung 1 lights up unchanged.

### Role chips — flagged deviation (needs Jordan's ack)

Plan 2.1 lists five chips. Three are rendered. `pij list`/`pij tree` carry no `role` field (flagged to
the pij o-prime; expected additively), so Coder and Reviewer could only be produced by pattern-matching
seat names, models or harnesses — inference, and wrong exactly when a seat is doing something unusual.
Prime (tree `prime`), PM (has children) and Worker (leaf) are all attested by the tree. Ratified by
roadrunner mid-build; recorded here for Jordan at phase review.

---

## T004 — Four empty states

`fleet-empty-state.tsx`, driven by the scoped row count plus the `PollerStatus` already inside the fleet
payload (no second request). The roadrunner ruling that arrived mid-build added the fourth:

| State | Discriminator | Renders |
|-------|---------------|---------|
| `empty` | `rows 0`, running, no error, `fleetSize 0` | "No seats here" |
| `filtered` | `rows 0`, running, no error, **`fleetSize > 0`** | "No seats matched this workspace" + the count elsewhere + **the path being matched** |
| `stale` | `running false`, or `lastRecordsPollAt` older than 3× the slow loop | "The pij reader is not keeping up" |
| `unreadable` | `lastError` set, or a non-2xx from the route | "Store unreadable" + the `E-` code verbatim |

Ordering is deliberate and tested: a failed read outranks a stale one, and a stale reader outranks any
claim about what the fleet contains — a stale reader's row count is not evidence of anything.
`fleetSize` is never the "is this workspace empty" discriminator; the test with `rows: []` and
`fleetSize: 178` asserts state 2, not state 1.

---

## T005 — Provenance + freshness

`freshness.tsx` (`Freshness`, `Provenance`, `ContextGauge`, `StalenessBanner`) plus
`lib/relative-time.ts`. `now` is a parameter everywhere — a component that reads its own clock cannot be
tested at the boundaries, and every boundary here matters.

- `boundModel` renders **pinned** until `bindHealth === 'ok'` confirms it, then **observed**; `effort`
  is always pinned (nothing attests it). An absent value says "not yet observed" rather than nothing.
- `contextCurrent.value === 'unknown'` renders the word **unknown** — asserted never to contain `0`,
  which would turn "the transcript could not be read" into "this seat has used no context".
- Absent/unparseable timestamps render `—`, never `0s ago`, which would claim freshness.
- The staleness banner fires past 24s (3 × the 8s slow loop) and distinguishes *never polled* from
  *polled a while ago*.

---

## T006 — Repo tree tab

`repo-tree.tsx` draws `PijTreeNode.children` and computes nothing about structure. **Allowlist
rendering**: only `id`, `folder`, `harness`, `unadopted`, `prime` can reach the DOM, so an additive
field the CLI grows tomorrow cannot leak.

The DOM audit test asserts over rendered HTML (not over source) that no `pid`, `paneId`, `dataDir` or
`eventsPath` — value *or* field name — appears, plus a regex for anything pane-id-shaped (`%\d{3,}`).
The fixture nodes deliberately carry all of them; an audit over sanitised input proves nothing. 400 and
503 render as two different designed states: "no workspace to read" is not "the store failed".

---

## T007 — Validation

### Gates, by my own hand

| Gate | Result |
|------|--------|
| `pnpm vitest run test/unit/web/pij/` | **15 files, 225 passed** (Phase 1 left 124 in 8 files) |
| `npx tsc -p tsconfig.test.json --noEmit` | **exit 0** |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | **exit 0** |
| `pnpm build` | **exit 0**, `/workspaces/[slug]/pij` present in the route manifest |
| `npx biome check <touched paths>` | clean |
| `test/integration/web/dashboard-navigation.test.tsx` | **3 failed** — unchanged from the PM-flagged baseline |

```
 Test Files  15 passed (15)
      Tests  225 passed (225)
```

```
@chainglass/web:build: ✓ Compiled successfully in 7.9s
@chainglass/web:build: ├ ƒ /workspaces/[slug]/pij
 Tasks:    7 successful, 7 total
```

```
 Test Files  1 failed (1)
      Tests  3 failed (3)      ← dashboard-navigation, pre-existing, count unchanged
```

### Live smoke — real store, read-only, no dev-server restart

Ran the feature's own modules against `~/.pij` (one `pij list`, one `pij tree`, one spine read, then the
real joins and grouping):

```
--- LIVE SMOKE (read-only) ---
pij list      : 179 rows in 451ms
pij tree      : 3 roots in 528ms
spine read    : 19528 new events, seq 19883, skipped 0, missing false, 18ms
workspace scope: 8 rows (server rule) / 8 rows (browser rule) — agree: true
grouping      : 1 prime shell(s), 1 loose section(s), 8 seats drawn, 0 hidden by the 48h filter
seat uniqueness: every seat drawn exactly once
  prime pij-chief-roadrunner governs 2 section(s), 7 seats
    section pij-cheap-cheetah: 3 seat(s) — PM the first-class pij UI stream: pre-amble discovery only, no product code
    section pij-recent-porpoise: 3 seat(s) — PM teardown-followups: ADR-0007 supersede, delete Workgraphs domain, test-tree typecheck gate, deferred store tidy
  loose pij-awkward-mongoose: 1 seat(s)
C-03 check    : forbidden fields on view rows: none
```

The smoke found a real gap that no fixture would have — **corrected post-hoc by the PM after
roadrunner measured the store directly**: the `currentTask` key is **NOT PRESENT in the `pij list`
row projection at all** (179/179), while the underlying field **is populated** — `pij node show`
returns it (e.g. `currentTask: 'PM the first-class pij UI stream: …'`). The original log entry said
"carries no `currentTask`", reading an absent key as an empty value — *empty* and *not present* are
different claims, and only one is a measurement (`field in row`, not `not row.get(field)`). The
wrong version pointed at waiting for population that had already happened; the correct ask (relayed
to dove) is projection: add the existing populated field to the `list` output, since the per-seat
alternative is 179 × `node show` ≈ 80s per refresh — a fan-out we must not do. The in-repo fix
stands regardless: `seatTask()` prefers the row and falls back to the tree node — both records,
neither inferred — pinned by two tests. The section titles above are that fix working.

### AC coverage demonstrated

| AC | Where |
|----|-------|
| AC-01 (headless half) | live smoke: spine read 18ms / 19,528 events, `pij list` 451ms, `pij tree` 528ms — one slow loop (8s) is two orders of magnitude clear |
| AC-03 | `fleet-view.test.tsx` columns + absent-badge + `puts no pid or pane id in the DOM`; `repo-tree.test.tsx` DOM audit |
| AC-04 | `folder-containment.test.ts` (both implementations, 13 hazard cases) + live smoke (server and browser rules agree on 179 real rows) |
| AC-05 (repo half) | `repo-tree.test.tsx` |
| AC-08 | `fleet-empty-state.test.tsx` — all five states, five distinct `data-reason`s (the fifth, `all-idle`, added in fix round 1) |
| AC-09 | `freshness.test.tsx` — banner, pinned/observed, unknown-not-zero |

### AC-01 browser probe — for PM/Jordan at phase review

Cannot be run here (no dev-server restart, and the in-browser half needs a real EventSource):

1. Open `/workspaces/chainglass/pij`. Confirm the Fleet tab lists the prime shell for
   `pij-chief-roadrunner` with its two sections.
2. DevTools → Network → filter `EventSource`. Confirm **exactly one** `/api/events/mux` stream for the
   whole browser, with `pij` among its channels (leader election, ADR-0015).
3. In a terminal: `pij spawn --harness claude` inside this repo. Start a stopwatch.
   **Expect the new seat within ≤10s** (one slow loop + render); it appears first under "Outside any
   prime" marked `unplaced`, then moves into place after the debounced tree refetch (~1.5s later).
4. `pij task set <new-id> "probe"` → the seat's task line appears without a page reload.
5. Watch the seat's observed column during work. **Expect a badge/state transition within ≤3s** (the 2s
   fast loop + render).
6. `pij close <new-id>` → the seat leaves the view on the next slow loop (`removed[]`).
7. Toggle to "all (hot tier)": expect a flat list of ~179 seats, no prime shells.
8. Open a second tab on a DIFFERENT workspace. Confirm neither tab shows the other's seats, and that
   the first tab's "N updates filtered out" counter rises as the other workspace's seats change — the
   client-side containment doing its designed job, visibly.

---

## Files

**New** — `apps/web/app/(dashboard)/workspaces/[slug]/pij/page.tsx`;
`apps/web/src/features/089-first-class-pij/`: `hooks/use-pij-fleet.ts`,
`lib/{folder-containment,fleet-grouping,relative-time}.ts`,
`components/{pij-page-client,fleet-view,prime-shell,team-section,seat-row,stage-strip,role-chip,freshness,fleet-empty-state,repo-tree}.tsx`;
`test/fakes/fake-pij-api.ts`; `test/fixtures/pij/fleet-ui.ts`;
`test/unit/web/pij/{use-pij-fleet,fleet-view,fleet-empty-state,freshness,repo-tree}.test.tsx`,
`test/unit/web/pij/{folder-containment,page-wiring}.test.ts`.

**Modified (additive only)** — `layout.tsx` (one channel), `navigation-utils.ts` (one nav row),
`server/join.ts` (`joinTeamToFlow`), `types.ts` (`TeamFlowJoin`, `NO_TEAM_FLOW`),
`test/unit/web/pij/join.test.ts` (+6), `test/unit/web/pij/fence.test.ts` (+3, browser-half assertions —
weakened nothing).

Nothing committed; git remains the orchestrator's.

---

## Fix round 1 — terra review, verdict FIX_REQUIRED (2026-07-26)

Packet: `scratch/pij-firstclass-packets/p2-fix-1.md`. Exactly three findings, all confirmed against
source before touching anything. RED first on all three.

### RED — the three findings reproduced

`pnpm vitest run test/unit/web/pij/{use-pij-fleet,fleet-view,fleet-empty-state}.test.tsx`

```
 ❯ test/unit/web/pij/use-pij-fleet.test.tsx (18 tests | 1 failed) 971ms
   × usePijFleet — retention > keeps applying deltas past the channel's default 1000-message retention cap 67ms
 ❯ test/unit/web/pij/fleet-view.test.tsx (26 tests | 5 failed) 225ms
   × FleetView — grouping > lets the TREE win when an in-tree row disagrees about being prime 6ms
   × seatRole — the tree is the only structure record > never derives Prime from a fleet row 1ms
   × seatRole — the tree is the only structure record > renders an unplaced row as a Worker until the tree adopts it 0ms
   × FleetView — the idle filter > says the seats here are all idle rather than claiming none matched this workspace 4ms
   × FleetView — scope toggle > never makes a workspace-scoped claim while scoped to the whole machine 1ms
 ❯ test/unit/web/pij/fleet-empty-state.test.tsx (12 tests | 4 failed) 31ms
   × FleetEmptyState > state 5: the seats are here and the idle filter is hiding every one of them 3ms
   × FleetEmptyState > never claims "no seats matched this workspace" while scoped to the whole machine 3ms
   × FleetEmptyState > ranks a failed read above a stale one, a stale reader above any count, and the idle filter above the workspace filter 1ms
   × FleetEmptyState > gives the five states five different test ids — they must never look alike 5ms

 Test Files  3 failed (3)
      Tests  10 failed | 46 passed (56)
```

**Finding 1, the freeze, reproduced exactly as specified** — the assertion diff is the bug in one line:

```
 FAIL  test/unit/web/pij/use-pij-fleet.test.tsx > usePijFleet — retention > keeps applying deltas past the channel's default 1000-message retention cap
AssertionError: expected 'delta-1000' to be 'delta-1001' // Object.is equality

Expected: "delta-1001"
Received: "delta-1000"
```

Message 1,001 never arrives at the view. The page keeps its `live` phase throughout.

**Finding 2** rendered the false claim verbatim — the RED output printed the card it should not have:

```
 FAIL  test/unit/web/pij/fleet-view.test.tsx > FleetView — scope toggle > never makes a workspace-scoped claim while scoped to the whole machine
AssertionError: expected <div …(3)><h4 …(1)></h4>…(3)</div> to be null
+ Received:
<div class="…" data-reason="filtered" data-testid="fleet-empty-filtered">
  <h4 class="mb-1 font-medium">◌ No seats matched this workspace</h4>
```

### The test that had to be written honestly (finding 1)

The packet allowed a simulation. A simulation would have been the weaker artefact here, because the
fault is *in the interaction* between the sliding array and the index cursor — so the test drives the
real `useChannelEvents` and really crosses the cap. What it does have to get right is the **shape** of
the crossing:

- the first 1,000 events are delivered inside **one** `act()`, so the cursor reaches exactly the cap
  before the next event arrives;
- event 1,001 is delivered in its own `act()`.

Delivering all 1,001 in a single batch would have gone green against the broken code: the slide keeps
the *last* 1,000, so the final event is still inside the window on a first pass from cursor 0. The
comment in the test says this, because a later reader tidying it into one loop would silently disarm
it. A third event (1,002) proves the cursor is tracking rather than parked.

### The fixes

| # | Sev | Fix | Where |
|---|-----|-----|-------|
| 1 | HIGH | Subscribe with `{ maxMessages: 0 }` — documented unbounded in `use-channel-events.ts:18` | `use-pij-fleet.ts` |
| 2 | MED | `FleetEmptyState` takes **two** counts (`visibleCount` = drawn, `rowCount` = scoped snapshot pre-idle-filter) plus `scope`; new fifth state `all-idle`; `filtered` is gated to workspace scope | `fleet-empty-state.tsx`, `fleet-view.tsx` |
| 3 | MED | Prime derives from `node.prime` alone, in both places | `fleet-grouping.ts`, `role-chip.tsx` |

**On finding 2's ordering.** The new state sits between `stale` and `filtered`: a stale reader still
outranks it (its counts are not evidence of anything), but having seats outranks the workspace filter,
because a workspace that HAS seats can never be one that matched none. Pinned by
`ranks a failed read above a stale one…`, which now asserts all four rungs of the ladder.

**On finding 3's consequence.** A row the tree has not placed at all now renders `Worker` even when
`row.prime` is set, and that is the intended reading: an unplaced row has no attested structure, and a
Prime chip on a seat no tree has adopted is the same unearned claim by a different route. Stated in
the `role-chip.tsx` doc block and pinned by `renders an unplaced row as a Worker until the tree adopts it`.

### GREEN — gates, run by my own hand

```
$ pnpm vitest run test/unit/web/pij/
 Test Files  15 passed (15)
      Tests  233 passed (233)
VITEST-PIJ EXIT 0

$ npx tsc -p tsconfig.test.json --noEmit
TYPECHECK-TEST EXIT 0

$ npx tsc --noEmit -p apps/web/tsconfig.json
TYPECHECK-WEB EXIT 0

$ npx biome check apps/web/src/features/089-first-class-pij/ test/unit/web/pij/
Checked 40 files in 25ms. No fixes applied.        (clean)

$ pnpm build
BUILD EXIT 0
@chainglass/web:build: cache miss, executing 9eebf3aecfa26fed
@chainglass/web:build: ✓ Compiled successfully in 8.3s
@chainglass/web:build: ├ ƒ /workspaces/[slug]/pij

$ pnpm vitest run test/integration/web/dashboard-navigation.test.tsx
 Test Files  1 failed (1)
      Tests  3 failed (3)                          (the PM-flagged baseline, unchanged)
```

233 tests, up from 225: +8 (1 retention, 4 prime/role, 3 empty-state). Nothing weakened — `fence.test.ts`
still 13 assertions, and the empty-state suite grew from four states to five. The AC-08 row in the AC
coverage table above now reads five states, five distinct `data-reason`s.

Nothing committed.
