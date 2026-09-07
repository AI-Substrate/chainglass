# Packet — make chainglass read pij-rs, and make the rail honest about it

**From**: pij-lonely-antelope (chainglass o-prime). Product owner; final say on scope.
**To**: pij-coherent-silkworm — you implement. Jordan chose you directly.
**Upstream**: pij-minor-unicorn (pij-rs prime). Three questions are with them (§6); answers
come to you through me, never go around me to change scope.
**Plan**: `docs/plans/093-pij-rs-reader/` — read `plan.dd.md`, then `impl-guide.dd.md`
IN FULL, especially Amendments 1–6. `assets/backpressure.dd.md` is the proof roster.
`assets/findings/rs-corpse-census.md` is why the rail cannot claim liveness.
`assets/inputs/TENETS.md` is the doctrine every packet cites instead of restating.

## 1. What is broken, measured

The PIJ rail shows `degraded`, `0 prime · 0 PM · 0 workers`. Live payload from
`/api/pij/fleet` on 2026-09-06: `status.running:false, fleetSize:0, seq:0`.
`use-pij-fleet.ts:541` renders `!status.running` as `degraded`. The poller is not running
because `start-pij-poller.ts:203` gates the LEGACY source behind `PIJ_POLLER=on`, default
off — my kill switch from 2026-09-02, when the legacy CLI poller was burning ~95% of a
core spawning `cli.ts list --json` every tick. The rs reader that replaces it landed on
main today (merge `8362d3f0f`) gated behind `PIJ_SOURCE=rs`, default `legacy`.

So the rail is degraded because the old source is off and the new source is not on.

## 2. Definition of done

`just dev` with NO env vars produces a rail that is `live`, shows the rs fleet, and never
states something about a seat that pij-rs did not tell us. Specifically:

- D1. Default `PIJ_SOURCE` is `rs`. `PIJ_SOURCE=legacy PIJ_POLLER=on` still works unchanged.
- D2. Amendments 4, 5 and 6 are implemented as written. They are rulings, not suggestions;
  if one is unbuildable against the live daemon, STOP and tell me — do not build the
  nearest thing that compiles (the impl-guide records three seams that described a daemon
  that does not exist; do not add a fourth).
- D3. Every backpressure row `bp-0001..bp-0008` has a receipt: the command, its exit
  status, and the number it printed — run by you, in this tree, from a committed script.
- D4. The rail states what it cannot know. See §4.

## 3. Units, in build order

**u5 — Amendment 4, the stream.** `server/rs/rs-event-stream.ts`. Split the resume cursor
from the observed cursor; only DESCRIPTOR kinds (+ `report.*`) advance resume. Recycle the
socket on a timer via AbortController — the daemon never closes it. RECHECKED 2026-09-06
with a positive control (`assets/findings/live-push-recheck-2026-09-06.md`): a `report.now`
at spine 14452 reached neither of two open subscribers while messaging frames at 14453–4
reached both, so descriptor kinds arrive ONLY by replay. The pij-rs prime says replay is
one sqlite read, unlimited, "2–8s is fine" — so the recycle interval is ~5s, not 30s, and
`bp-0003` is re-specified to ≤10s with its second assertion (resume cursor did NOT pass the
`seat.put`) unchanged and load-bearing. `since` MUST be the `{alias: cursor}` map —
`rs-client.ts:141` already does this; an integer is refused by the daemon today. Fixture
rule from the guide: a fake that yields on demand cannot fail to deliver, so this unit's
proof is the live daemon, not the fake.

**u6 — Amendment 5, the row.** `server/rs/rs-pij-records.ts` `mapSeat`. Explicit
`model→boundModel`, `provider→boundProvider`. `rsUnavailable` DERIVED as (fields
`join.ts` reads) − (fields the row carries), seeded from live `unsupported[]`, with a test
asserting the partition. Emit `liveness`, never `liveness:stale`. `terminal` becomes the
typed `{ tombstoneCursor, tombstoneReason, source:'pij-rs' }`.

**u7 — Amendment 6, ingest + resilience.** `server/pij-poller.service.ts` rs path.
Delete `SYSTEM_STATE_KIND` there; `ingest()` acts on `report.state` / `report.now` typed
from `assets/inputs/live-event-frames.ndjson` — every fixture is a captured frame, none
hand-authored. Populate `statuses` from them (F3). `list()` tolerates a `not_found` on the
provenance seat (F7). `established` means a frame BEYOND hello (F8). Land
`scripts/verify-rs-reader.mjs` (F9) — it is bp-0002's proof and does not exist.

**u8 — The flip.** `start-pij-poller.ts:52` default → `rs`. The `PIJ_POLLER` kill switch
stays, scoped to legacy exactly as it is. `bp-0008` re-specified: "`PIJ_SOURCE=legacy
PIJ_POLLER=on` leaves legacy behaviour unchanged; `just fft` green with nothing set."
Check `status.running` is true under rs once the stream is established, or the rail will
stay `degraded` with a working reader — read `use-pij-fleet.ts:536-543` before you decide
the poller's `running` semantics are fine.

**u9 — oq-0004, the honest rail.** pij-rs reports 716 of 744 paned seats as `idle` and
they are dead. Ruling already taken (boa's, adopted): handle it PERMANENTLY. Minimum
scope: (a) a collection-level flag in the snapshot (`livenessUnavailable: true`, sibling
of Amendment 6's `statusesUnavailable`) and (b) the rail header's "N seats currently hot"
and any hot/idle/active derivation must NOT be computed from rs `state` — render the
unavailable marker the row already supports. Do NOT compute liveness from `proc.pid` in
this unit; whether that belongs in chainglass is question 2 in §6 and I will rule when
unicorn answers. If it is trivially local (one `ps` per tick is NOT trivial — that is the
disease we are curing), say so and wait.

## 4. Constraints — the pij-rs owner's, non-negotiable

Reader only: no `/v1/register|send|adopt`, no writes. Never read `~/.pij-rs/pij.sqlite`.
ONE `/v1/events` subscriber, never per-row. Read `daemon.key` from disk each time it is
needed; one 401 retry, never a loop. These are in the impl-guide § architecture; a review
finding against any of them is an automatic fail.

## 5. Proof discipline, and what you cannot run

- Receipts distinguish RAN from READ. A number attached to the wrong claim is worse than
  no number — that exact mistake is on record in this plan under my name (bp-0003).
- `bp-0001` needs the dev server restarted with the new default. Jordan runs dev; you do
  not start, restart or kill it. Say "needs restart" in the receipt and ask him.
- `bp-0005` restarts the SHARED rs daemon, which disrupts every seat on the machine
  including yours. Do not run it without Jordan's explicit word in your conversation.
  Mark it `blocked: needs authorization` — an unrun row reported green is the one thing
  this plan will not forgive.
- Gate: `just lint`, `just typecheck`, `just test` green. `security-audit` is red on 124
  pre-existing advisories; you have already handled that with Jordan once, handle it the
  same way.
- Commit on main when green, one commit, Amendments 4/5/6/flip/oq-0004 each on their own
  body line. Push per Jordan's standing authorization. I will spawn a cross-model reviewer
  against your sha after — write the receipts file for them, not for me:
  `docs/plans/093-pij-rs-reader/assets/dispatch/RECEIPTS-silkworm.md`.

## 6. Upstream answers (pij-minor-unicorn, 2026-09-06, source main 217d66c3)

1. Fan-out: unicorn reads the source as one bus, all kinds. The wire disagrees — see u5 and
   the findings file. Build for replay-only; unicorn is bisecting. No rate limit on replay.
2. Liveness: plan 135 added NO derived field. `proc` is `{pid, proc_start}`; alive ⇔ pid
   exists AND its current start time == `proc_start` ("compared, never interpreted"; pid
   alone is recycled at boot). For Claude seats `pid` is now the Claude process, not the
   pane shell. `proc: null` = paneless. No reaper; ~716 corpses are real. RULING for u9(b):
   chainglass does NOT compute liveness this round — one `ps` per row per tick is the
   disease we are curing, and a batch `ps -o pid,lstart` join is a separate unit with its
   own proof. u9 ships the explicit-unavailable marker only. I will scope the batch join
   after review.
3. Shape: additive only since 09-03. Row gains `native_extension_delivery` (bool, plan
   137) and `spawn_id/model/provider/effort` when spawned. Frame unchanged; `payload` is
   STILL a JSON string — decode twice. Auth unchanged. There is no rs API doc; the
   golden fixture is `crates/testkit/fixtures/golden/cli/list-envelope.json` in the pij
   tree (READ-ONLY reference — never work in ~/pi-hacking/pij).

## 7. Working agreements

Shared tree: `git diff --cached` before any commit, an unexpected dirty file is a question
to me, not a revert. flowspace3 before grep for anything meaning-shaped; report misses to
me as friction. Ask me product questions; ask Jordan nothing I can answer. If you find the
plan is wrong about the daemon, that is the most valuable message you can send — send it
before building around it.
