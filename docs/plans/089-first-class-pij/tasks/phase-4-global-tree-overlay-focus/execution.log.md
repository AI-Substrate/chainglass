# Phase 4 — Global prime tree + overlay panel + focus route · execution log

**Plan**: `docs/plans/089-first-class-pij/first-class-pij-plan.md` (v1.1.0)
**Dossier**: `../phase-4-global-tree-overlay-focus/tasks.md` (T001–T007)
**Branch**: `main`, uncommitted — the orchestrator owns git.
**Date**: 2026-07-26

---

## T001 — the tree spike (throwaway) · Jordan's mid-phase gate

Three POCs in `scratch/pij-tree-spike/` (gitignored — confirmed with `git check-ignore -v`), all three
fed by **one real capture**, so the comparison is about rendering and never about data:

```
pij tree --global --json  → 63,318 bytes   (read verb, already in PIJ_READ_VERBS)
pij list --json --badge   → 181 rows
```

Trimmed to the ~16 keys a renderer reads and written to `data.js` (100KB) — the raw node carries 44.

### The finding that outranks the three renderings

The dossier frames this task as "~181 seats at real scale". The capture says the global tree is not
that set:

| Source | Rows | Folders | Roots | Depth | Max fanout |
|--------|------|---------|-------|-------|------------|
| `pij tree --global` | **52** | 9 | 30 (6 prime) | 2 | 3 |
| `pij list` | **181** | 20 | — | — | — |

The overlap is exact and it is not a coincidence:

```
in-tree by liveness:     {"active":50,"stale":2}
not-in-tree by liveness: {"dead":129}
```

**Every one of the 129 fleet rows missing from the global tree is dead, and every non-dead row is in
the tree.** The tree is the living fleet; the store keeps the dead. So the real design question the
spike puts to Jordan is not "which tree widget" — it is **"what does the global page do with 129 dead
records that have no tmux window and no place in the forest?"**, and the three POCs answer it three
different ways on purpose.

The corollary matters for the build: at 52 nodes, depth 2, fanout ≤ 3, **the tree itself needs no
virtualization**. Any render cost at this scale comes from the dead, not from the forest.

### The three POCs

| POC | File | Geometry | Answer for the 129 dead | Build cost¹ | Rows in DOM |
|-----|------|----------|--------------------------|-------------|-------------|
| **A** | `poc-a-folder-details.html` | folder-grouped `<details>`, prime roots as spine — **the ratified design, unchanged in kind** | collapsed band per folder, "present in the store, absent from the tree" | 51.8 ms | 181 |
| **B** | `poc-b-virtual-list.html` | one flat indented list, folder headers inline, windowed + filter box | inline, dimmed, filterable; an "in the tree only" toggle hides them | 1.1 ms | ~30 (window) |
| **C** | `poc-c-density-board.html` | folder cards with a proportional active/stale/dead mass bar; seats one click away | a proportional bar segment — the split is visible before any id is read | 15.8 ms | 30 + counts |

¹ **jsdom string-build time, not paint.** No browser was available in this session (Zen was not
running, and starting one would have perturbed Jordan's environment), so these are relative costs
only. Each page stamps its own real figure in the header when opened — the numbers above will be
replaced by the browser's when Jordan reviews.

Headless verification (`scratch/pij-tree-spike/verify.mjs`, jsdom, `runScripts: dangerously`):

```
--- poc-a-folder-details.html
  errors: none
  perf stamp: first render 51.8ms · 20 folders · 181 rows in DOM
  seat ids in DOM: 181 | details: 38 | cards: 20
--- poc-b-virtual-list.html
  errors: none
  perf stamp: first render 1.1ms · 201 rows modelled · ~8 in DOM
  seat ids in DOM: 2 | details: 0 | cards: 4
--- poc-c-density-board.html
  errors: none
  perf stamp: first render 15.8ms · 20 folder cards · 181 rows represented
  seat ids in DOM: 30 | details: 15 | cards: 20
```

(POC B reports ~8 rows because jsdom has no layout — `clientHeight` is 0. In a real viewport the
window is ~30.)

### Trade-offs, stated so the pick is a choice and not a default

- **A** is the design already ratified, so picking it costs nothing in agreement and it keeps the
  workspace tree and the global tree rendering identically. Its cost is that all 181 rows are in the
  DOM and the folder is the only unit of narrowing — there is no search.
- **B** scales past any row count and adds the one affordance the other two lack (filter by id,
  folder, state, badge). Its cost is that the folder stops being a container you can shut, and depth
  survives only as indentation.
- **C** answers "how much of this fleet is alive" before you read anything, which is the question the
  129/52 split makes the honest headline. Its cost is the inverse of B's: depth is barely expressible
  and the forest becomes a summary of itself.

**Not decided by me.** Per the packet this thread stopped at "built and reported" and T005 was left
unstarted until the pick landed. It did — see the decision row below.

### AC-03 in all three

The `badge` string is rendered verbatim, never re-derived, and the **absent** key gets its own
rendering ("badge not reported") rather than a fabricated value. Live check on the capture:
`badge present: 181, non-null: 181` with the flag; the key is absent 181/181 without it — the two
observed states the dossier names, and no null leg exists to render.

### Decision row — Jordan's pick

| Field | Value |
|-------|-------|
| **Decision** | **POC A** — the folder-grouped `<details>` design already ratified in `pij-observatory-poc.html` |
| **Dead records** | "whatever the chosen POC does" → **A's answer**: a collapsed band per folder, labelled *present in the store, absent from the tree* |
| **Source** | **Jordan, directly in-session.** Not relayed — the questions were put to him in the session he was already in, and he answered there |
| **Date** | 2026-07-26 |
| **Confirmed by** | `pij-cheap-cheetah`: *"Jordan answering you directly IS the protocol (questions stay with their context owner, no proxy needed), the pick supersedes my hygiene message"* |

**Note on the sequence.** The orchestrator sent a hygiene instruction (pause the watchdog, set state
`waiting`) while Jordan's pick was already in hand. It was declined on the facts rather than followed:
both actions would have marked this seat idle while it was actively building, and `state set` is on
the feature's own mutating-verb denylist besides. The orchestrator confirmed the correction.

**What A costs, accepted knowingly:** all 181 rows in the DOM and no search — the folder is the only
unit of narrowing. B's filter box was the affordance given up. The measured build cost at this scale
(51.8ms, jsdom string-build) does not make that a performance decision.

---

## T002 — server: global tree variant + `--badge` adoption

### (a) The global tree

`IPijRecords.tree` now takes a **union**, `{ cwd } | { global: true }`, not an optional flag. The two
reads answer different questions, and a caller supplying neither would silently get the server's own
repo — the exact trap the module's `cwd` discipline exists to close, pointing the other way.

`--global` ignores cwd, so the global read runs on `defaultCwd`; a child process still has to start
somewhere. The **flag**, not the directory, is what makes the answer global, which is why it is a
distinct argv rather than "cwd omitted".

Route ladder, checked BEFORE any read so a rejected request costs no CLI call:

| Request | Result |
|---------|--------|
| `?workspace=<path>` | 200, repo-scoped, `data.workspace` = the path |
| `?global=1` | 200, whole machine, **`data.workspace` = null** |
| both | 400 `Ambiguous request: pass exactly one of workspace, global — not both` |
| neither | 400 (the pre-existing `missingParam`) |

`workspace: null` is the honest scope for a global answer. Echoing a path there would label the whole
machine as one repo — precisely the claim the global page must not make.

### (b) `--badge`

Added to the fixed argv in `pij-records.ts` `list()`, **not** to the poller: `pij-poller.service.ts`
calls `records.list()` bare, so the argv is the only place the decision can be made. Every `list()`
call now requests badges. Measured cost, three runs each on the live 181-row store:

```
without --badge: real 0.45  real 0.46  real 0.52
with    --badge: real 0.66  real 0.71  real 0.68
```

~0.2s on an 8s loop — matches dove's measurement, and the loop absorbs it.

`toFleetRow` already copied `badge` verbatim, so the UI half needed no new code — but two comments
became false the moment the flag landed and were amended rather than left: `join.ts` said "`pij list`
rows carry no badge", and `seat-row.tsx` said the badge is "present only when a `node show` has
happened". Both now state what is true AND why the absence rendering stays: the flag is a request,
not a guarantee.

Two observed states, live-measured, and **no null leg exists to test**: with the flag, 181/181 rows
carry a string; without it the key is absent 181/181.

### RED proof

The tests were written first but ran green immediately, so the implementation was reverted to
`git checkout --` state and the suites re-run. Verbatim:

```
   × /api/pij/tree > serves the whole machine for `global=1`, with workspace recorded as null 1ms
     → expected 400 to be 200 // Object.is equality
   × /api/pij/tree > refuses a request that names both a workspace and global, rather than picking one 1ms
     → expected 200 to be 400 // Object.is equality
   × /api/pij/tree > does not reach the CLI at all for an ambiguous request 0ms
     → expected 2 to be 1 // Object.is equality
   × createPijRecords > calls `pij list --json --badge` with no scoping flag 3ms
     → FakePijExecutor: unmatched call — cwd=/Users/fixture/substrate/chainglass argv=[list, --json]
   × createPijRecords > asks for the whole machine with `--global`, and only then 2ms
     → expected [ 'tree', '--json' ] to deeply equal [ 'tree', '--global', '--json' ]
```

`expected 2 to be 1` is the one worth reading: without the ladder the ambiguous request *still ran
the CLI*. Restored, all three suites green (61 tests).

---

## T004 — the focus route (the ONE mutation)

### A gap in Phase 1 that only Phase 4 could see

`pij node show` on a missing id exits 2 and writes its error as **JSON on stderr**:

```
$ pij node show pij-does-not-exist-xyz --json 2>&1 1>/dev/null
{"error":"E-NOID","message":"no session 'pij-does-not-exist-xyz' in registry"}
(exit 2)
```

Phase 1's `toPijCliError` only decoded the *bare* form (`E-ARG: usage: …`), so every `--json`-mode
failure collapsed to `E-EXIT`. That was harmless while everything was a 503 — and is not harmless
now, because "that seat does not exist" (404) and "the store is broken" (503) are different answers
and `E-NOID` is the only thing separating them. Added a strict envelope decoder: only an object whose
`error` matches `^E-[A-Z0-9]+$` counts, so unrelated JSON still yields an honest `E-EXIT`. Both legs
are pinned in one test.

### The ladder

Order matters, and each rung is a different sentence to a human:

| Rung | Status | Wording (the contract T006 renders verbatim) |
|------|--------|----------------------------------------------|
| `unknown-seat` | 404 | `no seat <id> in the store` |
| `out-of-workspace` | 409 | `seat <id> works in <cwd>, outside this workspace` |
| `not-live` | 409 | `seat <id> last observed <liveness> at <lastEventAt>` |
| `not-live` (absent liveness) | 409 | `liveness not observable for <id>` |
| `no-window` | 409 | `seat <id> has no tmux window on record` |
| `store-unreadable` | 503 | the pij `E-` code, verbatim |

**`cwd`, not `folder`.** `node show` has no `folder` key at all — verified live against the full key
set. A containment check written against `detail.folder` reads `undefined`, and `undefined` fails
containment for every seat: a focus button that always refuses, for a reason that looks like policy.
The fixture mirrors the real key set precisely so a wrong-field check cannot green-test.

**Absent liveness gets its own wording**, and the test asserts `lastEventAt` appears NOWHERE in it
even though the record has one. Inferring liveness from freshness is wrong in both directions — a
seat can be dead and recently noisy, or alive and quiet — and an inference rendered in the same
sentence as an observation is indistinguishable from one.

The window id is resolved from a **fresh** `nodeShow` per click and never from the request body; a
test posts `windowId: '@999'` and asserts `@220` is what gets focused.

### The fence carve-out — narrowed, then proven

The general tmux assertion tripped on the new route exactly as designed:

```
+   "apps/web/app/api/pij/focus/route.ts: select-window",
```

Carved out that ONE path, with the exclusion itself guarded (`expect(paths).toEqual(
expect.arrayContaining([FOCUS_ROUTE, ...TMUX_FREE_WITNESSES]))`) so an exclusion naming a moved file
fails loudly instead of hiding nothing. The companion then covers what the exclusion blinds: which
verb, what argv, and how it is reached.

Three planted offenders, one per thing the carve-out could conceal:

```
=== PLANT 1: send-keys inside the carved-out file ===
   × … the focus route drives tmux with `select-window` and nothing else (C-06, companion)
     → "send-keys" must never appear in the one file allowed to reach tmux

=== PLANT 2: a second select-window OUTSIDE the carve-out ===
   × … never sends keystrokes to a pane or drives tmux (C-01, C-06)
+   "apps/web/app/api/pij/fleet/route.ts: select-window",

=== PLANT 3: an auto-fire path inside the focus route ===
   × … the focus route drives tmux with `select-window` and nothing else (C-06, companion)
     → setTimeout would make focus reachable without a human
```

Plant 2 is the important one: it proves the exclusion is *narrow*, not a hole. All three reverted;
`git diff --stat` on both files empty; fence back to 15 passing.

---

## T006 — the row focus button (client half of C-06)

The single `fetch` lives in `hooks/use-seat-focus.tsx`, a provider — not in the button. That is for
the audit, not for tidiness: "only an onClick reaches it" is a property of the whole client surface,
and putting the call in one file makes it checkable by reading one file. Three audit tests do exactly
that: the endpoint is named in exactly one client file; that file contains no `useEffect`,
`setTimeout`, `setInterval`, `addEventListener` or `requestAnimationFrame`; and every `focus.focus(`
call site sits inside an `onClick=`.

Three button states, and the middle one is a decision: **absent** where there is no provider (global
scope mounts none — the absence is structural, not conditional), **disabled** for a seat outside this
workspace (disabled rather than hidden: the seat is visible, so an omitted button would read as a
rendering gap), **enabled** otherwise — and even then the server re-checks, because the client's copy
of `folder` is as old as the last snapshot.

**The prime got a button it did not have.** The prime lead renders in `prime-shell.tsx`'s custom
header rather than through `SeatRow`, so the first pass left it as the one visible seat in the
workspace view with no focus affordance — a gap a reader would have to guess the meaning of. Adding
`<FocusButton placement={shell.lead} />` there also fixed a test-design hole: the positive control now
covers BOTH render paths, without which the "no button in global scope" assertion could not tell
"correctly absent" from "never rendered anywhere".

---

## T003 — the overlay panel (5th F-14 sibling)

Copied from the `pr-view` trio line for line — wrapper (always-mounted provider + `dynamic(ssr:false)`
panel + ErrorBoundary rendering `null`), provider (`pij:toggle` CustomEvent, `overlay:close-all` with
the `isOpeningRef` self-close guard, PL-08), panel (`zIndex: 44`, anchor measured from
`[data-terminal-overlay-anchor]` via ResizeObserver, `hasOpened` lazy guard, `display:none` rather
than unmount, Escape). The `question-popper` outlier was not consulted.

`zIndex: 44` is the SAME as the terminal's, not higher. "Over" comes from opening later plus the
close-all convention; a higher number would win the wrong argument and put pij permanently above a
terminal the user is typing into.

Composed INSIDE `MultiplexedSSEProvider` (asserted by index in `page-wiring.test.ts`), because
`useChannelEvents('pij', …)` outside it receives nothing at all, silently.

### AC-12's third path needed a better test

The first "survives navigation" test rerendered the tree with different children and asserted the
panel stayed open. It passed — and proved nothing: React reconciles the same element, so state held
in the PANEL would have survived it too. The assertion would have passed against the very design
AC-12 forbids.

Replaced with a test that drops the panel from the tree entirely and puts it back. That is a real
unmount, which is what a `dynamic(ssr:false)` import behind an ErrorBoundary can actually do. It
discriminates because `hasOpened` is panel-local and resets on remount: the panel can only come back
already-open if the PROVIDER told it so. The weaker children-swap test is kept alongside it, since it
documents the layout scenario.

### The fence caught my own code

Running the full suite after T003, the tmux assertion failed on a file I had just written:

```
+   "apps/web/src/features/089-first-class-pij/components/seat-row.tsx: tmux",
```

The offender was a tooltip — `Show this seat's tmux window`. Reworded to `Bring this seat's window to
the front` rather than carved out. The fence is right: the browser must never be the thing driving
the window manager, and a client tooltip that talks about it is one refactor from code that does. The
tooltip also reads better for naming what the human gets rather than the mechanism.

---

## Interim gate run — after T001–T004/T006, BEFORE T005

Recorded because T005 is blocked on Jordan's spike pick and this is the honest state at the pause.
**Superseded by the T007 close run**; it is not the phase's final gate.

```
 Test Files  22 passed (22)          test/unit/web/pij/
      Tests  336 passed (336)        (Phase 3 closed at 18 files / 289 tests)

 Test Files  58 passed (58)          sse + state + 088 + 058 + 050 + dashboard-sidebar
      Tests  521 passed (521)

TYPECHECK-TEST EXIT 0                npx tsc -p tsconfig.test.json --noEmit
TYPECHECK-WEB EXIT 0                 npx tsc --noEmit -p apps/web/tsconfig.json
BIOME EXIT 0                         Checked 99 files in 41ms. No fixes applied.
BUILD EXIT 0                         ✓ Compiled successfully in 11.6s · Tasks: 7 successful, 7 total
                                     ├ ƒ /api/pij/focus   ← the new route, in the manifest
 Test Files  1 failed (1)             test/integration/web/dashboard-navigation.test.tsx
      Tests  3 failed (3)             ← baseline, unchanged (was 3 before this phase)
```

`test/unit/web/components/dashboard-sidebar.test.tsx`: 4 passed — the sidebar's own suite still green
with the additive button.

## AC coverage — what is proven, and by what

| AC | Status | Proving test / probe |
|----|--------|----------------------|
| AC-03 (badges consumed verbatim) | ✅ | `fleet-view.test.tsx` "renders the badge pij reported, verbatim…" (both observed states, no null leg); `pij-records.test.ts` argv test; overlay's own render test |
| AC-10 server half (focus route) | ✅ | `focus-route.test.ts` — 12 tests, one per `focusReason` plus the success argv and the auth gate |
| AC-10 client half (only a click) | ✅ | `seat-focus.test.tsx` — behavioural (zero requests before the click, exactly one after) **and** the three static audits: one file names the endpoint, that file has no effect/timer/listener, every call site is inside an `onClick` |
| AC-10 fence | ✅ | `fence.test.ts` carve-out + companion, with three planted offenders demonstrated and reverted |
| AC-12 (overlay: 3 triggers, exclusion, Escape, survives navigation) | ✅ | `pij-overlay.test.tsx` (9) + `pij-sdk.test.ts` (4) + `page-wiring.test.ts` sidebar/SDK/keybinding assertions |
| AC-05 global half | ⛔ **blocked** | T005 is not built — waiting on Jordan's relayed spike pick. Not started speculatively. |
| AC-05 phase-position chip | ◦ **deliberate absence** | Requires the seat→flow join (rung 1 dormant pending dove's plan-id flag) AND a flow source (`/api/pij/flow` is workspace-scoped). Per the clause's own ruling text the chip is "absent (not faked) when no live flow joins" — today that is every seat. To be recorded as absent-not-faked, never as ✅ |
| AC-01 in-browser probe | ◦ **written, pending Jordan** | Rides forward from Phase 2; needs a dev-server restart |
| Watcher end-to-end probe | ◦ **written, pending Jordan** | Rides forward from Phase 3; the 8-step probe needs a dev-server restart |

---

## Live check — what the focus ladder actually does on the real fleet

Run read-only against the live store while T005 was blocked, because "the ladder is implemented and
unit-tested" is a different claim from "here is what the button does when a human presses it".

All 8 seats in the chainglass workspace, through the route's own rungs:

```
pij-able-cow           FOCUSABLE @2235    hasCwd=true hasFolder=false
pij-able-dragonfly     FOCUSABLE @2437    hasCwd=true hasFolder=false
pij-agreed-ebulan      not-live(stale)    hasCwd=true hasFolder=false
pij-awkward-mongoose   FOCUSABLE @1680    hasCwd=true hasFolder=false
pij-cheap-cheetah      FOCUSABLE @2437    hasCwd=true hasFolder=false
pij-chief-roadrunner   FOCUSABLE @1685    hasCwd=true hasFolder=false
pij-miserable-nigel    FOCUSABLE @2437    hasCwd=true hasFolder=false
pij-recent-porpoise    FOCUSABLE @2235    hasCwd=true hasFolder=false
```

7 focusable, 1 refused as `not-live(stale)` — and the refusal is correct: the rule is
`liveness !== 'active'`, so `stale` refuses, not only `dead`.

**`hasFolder=false` on all 8.** The dossier's `cwd`-not-`folder` trap is confirmed across every seat
rather than the one sampled while writing the fixture. A containment check against `detail.folder`
would have refused all eight, and looked like a policy decision while doing it.

### The finding: window ids are not seat identities

`@2437` appears three times above; `@2235` twice. Measured across the whole global tree:

```
distinct windows: 25   for 45 seats
windows holding more than one seat: 13   (of 25)
  @273  → pij-90wkbu, pij-disastrous-manatee, pij-zealous-chicken, pij-spare-wren
  @2437 → pij-cheap-cheetah, pij-able-dragonfly, pij-miserable-nigel
  @2235 → pij-recent-porpoise, pij-able-cow, pij-agreed-ebulan
  …
```

Seats are **panes**; `windowId` is the window that contains the pane. So for the majority of seats,
focusing brings up a window holding several other agents, and `tmux select-window` cannot select
*which pane inside it* is active.

Nothing here is wrong — `{ focused: '@2437' }` and "focused @2437" both name a **window** and claim
nothing about panes — but a human clicking focus on one seat may reasonably expect to land on that
seat, and will sometimes land on a window where it is one pane of four. That is a true statement
implying a false one, which is the exact failure the display doctrine exists to prevent.

**Not fixed here, on purpose.** The obvious remedy is `select-pane`, and that is a second tmux verb
touching a pane — outside C-06's sanctioned single verb and outside R-01's comfort zone. Naming the
sharing in the success wording is the cheaper alternative but needs a second read at click time to
know who else is in the window. Both are product decisions the dossier does not answer, so both are
raised rather than improvised. Flagged to the orchestrator.


## T005 — the global page (built to Jordan's pick)

POC A as chosen: `components/global-tree.tsx` (folder sections, primes leading, dead in collapsed
bands), `components/pij-global-client.tsx` (the snapshot-only shell), `app/(dashboard)/pij/page.tsx`
(outside the workspace layout), and one nav entry in a new `GLOBAL_NAV_ITEMS` group above Dev.

**Three properties the tests hold in place:**

1. **The tree and the fleet are different sets, and both are shown.** `groupByFolder` places every
   tree seat and keeps every unplaced fleet row as that folder's dead records. A folder present only
   in the fleet still gets a section — live, 11 of 20 folders have no tree seat at all, so keying
   sections off the tree would drop over half the machine's folders.
2. **"rows", never "live seats"** — asserted as an absent phrase as well as a present one, because
   129 of 181 rows are dead and the wrong noun would be false for most of the fleet.
3. **Snapshot-only, escalating.** No SSE exists outside the workspace layout, so the page states its
   age, ticks the clock without moving the data, and past 60s switches to its own rendered staleness
   state (`data-reason="snapshot-stale"`). A quiet grey timestamp over a picture of the past is the
   failure mode; this makes it loud.

`process.cwd()` slipped into the first draft of the folder-open rule — a node API in a client
component, which would have broken in the browser. Replaced with "the busiest folder opens": the
ratified POC could name `chainglass` because it was a fixture, and this page has no workspace context
to privilege one folder with.

### Live smoke at real scale (AC-05 global half)

Reconciled against the same capture the spike used:

```
folder sections the page would draw: 20
total in tree: 52  |  total dead records: 129        (52 + 129 = 181 rows ✓)
folders with ZERO tree seats (dead records only): 11
top of the page:
  ~/games/voxel-flying-game        17 in tree · 1 dead
  ~/substrate/chainglass            8 in tree · 0 dead
  ~/pi-hacking/pij                  7 in tree · 2 dead
  ~/substrate/harness-engineering   6 in tree · 1 dead
  ~/osk/osk-split-billing           5 in tree · 0 dead
```

181 **rows**, of which ~50 are `active` — said as rows, never as live seats.

---

## T007 — ship-readiness · CLOSE GATES

All run by my own hand, after the last code change, verbatim:

```
PIJ SUITE          Test Files  23 passed (23)      Tests  354 passed (354)
                   (Phase 3 closed at 18 files / 289 tests)

CONSUMERS          Test Files  66 passed (66)      Tests  629 passed (629)
                   sse + state + 088 + 058 + 050 + components/

TYPECHECK-TEST EXIT 0      npx tsc -p tsconfig.test.json --noEmit
TYPECHECK-WEB  EXIT 0      npx tsc --noEmit -p apps/web/tsconfig.json
BIOME          EXIT 0      Checked 104 files in 55ms. No fixes applied.
BUILD          EXIT 0      ✓ Compiled successfully in 8.2s
                           ├ ƒ /api/pij/focus     ← the one mutation
                           ├ ƒ /pij               ← the global page
                           Tasks: 7 successful, 7 total

DASHBOARD-NAVIGATION       Tests  3 failed (3)    ← baseline, unchanged before and after
```

### Final AC map

| AC | Status | Proof |
|----|--------|-------|
| AC-03 badges verbatim | ✅ | `fleet-view.test.tsx`, `global-tree.test.tsx`, `pij-overlay.test.tsx` — all three render boundaries |
| AC-05 global half | ✅ | `global-tree.test.tsx` (15 tests) + the live smoke above at 181 rows / 20 folders |
| AC-05 phase-position chip | ◦ **absent, not faked** | Needs the seat→flow join (dormant pending upstream's plan-id flag) AND a flow source (`/api/pij/flow` is workspace-scoped). The clause's own ruling sanctions absence "when no live flow joins" — today, every seat. Recorded honestly; **not** counted as ✅ |
| AC-10 server half | ✅ | `focus-route.test.ts` — 12 tests, one per `focusReason` |
| AC-10 client half | ✅ | `seat-focus.test.tsx` — behavioural + three static audits |
| AC-10 fence | ✅ | `fence.test.ts` carve-out + companion, three planted offenders proven and reverted |
| AC-12 overlay | ✅ | `pij-overlay.test.tsx` (9) + `pij-sdk.test.ts` (4) + wiring assertions |
| AC-01 in-browser probe | ◦ **written, pending Jordan** | Needs a dev-server restart — not done, not claimed |
| Watcher end-to-end probe | ◦ **written, pending Jordan** | Same; rides from Phase 3 |

### Open, non-blocking

**The focus wording question** — `windowId` names a window, not a seat (45 seats in 25 windows; 13
windows hold 2–4). Documented as a known limitation, contract wording left exactly as the dossier
specified, awaiting Jordan's ruling on whether to name the sharing or leave it. It gates nothing.


---

## Fix 1 — the store-unreadable 503 carried no machine reason

**Review**: `reviews/p4-review-terra.md`, single HIGH, orchestrator-confirmed. Packet:
`scratch/pij-firstclass-packets/p4-fix-1.md`. Scope: exactly this finding.

**The finding, restated as the failure it causes.** `focus/route.ts`'s node-show failure branch
handed off to `route-deps.ts`'s shared `storeUnreadable()`, whose body shape — `{ error, code, verb }`
— predates T004's `FocusReason` union and carries no `reason`. The closed contract therefore broke on
the one path a broken pij store makes the most common of the five, and `use-seat-focus.tsx` fell
through to `data-reason="failed"`: the single value that attribute can hold which nobody designed.
The old test asserted only `code`, which survives the omission perfectly — so nothing saw it.

### RED first — both halves, against unchanged code

```
npx vitest run test/unit/web/pij/focus-route.test.ts test/unit/web/pij/seat-focus.test.tsx

 Test Files  2 failed (2)
      Tests  3 failed | 21 passed (24)

 FAIL  focus-route.test.ts > store-unreadable: 503 carrying the machine reason AND the pij code verbatim
AssertionError: expected undefined to be 'store-unreadable' // Object.is equality

 FAIL  focus-route.test.ts > gives every reason in the union a response that actually carries it
AssertionError: expected [ 'no-window', 'not-live', …(3) ] to deeply equal [ 'no-window', 'not-live', …(3) ]

 FAIL  seat-focus.test.tsx > renders the DESIGNED store-unreadable state, never the undesigned fallback
AssertionError: expected 'failed' to be 'store-unreadable' // Object.is equality
```

The client failure rendered the reviewer's claim literally: `data-reason="failed"`, showing
`E-EXIT: Command failed: pij` — the client's own fallback sentence, not the route's observation.

**The client test is driven through the REAL route handler**, not a canned body. A hand-written body
would have asserted only that the client can read a field the test author put there, and would have
passed against the broken route — the defect lives in the seam between the two halves, so the test
has to span it. Everything server-side is still a fake (constitution P4): `FakePijExecutor`,
`FakeFocusExecutor`, `FakeScheduler`, `FakeSpineCursor`, `BroadcastRecorder`. No `vi.mock()`.

**A third test was added beyond the packet's two**, because the packet's two fix this instance and
not the class: `gives every reason in the union a response that actually carries it` drives all five
refusal conditions through the real handler and asserts the set of reasons EMITTED equals the set
DECLARED. A union member with no producer is invisible to the type checker and fatal to the client —
which is precisely how `store-unreadable` came to be declared, typed, documented, and never sent.

### GREEN

```
npx vitest run test/unit/web/pij/focus-route.test.ts test/unit/web/pij/seat-focus.test.tsx
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

### The fix

`focusStoreUnreadable()` in the route, replacing the shared helper on this one branch. Body is a
superset of the old one — `reason` and `observation` added, `code`/`verb`/`error` kept, so nothing
reading the old shape breaks. The `E-` code stays verbatim per the dossier.

One judgement call inside it: **which pij field holds "what pij said" depends on the code.** Every
coded path (`E-ARG:…` at the head of the stream, or the `--json` envelope) puts pij's own message in
`message`. `E-EXIT` means pij said nothing structured and `message` is then node's
`Command failed: pij …`, which names the process rather than the problem — there, `stderr` is the
only real information. Getting this wrong would have produced a technically-correct 503 whose human
sentence said nothing about pij at all. Capped at 300 chars.

### Close gates

```
npx vitest run test/unit/web/pij/       Test Files  23 passed (23)
                                              Tests  356 passed (356)   ← was 354; +2

npx tsc -p tsconfig.test.json --noEmit   TYPECHECK-TEST EXIT 0
npx tsc --noEmit -p apps/web/tsconfig.json   TYPECHECK-WEB EXIT 0
npx biome check <3 touched files>        Checked 3 files in 28ms. No fixes applied.
```

### Discoveries

| Date | Task | Kind | What | Why it matters | Files |
|------|------|------|------|----------------|-------|
| 2026-07-26 | Fix 1 | Discovery | A shared helper can silently violate a closed union: `storeUnreadable()` is correct for the read routes and wrong for the one route with a reason contract | The type checker cannot see it — the helper returns `Response`, which satisfies every signature. Only a test asserting the emitted body catches it | `apps/web/app/api/pij/focus/route.ts` |
| 2026-07-26 | Fix 1 | Discovery | "N states, N tests" was satisfied per-state and still left a hole — each reason had a test, but nothing asserted the emitted SET equals the declared set | Added the enumeration test. Per-state coverage cannot detect a state that is never produced; only the set comparison can | `test/unit/web/pij/focus-route.test.ts` |
| 2026-07-26 | Fix 1 | Discovery | A client test with a hand-written response body cannot fail on a server contract break — it asserts the author's fixture, not the seam | The client-render test drives the real route handler. This is the general lesson for every "does the client render the designed state" test in this feature | `test/unit/web/pij/seat-focus.test.tsx` |
| 2026-07-26 | Fix 1 | Discovery | On `E-EXIT`, `PijCliError.message` is node's `Command failed: pij …` and pij's actual complaint is in `stderr`; on every coded path the reverse holds | An observation built from the wrong field is diagnostically empty while looking complete — the exact failure mode this plan is written against | `apps/web/app/api/pij/focus/route.ts` |

## Fix 2 (post-landing) — the machine reason lied about which subsystem failed

Found by roadrunner in a day of trying to break the landed build; the only thing that broke. Packet:
`scratch/pij-firstclass-packets/p4-fix-2.md`. Against `fd469f95b`.

The tmux-failure catch (`route.ts:207`) answered `reason: 'store-unreadable'` while its observation
said `tmux refused to focus @220: …`. The two halves of one response disagreed, and the half that
lied was the machine-readable one — a reader spots the mismatch, a client branching on `data-reason`
cannot, and a human debugging it is sent to the pij store when tmux is what refused. The union simply
had no member for the cause, so the nearest one was borrowed. The comment above it said as much.

Worth naming as its own failure mode: **a closed union invites nearest-member reuse the moment a new
cause appears.** Adding a member is a visible edit; borrowing one is a single word and reads fine.

### RED

Tests first, against the unchanged route.

```
npx vitest run test/unit/web/pij/focus-route.test.ts test/unit/web/pij/seat-focus.test.tsx
 Test Files  2 failed (2)
      Tests  2 failed | 23 passed (25)

FAIL  focus-route.test.ts > tmux-refused: 503 whose machine reason names TMUX, not the store
AssertionError: expected 'store-unreadable' to be 'tmux-refused' // Object.is equality

FAIL  seat-focus.test.tsx > renders the DESIGNED tmux-refused state, distinct from a store failure
AssertionError: expected 'store-unreadable' to be 'tmux-refused' // Object.is equality
```

The client failure printed the bug in one line of DOM — `data-reason="store-unreadable"` sitting
directly above the text `tmux refused to focus @220: no server running on /tmp/tmux-501`.

Both are route-backed: the client test drives the real handler with the focus executor rejecting and
the pij read SUCCEEDING, which is what makes the old wording so plainly wrong — nothing was unreadable.

### The set-equality test did NOT go red — a finding on the test itself

The packet asked me to check this and say so if it held. It held.

After the route change, `gives every reason in the union a response that actually carries it` stayed
GREEN with the route emitting a sixth reason it did not know about. Two independent reasons, and both
matter:

1. It drove five hand-listed conditions. The tmux path was not among them, so `tmux-refused` never
   entered the emitted set.
2. Its expected set was a hand-written `FocusReason[]` literal. **TypeScript does not require an array
   literal to cover a union**, so adding a member produced no error there either.

That test was added in Fix 1 to close exactly this class of hole — a union member with no producer —
and it reproduced the hole one level up, in its own maintenance. Per-state coverage cannot see an
unproduced state; a hand-maintained enumeration cannot see an unenumerated one.

Fixed by keying the cases as `Record<FocusReason, …>` instead of an array, and deriving the expected
set from `Object.keys`. A new union member is now a **compile** error until it has a condition. Each
case also asserts the reason it is keyed by, so a mis-wired condition fails by name.

Revert-check, because a green never seen fail proves nothing — `:207` put back to `store-unreadable`
with the strengthened test in place:

```
npx vitest run test/unit/web/pij/focus-route.test.ts -t 'gives every reason'
AssertionError: the tmux-refused condition must emit its own reason:
  expected 'store-unreadable' to be 'tmux-refused'
 Test Files  1 failed (1)
```

It catches it now. Line restored immediately after.

### GREEN

```
npx vitest run test/unit/web/pij/focus-route.test.ts test/unit/web/pij/seat-focus.test.tsx
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

### The fix

Three lines of behaviour: `'tmux-refused'` joins `FocusReason`, `:207` returns it, and
`focusRefusal()`'s parameter excludes it alongside `store-unreadable` (both 503s are built at their
call sites — neither carries information that signature has room for). Status stays 503 and the
observation wording is untouched: it was the honest half all along.

**No client change was needed, and that is a fact worth recording rather than a gap.** `use-seat-focus`
passes `body.reason` straight through and `SeatRow` renders it as `data-reason`, so the client is
reason-agnostic by construction — a new designed state costs nothing there. Only the fallback
(`'failed'`, for a body with no `reason` at all) is hard-coded, which is the one value that should be.

### Close gates

```
npx vitest run test/unit/web/pij/       Test Files  23 passed (23)
                                              Tests  357 passed (357)   ← was 356; +1

npx tsc -p tsconfig.test.json --noEmit       TYPECHECK-TEST EXIT 0
npx tsc --noEmit -p apps/web/tsconfig.json   TYPECHECK-WEB EXIT 0
npx biome check <3 touched files>            Checked 3 files in 27ms. No fixes applied.
git status --porcelain                       5 entries; pnpm-lock + sse-manager untouched
```

Test count is +1, not +2: the tmux path already had a test (`reports a tmux failure as a failure, not
as a silent success`) which asserted status and observation but not `reason` — precisely how the lie
survived. It was extended and renamed rather than duplicated, keeping "one reason, one test" intact.

### Discoveries

| Date | Task | Kind | What | Why it matters | Files |
|------|------|------|------|----------------|-------|
| 2026-07-26 | Fix 2 | Discovery | A closed union invites **nearest-member reuse** when a new cause appears: tmux refusal borrowed `store-unreadable` because no member fit | Borrowing is one word and reads fine; adding a member is a visible edit. The result is a machine field that contradicts the human sentence next to it, and only the machine field is load-bearing for clients | `apps/web/app/api/pij/focus/route.ts` |
| 2026-07-26 | Fix 2 | Discovery | The Fix-1 set-equality test could not see this — its cases were an array and its expected set a hand-written literal, and **TS does not require an array literal to cover a union** | The test written to close "a union member with no producer" reproduced the hole in its own maintenance. `Record<Union, …>` makes the gap a compile error; an array can never do that | `test/unit/web/pij/focus-route.test.ts` |
| 2026-07-26 | Fix 2 | Discovery | An honest `observation` beside a false `reason` is worse than both being wrong — the response looks correct to every human who reads it | Reviews read the words. The field nobody reads by eye is the field that needs the test, and this one had a test asserting only status and observation | `test/unit/web/pij/focus-route.test.ts` |
| 2026-07-26 | Fix 2 | Discovery | Adding a designed state cost zero client changes: the hook passes `reason` through and the row renders it, so only the `'failed'` fallback is hard-coded | The pattern's payoff, and the reason a route-side union can be extended safely. It also means the client can never be the thing that catches a wrong reason — the route tests must | `apps/web/src/features/089-first-class-pij/hooks/use-seat-focus.tsx` |
