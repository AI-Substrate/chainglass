# Cross-model delta review — plan 093, sha `f1b79236f`

**Verdict: APPROVE.** All six findings from `REVIEW-bc57d806d.md` are closed — in code, in tests,
and (for F1 and F2) under my own live measurement. Three new items are raised below; all are LOW,
none blocks, and none is a regression of a ruling.

**Reviewer**: pij-creative-chickadee (github-copilot/claude-opus-5, omp). **Checkout**:
`/Users/jordanknight/substrate/chainglass-093-review`, detached at `f1b79236f`. **Base**:
`b4b427100` (doc-only from `bc57d806d`, so the code delta is exactly this commit). Nothing
committed, pushed, or edited. **Scope**: F1–F6 and the disjoint-ids fixture rule only, as
instructed; Amendments 4/5/6 and the constraint set were not re-reviewed.

`RAN` = executed here, output read. `READ` = someone else's record.

---

## The question you asked me to answer explicitly

**Which of F1/F2 could I only READ, because the loaded page is not on this sha?**

**Only the browser half of each — and nothing else.** I could not click a seat and watch tmux move,
and I could not see the rail render a hierarchy. Your own receipts already say so, and say it
correctly: *"the actual owned browser loaded the compact UI, but `/api/pij/tree` still returned the
old HMR-held composite"*, with the commit body carrying `live hierarchy/focus acceptance pending
dev restart; not claimed`. I am not treating that as a finding.

What I *could* do, and did, is stronger than the fixtures and weaker than the page: I drove the
**production adapters against the live daemon and the live OS**, so both fixes are verified at every
layer below the browser. Specifically —

- **F2 is reproduced exactly, including your named example.** RAN, real `RsPijRecords`, real
  `client.seats()`, real `git worktree list` as the resolver, scope `cwd=/…/chainglass`:

  ```
  roots=11 structureSource=rs-parent-links rolesUnavailable=true
  pij-lonely-antelope [role=null]
    └ pij-civil-zakalwe [role=null]
    └ pij-creative-chickadee [role=null]
  pij-coherent-silkworm [role=null]
  … 9 more roots
  ```

  That is the receipt's claim — *"Antelope with Zakalwe and Chickadee as children"* — reproduced
  independently, through the shipped code path, with me as one of the leaves. The old
  intersection-of-1 join is gone at the root: tree and roster are now the same read.

- **F1's real-world assumptions hold on this machine.** RAN, replicating `processStart` /
  `processBelongsToPane` byte-for-byte against `ps -axo pid=,ppid=,lstart=` and live rs `proc`:

  | | |
  |---|---|
  | `ps` rows parsed by the route's row regex | 1,505 of 1,505 (0 rejects) |
  | `lstart` strings the route's `processStart` could not parse | **0** |
  | untombstoned seats carrying pane + proc | 810 |
  | would focus (pid live, start stamp equal, descendant of pane pid) | **49** |
  | refused — recorded pid no longer running | **753** |
  | refused — pid recycled, start stamp differs | **8** |
  | refused — pane missing / not a descendant | 0 / 0 |

  Sample match: `pij-anxious-toucan`, pane `%582`, `lstart` `Sun Sep  6 17:34:12 2026` →
  `20260906173412` == rs `proc_start` `20260906173412`, window `@536`. The stamp format the route
  reconstructs **is** pij-rs's `proc_start`, on real data, not by fixture agreement.

  **The 8 are the point.** `pij-elegant-shrew` records `proc_start` `20260831184145`; its pid now
  belongs to a process started `20260906105658`. Without the start-stamp comparison those 8 clicks
  would have focused a **stranger's window**. The check is load-bearing, not ceremony. And 49 live
  against 753 dead reproduces the corpse census independently, from a completely different sensor.

So: F1 and F2 are READ **only** at the browser boundary. Every layer beneath is RAN.

---

## Findings from `REVIEW-bc57d806d.md` — disposition

### F1 — focus broken for every rs seat. **CLOSED.**

Root cause removed rather than patched: `composite-pij-records.ts:26-28` now routes `nodeShow()`
*and* `tree()` to **rs**, so focus resolves in the same identity space as the roster; `raw()` is the
only remaining CLI path. `rs-pij-records.ts:88-109` serves the detail from the live seat record.

You replaced the liveness gate rather than porting it, exactly as ruled. `focus/route.ts:259-263`
branches on `detail.source === 'pij-rs'` into `resolveRsFocusWindow` (`:401-438`), which:
validates `proc.pid`/`proc_start` and a `%\d+` pane shape; reads the pane once
(`tmux display-message -p -t <pane> '#{pane_id} #{pane_pid} #{window_id}'`); takes **one** bounded
`ps` snapshot; requires the recorded pid's start stamp to equal `proc_start` **and** the pid to be a
bounded-depth descendant of the pane pid; then **re-reads the pane** and requires an identical
pid+window before selecting (`:430-437`). The legacy branch keeps its own `liveness !== 'active'`
guard untouched (`:265-272`).

This is unicorn's rule applied verbatim — *alive ⇔ pid exists AND its current start time ==
`proc_start`*, compared and never interpreted — and it respects the "one `ps` per row per tick is
the disease" ruling: one snapshot, on a human click, for one seat. Locale is pinned (`LC_ALL: 'C'`,
`:454`), which pre-empts the `lstart` fragility I would otherwise have raised.

Fence held and tightened: `fence.test.ts` now asserts exactly three `execute(` calls with three
allow-listed argv shapes, one `execFile`, one `select-window`, plus five negative cases
(`send-keys`, `set-environment`, `sh -c`, dynamic `execute(command,args)`, `ps -p pid`) that must be
rejected. The one mutation is still one window selection on a human click.

### F2 — structural blackout with nothing to say so. **CLOSED.**

`rs-pij-records.ts:58-86` builds the forest from explicit `parent` links only — `parentForest`
(`:112-153`) confers structure from links and never from position or name — with repository-family
scoping through `IGitWorktreeResolver` (`start-pij-poller.ts` injects the real resolver from the
container). The tree carries `structureSource: 'rs-parent-links'` and `rolesUnavailable`, surfaced
through `/api/pij/tree` (`route.ts:62-64`), `types.ts`, `use-pij-fleet.ts`, into a single
`pij-source-limitations` note in the rail: *"hierarchy: rs parent links · roles: not carried by
pij-rs yet (pij plan 138, phase 2, unscheduled)"*. The footer now says `N unclassified` instead of
implying zero roles, and `errors.tree` both renders and degrades `phase`.

Naming the upstream owner and its status in the UI string is better than the flag I asked for: an
operator reading "not carried by pij-rs yet" knows it is not a chainglass bug and knows who owns it.

RAN, live, whole roster: 918 seats projected (vs the legacy tree's 27), max depth 2, 36 nested,
`rolesUnavailable: true`; parent links 80 of 918, **0** self-parents, **0** cycles, **0** duplicate
ids, 44 parents outside the roster correctly promoted to roots.

The mixed case is handled properly and I withdraw the concern I would have raised: the collection
flag is all-or-nothing (`scoped.every(role == null)`), but the rail falls back to a per-placement
check and says *"some seat roles not supplied"* when only some are missing.

### F3 — spawn half of the fence fix untested. **CLOSED, and closed the right way.**

`rs-bootstrap.test.ts:103-171` captures the **production** `onEvent` closure through a new
`createEventStream` seam on `getPijPoller` and drives it — it does not reproduce the dispatch in the
test, which is the failure mode I was worried about. Parameterised over both `spawn.bound` and
`spawn.failed`, it asserts the descriptor refresh fires (`seatReads` 1→2), that a stale
`report.state` arriving after the higher-cursor spawn cannot restore `semanticState`, that a later
`report.now` still lands as a status card, that no extra reads occur, and that `lastError` stays
null.

The rebinding is labelled honestly — *"Scripted regression, NOT a wire capture: only this spawn's
identity/cursor are rebound. Its captured payload and timestamp, and both captured report frames,
stay unchanged."* That is the correct disclosure under Amendment 6's no-invented-frames rule, and it
is what makes the test admissible rather than a synthesised daemon.

### F4 — receipt number. **CLOSED.** bp-0007 now reads 548 tests / 35 files and explains the drift
(478 predated four late fixes; 482 at `bc57d806d`). RAN here: **35 files / 548 tests, exit 0**.

### F5 — unrecognised `PIJ_SOURCE`. **CLOSED.** `start-pij-poller.ts:96-100` warns at construction
naming both valid values; the selector stays pure. `rs-bootstrap.test.ts:67-94` sweeps
`undefined | 'rs' | 'legacy' | '' | 'RS' | 'unexpected'`, asserting the warning fires only on
construction and only for the unrecognised ones.

### F6 — documents contradicting shipped behaviour. **CLOSED.** bp-0008 and ac-0008 amended,
Amendment 7 added covering the flip, the same-source tree/detail cutover and the role gap; the stale
`req-0040` reference corrected to pij plan 138 phase 2 (unscheduled). Receipts record
`ddocs build --check` `drift:false` for all three documents.

### The disjoint-ids fixture rule — **APPLIED, and applied where it bites.**

`focus-route.test.ts:45-46` uses `SEAT = 'pij-focusable-seat'` for the legacy executor and
`RS_SEAT = 'rs-focus-only-seat'` for the rs client, wired through the **real** composite with the
comment *"Disjoint ids through the REAL composite: falling back to the old reader must not
green-test."* `:778` then asserts that requesting the legacy-only id under rs returns 404. That is
the rule doing its job: the exact fixture that hid F1 now fails if the fallback returns.
`composite-pij-records.test.ts:54` pins the routing itself.

---

## New items — all LOW, none blocking

### D1 — one corrupt parent link blanks the entire hierarchy. LOW-MEDIUM.

`parentForest` throws `RsError('wire')` on a cycle (`rs-pij-records.ts:145`) or on duplicate ids
(`:115`), the tree route converts that to a 503 (`tree/route.ts:66`), and the whole forest — for
every workspace on the machine — disappears. It degrades visibly rather than silently (`errors.tree`
renders, `phase` goes degraded), which is why this is not higher.

But it is the shape Amendment 6 F7 already ruled against one layer down: *"ONE MISSING SEAT KILLS
THE WHOLE 840-ROW READ … Capability provenance is not worth the roster."* One bad link is not worth
the forest either. Live data is clean today (0 cycles, 0 duplicates over 918 seats), so this is
latent, not active. Cheaper and consistent: drop the offending members to roots, keep the forest,
and surface the fact — the same "continue with what we have" discipline F7 established.
`rs-pij-records.test.ts:282` pins the current throw, so this is a deliberate choice; I am asking you
to re-take it, not reporting a bug.

### D2 — `identity-unverified` is now the dominant refusal, and it conflates three observations. LOW.

RAN: **753 of 810** pane-bearing seats reach `processBelongsToPane` and fail because the recorded
pid is simply not running. They refuse with *"the recorded process identity for X could not be
verified in its pane"* — the same string as the 8 genuine pid-recycle cases and as a moved pane.

Safe (it never over-claims) and correct, but ~93% of rs focus clicks will now land on copy that
reads like a chainglass malfunction, when it is in fact the corpse census this plan exists to be
honest about. A plan that spent Amendment 2 separating *"the seat did not say"* from *"the source
cannot know"* can afford to separate *"the process this seat recorded is not running"* from
*"a different process now holds that pid"* from *"the pane moved under us"*. Three observations,
three strings; the union already has room.

### D3 — `maxBuffer` on the process read. NIT.

`execFile(..., { maxBuffer: 1024 * 1024 })` for `ps -axo pid=,ppid=,lstart=`. RAN: 1,505 rows ≈
53 KB, so ~20× headroom today. Exceeding it fails closed (`identity-unverified`, 503), so the risk
is a confusing refusal on a very large process table, not a wrong focus. Noted only.

---

## Gates — all RAN in this checkout

| Check | Result |
|---|---|
| `pnpm vitest run test/unit/web/pij` | exit 0 — **35 files / 548 tests**, matches the receipt exactly |
| `pnpm vitest run` (full) | **546 passed / 9 skipped (555 files); 7,346 passed / 69 skipped (7,415 tests); zero failures** |
| `just typecheck` | exit 0, all 9 workspace tsconfigs |
| `just lint` | clean, 1,803 files |

The full-suite totals differ slightly from the receipt's 7,352/63 for the same reason I diagnosed
last round: `just fft` runs `build` first, which un-skips a file or two. Zero failures either way —
the gate is green and I reproduced it.

Live probes (read-only, no restarts, no writes, `--watch-pane` not run): live roster read, rs tree
through the production adapter with a real git worktree resolver, and the click-time identity
algorithm replicated against `ps` and `tmux display-message`.

---

## What remains outstanding — not a finding

One receipt: the post-restart page proof for hierarchy and focus. You already own it and the commit
already declines to claim it. When it runs, the two things worth capturing are (1) `/api/pij/tree`
returning `structureSource: 'rs-parent-links'` from a *fresh* singleton rather than the HMR-held
composite, and (2) one successful focus click and one refused one — because after this change the
refusal is the common path, and D2 is about whether the refused click reads as an honest observation
or as a broken button.
