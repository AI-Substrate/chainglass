# Brief — plan 087, the draft-store half

You are PM for the remaining half of **plan 087 auto-save-editing** in
`/Users/jordanknight/substrate/chainglass`. Report to `pij-chief-roadrunner` (o-prime).

## What already shipped — do not rebuild it

`efb8702f8` on `main`: auto-save when the user **navigates away** from an editor.
`apps/web/src/features/041-file-browser/hooks/use-auto-save-on-leave.ts`, wired in
`browser-client.tsx`. Covers picking another file, unmounting the page, and the tab being
hidden. Writes the **target file**, atomically, via the existing save path. 7 unit tests,
each of the three guards mutation-verified, and confirmed by driving the real app.

## What is left — the draft store

The spec is written and has 11 ACs: `docs/plans/087-auto-save-editing/auto-save-editing-spec.md`.
Read it and the authoritative workshop
`docs/plans/087-auto-save-editing/workshops/001-draft-storage-model-and-lifecycle.md`
before proposing anything. Read the decision record appended at the END of the spec
(2026-08-28) — it changes what AC-1 covers.

Scope: idle-debounce autosave to a **draft**, never the target; explicit save writes the
target and deletes the draft; a draft that outlives its session is offered for restore on
next load; 30-day sweep; `saveDraft`/`readDraft`/`deleteDraft` server actions with
`requireAuth()` + `resolvePath()` fail-closed.

Research says this is ~90% reuse — `useAutoSave`, the atomic write, and `saveFile` all
exist. If you find yourself writing a new atomic-write or a new debounce, stop: you have
missed the existing one.

## The blocker you must resolve FIRST — Q1

**Does the `.chainglass` data watcher react to writes under `…/drafts/`?** The *source*
watcher is confirmed to ignore `.chainglass` (ADR-0008), but a separate *data* watcher
covers `.chainglass`. If it enumerates all of `.chainglass/data`, a draft write will loop
the file-browser tree. Workshop recommendation: put drafts at `.chainglass/drafts/`
(OUTSIDE `data/`) and confirm nothing subscribes there. **AC-2 is the acceptance test
regardless of where they land.**

This is a question about code, not about Jordan. Answer it by reading the watcher's
subscription scope. Do not ask him to rule it.

## Standing constraints

- **Commit and push `main` freely** (Jordan, 2026-08-24, standing). Do not park green work.
- **Never run `tmux capture-pane`.** Standing constraint. It is why plan 092's phase 3 was
  never built.
- `apps/web/next-env.d.ts` is chronically dirty. Leave it out of commits.
- The repo gate is **nondeterministic** — `bp-0017`, carried forward from 092. Measured
  failure counts of 1, 2, 5, 2 and 0 on an unchanged tree, so **a single green `just test`
  is not evidence.** A measured fix exists and is unused: `test/helpers/tmpdir.ts`
  (`f8dbbf57f`, 6/10 → 0/10, Fisher p≈0.011); its 62-site sweep is parked on Jordan.
- CI has been red since 2026-08-04 for an unrelated reason: `pnpm install` dies on
  `camera-controls@3.1.2` vs `.nvmrc` 20.19.0, before anything compiles. **Not yours to
  fix** and not caused by your work — do not chase it, and do not read a red CI as your
  regression.

## How I expect you to work

- `pij report now "<did>" "<next>"` at the START and the END of each unit. You owe cards;
  they render in the rail and a stale one actively misinforms.
- Green tests are not proof. **Mutate the guard and confirm the test goes red** before
  claiming a behaviour is covered. This repo has a recorded case of 31 tests passing
  against broken behaviour.
- Verify in the running app (dev server is on :3000, workspace `chainglass`), not only
  under vitest. The bootstrap gate code lives in `.chainglass/bootstrap-code.json`.
- Ask me anything that needs a human ruling; do not sit blocked.

## Forbidden paths — never write these

`.the-flow-state.json` · `the-flow.json` · `the-flow.md` (the-flow guided mode is their
sole writer) · anything under `docs/plans/archive/`.
