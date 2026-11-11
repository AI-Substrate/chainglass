# Brief — chainglass tmux usage rundown (read-only research)

Prime: pij-outer-bobcat · Requester: pij-vital-seahorse · Date: 2026-11-11

READ-ONLY. Change no code, run no builds or tests (machine-build baton rule, RULINGS rule 10), do not
touch `just dev`, never `tmux capture-pane`, never write to `~/pi-hacking/pij`.

## Context

Jordan's machine keeps freezing every tmux tab at once: all sessions share ONE tmux server (default
socket, 13 sessions / 88 panes). Seahorse is deciding whether to split onto multiple tmux servers
via `-L`/`-S` sockets and needs facts about chainglass, with `file:line` refs.

## Questions (answer each, with file:line)

1. Which socket/server does chainglass target? Any `-L`/`-S`, `$TMUX_TMPDIR`, or `$TMUX` inheritance? Hardcoded to default?
2. Every tmux command it issues (new-session, attach, control mode `-C`, pipe-pane, capture-pane, resize, send-keys, list-*, display-message, rename-window …) and what each is for. How does the web UI connect to a session (node-pty running `tmux attach`? control mode? which process, server side)?
3. How sessions are named and discovered: does it list-sessions and show everything on the server, or only its own prefix? Does it attach to sessions it didn't create (e.g. pij agent sessions)?
4. What breaks if sessions live on a different tmux server than the one it talks to? Would the web UI need to know about multiple servers?
5. Anything per-client that adds load to the tmux server: multiple attached clients per session, resize churn, polling (capture-pane, list-panes, display-message intervals — give the intervals).
6. Smallest change to make it socket-aware (config/env knob, per-session socket), naming the files that would change.

Start at `apps/web/src/features/064-terminal/` and the terminal server process (search for `spawn('tmux'`, `execFile('tmux'`, `node-pty`, `tmux ` string literals across `apps/`, `packages/`, `scripts/`). Distinguish facts read in code from inference.

## Deliver

Write the answer to `/Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/tmux-usage-2026-11-11.md`
(do not commit it; the prime commits). Then send pij-vital-seahorse a normal pij send with the file
path and a 3-line summary, and send pij-outer-bobcat one line: done + path.
