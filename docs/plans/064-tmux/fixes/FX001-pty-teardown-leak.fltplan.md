# Flight Plan: Fix FX001 — Deterministic PTY teardown (terminal sidecar leak)

**Fix**: [FX001-pty-teardown-leak.md](./FX001-pty-teardown-leak.md)
**Status**: Ready

## What → Why

**Problem**: The terminal sidecar spawns one `tmux attach` PTY per WebSocket but only tears it down on a clean `close`; socket errors leak PTYs in-session, and node-pty's `setsid()` children survive a hard `tsx watch` restart and reparent to launchd with their `/dev/ttys*` fds open — accumulating to the macOS PTY ceiling (511), after which no terminal/SSH/tmux can start machine-wide.

**Fix**: Make teardown deterministic on every catchable path (close/error/exit + cleanup on more signals), reap orphaned attach-clients from a prior crashed run on startup, and cap active PTYs defensively — while never killing the persistent tmux *sessions*.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| terminal | modify | `terminal-ws.ts` lifecycle hardening + PID-tracking/reaper helper; possible internal `PtyProcess.kill(signal?)`. No wire-protocol or consumer-contract change. |

## Stages

- [x] **Stage 1: Idempotent teardown + `ws.on('error')`** — funnel close/error/exit through one `disposePty()` so abnormal drops can't orphan a PTY (`terminal-ws.ts`).
- [ ] **Stage 2: Harden process cleanup** — force-kill children, add `SIGHUP`/`beforeExit` handlers (`terminal-ws.ts`).
- [ ] **Stage 3: Startup reaper** — track PTY PIDs to a per-port state file; kill prior-run survivors on boot with a liveness + `ps`-is-tmux guard, never the session (`terminal-ws.ts` + helper).
- [ ] **Stage 4: Max-PTY ceiling + idle reaper** — reject over-cap upgrades; never exhaust the host (`terminal-ws.ts`).
- [ ] **Stage 5: Tests** — assert kill-on-close, kill-on-error, cleanup-kills-all, reaper, over-cap rejection via `FakePty` (`terminal-ws.test.ts`).

## Acceptance

_Unit-testable (FakePty):_
- [ ] Socket `error` no longer leaks a PTY; `disposePty` is idempotent and clears the activity-log interval.
- [ ] Graceful shutdown (`SIGTERM`/`SIGINT`/`SIGHUP`/`beforeExit`) force-kills all active PTYs.
- [ ] Startup reaper kills exactly the recorded per-port PIDs (guard mocked), never others.
- [ ] Over-cap connections rejected with a typed close code; no PTY spawned.

_Manual / integration (host-level):_
- [ ] After a hard kill, the next same-port start reaps orphaned attach-clients; `/dev/ttys*` returns to baseline without manual `pkill`.
- [ ] `tmux list-sessions` unchanged across a reap (sessions persist; only attach clients killed).
- [ ] Concurrent worktree sidecars don't reap each other's live PTYs.

_Gate:_
- [ ] Terminal feature lint + typecheck + tests pass.
