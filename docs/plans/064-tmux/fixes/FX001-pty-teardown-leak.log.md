# Execution Log: Fix FX001 — Deterministic PTY teardown

_Populated by plan-6-v2 during implementation._

| Date | Task | Action | Evidence |
|------|------|--------|----------|
| 2026-06-03 | setup | Companion `code-review-companion` booted (gpt-5.5) after `E205 COORDINATION_WRITE_DENIED` → rebooted with `--allow-coord-write-deny` (user-approved, ephemeral). Run `2026-06-03T09-59-51-241Z-266e`. | minih status verdict=active |
| 2026-06-03 | FX001-1 | Added idempotent `disposePty()` (WeakSet guard) + `ptyIntervals` Map; funneled `ws.on('close')`, NEW `ws.on('error')`, and `pty.onExit` through it; tied activity-log interval to its PTY. Extended `FakeWs` with `simulateError()`; added error-path + idempotency tests. Commit e49a94da. | `pnpm vitest run …/terminal-ws.test.ts` → 40 passed |
| 2026-06-03 | companion | Run `…266e` died mid-review with `E200 permission denied: kind=shell` (restricted preset blocks `git show`). User approved rebooting with `--permissions trusted` (shell+write, ephemeral). New run `2026-06-03T10-59-26-613Z-0cd1`. | minih status verdict=active |
| 2026-06-03 | FX001-3 | New `pty-registry.ts`: per-port PID file (`.chainglass/terminal-sidecar-<port>.pids.json`, atomic temp+rename), `recordPid`/`removePid`, and `reapStalePtys` (kills only alive+tmux PIDs via `kill(pid,0)` + `ps -o command=` guard, then resets file). Wired into `terminal-ws.ts`: record on spawn, remove on dispose, reap on `start()` before binding — all gated on `listenPort>0`. 6 registry tests (per-port isolation, PID-reuse safety, fail-closed). | `pnpm vitest run` (both files) → 47 passed |
| 2026-06-03 | FX001-2 | Hardened `cleanup()`: idempotent (`cleanedUp` guard), snapshot iterate, `disposePty` + SIGKILL backstop via injectable `killProcess` dep (default `process.kill`; tests inject a fake so no real PID is signalled). Added `SIGHUP` + `beforeExit` handlers alongside SIGTERM/SIGINT. Test asserts both PTYs force-killed with SIGKILL. | `pnpm vitest run …/terminal-ws.test.ts` → 41 passed |
