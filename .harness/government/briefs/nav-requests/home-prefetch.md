Work request for role coder/home-prefetch (prime pij-outer-bobcat, nav speed wave 1, Jordan 2026-11-12).

Read first: your role packet's reading list, then /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, gates, who else is editing what), then the PRD section below in /Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md.
Worktree slug: home-prefetch. Spare prod port: 3103. Output subject: plan:nav-home-prefetch.

PRD items 3 and 5: home page runs git for every workspace before sending anything; prod link prefetch floods the server.
Item 3: app/(dashboard)/page.tsx:29-45 calls workspaceService.getInfo per workspace (git worktree list each, packages/workflow/src/resolvers/git-worktree.resolver.ts:89-97). Send the card grid from the workspace list alone and stream worktree counts after (Suspense per card or a cached API); add a short-lived cache for worktree detection (a few seconds), shared so item 2 can reuse it later.
Item 5: prefetch={false} (or hover-only) on link lists that scale with data: workspace cards, sidebar workspace list, work-unit list; find why the work-units page re-prefetches while idle.
Done when: prod home HTML under 0.5 s with ~30 workspaces; prod home issues at most 5 route prefetches on load; work-units page none while idle.
