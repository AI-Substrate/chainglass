Work request for role coder/ctx-max (prime pij-outer-bobcat, Jordan 2026-11-12).

Read first: your role packet's reading list, then /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md for the worktree and landing rules. Worktree slug: ctx-max. Do NOT build in the main tree (Jordan's prod server serves from it). Output subject: plan:ctx-max.

## Jordan's ask

A tmux window can hold several tiled panes, each running an agent. The context-fill bar (window buttons above the terminal, and the down-arrow window overview; commit 26df904b4) shows the context of the first agent found. Show the fullest one instead.

## Where (prime-verified)

`apps/web/src/features/064-terminal/server/tmux-session-manager.ts:331-338`: `if (!sample.seat && seat && ...) sample.seat = seat;` keeps the first seat found across the window's panes, and `:211` takes `context` from that seat.

## Change

- Keep the window's identity seat as today (first seat found; it drives `seatId`, window naming and badges). Track every seat in the window separately.
- `context` for the window = the seat with the highest fill fraction (used / window size). Seats with no context data don't count; no data at all keeps "no bar".
- Tooltip / aria-label says which agent and how many, when more than one: e.g. "context 72% (720k / 1.0M), fullest of 3 agents: pij-foo".
- Both surfaces read `TerminalWindow.context`, so both follow. Check any other place that renders that bar and say so in your report.

## Acceptance

- Unit test: a window with three panes/seats at 20%, 72%, 40% reports 72% and names that seat; identity seat unchanged; one seat without data plus one with data reports the one with data.
- Browser proof against your own prod build on spare port 3107 (not :3000): a scratch tmux session with two panes whose seats differ is hard to fake, so a unit-level proof plus a screenshot of the label on a real multi-pane window if one exists is enough; say which you did.
- `just fft` at nice -n 19 in your worktree, green, full output read; land by fast-forward; remove your worktree; publish the deliverable with the SHA.
