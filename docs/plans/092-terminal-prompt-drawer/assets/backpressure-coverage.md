# Backpressure Coverage — terminal prompt drawer

> **PARTLY SUPERSEDED — 2026-08-09, `dce6ac368`.** This is a **point-in-time survey**, dated
> below, not current guidance. The prompt-list rows still name
> `scratch/prompt-drawer-list.md`; that file **no longer exists**, and neither does the
> file-parity test they call for. The list collapsed to a single authoring surface,
> `PROMPT_TEXTS` in `lib/terminal-prompts.ts`, so there is no second copy to keep in parity
> and nothing is owed. **Do not read the parity rows as work to do.** The live record is
> `plan.dd.json#acceptance_criteria/ac-0006` and `backpressure.dd.json#rows/bp-0007`, both
> now `na` with the supersession recorded. Rows are left as written rather than edited —
> a survey that is quietly revised stops being evidence of what was believed when it ran.

**Plan**: [plan.dd.md](../plan.dd.md) (source of truth: `plan.dd.json`)
**Basis (plan SHA-256)**: recorded in [`backpressure.dd.json`](./backpressure.dd.json) `#meta/basis_sha` — the machine-readable twin of this file
**Generated**: 2026-08-08
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores.
> Selection, not enforcement: nothing here executes at phase end — the proof lines
> below are what the plan's owner folds into each criterion's "done when".

> **This survey has two artifacts, deliberately.** The dd-native plan's `pressure`
> links target `builder/backpressure/section/rows`, so the rows must live in a dd
> document — [`backpressure.dd.json`](./backpressure.dd.json), which the plan's
> acceptance criteria and every task's `done_when` assertion now link to. This
> markdown file is the human read of the same survey. The dd document is
> authoritative; if the two ever disagree, the dd document wins.

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| terminal feature unit suite | `pnpm vitest run test/unit/web/features/064-terminal/` | behaviour | root `vitest.config.ts` — jsdom via `environmentMatchGlobs` for `**/*.test.tsx` and `**/web/**/*.test.ts`. Verified green 2026-08-08: 19 files, 208 tests, 7.6s |
| whole test suite | `just test` | behaviour | `justfile` → `pnpm vitest run` |
| typecheck | `just typecheck` | maintainability | `justfile` — composite across 9 tsconfig projects. Verified green 2026-08-08, 18.8s |
| lint | `just lint` | maintainability | `justfile` → `pnpm biome check .` |
| combined gate | `just check` | behaviour | `justfile` — lint + typecheck + test |
| harness browser e2e | `just test-harness` | behaviour | `harness/playwright.config.ts` — real-browser tier, scoped to harness tooling, not `apps/web` |

## Coverage Matrix

Full rows, with ids, states and `pressure` targets, live in [`backpressure.dd.json`](./backpressure.dd.json). Summary:

| Criterion / failure mode | Row | Selected proof | Status | Tier |
|---|---|---|---|---|
| Toggle renders in the shared pane header, so both surfaces get it | bp-0001 | EXTEND→RUN: add a drawer spec rendering the header in both hosts; then the terminal suite command | EXTEND | computational |
| Drawer opens/closes; Escape does not close the terminal | bp-0002 | EXTEND→RUN: open/close + Escape-precedence cases | EXTEND | computational |
| Drawer reads as full height and ~one third width, over the terminal | bp-0003 | — | ABSENT | human-judgement |
| Rows truncate with an ellipsis and expose full text on title | bp-0004 | EXTEND→RUN | EXTEND | computational |
| Paste writes the text with nothing appended | bp-0005 | EXTEND→RUN | EXTEND | computational |
| Run writes the text plus exactly one carriage return | bp-0006 | EXTEND→RUN | EXTEND | computational |
| Shipped list equals `scratch/prompt-drawer-list.md` | bp-0007 | EXTEND→RUN: parity test | EXTEND | computational |
| Backticks / `$(…)` / quotes survive byte-identical | bp-0008 | EXTEND→RUN | EXTEND | computational |
| Singleton undisturbed — one socket, one tmux client | bp-0009 | EXTEND→RUN | EXTEND | computational |
| New context method typechecks across every project | bp-0010 | RUN: `just typecheck` | EXISTS | computational |
| New files pass lint/format | bp-0011 | RUN: `just lint` | EXISTS | computational |

**bp-0003 probe trail**: globbed `**/playwright.config.*`, `**/cypress.config.*`, `**/*.e2e.*` across root, `apps/*`, `packages/*`, `harness/`. Only `harness/playwright.config.ts` matched, and its suite drives harness tooling rather than `apps/web`. jsdom reports no computed layout, so asserting a class would prove the class was written — not that the proportion reads right.

## Proof Plan (selected)

### Phase 1: Implementation

| Proves | Mode | Proof line |
|--------|------|------------|
| bp-0010, bp-0011 | RUN | `just typecheck` · `just lint` |
| bp-0001, bp-0002, bp-0004…bp-0009 | EXTEND→RUN | add the cases named per row to `test/unit/web/features/064-terminal/`, then `pnpm vitest run test/unit/web/features/064-terminal/` |
| bp-0003 | — | human: Jordan exercises it under HMR in `main` |

## Certainty: Partial

Counts (behaviour/architecture rows): **2 RUN · 8 EXTEND · 0 BUILD · 1 ABSENT**
Recommended next move (per-task lookup, advisory): **any `EXTEND` gaps → propose the extension(s) first** — the cheapest move, landing in a proven home.

Rationale: no behaviour criterion needs a sensor built. Every one of them extends a suite that already exists, already runs under one paved command, and was verified green today. The single `ABSENT` row is visual proportion, which is human-judgement by nature and does not drag the rating.

## Recommended Phase 0: Establish Backpressure (build or extend)

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens |
|---|---|---|---|
| extend the terminal feature unit suite | bp-0001, bp-0002, bp-0004, bp-0005, bp-0006, bp-0008, bp-0009 | new spec file + cases in `test/unit/web/features/064-terminal/` | `pnpm vitest run test/unit/web/features/064-terminal/` (same command, stronger) |
| extend the same suite with a fixture-parity check | bp-0007 | a test that reads `scratch/prompt-drawer-list.md` and deep-equals the shipped list | same command |

**No separate Phase 0 is warranted.** Every extension above is already a task in this plan — `tk-0002` (parity) and `tk-0006` (payloads, truncation, singleton stability) — so standing up a preceding phase would add ceremony without adding proof.

## Closing Verdict

Here's how we'll know this is actually done.

**One thing I already did, automatically:** I wrote the how-to-prove-it commands into this plan, and wired them so each promise points at the exact check that proves it. Every acceptance criterion in the plan and every "done when" line on every task now links to a row in the survey document beside this one. That matters because it means "done" stops being an opinion — when the commands pass, those promises are kept, with no judgement calls. And it's written where the work lives, so whoever picks this up later sees it even after this conversation is gone.

Most of this is **provable after extending one thing we already have.** There's a test suite for the terminal feature that runs under a single command, and I ran it today — nineteen files, two hundred and eight tests, green in under eight seconds. Nothing new needs building. The two checks that matter most are the ones that watch what actually reaches the terminal: that "paste" sends your text and nothing else, and that "run" sends your text followed by exactly one Enter. That second one is worth being fussy about — a check that only looks at the end of the message would happily pass on two Enters, which runs your command and then submits a blank line. So the check counts them.

There's one more worth naming: a test that reads your prompt file and fails if the shipped list has drifted from it. You said the list must not be hardcoded to something different — that turns it from a promise someone has to remember into a check that can't be forgotten.

And a fix-the-checker-first note: if these all pass but you look at it and say it's not done, the checks are wrong. We fix the check first, then the code — so that particular mistake can never slip past again.

**One thing that can only be judged by you:** whether the drawer *looks* right — full height, about a third of the width, sitting over the terminal rather than squashing it. No command can judge a proportion. That's the reason you're working in `main` with hot reload rather than in a worktree: you'll see each increment as it lands.

**One thing I'd like your OK on:** the send path. Your ask said "using send keys", but the terminal already holds a live channel to the shell, and anything sent down it lands verbatim — no shell-out, no working out which pane, and no risk that a prompt containing backticks or `$(…)` gets mangled or, worse, executed as something you didn't write. I've planned it that way. Say the word if you want `tmux send-keys` instead; it's confined to one file, so switching costs one task rather than the plan.

**In summary:** the commands will prove that the right bytes reach your shell, that a prompt with awkward characters survives intact, that the shipped list still matches your file, and that opening the drawer doesn't disturb the terminal underneath. The one thing left to your eyes is whether the drawer looks right on screen. The recommended next move for this task is to extend the existing suite rather than build anything new — two RUN, eight EXTEND, nothing to build. The approval I'm asking for is on the send path: confirm the direct-to-terminal route, or tell me to use `tmux send-keys`.
