Work request for role coder/ssr-dashboard (prime pij-outer-bobcat, nav speed wave 1, Jordan 2026-11-12).

Read first: your role packet's reading list, then /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, gates, who else is editing what), then the PRD section below in /Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md.
Worktree slug: ssr-dashboard. Spare prod port: 3101. Output subject: plan:nav-ssr-dashboard.

PRD item 1: pages arrive empty until all JS runs.
Confirm the cause (apps/web/src/features/063-login/components/auth-provider.tsx:9-15 SessionProvider with ssr:false wrapping app/(dashboard)/layout.tsx:25-27), then make the dashboard tree render on the server. Fix the next-auth/React resolution problem the comment describes if you can; otherwise render children outside the client-only provider. Watch for hydration mismatches in components that read browser state.
Done when: HTML for /workspaces/<slug> contains sidebar and page markup with JS disabled; prod first paint on a workspace page under 0.5 s (quote load). Add a test that pins server rendering of the dashboard shell.
