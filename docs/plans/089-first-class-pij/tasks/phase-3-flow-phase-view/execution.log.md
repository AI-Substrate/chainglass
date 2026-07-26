# Phase 3 — Flow phase view · execution log

**Plan**: `docs/plans/089-first-class-pij/first-class-pij-plan.md` (v1.1.0)
**Dossier**: `../phase-3-flow-phase-view/tasks.md` (T001–T007)
**Branch**: `main`, uncommitted — the orchestrator owns git.
**Date**: 2026-07-26

---

## T002 — flow-delta application + retention-debt retirement (TDD)

Done in the dossier's order: **(b) the cursor first, (a) the flow branch second.** They share one
effect body, so doing them the other way round would have meant writing the flow branch against a
cursor that was about to be replaced underneath it.

### (b) The retention debt — RED

Phase 2 retired the freeze by disabling the cap (`maxMessages: 0`) and logged the durable fix as debt
for this phase. Retiring it means putting the cap **back** and making the cursor survive it, so the
RED is produced by the cap alone: `PIJ_CHANNEL_RETENTION = 1_000` restored, index cursor untouched.

Verbatim:

```
 ❯ test/unit/web/pij/use-pij-fleet.test.tsx (20 tests | 2 failed) 2036ms
   × usePijFleet — retention > keeps applying deltas once retention has begun trimming the buffer 65ms
     → expected 'delta-1000' to be 'delta-past-cap' // Object.is equality
   × usePijFleet — retention > replays a delta that raced the fetch even when the buffer has been trimmed since 1067ms
     → expected 'working' to be 'raced-past-the-cap' // Object.is equality

 FAIL  test/unit/web/sse/use-channel-hooks.test.tsx > useChannelEvents > counts every message received, including the ones pruning has since dropped
AssertionError: expected undefined to be 5 // Object.is equality
 FAIL  test/unit/web/sse/use-channel-hooks.test.tsx > useChannelEvents > counts only the subscribed channel, and starts at zero
AssertionError: expected undefined to be +0 // Object.is equality
 FAIL  test/unit/web/sse/use-channel-hooks.test.tsx > useChannelEvents > keeps the count monotonic across clearMessages — it counts arrivals, not survivors
AssertionError: expected undefined to be 3 // Object.is equality

 Test Files  2 failed (2)
      Tests  5 failed | 29 passed (34)
```

`expected 'delta-1000' to be 'delta-past-cap'` is the freeze itself, reproduced: the cursor reaches
1,000, the array stops growing, and every subsequent delta is skipped forever while `phase` still
reads `live`.

**Why the test crosses the cap for real.** The first 1,000 events go in ONE `act()` so the cursor lands
exactly on the cap before event 1,001 arrives. Delivering 1,001 in a single batch would pass against
the broken code — the slide keeps the LAST 1,000, so the final event is still inside the window on the
first pass. That trap is written into the test's comment so a later tidy-up cannot silently disarm it.
A second assertion runs a further 500 events past the cap, because the freeze is permanent rather than
a one-event stutter.

The third retention test is new this phase: the replay window's two ends (`appliedCount`,
`replayUntil`) are positions in the message stream, and the snapshot rewind moves one of them
*backwards*. As array indices both drift as the array slides; as absolute counts neither does. It runs
the Phase 2 race on the far side of the cap, where the two representations disagree.

### (b) The fix — two files, one coordinate

**`apps/web/src/lib/sse/use-channel-events.ts` (ADDITIVE).** The trim happens inside the hook's own
state updater, so from outside "five arrived and three were trimmed" and "two arrived" are the same
observation. `receivedCount` is the missing half — a monotonic total, incremented in the same updater
as the trim so the two can never be read a render apart. Both values now live in one state object for
that reason. `clearMessages()` empties the array and leaves the count alone: it counts arrivals, not
survivors, which is what lets a consumer read the pair as "everything before now is behind me".

**`hooks/use-pij-fleet.ts`.** `appliedIndexRef` → `appliedCountRef`, `replayUntilRef` and the
`bufferedFrom` mark all re-expressed in the same absolute coordinate; `messages` is consulted only for
the tail it still holds. One clamp, documented: if trimming removed events we had not applied (needs
>1,000 messages inside a single fetch window), the effect takes what remains rather than reading past
the start of the array, and the snapshot that closes the window re-establishes the truth. Bounded and
self-healing, versus the index cursor's silent and permanent.

### (b) Existing consumers proven unbroken

Every `useChannelEvents` consumer found by grep — 058 workunit catalog, 088 remote view, 050 workflow
SSE, `lib/state/server-event-route` — plus the hook's own contract suite:

```
 Test Files  21 passed (21)
      Tests  251 passed (251)
```

### (a) The flow-delta branch — RED

```
   × usePijFleet — flow deltas > merges changed-only summaries by planDir, leaving the untouched ones alone 57ms
     → expected 'untracked' to be 'live' // Object.is equality
   × usePijFleet — flow deltas > applies two flow-deltas carrying the SAME seq — both, in order 55ms
     → expected undefined to be 'ph3' // Object.is equality
   × usePijFleet — flow deltas > counts a foreign plan folder into flowsFilteredOut — never into the fleet counter 53ms
     → expected undefined to be 2 // Object.is equality
   × usePijFleet — flow deltas > contains flows by workspace even in global scope — the flow route is workspace-scoped 54ms
     → expected undefined to be 1 // Object.is equality

 Test Files  1 failed (1)
      Tests  4 failed | 21 passed (25)
```

The fifth flow test ("keeps a vanished plan until a snapshot says otherwise") passed in RED, because
with no flow branch at all nothing removes anything. Recorded as-is rather than dressed up: its value
is as a guard against a future removal-inference, and it only becomes load-bearing once the branch
exists.

### (a) Two decisions the dossier left to be made and pinned

**Flow-deltas bypass the seq guard entirely.** The guard compares against the FLEET snapshot's seq, and
that seq says nothing about which flow scans a flow-delta reflects — different reads, different
clocks, and `refreshFlows` stamps a cursor seq that a flow file changing never moves. Applying it here
would drop live flow updates wholesale. The cost is stated where the decision is taken: a flow-delta
that raced the flow fetch can re-apply a summary the snapshot already superseded, which a merge by
`planDir` makes idempotent and the next delta corrects. Losing every live update was the alternative.

**Flow containment is unconditional, unlike the fleet's.** The fleet's containment follows the scope
toggle because the fleet route itself widens. `/api/pij/flow` requires a workspace, so a global-scope
tab still holds exactly one workspace's plans and has no wider set to widen to.

**`flowsFilteredOut` is a separate counter,** never folded into `filteredOut`. The Fleet tab renders
that one as "N updates filtered out (other workspaces)" *about seats*, and it is a sentence a human
reads while wondering where a seat went. Asserted both ways in the same test.

---

## T001 / T003 — the Flows tab, the plan list, the absences

Two blocks in `pij-page-client.tsx` exactly as the Phase 2 report predicted, plus three new
components. `fleet.flows` and `fleet.errors.flows` have their first consumer.

**Two levels of absence, deliberately apart.** A plan folder's own state is one of the reader's five;
the tab's own question — "why is there no list at all?" — has three answers with their own
discriminator (`flowsAbsenceReason`) and their own `data-reason`s: `global-scope`, `unreadable`,
`no-plans`. Global scope outranks a stale error in that ladder, because in global scope the tab has
not asked a question worth failing, and reporting a fault at a capability boundary attributes it to
the wrong thing.

**The five state fixtures are materialized and read by the real `IFlowReader`.** A hand-written
`state: 'legacy'` would let a wrong expectation and a wrong classifier agree with each other. A guard
test asserts the fixture set still covers all five states, so the "five distinct data-reasons" test
cannot quietly start proving less than it claims.

**Test seam added:** `PijPageClient` takes an optional `fetchImpl`, passed straight through to the
hook's existing seam. The tab mechanism lives in the shell rather than the hook, so "a tab change
re-reads the flow snapshot" is only assertable by driving the real shell. Production never sets it.

One artefact worth recording, because it shaped a test rather than the code: Radix activates a tab on
`mousedown` AND on the focus that follows, and inside one `act()` those land in a single React batch,
so the guard that normally makes the second a no-op has not committed yet — `userEvent.click` produced
two `refresh()` calls. Driving `fireEvent.mouseDown` (the one event Radix actually activates on) keeps
the assertion exact instead of settling for "went up by at least one".

---

## T004 — the phase rail (AC-06)

Read against the real 088 fixture, through the real reader:

```
now=ph6  nowPhaseId=ph6  next=ship  completion=active (nav.bag.status)  phases 5/6
ph1..ph6 order 1..6, ph6 in_progress, activations ph1:1 ph2:1 ph3:0 ph4:2 ph5:2 ph6:1
reviews rv4, rv4b, rv4c — all branchOf ph4, all excursion:true
```

The AC-06 trap is `rv4/rv4b/rv4c`: they branch off **ph4** while the cursor sits on **ph6**. Attaching
them to the cursor would report Phase 6 as thrice-reviewed when it has not been reviewed at all. The
test asserts both halves — present under `rail-phase-ph4` with `data-branch-of="ph4"`, and *absent*
under `rail-phase-ph6`.

Array-order mutation test: reversing the `phases` input renders byte-identical HTML (`order` is the
only sequence source), and `spinePhases` sorts a copy — asserted, because the array belongs to a
snapshot other components are rendering from.

Off-spine nodes are pulled out of the rail entirely and listed as "position unknown", proven against
the `orphan-node` fixture. Activations read "N phase activations"; a zero renders as nothing rather
than as "0 activations", which reads like a measurement.

---

## T005 — the server flow watcher (TDD)

RED was the import itself:

```
Error: Failed to resolve import "../../../../apps/web/src/features/089-first-class-pij/server/flow-watcher" from "test/unit/web/pij/flow-watcher.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN: 19 tests. The fake is `FakeFileWatcherFactory` from `@chainglass/workflow` — the same contract
production uses, so the events a test *can* simulate are exactly the events that exist. There is no
`simulateRename` because `FileWatcherEvent` has no `'rename'`; building a fake that emitted one would
be testing a protocol the adapter never speaks.

**The burst.** An atomic replace surfaces as `'add'` **and** `'change'` on one path. Two events for one
edit is two full scans of 86 plan folders unless something coalesces them — the 500ms debounce, keyed
per plans root, is that something. Pinned: burst → exactly one `refreshFlows`; two plans in one repo →
one scan; two repos → two scans.

**`FileWatcherOptions.atomic` decided explicitly: `false`.** `NativeFileWatcherAdapter` reads that
option nowhere — it translates fs.watch renames into add/unlink itself — so `true` would be a claim
about coalescing that nothing implements. Stated in the options object, asserted in a test, and the
debounce is named as the actual mechanism.

**Enumeration.** `IWorkspaceService.list()` via `getContainer()` at bootstrap (the `pij/page.tsx`
precedent), joined with `docs/plans`; a `?worktree=` root registers itself on its first
`/api/pij/flow` request. Watch-once lives in the watcher, so the route calls it unconditionally.
`PijRouteDeps.noteWorkspace` is optional, so the other two routes and every pre-Phase-3 caller
construct their deps unchanged.

**C-04 at runtime.** `assertNotPijShaped` throws rather than logging — a fence that degrades quietly
is a fence that has stopped. Two checks, because they fail differently: inside `$PIJ_HOME`, or any
`.pij` path *segment* (segment-wise, never `startsWith`, so `/Users/x/.pijsomething` is not blocked).
A refused entry in the container list is skipped with a warning without costing the other workspaces
their watch.

**Degradation:** a factory that throws, an enumeration that throws, a `refreshFlows` that rejects, and
a watcher `error` event are each covered — every one leaves the page snapshot-only and logged, never
crashed. `stop()` cancels a pending debounce, so SIGTERM inside the window cannot fire a scan against
a shutting-down poller.

### One capability dropped, on the record

The watcher subscribes to `add` and `change` only. A **deletion** is deliberately not watched: the CLI
is the sole writer (C-02) and never deletes, so a vanished flow document is a human `rm`, a branch
switch, or the whole plan folder going — none of which is a flow *moving*, and all of which the next
snapshot covers. This mirrors the client, which has no removal signal for flows either.

There was a second reason and it is stated rather than buried: a bare `'unlink'` string literal in a
guarded file trips the C-02 fence, which reads it as the pij verb of the same name. Verified before
removing it —

```
   × C-02 fence — the feature writes to nothing (AC-11) > names no mutating pij verb 34ms
     → expected [ Array(1) ] to deeply equal []
+   "apps/web/src/features/089-first-class-pij/server/flow-watcher.ts: 'unlink'",
```

— and the remedy for a deliberately blunt check is to change the code, not the check. The capability
would not have been worth an exclusion even if the fence had been silent, which is why it went rather
than the fence bending. Pinned as a test, so the absence is a decision on the record.

---

## T006 — C-04 fence work (additive)

**The preferred outcome held: no exclusion was needed.** The dossier asked to check first, and the
general C-04 assertion passes over the real `flow-watcher.ts` untouched — it reaches the filesystem
through `IFileWatcherFactory`, so it names no watcher API at all. An unnecessary exclusion is a hole,
so none was added. The assertion's Test Doc was amended to say so, and an `arrayContaining` guard was
added to it: the check must be *looking at* the watcher, or its silence proves nothing about it.

**Companion assertion added** (assertion count 13 → 14), covering what the general check cannot see —
the watch TARGETS, which is the half of C-04 that actually matters:

1. every `.add(...)` argument in the file is `plansRoot`, and nothing else;
2. that root is built from `join('docs','plans')`, and the document reacted to is `the-flow.json`;
3. `.pij` appears only inside `assertNotPijShaped` — the same split-at-the-denylist shape
   `pij-records.ts` already uses;
4. the refusal is the first statement of `watchWorkspace`, on every path in.

**Planted-offender demonstration — both bite.** A bare `watch(` planted in `server/join.ts`, and the
flow watcher handed a pij-shaped target:

```
   × C-02 fence — the feature writes to nothing (AC-11) > never watches ~/.pij with a file watcher (C-04) 10ms
     → expected [ Array(1) ] to deeply equal []
+   "apps/web/src/features/089-first-class-pij/server/join.ts: watch(",
   × C-02 fence — the feature writes to nothing (AC-11) > the flow watcher watches plan folders and nothing else (C-04, companion) 1ms
     → the watcher may only ever be handed a derived plans root: expected 'join(this.deps.pijHome, \'.pij\'' to be 'plansRoot' // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 12 passed (14)
```

Both plants reverted; `git diff` against HEAD on `join.ts` is empty and the suite is green again.

---

## T007 — gates

All run by my own hand, after the last code change, verbatim.

**Live classification histogram** — via `IFlowReader.scan` over this repo's `docs/plans` (never
`harness flow list`, which only scans `.harness/flows/` and returns `{flows: [], count: 0}` in a repo
full of flight plans):

```
plan folders scanned: 86
histogram: {"live":1,"legacy":2,"untracked":82,"not-started":1,"corrupt":0}
  085-watch-polling-fallback: state=legacy reason=no `provenance` block — predates the flow CLI; every `harness flow` verb refuses it (E308). Needs re-creating, not repairing.
  086-image-editor: state=legacy reason=no `provenance` block — predates the flow CLI; every `harness flow` verb refuses it (E308). Needs re-creating, not repairing.
  088-remote-app-view: state=live now=ph6 nowPhase=ph6 completion=active phases=5/6
  089-first-class-pij: state=untracked
  not-started: 069-tree-metafiles
```

Expected 83 untracked-or-not-started / 2 legacy / 1 live. Observed **82 untracked + 1 not-started =
83**, 2 legacy, 1 live. No drift to investigate; the plan's "82/2/1 pre-089-dir" reconciles exactly
once 089's own folder is counted (it classifies `untracked`, recorded as-is). Anchors verified as
named.

**Test gates:**

```
pnpm vitest run test/unit/web/pij/
 Test Files  18 passed (18)
      Tests  289 passed (289)
VITEST-PIJ EXIT 0
```

(Phase 2 closed at 233 across 15 files. +3 files — `flows-tab`, `phase-rail`, `flow-watcher` — and
+56 tests: 46 new, plus 10 added to `use-pij-fleet` and `routes`.)

```
npx vitest run test/unit/web/sse/ test/unit/web/state/ test/unit/web/features/088-remote-view/ \
  test/unit/web/features/058-workunit-editor/ test/unit/web/features/050-workflow-page/
 Test Files  57 passed (57)
      Tests  517 passed (517)
VITEST-CONSUMERS EXIT 0
```

```
npx tsc -p tsconfig.test.json --noEmit      → TYPECHECK-TEST EXIT 0
npx tsc --noEmit -p apps/web/tsconfig.json  → TYPECHECK-WEB EXIT 0
npx biome check <touched dirs>              → Checked 66 files in 95ms. No fixes applied. (BIOME EXIT 0)
```

```
pnpm build
BUILD EXIT 0
@chainglass/web:build: cache miss, executing 9ee6c75f553dee9d
@chainglass/web:build: ✓ Compiled successfully in 15.7s
@chainglass/web:build: ├ ƒ /api/pij/flow
@chainglass/web:build: ├ ƒ /workspaces/[slug]/pij
 Tasks:    7 successful, 7 total
```

**dashboard-navigation baseline — exactly 3, before and after:**

```
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

---

## AC coverage

| AC | Claim | Proving test |
|----|-------|--------------|
| AC-06 | phase rail correct against the 088 fixture: in-progress ph6, excursion reviews on ph4 | `phase-rail.test.tsx` — "draws the six phases in spine order with ph6 in progress"; "attaches the excursion reviews to ph4 — the phase they branch off, not the current one" |
| AC-07 | five absence states as five visually distinct designed states | `flows-tab.test.tsx` — "gives the five states five different data-reasons"; one wording test per state; "classifies the five fixtures as the five ruled states" as the anti-vacuity guard |
| `flow-delta` end-to-end | watcher → `refreshFlows` → channel → hook → tab | `flow-watcher.test.ts` (watcher → refreshFlows) + `use-pij-fleet.test.tsx` "flow deltas" (channel → hook); the live browser leg is the probe below |
| retention debt retired | cursor survives trimming with the cap restored | `use-pij-fleet.test.tsx` — "keeps applying deltas once retention has begun trimming the buffer"; "replays a delta that raced the fetch even when the buffer has been trimmed since" |
| C-04 narrowed, never deleted | watcher passes the general check; companion covers its targets | `fence.test.ts` — "never watches ~/.pij with a file watcher (C-04)" + "the flow watcher watches plan folders and nothing else (C-04, companion)"; planted-offender RED above |

---

## The end-to-end watcher probe (for phase review — needs Jordan's nod to restart the dev server)

The watcher only attaches at server start, and Jordan's rule is no dev-server restart. Written out so
it can be run in one pass at phase review:

1. Restart the dev server (Jordan's call). Expect `[pij] observatory poller started …` in the log.
2. Open `/workspaces/chainglass/pij` and click **Flows**. Expect the histogram to read
   `1 live / 2 legacy / 82 untracked / 1 not-started / 0 corrupt`.
3. Confirm `088-remote-app-view` shows a rail at phase 6 of 6, 5 of 6 done, with `rv4 rv4b rv4c`
   under **ph4** and nothing under ph6.
4. In another terminal, run a `harness flow` verb against `docs/plans/088-remote-app-view` that moves
   the cursor (a status or nav change — a real CLI write, never a hand-edited file: C-02).
5. Watch the page **without reloading**. Within ~1s (500ms debounce + scan) the 088 card should move.
6. Confirm the browser made no new `/api/pij/flow` request in the Network tab — the update must have
   arrived on the `pij` channel as a `flow-delta`, not by a refetch.
7. Switch scope to "all (hot tier)" on the Fleet tab, return to Flows: expect the designed
   "Flows are workspace-scoped" card, not a blank and not an error.
8. Revert the flow change with the CLI, and confirm the card moves back.

Also still riding forward from Phase 2 and unchanged: the AC-01 in-browser probe, and Jordan's ack of
the three-chip role vocabulary.
