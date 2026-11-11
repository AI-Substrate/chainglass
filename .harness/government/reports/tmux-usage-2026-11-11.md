# Chainglass tmux usage rundown (read-only research)

Author: pij-liquid-carp - Date: 2026-11-11 - For: pij-vital-seahorse (via prime pij-outer-bobcat)
Scope: apps/, packages/, scripts/, harness/, justfile of /Users/jordanknight/substrate/chainglass at main (ee99fcbbf). No code changed, nothing run against tmux; `capture-pane` was never executed by me.
Paths are relative to `apps/web/` unless prefixed. **FACT** = read in code. **INFERENCE** = reasoning from code or tmux behaviour, not observed.

## TL;DR
- Chainglass never names a socket. Every tmux call is a bare `tmux ...`, so it talks to whatever server the process environment selects: the default socket, or the one in `$TMUX`/`$TMUX_TMPDIR` inherited from whoever started `just dev`.
- The web UI is not control mode. Each browser terminal opens one WebSocket to a sidecar (`terminal-ws`), which spawns one node-pty running `tmux new-session -A -s <name>`; so **one real tmux client per open terminal**.
- It lists and shows **every session on the server** (no prefix filter) and will attach to any of them, including pij agent sessions.
- Steady load per visible terminal: one `list-windows` + one `list-panes -s` every 2 s, plus up to 21 `capture-pane` reads per sample (only for changed or due windows). Separately the pij pages poll `list-windows -a` every 30 s.
- Smallest socket-aware change: one env knob (`CHAINGLASS_TMUX_ARGS`/socket name) applied at ~5 executor choke points plus the shell launch string. A true multi-server UI is a bigger change (see Q4/Q6).

## 1. Which socket/server
- **FACT** No `-L`, `-S`, `-f`, or `TMUX_TMPDIR` anywhere in code. Grep over apps/ packages/ scripts/ harness/ justfile found no socket flag on any tmux invocation.
- **FACT** Commands are `execFileSync('tmux', args)` (`src/features/064-terminal/server/terminal-ws.ts:600-602`), `execFile('tmux', ...)` (`terminal-ws.ts:617-625`, `src/features/089-first-class-pij/server/tmux-windows.ts:59`), and `execSync('tmux list-sessions ...')` (`app/api/terminal/route.ts:22-23`). None passes `env`, so they inherit `process.env`.
- **FACT** The PTY is spawned with `env: { ...process.env, TERM: 'xterm-256color' }` (`tmux-session-manager.ts:543`; raw shell fallback `:555`). No `TMUX`/`TMUX_TMPDIR` is removed or set. The only `$TMUX` read in the repo is `packages/shared/src/utils/tmux-context.ts:27` (detection for logging context: `display-message` at `:33,:37`), which does not select a server.
- **INFERENCE** tmux picks its server from `$TMUX` (socket path inside it) when set, else `$TMUX_TMPDIR`/default `/tmp/tmux-<uid>/default`. So chainglass targets the default socket unless the `just dev` / terminal-ws sidecar process was launched from a shell inside tmux, in which case it targets that shell's server. Whether Jordan's dev server runs inside tmux was not checked.
- **INFERENCE** `tmux new-session -A` run with `$TMUX` set makes tmux refuse with a "sessions should be nested with care" message; the code does not unset `$TMUX`. I did not test this; worth a check on the live dev process env before relying on it.

## 2. Every tmux command and what it is for
Web terminal sidecar (`terminal-ws`, a separate Node process, `src/features/064-terminal/server/terminal-ws.ts`; started at `:590-639`):

| tmux command | Where | Purpose |
|---|---|---|
| `tmux -V` | `tmux-session-manager.ts:116` | availability probe, once per WS connection (`terminal-ws.ts:184`) |
| `tmux new-session -A -s <name> -c <cwd>` (inside `$SHELL -c '...; exec $SHELL'`) | `tmux-session-manager.ts:537` | the attach: node-pty runs this; create-or-attach. This is the long-lived client |
| `list-sessions -F ...` | `tmux-session-manager.ts:144` (sidecar manager, no callers found in the web path) and `app/api/terminal/route.ts:22-23` (the live one, called by the browser session picker) | session picker |
| `has-session -t <name>` | `tmux-session-manager.ts:510` | existence check (no callers found in the live path) |
| `list-windows -t =<s> -F` | `tmux-session-manager.ts:173` | window strip, answers WS `windows` message |
| `list-panes -s -t =<s> -F` | `tmux-session-manager.ts:231` | per-sample pane pids/activity for the working/idle detector |
| `capture-pane -p -J -t @id` | `tmux-session-manager.ts:375` (screen-change detection) and `:409` (question detection) | reads window screens |
| `rename-window -t @id -- <seat>` | `tmux-session-manager.ts:219` | names unnamed seat windows after the pij seat id |
| `if-shell -F ... select-window ; display-message` | `tmux-session-manager.ts:459` | window select, guarded |
| `new-window -P -F -t =<s>: [-n] -c` + `send-keys -l <agent cmd>` + `send-keys Enter` | `tmux-session-manager.ts:490,502,503` | "new agent window" button |
| `list-panes -t =<s>: -F` | `src/features/064-terminal/server/tmux-pane-layout.ts:236` | pane layout for resize mode |
| `if-shell -F ... select-layout` | `tmux-pane-layout.ts:348` | pane resize drag, guarded |
| `list-panes -t =<s>: -F #{pane_current_path}` | `src/features/064-terminal/server/resolve-terminal-paths.ts:20` | click-to-open paths in terminal output |
| `show-buffer` | `terminal-ws.ts:327` | copy-buffer button (no `-t`; default server/buffer) |
| `rename-window -t <session> -- <name>` | `terminal-ws.ts:359` | rename current window |
| `display-message -p -t <target> #{pane_id}`, `send-keys -t <pane> ...`, `set-buffer`, `paste-buffer -p -d -b -t`, `send-keys Enter` | `src/features/064-terminal/server/send-prompt-keys.ts:231,321,327,328,333,339,360` | prompt drawer "send to agent" (called from `terminal-ws.ts:387` with `target: sessionName`) |

Next.js route handlers (the main web server process):

| tmux command | Where | Purpose |
|---|---|---|
| `list-windows -a -F` | `src/features/089-first-class-pij/server/tmux-windows.ts:40` | window-label join for pij rail/tree; called by `app/api/pij/tree/route.ts:54` and `app/api/pij/windows/route.ts:27` |
| `select-window -t @id` | `app/api/pij/focus/route.ts:358` | "focus" button on a pij seat |
| `display-message -p -t %pane ...` | `app/api/pij/focus/route.ts:488` | verify pane/pid before focusing |

Other tmux users (not the web terminal):
- `execSync('tmux send-keys -t <target> ...')` in `src/lib/di-container.ts:295,299` and `apps/cli/src/lib/container.ts:375,378` (copilot-cli agent adapter), plus scripts `scripts/session-watcher.ts:208`, `scripts/test-copilot-cli-adapter.ts:53,65,69,152`. **FACT** these are bare `tmux send-keys -t <target>`; target is a tmux target supplied by the agent config (`packages/shared/src/adapters/copilot-cli.adapter.ts:28`).
- `packages/shared/src/utils/tmux-context.ts:27-41`: `display-message` for the current session/window when `$TMUX` is set.

**How the web UI connects (FACT):** browser xterm.js -> WebSocket (`terminal-ws.ts:503-549`, port derived from `PORT`, `:418`) -> sidecar `handleConnection` (`:164`) -> `manager.spawnAttachedPty` (`:190`) -> node-pty (`:605`) running `$SHELL -c "tmux new-session -A -s <name> -c <cwd>; exec $SHELL"` (`tmux-session-manager.ts:537`). Not control mode (`-C` appears nowhere), no `pipe-pane`, no `attach` string (the registry matches `new-session|attach`, `pty-registry.ts:93-100`). Disconnect SIGHUPs the wrapper so the tmux session survives (`terminal-ws.ts:434`, comment at `tmux-session-manager.ts:527-531`). Control messages (windows, select, resize-pane, send-keys, rename) arrive over the same WS and run as separate short-lived `tmux` processes via `execFileSync` (synchronous, on the sidecar's event loop).

## 3. Session naming and discovery
- **FACT** `/api/terminal` lists **all** sessions on the server, unfiltered, sorted created asc (`app/api/terminal/route.ts:22-52`; `sortTerminalSessions`). No chainglass prefix; any name matching `^[a-zA-Z0-9_-]+$`, max 256, is accepted for attach (`tmux-session-manager.ts:41-42,125-130`).
- **FACT** Default selection is derived from the worktree path (`sessionNameFromWorktreePath`, `src/features/064-terminal/lib/session-name-from-worktree-path.ts`, used by `resolve-split-session.ts:35`); the user can pick any listed session. The picker fetches `/api/terminal` on mount and on every window `focus` event (`src/features/064-terminal/hooks/use-terminal-sessions.ts:196-199`).
- **FACT** So yes: it shows and can attach to sessions it did not create, including pij agent sessions (e.g. `unimatrix-main`, `flowspace3` appear in the picker; I saw this in a screenshot of the sidebar today).
- Window ops address `=<session>` (exact match) or window ids `@N`/pane ids `%N` (server-unique ids), never prefix matches.

## 4. What breaks on a different tmux server
- **FACT** Chainglass would see only sessions on the server its env selects; sessions on another server would be absent from the picker, unattachable by name (the attach would create a fresh same-named session on the chainglass server via `new-session -A`), and unreachable for send-keys, focus, window list and pane resize. There is no registry of servers anywhere.
- **FACT/INFERENCE** `@N` window ids and `%N` pane ids are unique **per server only**. The code treats them as globally unique: `readQuestions` comment "Window ids are server-unique" (`tmux-session-manager.ts:408`), `list-windows -a` label map keyed by bare `@id` (`tmux-windows.ts:41-50`), seat-to-window join by pane id (`tmux-session-manager.ts:241` builds `seatsByPane`; `RsSeat` in `src/features/089-first-class-pij/server/rs/rs-client.ts:17-39` has `pane` but no socket/server field). With two servers these collide: wrong seat badge on a window, wrong focus target. So the pij join would need a server identity too (pij-rs side), not just chainglass.
- Yes, the web UI would need to know about multiple servers to be correct (session picker, window poll, focus, seat join).

## 5. Per-client load on the tmux server
Per **visible** terminal that has a window strip:
- One tmux client per WebSocket (**FACT** `terminal-ws.ts:190`). Cap `TERMINAL_MAX_ACTIVE_PTYS`, default 100 (`:111-113`). A session opened in two tabs, or overlay plus `/terminal` page, is two clients on that session. **INFERENCE** (not checked in code which components can mount concurrently): attach count may exceed open sessions.
- **Windows poll every 2 s** per visible connected terminal (`src/features/064-terminal/components/terminal-inner.tsx:267-269`, WS `windows`). Each poll = 1 sync `list-windows` (`tmux-session-manager.ts:173`) + fire-and-forget `sampleActivity` (`:204`): 1 `list-panes -s` (`:231`), 1 machine-wide `ps -A` shared within 1 s (`:430-434`, TTL `:44`), 1 pij `rs.seats()` shared within 5 s (`:54`, `terminal-ws.ts:626-632`), `capture-pane` per window whose `window_activity` moved, cap 16/sample (`:48,372-375`), plus idle-window "question" reads, cap 5/sample, each window re-read at most every 60 s or when a working streak ends (`:46,52,409`). Worst case about 2 + 21 tmux execs per 2 s per visible terminal; typical steady state is the first two plus a few captures. Also `rename-window` once per unnamed seat window (`:219`).
- **N visible terminals multiply this** (the per-session sampling guard `this.sampling` at `:228-229` only prevents overlap within one session, not duplicate work across identical sessions).
- **Resize churn:** every ResizeObserver fire, rAF-coalesced but not debounced, sends WS `resize` -> `pty.resize` (`terminal-ws.ts:317-318`; `terminal-inner.tsx:582-590`, also `:218,:517,:552`). Each is a SIGWINCH on the tmux client; with several clients on one session, tmux re-lays out on each (INFERENCE). Pane-layout reads are on demand (`terminal-inner.tsx:255`), only in resize mode.
- **Pij pages:** `readTmuxWindowLabels` runs `list-windows -a` every 30 s per open pij page (`src/features/089-first-class-pij/hooks/use-pij-fleet.ts:98,400`, 3 s timeout `tmux-windows.ts:28`) and once per `/api/pij/tree` request (`app/api/pij/tree/route.ts:54`). `use-window-seats.ts:28,64` polls `/api/pij/fleet` every 5 s while the overview is open, but that hits the pij daemon, not tmux.
- **Session picker:** one `list-sessions` per mount and per window focus (`use-terminal-sessions.ts:196-199`).
- **Blocking:** the sidecar uses `execFileSync` for windows/layout/send-keys/paste (`terminal-ws.ts:600-602`), so a slow tmux server stalls the sidecar's event loop and every terminal's I/O at once (INFERENCE from synchronous calls on the WS message handler). The Next route handlers use async `execFile` with 3-5 s timeouts (`tmux-windows.ts:59`, `focus/route.ts:80` FOCUS_TIMEOUT_MS = 3 s), but `app/api/terminal/route.ts:22` uses `execSync` with 5 s timeout.
- No `pipe-pane`, no control mode, no per-client polling of `capture-pane` outside the sampler.

## 6. Smallest change to make it socket-aware
Minimal (one server, selectable by config), all FACT-based list of touch points:
1. Add one env knob, e.g. `CHAINGLASS_TMUX_ARGS` (`-L chainglass` or `-S /path`), parsed once into a `tmuxArgs` array in a new small module under `src/features/064-terminal/server/` and prepended to every tmux arg list.
2. Apply at the choke points instead of every call site:
   - `src/features/064-terminal/server/terminal-ws.ts:600-603` (`execCommand`) and `:617-625` (`execCommandAsync`): when `command === 'tmux'`, prepend `tmuxArgs`. This alone covers `tmux-session-manager.ts` (all `this.exec/execAsync` calls), `tmux-pane-layout.ts`, `resolve-terminal-paths.ts`, `send-prompt-keys.ts`, `show-buffer`, `rename-window`.
   - `tmux-session-manager.ts:537`: the `launch` shell string hard-codes `tmux new-session`; must become `tmux ${tmuxArgs} new-session ...`.
   - `src/features/089-first-class-pij/server/tmux-windows.ts:38-62` (`nodeTmuxExecutor`) and `app/api/pij/focus/route.ts` (its executor, `:358,:488`): prepend `tmuxArgs`.
   - `app/api/terminal/route.ts:22-23`: the `execSync` string; prepend.
   - `src/features/064-terminal/server/pty-registry.ts:93-100` `isTmuxClient` regex still matches (`tmux ... new-session`); no change needed (verify with `-L x` between the words, it uses `\btmux\b` and `\bnew-session\b` independently, so it holds).
   - Optional: `src/lib/di-container.ts:295,299`, `apps/cli/src/lib/container.ts:375,378`, `packages/shared/src/utils/tmux-context.ts:33,37` if those agent paths must follow the same server.
3. Also scrub `TMUX` from the PTY env (`tmux-session-manager.ts:543,555`) when a socket is configured, so an inherited `$TMUX` cannot override or trigger the nesting refusal.
Estimated size: roughly 6-8 files, tens of lines, no UI change.

Per-session/multi-server (not minimal): needs the session list to enumerate several servers (`app/api/terminal/route.ts`), a `{server, session}` identity through the WS URL/handshake and `useTerminalSessions`, per-server window/pane ids in the pij join (and a socket field on pij seats, which `RsSeat` lacks), and N sidecar exec paths. Recommend the single-knob version first: it lets chainglass live on its own server (separating its load/blast radius from pij's) without UI work, at the cost that pij agent sessions on the other server stop appearing in the picker.

## Not verified / caveats
- I did not inspect the live dev process env (`$TMUX`, `$TMUX_TMPDIR`) or the real tmux server, per brief.
- pij's own tmux usage (how seats are spawned and on which socket) is outside chainglass and was not read.
- Counts of "visible terminals" at runtime depend on which UI surfaces are mounted; the poll multipliers above are per mounted, visible terminal.
