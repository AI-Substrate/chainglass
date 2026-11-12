Work request for role coder/test-load (prime pij-outer-bobcat, 2026-11-12). Holder: pij-formal-mole (second task, after trace-idle).

Read /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, serialized full runs, private tmux). Worktree slug: test-load (new worktree from origin/main; keep chainglass-trace-idle for your other commit). Output subject: plan:test-load.

## Problem

Every full `just test` in the wave goes red with timeouts only, never assertions, at load 75-190 (this machine rarely drops below 60):
- 5 s test / 10 s hook timeouts in real-git or real-spawn files: git-cli, 071-pr-view (x3), file-list, recent-feed-seed, recent-feed-live-updates, content-hash, per-file-diff-stats, pr-view-entrypoints, unix-process-manager, event-popper-sinks, git-diff-action (even at its 30 s limit from 0aebeb1a5), get-all-diffs.
- exec timeouts inside code under test: tmux-context's 3 s `tmux display-message` (2 tests, 3005 ms), cg-binary-linkage's 5 s `cg --version`.
- vitest worker `onTaskUpdate` RPC timeouts.
Raising timeouts file by file is not converging (evidence: parakeet 34 failures/11 files, clownfish 30, vast-wombat 17).

## Change (find the real lever; these are candidates, not orders)

- Run real-process tests in their own vitest project/pool with low concurrency (e.g. maxWorkers 2, or `singleFork`), so dozens of `git init`/spawns don't stall each other; keep the pure unit tests parallel.
- Give that project timeouts that bound spawn latency under load (one place, documented why), instead of per-file overrides; remove the per-file raises (git-diff-action, git-cli, get-all-diffs) in favour of it.
- Tests whose subject has its own exec timeout (tmux-context 3 s, cg --version 5 s): inject the timeout or the executor in the test, rather than racing a real 3 s budget.
- Check the onTaskUpdate RPC timeouts (vitest `teardownTimeout`/`rpc` settings or worker count).
- Do not delete, skip or weaken assertions (AGENTS.md: suppression is not fixing).

## Acceptance

- At whatever load the machine has (quote it), a full `just test` in your worktree has zero timeout failures, twice in a row; quote both runs' times and loads, and the before (your first run) for comparison.
- Wall time of the full suite at low concurrency for those files stays reasonable: report it.
- Lands by fast-forward. Your full runs ARE allowed outside the queue (you are fixing the queue's blocker) but at nice -n 19 and not while another chainglass full run is mid-flight: ask the prime first.
