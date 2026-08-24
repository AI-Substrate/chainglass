# Post-flight — 092-terminal-prompt-drawer

**Closed out**: 2026-08-24T20:53:27Z
**Archived to**: docs/plans/archive/092-terminal-prompt-drawer/
**Shipped**: yes — already on `origin/main` before this close-out (see Completion)

Closed on Jordan's word, 2026-08-24: *"close it out, its done"*, confirming the
2026-08-09 close (*"prompt drawer is done"*). The substantive close-out note written at
that time is preserved beside this one at `assets/close-out.md` and is the fuller record
— this note is the archive receipt, not a replacement.

## Completion

| Check | Result |
|-------|--------|
| Phases / tasks | ph-0001 7/7 checked · ph-0002 7/7 checked · ph-0003 2 tasks human-skipped (folded) |
| Acceptance criteria | 16 checked · 1 `na` · 1 human-skipped (`ac-0018`, folded — criterion NOT met) |
| Latest review | no review file on disk; ph-0001 and ph-0002 were cross-model reviewed and mutation-verified in-flight, and ph-0002 was gate-checked at the phase edge |
| Shipped to main | `fb87047a4` UI · `f4a9d36c2` send path · `dce6ac368` prompt-list merge · `599608f16` pane-targeting fix — all on `origin/main` |

## Open / deferred items

_Carried into the archive on the user's explicit go-ahead. Four rows were folded
deliberately by the human; one is **blocked and carries forward**._

| Kind | Item | Where | Note |
|------|------|-------|------|
| folded | `ph-0003` Submit verification | plan.dd.md § Phases | Never ran. Existed to replace an exit-code claim with an observed one; gated end-to-end on `oq-0004`. What shipped instead is the honest fallback: the drawer claims nothing it cannot prove — failure toasts only, no success signal. The at-most-once re-press mechanism is built and inert. |
| folded | `tk-0201`, `dw-2011` | assets/tasks/phase-3 | Folded with their phase. |
| folded | `ac-0018` submit reported succeeded only when observed | plan.dd.md § Acceptance criteria | **This criterion is not met and was never attempted.** Recorded as a silence, not a false claim. |
| folded | `oq-0004` does never-`capture-pane` bind product code? | plan.dd.md § Open Questions | **Never ruled** — moot, not open. Marked `human-skipped` rather than `unchecked` so a later reader does not read it as a live invitation to fetch a ruling nobody is coming to give. |
| **blocked — CARRIES FORWARD** | `bp-0017` repo gate green at every phase boundary | assets/backpressure.dd.md:52 | **NOT folded, and not about the drawer.** The repo test gate is nondeterministic — measured failure sets of 1, 2, 5, 2 and 0 across five `just test` runs on an unchanged tree, so a single green run is not evidence the gate passed. `test/helpers/tmpdir.ts` (`f8dbbf57f`) is a measured fix (6/10 → 0/10, Fisher p≈0.011) and is **currently unused**; the 62-site sweep is parked on Jordan. Separately, `just test` is EXIT=1 on main from DL-001, a pre-existing failure this stream never touched. |

### Where `bp-0017` goes now

It attaches to whatever is built next in this repo, not to this plan. It was already
re-declared once on the rename-window work (2026-08-09). Archiving 092 does not close it,
and this row is the reason the archive is not a clean 3-of-3 green.

## Archive record

- `git mv docs/plans/092-terminal-prompt-drawer docs/plans/archive/092-terminal-prompt-drawer`
- `harness flow relocate` **skipped**: `harness flow list` returns zero flows and there is
  no `.harness/flows/` directory, so no flight plan is registered against this folder.
  Checked for the hazard that skip normally implies — root-anchored `dd_link` gate
  addresses stranded by the move — and found none: the six `dd_link` hits in
  `plan.dd.json` are prose inside note text, not gate addresses, and no
  `docs/plans/092…` address appears anywhere in the file.
