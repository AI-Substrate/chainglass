# Brief — chainglass navigation and page-load speed review

Prime: pij-outer-bobcat · Reviewer: pij-lonely-antelope · Requested by Jordan, 2026-11-12.

## Jordan's words (cleaned)

"chainglass is getting very slow. Page loads constantly show the compiling indicator. I use it in dev
mode as we work on it and like that updates come easily, though even then I restart the dev server
often, so prod mode is a consideration. Review the codebase, run some tests, find opportunities to
speed up navigation in the site, find weak spots. The alerts system is no longer used, nor the
first-class question UI at the top (which coincidentally always shows there is a question these
days). I will work with antelope as it explains what it will look for: architectural, the way it
builds pages. Something must be slowing it down."

## How to work

1. **First, talk to Jordan** (text only, one question at a time; RULINGS rule 1). Explain what you
   will look for and how you will measure it before you dig in. He wants to work through it with you.
2. Investigation and measurement only. **No product code changes** without Jordan's or my go; fixes
   become briefs I dispatch.
3. Report findings ranked by expected gain, each with evidence (numbers, file:line), and say which are
   dev-only (Turbopack compile cost) versus also hurting production.

## Where to look (starting hypotheses, not conclusions)

- Dev compile cost: per-route compile on first navigation; how much each route/layout pulls in. Barrel
  `index.ts` re-exports dragging large graphs into every page; client components importing server-heavy
  or large libs (shiki must stay server-only, mermaid, xterm, monaco/code editors, charts); icons
  imported whole.
- Layout-level work: what the `(dashboard)` and `workspaces/[slug]` layouts render and fetch on every
  navigation (SSE channel setup, providers, DI container bootstrap, `force-dynamic`, sync fs/exec).
- Always-mounted client features: the unused alerts system and the first-class question UI (polling,
  SSE subscriptions, stale "question" state). Candidates for removal.
- Polling and SSE: hooks that poll on every page (pij fleet, terminal sessions, worktree activity,
  question popper), the mux SSE endpoint, and anything that refetches on window focus.
- Server: route handlers doing synchronous `execSync`/`execFileSync`/fs scans on the request path;
  middleware (`proxy.ts`) and auth cost per request; DI container work per request.
- Dev server health: Turbopack cache size and churn (`just dev` clears it on lockfile change), memory
  growth that forces restarts, file watchers over huge trees (worktrees, `scratch/`, `.chainglass/`).
- Prod mode: what `next build && next start` would cost Jordan (HMR loss), and whether a fast prod-like
  loop is viable. Measure before recommending.

## Measuring

- You may run a production build and `next start` on a spare port (not 3000), at `nice -n 19`, one at
  a time, and stop it when done. Builds are heavy: one build for this review, reused (RULINGS rule 10).
- Use the Next.js MCP (`/_next/mcp` on the running dev server: get_routes, get_errors) and timing on
  Jordan's dev server without restarting it. **Never start, stop or restart `just dev`** (rule 4).
- Browser timing via Playwright against :3000 is fine; read-only.

## Deliver

`/Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md`
(do not commit; the prime commits). Then send pij-outer-bobcat the path and a 5-line summary.

## Rules

RULINGS 1-11 at `/Users/jordanknight/substrate/chainglass-governance/.harness/government/RULINGS.md`;
AGENTS.md. Never `tmux capture-pane`; never write to `~/pi-hacking/pij`. Report at both edges with
`pij report now`.
