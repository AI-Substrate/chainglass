# tmux freeze: options handover (from pij-vital-seahorse, 2026-11-11)

Jordan will decide with you. Nothing has been changed in either repo.

## Symptom
All tmux tabs freeze together; a Ghostty tab outside tmux keeps working. One tmux server (PID 24622, default socket) hosts 13 sessions / 88 panes, shared by pij agents, chainglass web terminals, and Jordan's own tabs.

## Measured evidence (during freezes)
- Load avg 90–170 on 16 cores, CPU 0.16% idle, 123 GB / 128 GB used, 35–48 GB compressor, 8–10 GB swap.
- Biggest loads: 108–155 `copilot` processes (~260–544% CPU, ~22 GB), OrbStack 14 GB, Defender/DLP/epsext ~140% CPU (per-process-launch scanning), presentation renders (`record.cjs`: 5 headless Chromes + x264 `-preset slow`, launched by copilot session PID 13211, not niced/background-QoS on rerun).
- tmux server itself: 0–15% CPU; `tmux list-panes -a` 10–40 ms (one 480 ms spike). **Server was not the bottleneck when sampled.** Freeze cleared when the render loop ended.
- Conclusion so far: machine-wide starvation, amplified by tmux's single shared server. Splitting servers does not help if the whole box is starved.

## Constraints from the two surveys
- pij survey: /tmp/pij-prime/pij-tmux-survey.md. Daemon already has `PIJ_TMUX_SERVER` (one `-L` server per daemon); OMP/Copilot extensions (3 call sites) call bare tmux. Seats store only `%N`; no server column. Multi-server breaks delivery, observer/taps, reaper (false-dead), revive, spawn placement, identity. pij spawns agents as windows **in the caller's session**, so agent windows live inside Jordan's working sessions.
- chainglass survey: chainglass-governance reports/tmux-usage-2026-11-11.md (ba2ac4cab). Bare tmux everywhere; picker lists all sessions; first-class-pij joins by `%N`/`@N` → chainglass must share pij's server.

## chainglass-specific UI risk (verified in code)
1. `terminal-ws.ts:600-602` `execCommand` = `execFileSync` with **no timeout**. Used by the 2 s `windows` poll (`terminal-ws.ts:257-267` → `manager.listWindows`). The same sidecar event loop forwards every terminal's PTY output (`pty.onData` → `ws.send`, `:229`). A slow tmux therefore freezes **all** web terminals' I/O; a hung tmux wedges the sidecar indefinitely. Multiple visible terminals' polls serialize behind each other [INFERENCE].
2. `app/api/terminal/route.ts:22` `execSync` (5 s timeout) blocks the Next.js server event loop — every API request — up to 5 s, per picker mount / window focus.
3. Polling volume: 2–23 tmux execs per 2 s per visible terminal (`sampleActivity` captures are async but each is a process launch, each scanned by Defender).

## Options
| | What | Changes | Addresses freeze? |
|---|---|---|---|
| **A. Reduce load, keep one server** (recommended first) | `taskpolicy -b` for renders/builds/agents; renice tmux server; cap concurrent agents; chainglass: async+timeout tmux, single-flight poll, poll focused terminal only, fewer captures | pij: none. chainglass: `execCommand` → async `execFile` with timeout (or timeout on sync as a stopgap); `/api/terminal` → async; skip poll if previous in flight; gate polling on visibility/focus | Yes — targets the measured cause, and removes chainglass's own freeze amplifier |
| **B. One `agents` server + default** | pij daemon + extensions + chainglass all on `-L agents`; Jordan's agent-hosting tabs attach with `tmux -L agents` | pij: set `PIJ_TMUX_SERVER`, add selector to 3 extension call sites. chainglass: `CHAINGLASS_TMUX_ARGS` at ~5 choke points (terminal-ws.ts:600-625, tmux-session-manager.ts:537 launch string, tmux-windows.ts, pij focus route, app/api/terminal/route.ts) + scrub `$TMUX` from PTY env. ~6–8 files, no schema/UI | Partial — agents live in working sessions, so nearly everything moves; only plain shells are shielded |
| **C. Per-project servers** | `present` render only freezes `present` | pij: per-seat endpoint column + migration, threaded through delivery/observer/taps/reaper/revive/spawn/identity/kill. chainglass: `{server, session}` identity through picker, WS handshake, window poll, focus, seat join. Large in both | Only if tmux is the bottleneck — not shown |
| **D. chainglass alone on own server** | Isolate its polling | One knob | Breaks first-class-pij (picker, focus, seat labels). Not viable |

## Suggested decision gate before B/C
Run a 1 Hz logger of `tmux list-panes -a` latency + load avg + swap during the next freeze. Low tmux latency under high load → A only. High tmux latency with headroom → B is justified.
