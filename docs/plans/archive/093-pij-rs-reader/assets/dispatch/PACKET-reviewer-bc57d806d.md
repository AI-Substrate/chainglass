# Review packet — plan 093, sha `bc57d806d`

**From**: pij-lonely-antelope (chainglass o-prime). **Role**: cross-model reviewer,
READ-ONLY. You judge; you do not fix. Your model is deliberately not the coder's.
**Checkout**: `/Users/jordanknight/substrate/chainglass-093-review` — detached at
`bc57d806d`. Work THERE, not in the main checkout (it is a shared tree that moves). `cd`
into it first; run `pnpm install --frozen-lockfile` if `node_modules` is absent.
**Coder**: pij-coherent-silkworm. Its receipts: `docs/plans/093-pij-rs-reader/assets/dispatch/RECEIPTS-silkworm.md`.
Its packet: `PACKET-silkworm-rs-default.md` beside it. The rulings it built to: impl-guide
Amendments 1–6 (`impl-guide.dd.md`), plus `assets/findings/live-push-recheck-2026-09-06.md`.

## What you are judging

The commit makes chainglass read pij-rs by default (`PIJ_SOURCE` default `rs`) and
implements Amendments 4–6 plus an "honest rail" for a fleet where 716+ seats are corpses
reported `idle`. 36 files. The prior review of this plan filed nine findings, all upheld;
you have their text in `U1-REVIEW.md` and `RULING.md` in this folder — read them so you
do not re-file what was already ruled, and so you can check whether each ruling was
actually implemented rather than described.

## Order of attack — highest-value first

1. **Fidelity to the rulings.** For each of Amendments 4, 5, 6: find the code that
   implements it and the test that pins it. A ruling implemented in prose and not in a
   test is a finding. The invariants that matter most, in order:
   a. Resume cursor advances ONLY on kinds the reader acts on AND that arrive only by
      replay (`seat.*`, `report.*`). Pushed kinds (`message.*`, `delivery.*`, `spawn.*`)
      never move it. `rs-event-stream.ts`.
   b. `rsUnavailable` is DERIVED (consumer fields − carried fields), partition asserted.
   c. `ingest()` acts on real `report.now` / `report.state` from captured frames
      (`assets/inputs/live-report-frames-*.ndjson`); nothing hand-authored; no
      `system-state` kind on the rs path.
   d. Fresh descriptor is the authority over cached `report.state` (the revival defect the
      coder's own critic found). Check the race guard, not just the happy path.
   e. Legacy path unchanged under `PIJ_SOURCE=legacy PIJ_POLLER=on`.
2. **The receipts.** Every RAN row names a committed command. Re-run at least `--all`,
   `--auth` and `--replay` from `scripts/verify-rs-reader.mjs` yourself and compare
   numbers. A receipt you cannot reproduce is a finding against the receipt, not the code.
   Do NOT run `--watch-pane` (it adopts a scratch seat into the shared daemon and adds a
   permanent registry row) and do NOT restart anything.
3. **Delivery, not content.** The last review's generalisation: a fake that yields on
   demand cannot fail to deliver. Find every test that mocks the event stream and ask what
   it would fail to catch. The live proofs are in the receipts; check the tests do not
   claim more than the fakes can show.
4. **The honest rail (u9).** Under rs, nothing in the UI may derive hot/idle/alive from
   `state`. Grep for it. The header "N seats currently hot" is the historical offender.
5. **Two findings from the repo's native reviewer were fixed late** (cleared `lastError`
   not published after recovery; `spawn.*` refresh not fencing stale `report.state`).
   Verify both fixes and that each has a test.

## Constraints you enforce

Reader only (no `/v1/register|send|adopt` from app code), no sqlite reads, ONE subscriber,
`daemon.key` re-read per use with one 401 retry. Any violation is an automatic fail.

## Output

Write `docs/plans/093-pij-rs-reader/assets/dispatch/REVIEW-bc57d806d.md` IN THE MAIN
CHECKOUT (`/Users/jordanknight/substrate/chainglass`) — the review checkout is disposable
— then send me the path. Findings numbered F1..Fn, each with: file:line, what the code
does, what the ruling/receipt claims, why they differ, severity. Verdict at the top:
APPROVE / REQUEST_CHANGES. Distinguish RAN from READ throughout. No findings is a valid
outcome and must be stated as one, with what you ran to conclude it.

Do not commit, do not push, do not edit source. flowspace3 before grep for meaning-shaped
questions; report misses to me.
