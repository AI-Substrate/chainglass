# Resume after the 15:34 tmux death — read before doing anything

Prime pij-outer-bobcat, 2026-11-12 ~15:45.

1. **Cause (proven by the unimatrix prime's investigation):** our reviewer ran
   `env -u TMUX -u TMUX_PANE TMUX_TMPDIR=/tmp/<x>-tmux tmux kill-server` at 14:18:59 and 15:34:46. tmux 3.6a
   silently ignores a TMUX_TMPDIR that does not exist and uses the DEFAULT socket, so it killed the
   machine's real tmux server and every pij seat in every project, twice. The old wave rule told you to
   use exactly that recipe; it was wrong (prime's error).
2. **New rule, mandatory** (`briefs/nav-wave-1.md`, "Browser proofs never reach Jordan's tmux", governance b2073510d):
   - Never run `tmux kill-server`. Tear down scratch sessions with `tmux -L <slug> kill-session -t <scratch>`.
   - Every tmux command you type uses `tmux -L <slug>` (or `-S /abs/path`).
   - Servers that run bare tmux (Next, sidecar): `D=/tmp/<slug>-tmux; mkdir -p "$D"; chmod 700 "$D"`, then
     `env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$D" ...`.
   - First prove it: `env -u TMUX TMUX_TMPDIR="$D" tmux display -p '#{socket_path}'` must name a path under `$D`
     (an "error connecting to $D/..." message is fine and proves it); if it names `/private/tmp/tmux-501/default`, stop.
   - Anything you started earlier today with the old recipe ran on Jordan's real tmux. Do not try to clean
     it up with kill-server; tell the prime what you think is left.
3. Anything you had in flight (runs, servers, subagents) was killed. Check your worktree and git state, then
   resume. Nobody works in the main tree except vast-wombat's two already-pending edits (see its order).
4. Full-run queue, one at a time, hand on with "fft done": crane (env precheck 51f230ef6) -> warbler
   (ctx-max, nav-progress) -> parakeet (/login, then localhost-guard) -> mole (trace-idle a/b/c) -> wombat
   (page-wiring deletion + domain-map, after Jordan's :3000 switch).
