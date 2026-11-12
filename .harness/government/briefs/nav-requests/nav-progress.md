Work request for role coder/nav-progress (prime pij-outer-bobcat, Jordan 2026-11-12). Holder: pij-ambitious-warbler (second task, after ctx-max).

Read /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, serialized full runs, private tmux for proofs). New worktree slug: nav-progress (from origin/main). Spare port: 3108. Output subject: plan:nav-progress.

## Jordan's words

"Clicking things, like navigating into the workspace list, to a workspace, or clicking a branch, gives no indication that something is loading. Something along the bottom, or a little pop-up, showing that something is actually happening; right now it looks frozen."

## Change

- A global navigation-pending indicator: appears within ~100 ms of a click that starts a client-side navigation (Next `<Link>`, `router.push/replace`, worktree/branch switches that change the URL), stays until the new route has rendered, then disappears. A thin animated bar (top or bottom edge) or a small corner pill; pick one that reads clearly in light and dark themes and doesn't shift layout. Delay showing it ~150 ms so instant navigations don't flash.
- Search first (AGENTS.md "Search before creating"): nothing in the repo uses `useLinkStatus`, nprogress or a top loader today (prime checked). Next 16 has `useLinkStatus` per Link and `useTransition` around router pushes; the App Router has no global route events, so the usual approach is a client provider that starts on link click / router push and ends when `usePathname`/`useSearchParams` change. Choose the boring robust one and say why.
- Mount it once, high in the tree: `apps/web/app/layout.tsx` (root). Do NOT edit `app/(dashboard)/layout.tsx` (coder/ssr-dashboard owns it) or `workspaces/[slug]/layout.tsx` (coder/strip-067). If you need a hook in a shared nav component, tell the prime first.
- Must also cover the worktree/branch switcher and workspace cards, which may navigate via router calls rather than `<Link>`.
- This is the first half of PRD item 2; route-level `loading.tsx` skeletons come later in another brief. Don't add those.

## Acceptance

- Unit test: indicator appears after the delay on a navigation start, hides on pathname change, never shows for a same-URL click or a navigation that completes inside the delay.
- Browser proof on your spare-port prod build (private tmux, no terminal pages needed): screenshots mid-navigation into a workspace and on a branch switch, light and dark, in `scratch/`.
- `just fft` in your worktree when your queue slot comes (after your ctx-max run), nice -n 19; land by fast-forward; publish the deliverable.
