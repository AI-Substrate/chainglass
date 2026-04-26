# Execution Log — FX001: FlowSpace MCP Review Fixes

**Fix**: [FX001-flowspace-mcp-review-fixes.md](./FX001-flowspace-mcp-review-fixes.md)
**Status**: Complete
**Date**: 2026-04-26

---

## FX001-1 — Pool lifecycle race fixes

**File**: `apps/web/src/lib/server/flowspace-mcp-client.ts`

Three sub-changes:

1. **Explicit `pool.delete` in `maybeRecycle`** — previously trusted `transport.onclose` to remove the entry, leaving a window where `pool.get(cwd)` could return a dying handle. `maybeRecycle` now signals a boolean back to the caller to indicate recycling happened.
2. **`inflight` increment moved synchronously after `getOrSpawn` in `flowspaceMcpSearch`** — closes the idle-reaper race. The body of `flowspaceMcpSearch` is now a 2-attempt for-loop: each attempt calls `getOrSpawn`, immediately bumps `inflight` (no await between them), then runs `maybeRecycle` and the search inside a `try/finally` that decrements `inflight`.
3. **`transport.onerror` wired alongside `onclose`** — some transport-level errors don't cleanly trigger `onclose`. The `onerror` handler now marks the entry as `state: 'error'` and removes it from the pool, mirroring `onclose`.

**Tests**: existing 4 pool tests still pass.

## FX001-2 — Recoverable error state

**File**: `apps/web/src/lib/server/flowspace-search-action.ts`

The action's `status === 'error'` branch previously returned the cached error indefinitely. Now it logs the prior error, calls `prewarmFlowspace(cwd)` (which clears the dead pool entry inside `getOrSpawn`), and returns `{ kind: 'spawning' }`. The hook's existing 1 s polling handles the rest. Subsequent transient spawn failures are self-recoverable on the next keystroke.

## FX001-3 — Restart FlowSpace via `useEffect` in browser-client

**Files**: `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` + `apps/web/src/features/041-file-browser/sdk/register.ts`

Added the `file-browser.restartFlowspace` registration inside the existing SDK-commands `useEffect` block in `browser-client.tsx`, sitting alongside `openFileAtLine`. The handler closes over the live `worktreePath` prop, so it always knows which process to shut down.

Removed the URL-sniffing variant from `sdk/register.ts` — it was a silent no-op because the dashboard URL pattern is `?file=…`, not `?worktree=`. Updated the file-header comment to reflect the move and the reasoning.

## FX001-4 — Drop polling round-trip when spawning

**File**: `apps/web/src/lib/server/flowspace-search-action.ts`

Removed the `if (status.state === 'spawning') return { kind: 'spawning' }` short-circuit. The action now falls through to `flowspaceMcpSearch`, whose internal `getOrSpawn` already awaits the existing `proc.ready` promise — no new spawn is started, just a single block-then-return.

The `status === 'idle'` short-circuit is **preserved** so the dropdown's "Loading FlowSpace, please wait…" message still appears immediately on the cold path. The user's experience is: first poll → loading message; second poll → results (no third poll needed).

Cold-call latency drops from `spawn-time + ~1 s polling buffer` to `spawn-time + ~30 ms`.

## FX001-5 — Tighten pool tests

**Files**: `apps/web/src/lib/server/flowspace-mcp-client.ts` (added two test seams) + `test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts`

Added two tiny test seams to the production module (kept exported and documented):

1. `setReadGraphMtimeForTests(fn)` — overrides the `readGraphMtime` reader so tests can simulate `fs2 scan` rebuilds without touching the filesystem.
2. `runIdleReaperOnce()` — extracted the reaper sweep into a callable function. The 60 s `setInterval` calls it; tests invoke it directly to skip the wait.

Restructured the test scaffolding: instead of one shared `handle`, tests push handles into an array as they need spawns. The factory pulls the next unconsumed handle. This supports tests that need a respawn (recycle, crash) without contortions.

**Four new tests**:

- **mtime recycle** (AC-FX-6): override mtime to advance between two calls; assert `factoryCalls === 2`.
- **`transport.onclose` crash recovery** (AC-FX-6): invoke `transport.onclose()` directly between two calls; assert pool returns to `idle` and the second call respawns.
- **idle reaper** (AC-FX-6): set `FLOWSPACE_IDLE_MS=50`, backdate `lastUsedAt` past the threshold, call `runIdleReaperOnce()`, await one tick, assert pool returns to `idle`.
- **slow-connect dedup regression guard** (AC-FX-5): wrap `transport.start()` with a 30 ms delay; 3 concurrent first-callers; assert `factoryCalls === 1`. This is the test that would catch a future regression where someone moves `pool.set` after an `await`.

**Result**: 8 pool tests, all pass.

---

## Final Validation

- **Unit tests**: 8/8 pool + 19/19 mapper + 18/18 dropdown — all green.
- **Integration test**: 2/2 against real `fs2 mcp` — cold ~13 s, warm ~2 s.
- **Repo-wide tests**: 424 pass, 1 skipped — same as before FX001 (no regressions).
- **Repo-wide lint**: clean across all 1567 files.
- **Typecheck**: zero new errors in any of the touched files.

---

## Discoveries

| # | Discovery | Resolution |
|---|-----------|-----------|
| 1 | Reviewer's claim that the existing dedup test was a no-op was partially incorrect. With the in-memory transport, `Promise.all`'s 3 callers each run their sync prefix back-to-back before any microtask drains, so the test would still fail if `pool.set` were moved after the first await. | Kept the original test; added a separate slow-connect test as an explicit regression guard for AC-FX-5. |
| 2 | The dossier's "delayed factory" suggestion (returning a Promise from the factory) wasn't architecturally feasible — the synchronous-prefix invariant in `getOrSpawn` requires a sync factory. | Wrapped `transport.start()` with a delay instead — same observable timing effect (slow connect), preserves architecture. |
| 3 | The 2-attempt for-loop in `flowspaceMcpSearch` is bounded — recycle case → continue, search case → return-or-throw. Genuine repeated mtime races would exhaust the loop, but in practice mtime advances once per `fs2 scan` invocation. | Loop bounded at 2; documented in the function header. |
| 4 | `delete process.env.FOO` triggers a Biome `noDelete` warning, but env-var teardown is a canonical use case. | `// biome-ignore lint/performance/noDelete: env var teardown` |
| 5 | AC-FX-7 (mid-search crash → mappable error) is structurally addressed (retry loop + explicit pool eviction handle the mechanics) but not all error messages are mapped through `mapMcpError`. Marked as `[~]` and noted for FX002 if real-world crashes surface raw fragments. | Deferred to a follow-up if needed. |

---

## Suggested Commit Message

```
084 FX001: FlowSpace MCP — pool lifecycle races + UX latency + test gaps

Addresses 7 Critical/High findings from the mini code review on Plan 084.
No contract changes, no new domains.

- Pool lifecycle: maybeRecycle now explicitly pool.delete()s instead of
  trusting async transport.onclose; inflight increments synchronously
  after getOrSpawn (closes idle-reaper race); transport.onerror wired
  alongside onclose; flowspaceMcpSearch is now a 2-attempt retry loop
  for the recycle case
- Recoverable error state: action treats status==='error' like 'idle'
  (kicks prewarm + returns spawning) instead of permanent poisoning
- > Restart FlowSpace: registered in browser-client.tsx useEffect with
  the live worktreePath prop; removed silent-no-op URL-sniffing variant
  from sdk/register.ts (dashboard URL doesn't carry ?worktree=)
- Drop polling round-trip on spawning: action falls through to
  flowspaceMcpSearch whose internal getOrSpawn awaits proc.ready —
  collapses ~1s polling buffer into a single block-then-return
- Test seams + 4 new tests: setReadGraphMtimeForTests, runIdleReaperOnce;
  cases for mtime recycle, transport.onclose crash, idle reap, and a
  slow-connect dedup regression guard. 8 pool tests total.

Tests: 424 pass + real fs2 integration (cold ~13s, warm ~2s).
```
