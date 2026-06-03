# Execution Log: Fix FX001 — Deterministic PTY teardown

_Populated by plan-6-v2 during implementation._

| Date | Task | Action | Evidence |
|------|------|--------|----------|
| 2026-06-03 | setup | Companion `code-review-companion` booted (gpt-5.5) after `E205 COORDINATION_WRITE_DENIED` → rebooted with `--allow-coord-write-deny` (user-approved, ephemeral). Run `2026-06-03T09-59-51-241Z-266e`. | minih status verdict=active |
| 2026-06-03 | FX001-1 | Added idempotent `disposePty()` (WeakSet guard) + `ptyIntervals` Map; funneled `ws.on('close')`, NEW `ws.on('error')`, and `pty.onExit` through it; tied activity-log interval to its PTY. Extended `FakeWs` with `simulateError()`; added error-path + idempotency tests. | `pnpm vitest run …/terminal-ws.test.ts` → 40 passed |
