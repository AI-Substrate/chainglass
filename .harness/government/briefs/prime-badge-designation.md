# Brief — designated prime badge in the pij rail and terminal fleet overview

Prime: pij-outer-bobcat · Project: chainglass · Date: 2026-11-10 · Jordan ruled "yep do it".

## Problem

A seat that a pij **project record designates as prime** (`prime_id`, see `pij project list --json`)
shows no Prime badge in chainglass unless its seat `role` label also says `prime`. Designation is the
only prime authority in pij (ruling C24); the seat `role` is an optional assertion that designated
primes often leave empty. Live today: `unimatrix` → `pij-loud-stoat` and `pij-fleet` →
`pij-outstanding-silkworm` have `role: null` and render as plain roots.

Root cause (verified by the prime):
- `apps/web/src/features/089-first-class-pij/server/rs/rs-pij-records.ts:142-143` (`parentForest`) and
  `:222` (`mapSeat`) derive `orchestrationRole` / `prime` from `seat.role` only.
- `apps/web/src/features/089-first-class-pij/server/pij-status.contract.ts:162` maps
  `orchestrationRole` to the placement role the UI renders.

Two surfaces show the bug; fix both through the shared data path, not per component:
1. pij rail hierarchy view (`components/pij-rail-view.tsx`, `role-chip.tsx`) — screenshot: `pij-loud-stoat` card has no Prime chip while its PM child shows `PM`.
2. Terminal fleet fold-out above the terminal (`apps/web/src/features/064-terminal/components/terminal-window-overview.tsx`: `isPrimeSeat` line 46, `RoleBadge` line 235; also its "prime windows listed first" ordering).

## Change

- Read project designations from the pij-rs daemon (the same daemon `RsClient` in
  `server/rs/rs-client.ts` already talks to). Find the endpoint `pij project list` uses; read
  `~/pi-hacking/pij` source READ-ONLY to learn it. Never write there.
- A seat is prime if any project designates it; `seat.role === 'prime'` stays as the fallback.
  Apply in both `parentForest` and `mapSeat` so the tree and fleet rows agree.
- A failed projects read must not break the seat list: fall back to role-only and leave the
  existing unavailable/warning mechanism to say so if one fits.
- Reuse existing patterns (search before creating, AGENTS.md). Update the stale doc comment in
  `role-chip.tsx` if your change makes it wrong.

## Acceptance

- A unit test on the mapping: designated seat with `role: null` → prime; non-designated seat with
  `role: 'prime'` → still prime; projects read failure → role-only, list still returns.
- Browser proof on Jordan's running dev server (do NOT start/stop/restart `just dev`): the pij rail
  for the unimatrix workspace shows Prime on `pij-loud-stoat`, and the terminal fleet fold-out shows
  the Prime badge on the designated prime's window. Screenshots saved under `scratch/`.
- `just fft` fully green, whole output read.

## Landing

- Commit on main (Jordan's ruling: commit and push main). Stage BY PATH: your changed files **plus
  `.harness/government/README.md`** (a prime-authored pointer stub already in the working tree;
  include it unchanged in your commit).
- Never stage: `.serena/project.yml`, `apps/web/next-env.d.ts`, `docs/retros/code-review.md`, `scratch/`.
- Message: conventional `fix(pij-rail): …`; trailers per recent commits plus `pij commit-trailers` output.
- Push: `XDG_CONFIG_HOME=~/.config git push origin main`.
- Never `git stash`, `git reset`, `git checkout -- .`. Never edit `the-flow.json` / `the-flow.md`.

## Report

Send pij-outer-bobcat: commit SHA, test names, `just fft` result line, screenshot paths. Questions
about the work go to Jordan only if the prime cannot answer; ask the prime first, in text.
