# Close-out — plan 092, terminal prompt drawer

**Closed** 2026-08-09 by Jordan, verbatim: **"prompt drawer is done."**
**Shipped**: phases 1 and 2 of 3. **Phase 3 was folded by the human, not delivered.**

This plan does not read 3-of-3 green, and that is the point of this note. A plan that
shipped two phases with the third folded is a good record; a plan that reads complete
when a phase never ran is a false one.

## What shipped

The drawer, in the shared pane header, with prompts delivered to the agent by
`tmux send-keys` — argv + `-l` (two layers, both required), bracketed paste for
multi-line, `CSI I` focus-in before typing, a 900 ms conservative-maximum settle, and a
per-target promise queue wrapping the whole focus → type → settle → Enter sequence.
Commits `fb87047a4` (UI) and `f4a9d36c2` (send path).

## What was folded, and why

| row | now | |
|---|---|---|
| `ph-0003` Submit verification | `human-skipped` | folded |
| `tk-0201` verify by reading the pane | `human-skipped` | folded — it *was* `oq-0004` |
| `dw-2011` pending vs consumed payload | `human-skipped` | folded with its task |
| `ac-0018` submit reported succeeded only when observed | `human-skipped` | folded — **this criterion is not met** |
| `oq-0004` does never-`capture-pane` bind product code? | `human-skipped` | **never ruled** — moot, not open |
| `bp-0017` repo gate green at every boundary | `blocked` | **NOT folded** — carries forward |

Phase 3 existed to replace an exit-code claim with an observed one, and every part of it
turned on `oq-0004`. Jordan moved on without ruling it, so the question is moot for this
plan rather than answered.

**The fallback the phase was designed around is what shipped.** The drawer claims nothing
it cannot prove: there is no success signal at all, failure toasts only (`ac-0014`,
checked). The absence is a silence, not a false claim — which is why folding phase 3
leaves a coherent feature rather than a hole.

`tk-0202` was built independently of the pane read, is done, and survives the fold
untouched. The at-most-once re-press mechanism is built and **inert**: `sendPromptKeys`
takes an optional `isPayloadPending` predicate, and with none supplied the loop never
runs. Reopening this is one task, not a phase, and it starts by getting `oq-0004` ruled.

## The corollary worth keeping

**A ruling mutates three things — the criterion, the code, and the question row that
proposed it — and the third has no owner and no gate, so it rots by default.** This plan
was bitten by that twice. `oq-0004` is therefore recorded as `human-skipped` rather than
left `unchecked`: an unchecked row reads to a later reader as a live invitation to go and
fetch a ruling nobody is coming to give.

## `bp-0017` carries forward

The repo test gate is **nondeterministic** — measured failure sets of 1, 2, 5, 2 and 0
across five `just test` runs on an unchanged tree. **A single green run is not evidence
the gate passed**; the 0 is the most valuable entry in that series precisely because it
would have ended the enquiry. `test/helpers/tmpdir.ts` (committed `f8dbbf57f`) is a
measured fix — 6/10 → 0/10, Fisher p≈0.011 — and is **currently unused**; the 62-site
sweep is parked on Jordan.
