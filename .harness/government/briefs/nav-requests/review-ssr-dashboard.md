Review request for role reviewer (prime pij-outer-bobcat, 2026-11-12).

Subject: plan:nav-ssr-dashboard · Head: e37b1ea0d (on origin/main) · Author: pij-local-parakeet (coder/ssr-dashboard)

Read: your role packet's reading list; /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (gates, incl. private tmux and "terminal keeps working"); PRD item 1 in /Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md; the request /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-requests/ssr-dashboard.md; the coder's deliverable (pij outputs --role coder, subject plan:nav-ssr-dashboard) if published.

What changed: AuthProvider no longer client-only (SessionProvider server-renders); next-auth removed from serverExternalPackages (bundled); a turbopack resolveAlias `next/navigation.js` -> `next/navigation` to undo the patches/next-auth*.patch rewrite; <Suspense> around dashboard children; a new SSR test.

Look hard at:
- The global resolveAlias: what else imports `next/navigation.js`, and can the alias change their behaviour (client router contexts in route handlers, the reason it exists)? Is a global alias the narrowest fix?
- Bundling next-auth: does any server code depend on it being external (auth.ts, route handlers, proxy.ts, the patches/ folder, vitest config)? Session/cookie behaviour unchanged?
- Hydration mismatches in components that read browser state now that the tree server-renders (localStorage, window size, theme).
- The Suspense boundary: does a page's own loading/streaming still work; any page that now flashes or shows nothing longer?
- Test quality: does dashboard-shell-ssr.test.tsx pin server rendering of the shell (fails if ssr:false comes back), not wording?
- Done-when: workspace HTML contains sidebar + page markup with JS off. You may verify with the coder's existing build at /Users/jordanknight/substrate/chainglass-ssr-dashboard/apps/web/.next served on a spare port that is free on the LAN IP (e.g. 3192), niced, private tmux ONLY per nav-wave-1.md "Browser proofs never reach Jordan's tmux" (mkdir -p the dir first, prove the socket path, never `tmux kill-server`); the original `TMUX_TMPDIR=/tmp/reviewer-tmux` here pointed at a dir that never existed and hit the default server (2026-11-12 incident). Stop it after. Do not build your own copy.

Publish: `pij output verdict --role reviewer --subject plan:nav-ssr-dashboard --head e37b1ea0d --result pass|pass-with-notes|block --body-file <path> --answers <this request id>`.
