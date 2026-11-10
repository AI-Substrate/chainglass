# Orient — local (lever 2)
**Scope**: chainglass · o-prime single writer · `<government-root>` = `/Users/jordanknight/substrate/chainglass-governance/.harness/government`

## What this project is

Chainglass: first-class enrichment workflow for spec-driven development (README). A
Next.js 16 web app (`apps/web`), the `cg` CLI (`apps/cli`), and shared packages, used
daily by Jordan as the operator console for workflows, files, terminals and the pij
fleet (pij rail, plans 089/090). Pillars: real workspace data over mocks, server
components by default, the browser surface is the product (verify it, not just tests).

## Mandatory orient reads

- `AGENTS.md` (repo rules, Definition of Done, no pre-existing errors)
- `docs/project-rules/constitution.md`, `rules.md`, `idioms.md`, `architecture.md`
- `docs/domains/domain-map.md` and `docs/domains/registry.md`
- `docs/c4/README.md` when a change touches domain boundaries
- `RULINGS.md` in this tree

## What matters here

- Done = `just typecheck` + `just lint` + `just test` fully green, full output read; `just fft` before every commit.
- Green-but-wrong: tsc and vitest pass while Turbopack refuses a server-only import in a client chunk; UI work needs a browser check.
- `just dev` belongs to Jordan: never start, stop or restart it.
- PRD reconciliation owner: the current o-prime (pij-outer-bobcat from 2026-11-10); transfer at rotation.

## Repo mechanics

| Question | This repo's answer |
|---|---|
| Cheap quality gate | `just check` (lint + typecheck + test); `just test-feature <plan>` during work |
| Full pre-ship gate | `just fft` (adds build + security-audit) |
| Notify-only worktree actions | reads, edits, gates and commits inside a stream worktree |
| Non-hermetic commands | `just install` (links CLI globally), `pnpm install` (shared store), `just dev` (Jordan only), harness-tools Docker |
| Batons | landing on main (one pusher at a time; free = `git status` clean on main and no other seat mid-commit); the host dev server (Jordan's) |
| Never-stage list | `.serena/project.yml`, `apps/web/next-env.d.ts`, `docs/retros/code-review.md`, `scratch/`, `.chainglass/` |
| Flow-state rule | `the-flow.json` / `the-flow.md` written only by `harness flow` |
| Worktree root | `/Users/jordanknight/substrate/` (siblings of main) |
| Worktree naming | `<ord>-<slug>` or `chainglass-<ord>`, branch `<ord>-<slug>` |
| Base branch | `main` (`git rev-parse origin/main`) |
| Landing policy | Jordan's ruling: commit and push main directly after `just fft`; streams on branches converge through the prime |
| Shared-tree fallback | default for small fixes on main (Jordan's working practice); stage by path |
| Fleet defaults | omp/claude seats; cross-model review via `/builder 7 review` |
| Human digest channel | this pane (pij-outer-bobcat), self-identified |
| Ceremony tier | cheap omp/pi worker |

## Current portfolio context

- Portfolio: store project `chainglass` (`pij project show chainglass`).
- No streams in flight. Shipped 2026-11-10: designated-prime badge (`1c53ce569`, `b4f633b3b`, `6d60581f1`, worker pij-liquid-carp); live screenshots wait on Jordan restarting `just dev`.
- Pending Jordan decisions: pij-rs event-log compaction (2.4 GB); daily sshd disable by device policy; Co-Authored-By trailer (AGENTS.md "no AI attribution" vs handover rule).
- ~~Watch: borrowed caller in `RsClient.projects()`~~ closed 2026-11-10: pij F184 (pij-fleet #226) made read-only governance leaves callerless; `6d60581f1` dropped the borrowed caller.
