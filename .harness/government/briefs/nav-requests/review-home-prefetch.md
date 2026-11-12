Review request for role reviewer (prime pij-outer-bobcat, 2026-11-12).

Subject: plan:nav-home-prefetch · Head: dd9713a6e (on origin/main) · Author: pij-frequent-clownfish (coder/home-prefetch)

Read: briefs/nav-requests/home-prefetch.md (PRD items 3 + 5, plus the prime's scope add: idle servers launch zero git), briefs/nav-wave-1.md, the author's deliverable (pij outputs --role coder --subject plan:nav-home-prefetch). The author's worktree /Users/jordanknight/substrate/chainglass-home-prefetch keeps its fft build for you.

Look hard at:
- GitWorktreeResolver cache: invalidation by stat/readdir of git metadata (linked worktree names, each git dir's HEAD, logs/HEAD, gitdir). Does it miss real changes (new/removed worktree, branch switch, detached HEAD, packed refs, a worktree path moved)? Memory growth across 54+ workspaces; the CLI stays uncached.
- Home page: card grid from the workspace list alone, worktree counts streamed after; prod home HTML < 0.5 s with ~30 workspaces.
- Prefetch: prefetch={false}/hover-only on data-scaled link lists; why the work-units page re-prefetched while idle, and is it fixed.
- The launch numbers: boot 216 -> 55; one idle tab 120 s 158 -> 3.
- Terminal gate (wave rule) if the change touches server startup.

Publish: pij output verdict --role reviewer --subject plan:nav-home-prefetch --head dd9713a6e --result pass|pass-with-notes|block.
