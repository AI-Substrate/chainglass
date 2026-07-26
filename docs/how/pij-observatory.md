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

## Key files

| File | Role |
|------|------|
| `apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet.ts` | the page's one data path |
| `apps/web/src/features/089-first-class-pij/components/flows-tab.tsx` | plan list, histogram, three tab-level absences |
| `apps/web/src/features/089-first-class-pij/components/phase-rail.tsx` | the spine, excursions, activations |
| `apps/web/src/features/089-first-class-pij/server/flow-reader.ts` | classification into the five states |
| `apps/web/src/features/089-first-class-pij/server/flow-watcher.ts` | the watch → `refreshFlows` trigger |
| `apps/web/src/lib/sse/use-channel-events.ts` | shared SSE accumulation (`receivedCount` lives here) |
