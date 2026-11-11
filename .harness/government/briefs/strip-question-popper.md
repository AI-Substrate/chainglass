# Brief — strip out the question popper and alerts (plan 067 "Event Popper")

Prime: pij-outer-bobcat · Coder: TBD at spawn · Requested by Jordan, 2026-11-12.

## Jordan's words (cleaned)

"Strip out the alerts functionality and the first-class question thing in the top right, and stop the
alert pop-ups that are happening all the time." Earlier the same day: "the alerts system is no longer
used, and the first-class question UI at the top (which always shows there is a question these days)."

## Decision (prime; Jordan may override)

Full removal, clean cutover (no shims, no feature flag): with the UI gone, `cg question ask` would block
agents for 10 minutes with nobody able to answer, so the CLI and API go too.

## Target

- Web UI: `apps/web/src/features/067-question-popper/**` (indicator top-right, overlay panel, alert
  card, question card, history list, desktop notifications, `use-question-popper`), the mount in
  `apps/web/app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx` and
  `workspaces/[slug]/layout.tsx`, its SSE channel in `WORKSPACE_SSE_CHANNELS`, any toaster/pop-up wired
  to alerts, and anything in `apps/web/src/lib/**` that only serves it.
- API: `apps/web/app/api/event-popper/**` routes for questions and alerts.
- CLI: `apps/cli/src/commands` `question` and `alert` commands and their wiring.
- Shared: `packages/shared/src/question-popper/**` and exports.
- Tests: `test/unit/question-popper/**`, related `test/integration/web/**`, `test/unit/web/sse/**` cases.
- Docs: AGENTS.md "Event Popper CLI (Plan 067)" section; `docs/domains/**` entries, `docs/c4/**` (per
  AGENTS.md, keep C4 in sync), `scripts/scripts.md` if any script goes. Historical `docs/plans/**`
  stay untouched (history).

## Watch out (find out, don't assume)

- `event-popper` may host more than questions/alerts: plan 080 (tmux eventing) and plan 084 (sidecar
  HTTP sink) reference it. Anything that is not question/alert stays and keeps working; say what you
  kept and why.
- Find every caller of `cg question` / `cg alert` / `/api/event-popper` outside apps (agents/, harness/,
  scripts/, prompts, justfile, `.github/`), and remove or repoint each.
- "Pop-ups all the time": confirm their source in code (alert toasts, desktop `Notification`, a
  polling loop). If any pop-up comes from something other than 067, report it to the prime before
  touching it.

## Acceptance

- No top-right question indicator, no alert pop-ups, no desktop notifications from this feature.
- `rg` for `question-popper|event-popper|QuestionPopper|cg question|cg alert` outside `docs/plans/**`
  returns only what you deliberately kept (listed in your report).
- `just fft` green at `nice -n 19` (full output read). Browser check on Jordan's dev server (do not
  restart it): a workspace page loads with no indicator and no console errors; screenshot in `scratch/`.
- Commits on main, stage by path, push. Report SHAs, removed/kept lists, screenshot path.

## Rules

RULINGS 1-11 (`/Users/jordanknight/substrate/chainglass-governance/.harness/government/RULINGS.md`),
AGENTS.md. Main tree hot-reloads in Jordan's dev server: keep every save compiling (remove the mount
first, then the feature). Never touch `just dev`. A separate reviewer seat will review your commits.
