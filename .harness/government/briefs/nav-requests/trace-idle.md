Work request for role coder/trace-idle (prime pij-outer-bobcat, nav speed wave 1, Jordan 2026-11-12).

Read first: your role packet's reading list, then /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, gates, who else is editing what), then the PRD section below in /Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md.
Worktree slug: trace-idle. Spare prod port: 3106. Output subject: plan:nav-trace-idle.

PRD items 6 and 7, TRACE FIRST, no fixes until the prime says go.
Item 6: idle server-action POSTs (workspace 6/30 s dev, browser 7/30 s prod, pij 3-6). Log the next-action id per POST and map it through .next/server/server-reference-manifest.json to name each action and its caller.
Item 7: the pij-rs event stream reconnects ~every 7 s (9,835 times in 19 h; start-pij-poller.ts:192). Find why the stream ends (idle timeout either side first). If the cause is in pij-rs, write it up for the pij-fleet project, do not edit ~/pi-hacking/pij.
Deliver: a note naming each idle action (file:line, interval, purpose) and the stream cause, with a proposed fix for each. Use your own spare prod port; read-only otherwise.
