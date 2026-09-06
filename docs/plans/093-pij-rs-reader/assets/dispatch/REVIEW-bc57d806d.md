# Cross-model review — plan 093, sha `bc57d806d`

**Verdict: REQUEST_CHANGES.**

**Reviewer**: pij-creative-chickadee (github-copilot/claude-opus-5, omp), cross-model against the
sol-fast-1m coder. **Checkout**: `/Users/jordanknight/substrate/chainglass-093-review`, detached at
`bc57d806d`, `pnpm install --frozen-lockfile` exit 0. Nothing was committed, pushed, or edited.
`--watch-pane` was NOT run (packet instruction); no process was restarted.

The rulings are implemented, and implemented in tests, not prose. Amendments 4, 5 and 6 each hold
under my own live measurement — see § Verified. The two blocking findings are not in the rulings:
they are in what the **default flip** did to two surfaces nobody re-measured after it, because the
composite adapter now serves `list()` from pij-rs and `tree()`/`nodeShow()` from a legacy registry
that shares **1 of 917 seat ids** with it. F1 and F2 both come from that single seam.

`RAN` = I executed it in this checkout and read the output. `READ` = I read someone else's record.

---

## Findings

### F1 — Focus is broken for every pij-rs seat under the new default. HIGH.

`apps/web/app/api/pij/focus/route.ts:189` calls `deps.poller.records.nodeShow(seatId)`. Under
`PIJ_SOURCE=rs` the composite routes that to the **legacy CLI**
(`apps/web/src/features/089-first-class-pij/server/rs/composite-pij-records.ts:26-28`), while the
row the user clicked came from pij-rs (`:17-19`).

**RAN** — five ids taken from the live rs roster, including both seats in this conversation:

```
pij-lonely-antelope     -> exit=2 {"error":"E-NOID","message":"no session 'pij-lonely-antelope' in registry"}
pij-creative-chickadee  -> exit=2 {"error":"E-NOID","message":"no session 'pij-creative-chickadee' in registry"}
pij-zonal-cricket       -> exit=2 …  pij-zealous-zebra -> exit=2 …  pij-yummy-caribou -> exit=2 …
```

5 of 5. `E-NOID` is `NO_SUCH_SEAT` (`route.ts:73`), so `:193-195` returns the 404 refusal
`no seat <id> in the store` (`:92`). The rail lists the seat; clicking it says the store has never
heard of it. Both statements are on the same screen, from two stores under one id namespace.

Second defect in the same handler: `route.ts:222` gates focus on `detail.liveness !== 'active'` —
a **liveness verdict**, taken from the legacy registry, applied to an rs row, in the same commit
whose u9 exists to say chainglass cannot know liveness for these rows. For the 1 id that does
overlap, `cwd` and `windowId` come from whichever process the *legacy* daemon has under that name;
bp-0002's own note records 3 renamed of 28, and `tmux select-window` is a real side effect on the
user's terminal.

Ruling/receipt divergence: the receipts assert u8 "Default rs; explicit legacy retains
PIJ_POLLER=on gating" with no mention of a route that stops working. Amendment 1C priced the
composite as "tree/nodeShow still spawn a process, but per REQUEST" — a **cost**, not a **failure**;
that pricing was taken when rs was opt-in and is no longer accurate now rs is the default.

No test catches it: the focus tests fake both sources with ids that match by construction. This is
the packet's §3 generalisation on a new surface — *a fixture whose two sources share ids cannot fail
to join*.

### F2 — Structural blackout: nesting and roles are gone, and nothing says so. HIGH.

**RAN**, live: rs roster **917** ids; `pij tree --global --json` **27** seats; **intersection = 1**.
`use-pij-fleet.ts:261` fetches `/api/pij/tree` (legacy, via the same composite) and joins it to the
rs rows by id, so 916 of 917 rows get no tree placement.

**RAN**, live: `readSeatRole` over all 917 mapped rs rows returns
`{kind:'absent', reason:'role-unknown'}` for **917/917** (rs sends `role: null` on every seat;
`--all` coverage confirms `role: {missing:0, null:917, value:0}`).

So under the shipped default the rail renders a flat, role-less list — for the chainglass workspace,
11 rows (RAN) with no prime/PM/worker structure and no nesting — where the legacy rail rendered a
tree. That is a defensible consequence of a source that carries neither, but the plan already has
the idiom for saying it: Amendment 6 F3 ruled that a **collection-level** absence needs a
collection-level flag, and `statusesUnavailable` was added for exactly that shape
(`pij-poller.service.ts:101-102, 208-210`). No sibling exists for structure. An empty tree therefore
reads as "this workspace has no structure", which is the 65f524ea9 shape one level up — the same
error the plan's own F3 names.

`orchestrationRole` is *not* listed in `rsUnavailable` (the key is present with value `null`, so the
derivation subtracts it). That is defensible under Amendment 2 rung 1, because `readSeatRole` has a
real `role-unknown` member — but it means the row's provenance array cannot carry this gap either.

Every rail/tree test supplies a fixture tree whose ids are the fixture rows' ids
(`test/unit/web/pij/pij-rail-view.test.tsx`, `global-tree.test.tsx`), so the join can never miss.

### F3 — The spawn half of the late "fence stale `report.state`" fix has no test. MEDIUM.

`pij-poller.service.ts:253-261` fences `report.state` behind a per-seat descriptor cursor advanced
by `spawn.bound`/`spawn.failed`; `start-pij-poller.ts:31-36` adds those kinds to
`DESCRIPTOR_EVENT_KINDS` so they also trigger `refreshRecords()`. Neither is asserted.

**RAN** — the only fixture that feeds `ingest()`
(`assets/inputs/live-report-frames-6012-14473.ndjson`) has **zero seat overlap** between its spawn
frames and its report frames:

```
spawn seats : pij-ideal-rabbit  pij-kind-alpaca  pij-poor-mellanie  pij-urban-odette
report seats: pij-involved-egret  pij-lonely-antelope
```

so `rsDescriptorSeq` written by a spawn frame is never read by any assertion. Deleting both spawn
kinds from `ingest()` fails no test. `getPijPoller`'s `onEvent` closure
(`start-pij-poller.ts:114-118`) — which carries both the descriptor→`refreshRecords` wiring and the
`lastError`→throw that turns a failed read into a stream reconnect — has **no test at all**;
`rs-bootstrap.test.ts` only covers the three env helpers.

For contrast, and to be fair to the coder: the *resume-cursor* half of the same fix **is** pinned
(`rs-event-stream.test.ts:220-252`), and the *other* late finding — cleared `lastError` published
after recovery — **is** pinned (`rs-poller-ingest.test.ts:275-313`). This is one uncovered half of
one of the two, not a pattern.

### F4 — A committed receipt number does not reproduce at this sha. LOW.

RECEIPTS rows for bp-0007 and the preliminary both state `pnpm vitest run test/unit/web/pij`, exit
0, **478 tests**. **RAN** at `bc57d806d`: exit 0, **35 files / 482 tests**. The number predates the
final four tests added by the late review fixes. Harmless in direction; still a receipt whose figure
is not the published sha's. Same class as the bp-0003 `30ms` error Amendment 4 records — a true
number attached to a slightly different run.

### F5 — An unrecognised `PIJ_SOURCE` silently selects the new default. LOW.

`start-pij-poller.ts:57` is `env.PIJ_SOURCE === 'legacy' ? 'legacy' : 'rs'`, pinned as intentional
by `rs-bootstrap.test.ts:13` (`'unexpected'` → `rs`). A typo (`legacyy`, `Legacy`) now silently
lands on rs. The pre-flip form failed toward the incumbent; this one fails toward the change. Accept
only the two words and warn on anything else.

### F6 — Two plan documents now contradict shipped behaviour. LOW (doc).

`assets/backpressure.dd.md` bp-0008 still reads *"The flip is out of scope; default must not move"*,
and `impl-guide.dd.md:37` (§ Architecture, HARD CONSTRAINTS) still reads *"Default stays legacy.
This branch does not flip PIJ_SOURCE."* The packet's u8 authorises the flip, but neither document
was amended or regenerated, so the plan's own generated backpressure table asserts the opposite of
the commit. Regenerate `backpressure.dd.json`/`.md` and add the amendment line.

### Note, not a finding — rail capability derivation is inconsistent with itself.

`pij-rail-view.tsx:762` computes `unavailable = livenessUnavailable || rows.some(isLivenessUnavailable)`,
but `:753` passes `idleFilter: !livenessUnavailable` using the **prop only**. A snapshot that omits
the flag while its rows carry `rsUnavailable:['liveness']` would label the footer "N recorded seats"
over an idle-pruned list. Unreachable today (the route always sets the flag under rs); one word to
make the two agree.

---

## Verified — the rulings hold

Fidelity checks, in the packet's order. All statements below are RAN unless marked READ.

**(a) Resume cursor — Amendment 4.** `rs-event-stream.ts:9`
`RESUME_EVENT_KINDS = {seat.put, seat.tombstone, report.now, report.state}`; `:113-117` advances
only on those, and only after the application promise resolves, chained so a later success cannot
skip an earlier failure. `message.*`, `delivery.*` and `spawn.*` flow through without moving it —
correct, and evidence-backed rather than assumed: the three-writer bisect in
`assets/findings/live-push-recheck-2026-09-06.md:56-61` places `spawn.*` on `EventBus::publish`
(pushed) and `report.*`/`seat.*` on direct spine writers (replay-only), so excluding `spawn.*` from
resume — a deviation from Amendment 4's literal "DESCRIPTOR_EVENT_KINDS" wording — is the right
call, not a shortcut. Pinned by `rs-event-stream.test.ts:220-252` (pushed 12/13/14 arrive after
`seat.put` 10; reconnect `since` is `{local:10}`), `:290-318` (no commit across a failed
application), `:320-343` (fresh process replays each machine from 0). F8 is fixed and pinned:
`established` is set only on a cursor frame (`:105-109`), and `:254-288` proves hello-only sockets
back off `250/500/1000/2000`.

**(b) `rsUnavailable` is derived — Amendment 5.** `rs-pij-records.ts:89-97` seeds from the live
`unsupported[]`, rewrites `liveness:stale`→`liveness`, unions `FLEET_ROW_FIELDS`, then subtracts
every field the emitted row actually carries. Partition asserted both ways in
`rs-pij-records.test.ts:178-199`. **I re-derived it against the live daemon rather than a fixture**
— 917 real rows through the real mapper:

```
rows 917 | rows carrying a `liveness` key 0 | rows marked liveness-unavailable 917
rows carrying the string `liveness:stale` 0 | partition violations 0
tombstoned rows carrying typed `terminal` 96 | boundModel carried 108 | boundProvider carried 68
distinct `state` values across all 917 rows: { idle: 917 }
```

F4's dropped facts are restored (108/68 rows now carry the model/provider the rail used to deny).
F6b's cursor is typed and discriminated (`RsTerminal.source: 'pij-rs'`). The `{idle: 917}` row is
worth keeping: every seat on the machine, live and dead, reports `idle` — which is the whole reason
u9 must exist.

**(c) `ingest()` acts on real frames — Amendment 6.** `SYSTEM_STATE_KIND` survives only on the
legacy `applyEvent` path (`pij-poller.service.ts:540-543`); the rs path is gone. `ingest()`
(`:244-311`) handles `report.now` (`{did,next}`) and `report.state` (`{state,note,registry_seq}`),
both typed from measured payloads, both cursor-deduped. Every fixture is a captured frame, including
the `at:0` / `payload:''` `seat.put` that `rs-poller-ingest.test.ts:230-232` explicitly asserts
rather than fabricates. F3's collection flag ships (`:101-102`, `:208-210`), F7's `not_found`
tolerance ships (`rs-pij-records.ts` `list()`, pinned at `rs-pij-records.test.ts:200-209`), F9's
script is in the tree and I ran four of its modes.

**(d) Fresh descriptor beats cached `report.state` — the revival defect.** `withRsStateReport`
(`:313-327`) gates on `report.revision > readStartedAt && report.seq > rsDescriptorSeq[id]`, with
`readStartedAt` captured at `tickSlow` entry (`:414`). The **race**, not just the happy path, is
covered three ways: `rs-poller-ingest.test.ts:208-236` (revival clears, and a later replay of the
same old declaration cannot restore it), `:237-257` (a report arriving *during* a read survives that
read but not the next), `:258-274` (a fresh null descriptor wins when historical replay races
bootstrap). Built from the real 12639/12672 pair.

**(e) Legacy unchanged.** The shared-file edits are inert under legacy: `rsStateReports` is empty so
`withRsStateReport` returns the row identity; the recovery `poller-status` emit (`:456-464`) and the
snapshot capability flags (`:208-210`) are both gated on `pollSpine === false`; `currentSeq()` falls
back to `deps.cursor.seq` because `ingest()` never runs. `bootstrap.test.ts` now names
`PIJ_SOURCE: 'legacy'` explicitly on every kill-switch case and passes.

**Constraints (automatic-fail list) — all clean.** Grep across the feature finds exactly three
endpoints: `GET /v1/seats`, `POST /v1/state`, `GET /v1/events` (`rs-client.ts:127,135,143`). Zero
matches for `v1/register|v1/send|v1/adopt`, zero for `sqlite`. One subscriber: `globalThis`
singleton plus idempotent `start()` (`rs-event-stream.ts:43-51`); measured `maxSubscribers: 1` and
`maxConcurrentReads: 1` across a 14,653-frame replay. `daemon.key` is re-read inside `fetchOnce`
(`rs-client.ts:200-217`) on every attempt, with exactly one retry whose result is returned
unconditionally (`:191-198`).

---

## Receipts I re-ran

| Receipt | Committed | RAN here | Verdict |
|---|---|---|---|
| `--all` | 913 rows, 0 mismatches, 96 tombstoned, 1 seats + 1 state read | exit 0, **917 rows**, 0 mismatches, **96 tombstoned**, 1 + 1 | reproduces (roster grew) |
| `--auth` | 401/200 in 2 attempts; 401/401 in 2 attempts | exit 0, `[401,200]` 2 attempts; `[401,401]` 2 attempts | reproduces exactly |
| `--replay` | 14,614 frames, 90.75ms transport / 196.96ms integrated, 7,834,105 B, 916 rows / 57 cards / 11 semantic, 1,584 refresh → 3 reads | exit 0, **14,653** frames, **89.28ms / 184.48ms**, **7,851,643 B**, **917 rows / 57 cards / 11 semantic**, **1,588 refresh → 3 reads**, max subscriber/read 1, 3 `poller-status` + 1 `fleet-delta` | reproduces within spine drift |
| `--seat` (bp-0002) | one row matched direct source | exit 0, 1 of 917 compared, 0 mismatches | reproduces |
| bp-0007 vitest | 478 tests | **482 tests / 35 files**, exit 0 | **F4** |
| `just typecheck` | 9 workspace tsconfigs pass | exit 0, all 9 (after building `packages/*`; a bare checkout fails on unbuilt `@chainglass/workflow` types) | reproduces |
| `just lint` | 1,804 files | 1,803 files checked, no fixes | reproduces |
| `just test` | 547 files / 7,286 passed, 8 files / 63 skipped | 537 passed / **9 failed** / 9 skipped files; 7,210 passed / 24 failed / 71 skipped | see below — reproduces |

The 24 failures are all in `test/unit/mcp-server/**` and `test/integration/mcp/**` and are an
artifact of a fresh checkout: `apps/cli/dist/cli.cjs` does not exist, so the MCP stdio child dies
with `Connection closed`. After `pnpm --filter @chainglass/cli build`, **RAN** those nine files
again: **9 files / 60 tests, all pass.** The receipt's higher totals (7,349 vs 7,305) are explained
the same way — `just fft` runs `build` before `test`, un-skipping one file. **Not a finding; the
gate is genuinely green at this sha.** Nothing in the 093 diff is implicated.

Not run, by instruction: `--watch-pane` (bp-0003) — so the single most important **delivery**
property, that a brand-new seat's `seat.put` reaches the reader within one recycle, is READ-only for
me. Blocked by design and correctly labelled in the receipts: bp-0001 (needs a dev restart) and
bp-0005 (needs authorisation to restart the shared daemon).

**Consequence worth stating plainly**: the flip ships without one observation of the running product
under rs. bp-0001 is the row that would have loaded a page — and F1 and F2 are both the kind of
defect that only a loaded page reveals. That is not the coder's fault (it was forbidden the restart,
and said so), but it is why REQUEST_CHANGES rather than "approve with notes": the two blocking
findings live exactly in the gap the blocked row left.

---

## What I would fix, in order

1. **F1** — decide the focus contract under rs. Either resolve `windowId`/`cwd` from the rs row
   (rs carries `pane`, and the rail already renders a tmux window label), or make the composite
   refuse `nodeShow` under rs with a typed "unsupported on this source" error and give the refusal
   its own wording, so the UI stops saying "no seat in the store" about a seat it is displaying.
   Whichever: a test that gives the two fake sources **disjoint** id sets.
2. **F2** — add the collection-level provenance sibling for structure, the same shape as
   `statusesUnavailable`, so an empty tree states its cause. Same disjoint-id test.
3. **F3** — one test that ingests a captured `spawn.bound` and a lower-cursor `report.state` for the
   **same** seat, and one that exercises `getPijPoller`'s `onEvent` closure.
4. **F4/F5/F6** — correct the receipt figure, tighten `pijSource`, regenerate the backpressure doc
   and amend the architecture block.

F3–F6 are cheap and none of them block on the daemon. F1 and F2 want bp-0001 unblocked to confirm
the fix on a loaded page.
