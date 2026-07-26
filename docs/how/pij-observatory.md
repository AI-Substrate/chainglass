# The pij observatory

A read-only view of the pij fleet and the builder-flow spine, at `/workspaces/[slug]/pij`.

Everything on the page arrives through one hook (`usePijFleet`) talking to three snapshot routes plus
one SSE channel. The browser never reaches the pij CLI or the pij store, and nothing in the feature
writes to either store — `test/unit/web/pij/fence.test.ts` proves both statically on every test run.

## Tabs

| Tab | Shows | Source |
|-----|-------|--------|
| Fleet | seats grouped by the `pij tree` forest, with prime shells and an "outside any prime" band | `/api/pij/fleet` + `fleet-delta` |
| Repo tree | the repo-scoped forest as the CLI reports it | `/api/pij/tree` |
| Flows | every plan folder under `docs/plans`, classified, with the live ones showing a phase rail | `/api/pij/flow` + `flow-delta` |

There is also a **machine-wide** view at `/pij` (outside any workspace) and a **quick-glance overlay**
inside every workspace — both described below.

---

## The flow view (Phase 3)

### Two levels of absence, kept apart

A **plan folder's own state** is a fact about that folder. There are five, and four of them are
absences:

| State | Means | Rendered as |
|-------|-------|-------------|
| `live` | `the-flow.json` present with `provenance` — the CLI can act on it | phase rail |
| `legacy` | present without `provenance` — predates the flow CLI; every verb refuses it with E308 | "needs re-creating", explicitly *not an error* |
| `untracked` | no flow, but artifacts exist — the work happened, the tracking did not | "untracked work" |
| `not-started` | no flow, no artifacts | "nothing started", a designed state |
| `corrupt` | unparseable, or `nav.now` names a node not in `nodes[]` | the reader's `reason`, verbatim |

The **tab** has its own separate question — "why is there no list at all?" — with three answers:
`global-scope` (the flow route requires a workspace, so there is no machine-wide flow view),
`unreadable` (the read failed; the `E-` code is shown verbatim), and `no-plans`. Each gets a distinct
`data-reason`, so no two absences can be mistaken for one another.

Absence is the dominant output, not an edge case. In this repo today: **86 plan folders → 1 live, 2
legacy, 82 untracked, 1 not-started, 0 corrupt.** The five-count histogram leads the tab for exactly
that reason — a view that headlined "1 live flow" would be true and useless.

### The phase rail

Four rules, each because the obvious implementation is wrong:

1. **Order comes from `FlowPhase.order`**, never array position — flow documents store their nodes
   newest-first, so array order draws the plan backwards.
2. **Off-spine nodes are excursions, never rail positions.** An `offSpine` node was unreachable by the
   `next[]` walk; splicing it in would draw an edge the plan never had.
3. **Reviews attach to the phase they `branch_of`,** not to the cursor. In 088 all three reviews branch
   off `ph4` while `nav.now` is `ph6` — hanging them off the cursor would report Phase 6 as
   thrice-reviewed when it has not been reviewed at all.
4. **`activations` are PHASE activations.** Flow data has no seat dimension, so any label naming a
   *who* would be inventing one.

Completion comes from `completion` / `completionSource` and never from the file set: a folder with six
phase directories in it proves nothing about whether the plan is done.

### Deliberate absences

These are decisions, not gaps:

- **No seat dimension on flows.** There is no data joining a seat to a phase. `joinTeamToFlow` reaches
  a plan folder only when a record carries the link, which is why almost every section shows "⛭ no
  flow" rather than a guessed chip.
- **No removal signal on `flow-delta`.** A deleted plan folder emits nothing — the poller broadcasts
  what it *found*. Snapshot refetch (tab change, or `refresh()`) is the deletion path.
- **`nav.next` is advisory.** It fires no event and the CLI never routes on it. Rendered marked as
  advisory, or not at all.
- **A deleted `the-flow.json` is not watched for.** The CLI is the sole writer and never deletes, so a
  vanished document is a `rm`, a branch switch, or the whole folder going — all of which the next
  snapshot covers.

### How live updates reach the page

```
harness flow <verb>            atomic replace of docs/plans/<plan>/the-flow.json
      ↓
flow-watcher (server)          'add' + 'change' burst → debounced 500ms → one call
      ↓
poller.refreshFlows(plansRoot) scans, signature-diffs, broadcasts changed summaries only
      ↓
pij SSE channel                flow-delta { seq, at, flows: FlowSummary[] }
      ↓
usePijFleet                    contains by planDir, merges by planDir
      ↓
Flows tab
```

**The watcher activates at server start.** `startPijPoller()` starts it beside the poller; workspaces
come from `IWorkspaceService.list()` at bootstrap, and a `?worktree=` root registers itself on its
first `/api/pij/flow` request (watch-once). A watcher that cannot start degrades the page to
snapshot-only — still correct, no longer live — and logs; it never fails the boot.

**C-04 holds at runtime, not just statically.** `assertNotPijShaped` *throws* rather than logging if a
path is `~/.pij`-shaped: pij descriptors are rewritten every daemon tick across ~180 seats, which is
precisely the design C-04 rules out. Flow files change a handful of times an hour, which is why they
may be watched at all.

### Channel retention

The `pij` channel retains 1,000 messages and slides. The hook's cursor is therefore an **absolute
count** (`useChannelEvents`' `receivedCount`), not an index into the array: an index into a sliding
buffer stops being behind once the cap is reached, and the page goes silently static while still
reporting itself live.

---

## The global view — `/pij` (Phase 4)

The whole machine, outside any workspace. Two reads, neither scoped: `/api/pij/fleet` with no
parameter and `/api/pij/tree?global=1`.

**The tree and the fleet are not the same set**, and the page is built around that. Measured
2026-07-26:

| Source | Rows | Folders |
|--------|------|---------|
| `pij tree --global` | **52** across 30 roots | 9 |
| `pij list` | **181** | 20 |

The 129 rows the tree does not place are *exactly* the dead ones — every non-dead seat is in the tree
and every absent one is dead, no exceptions in either direction. So each folder section shows its
living seats as a tree, and its dead records in a **collapsed band of their own**, labelled *present
in the store, absent from the tree*. Rendering only the tree would drop two thirds of the machine
without saying so; merging the two would imply the dead have a place in the forest.

The design is the ratified POC's global tab — folder-grouped `<details>`, primes leading each section
— chosen by Jordan from three spike POCs. The alternatives were a windowed flat list with a filter
box and a density board; A was picked, and its cost is accepted knowingly: all rows in the DOM, and
the folder as the only unit of narrowing.

It says **"rows"**, never "live seats". A count of rows is a count of records read; most of them are
dead.

**Snapshot-only, by design and out loud.** `MultiplexedSSEProvider` is mounted in the workspace layout
only, so there is no `pij` channel here and no live update. Instead the page states when it was read,
ages that statement as you look at it, and gives you a button to read again. Past a minute it
escalates to its own rendered staleness state (`data-reason="snapshot-stale"`) rather than leaving a
quiet grey timestamp over a picture of the past. The clock ticks; the data does not move behind it.

**No focus button here.** Containment is checked against a workspace and this page has none, so a
button could not know whether it was allowed. The absence is structural — that branch mounts no
provider.

## The overlay (Phase 4)

A condensed seat list for the current workspace, over whatever you are doing. Three ways in, all of
them the same behaviour because all three dispatch one `pij:toggle` CustomEvent:

| Trigger | Where it lives |
|---------|----------------|
| the sidebar's "pij fleet" button | `dashboard-sidebar.tsx` — outside the overlay providers, which is *why* the event exists |
| the `pij.toggleOverlay` palette command | `sdk/register.ts` (ADR-0009) |
| `$mod+Shift+KeyF` | the same static manifest — the tinykeys map is built once at mount, so a dynamically registered binding would never fire |

It is the **fifth F-14 anchored sibling** (terminal, notes, pr-view, question-popper, pij), copied
from `pr-view` rather than reinvented. The `question-popper` sibling is a known outlier — missing
`isOpeningRef`, its z-index and its anchor measurement — and was deliberately not used as the model.

Three details are load-bearing:

- **State lives in the always-mounted provider, never in the panel.** The panel is a
  `dynamic(ssr:false)` import that can unmount; state kept there would vanish on navigation and the
  overlay would appear to shut itself at random (AC-12).
- **`isOpeningRef`.** Opening dispatches `overlay:close-all` for mutual exclusion (Plan 065) and the
  provider listens for that event. Without the guard, opening closes itself.
- **`zIndex: 44` — the same as the terminal's, not higher.** "Over" comes from opening later plus
  close-all. A higher number would put pij permanently above a terminal you are typing into.

It renders inside the workspace layout's `MultiplexedSSEProvider`, so its list is live. Outside that
provider `useChannelEvents('pij', …)` receives nothing at all, silently.

## Focus: the one mutation (Phase 4)

Everything else in this feature reads. `POST /api/pij/focus` runs `tmux select-window`, and it is the
only thing here that changes the world.

```
row's focus button onClick  ──the only caller──▶  POST /api/pij/focus { seatId }
                                                       │
                                            fresh `pij node show <id>`
                                                       │
                                    execFile('tmux', ['select-window','-t', windowId])
```

**The window id is never accepted from the client.** It is resolved server-side from a fresh read at
click time. A client-supplied id is an instruction to focus an arbitrary window, and tmux recycles
ids, so even an honest stale one points somewhere real and wrong. (`pij list` rows carry no
`windowId` at all — 0 of 181 — so there is nothing cached to be tempted by.)

Six refusals, each with a fixed wording the button renders verbatim:

| Reason | Status | What the human reads |
|--------|--------|----------------------|
| `unknown-seat` | 404 | `no seat <id> in the store` |
| `out-of-workspace` | 409 | `seat <id> works in <cwd>, outside this workspace` |
| `not-live` | 409 | `seat <id> last observed <liveness> at <lastEventAt>` |
| `not-live`, liveness absent | 409 | `liveness not observable for <id>` |
| `no-window` | 409 | `seat <id> has no tmux window on record` |
| `store-unreadable` | 503 | `the pij store could not be read: <E-code> <what pij said>` |
| `tmux-refused` | 503 | `tmux refused to focus <windowId>: <what tmux said>` |

**Every refusal carries its machine `reason`, including the 503.** The button's `data-reason` has
exactly one value that is not a designed state — `failed`, the fallback for a body with no `reason`
at all — and a store failure is the likeliest of them all, so it is the last one that should land
there. The generic `storeUnreadable()` helper the read routes share cannot express this: its body
predates the reason union. Focus builds its own.

**Every distinct cause gets its own member, or the nearest one gets borrowed.** The two 503s are
different failures of different subsystems, and for a while they shared a reason: a tmux refusal
answered `store-unreadable` because the union had no member for it. The observation was honest and
the machine field was not, which is the worse way round — a reader can catch the mismatch, a client
branching on `reason` cannot, and a human debugging it is sent to the wrong subsystem. `FocusReason`
is closed, and the cost of closing it is that adding a cause means adding a member.

**Which of pij's fields carries "what pij said" depends on the code.** Every coded failure (`E-ARG:…`
at the head of the stream, or the `--json` envelope) puts pij's own message in `message`. `E-EXIT`
means pij said nothing structured, and `message` is then node's `Command failed: pij …`, which names
the process rather than the problem — there, stderr is the only real information.

**Absent liveness gets its own sentence** and never borrows `lastEventAt`. A seat can be dead and
recently noisy, or alive and quiet — inferring one axis from the other is wrong in both directions,
and an inference printed beside observations is indistinguishable from one.

**Containment is checked on `cwd`.** `pij list` rows call the working directory `folder`; `node show`
calls it `cwd` and has no `folder` key at all. A check written against the wrong name reads
`undefined` and refuses every seat — a button that always says no, for a reason that looks like
policy.

### A window is not a seat

Measured on the live fleet: **45 seats occupy 25 tmux windows, and 13 of those windows hold two to
four seats each.** A seat is a *pane*; `windowId` names the window containing it. So focusing a seat
usually raises a window that holds other agents too, and `select-window` cannot choose which pane
inside it is active.

`focused @2437` is therefore precise about what happened — it names a **window** — and claims nothing
about panes. Read quickly, though, it can imply the seat itself was surfaced. Selecting the pane would
need `select-pane`, a second pane-touching verb outside what C-06 sanctions and what R-01 is
comfortable with, so it is not done. Known limitation, awaiting a ruling rather than a workaround.

### What focus deliberately cannot do

- **No attach, no keystrokes, no resize** (R-01). An attached client's size clamps and reflows an
  agent's pane, which corrupts the daemon's own liveness read of the agent running in it. Changing
  which window is *visible* touches none of that. The C-02 fence permits exactly one tmux verb, in
  exactly one file, and a companion assertion proves it.
- **No auto-focus.** No effect, timer, or self-firing handler may reach the call — asserted
  statically at both ends, server and client.
- **No retry, no queue.** A failed focus is reported, never re-attempted; a click while another is in
  flight is ignored rather than stacked. Both would move the window more times than the human asked.
- **No button in global scope**, because there is no workspace to check containment against. The
  absence is structural: that branch mounts no provider.

---

## Key files

| File | Role |
|------|------|
| `apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet.ts` | the page's one data path |
| `apps/web/src/features/089-first-class-pij/components/flows-tab.tsx` | plan list, histogram, three tab-level absences |
| `apps/web/src/features/089-first-class-pij/components/phase-rail.tsx` | the spine, excursions, activations |
| `apps/web/src/features/089-first-class-pij/server/flow-reader.ts` | classification into the five states |
| `apps/web/src/features/089-first-class-pij/server/flow-watcher.ts` | the watch → `refreshFlows` trigger |
| `apps/web/src/lib/sse/use-channel-events.ts` | shared SSE accumulation (`receivedCount` lives here) |
| `apps/web/app/api/pij/focus/route.ts` | **the one mutation** — the refusal ladder and the single `select-window` |
| `apps/web/src/features/089-first-class-pij/hooks/use-seat-focus.tsx` | the single client-side focus `fetch`, so "only a click reaches it" is checkable by reading one file |
| `apps/web/src/features/089-first-class-pij/hooks/use-pij-overlay.tsx` | overlay state — in the provider, so it survives navigation |
| `apps/web/src/features/089-first-class-pij/sdk/contribution.ts` | the static command + keybinding manifest (ADR-0009) |
| `apps/web/app/(dashboard)/pij/page.tsx` | the machine-wide view — outside the workspace layout, hence snapshot-only |
| `apps/web/src/features/089-first-class-pij/components/global-tree.tsx` | folder sections, the dead band, and the three global absence states |
| `test/unit/web/pij/fence.test.ts` | the standing proof of every fence above, including the one carve-out |

---

## Everything deliberately not shown

Collected in one place, because each of these looks like a gap until you know why it is a decision.

| Not shown | Why |
|-----------|-----|
| tmux attach, keystrokes, pane resize | R-01 — an attached client reflows the agent's pane and corrupts the daemon's own liveness read |
| Any auto-focus | C-06 — focus happens on a human click or not at all |
| Pane id / pid | Both recycle; they are not identity (C-03) |
| A seat dimension on flows | No data joins a seat to a phase; `agents[]` is unpopulated |
| A removal signal on `flow-delta` | The poller broadcasts what it FOUND; snapshot refetch is the deletion path |
| A deleted `the-flow.json` watch | The CLI is the sole writer and never deletes |
| `nav.next` as a commitment | It is advisory: it fires no event and the CLI never routes on it |
| Live updates on `/pij` | No SSE provider outside the workspace layout — snapshot-only is the designed v1, rendered honestly |
| The archive tier | 1,988 of ~2,184 seats are archived; a history view is a separate product |
| An estimated context gauge | A real value or an honest `unknown`, never an estimate (C-05) |
| needs-human / questions UI | Deferred to plan 073, which is building the platform side |
| **The phase-position chip on `/pij`** | **Absent, not faked.** It needs the seat→flow join (dormant until upstream ships a plan-id flag) AND a flow source (`/api/pij/flow` is workspace-scoped). AC-05's own ruling text sanctions the absence "when no live flow joins" — today that is every seat. It lights up additively when the linkage lands |
| Which *pane* a focused window shows | `select-window` cannot choose one, and `select-pane` is a second pane-touching verb outside C-06. See "A window is not a seat" |
