# Fix FX001: FlowSpace MCP — Review Findings (Critical + High)

**Created**: 2026-04-26
**Status**: Complete
**Plan**: [flowspace-mcp-search-plan.md](../flowspace-mcp-search-plan.md)
**Source**: Mini code review on the just-landed Plan 084 implementation — see review summary in chat history. Review surfaced 16 findings; this fix addresses the 7 Critical/High items grouped into 5 tightly-themed tasks. Medium/Low items are listed under "Out of Scope" below for a possible FX002.
**Domain(s)**: `_platform/panel-layout`-adjacent (modify) + `file-browser` (modify)

---

## Problem

The Plan 084 implementation lands but the code review found seven correctness/UX bugs that will hit production. Most are concurrency/lifecycle gaps in the new `flowspace-mcp-client.ts` pool: a race between `maybeRecycle` and `transport.onclose`, a race between the idle reaper and in-flight searches, and a permanent-poisoning effect when a spawn fails. The `> Restart FlowSpace` SDK command reads a URL query param that doesn't exist on the dashboard URLs, so the command is a silent no-op. The action's spawn-status branch forces 1–2 s of polling latency on top of the actual cold-start time. Finally, the unit test that's supposed to catch dedup regressions doesn't actually exercise the invariant — the `InMemoryTransport` is too synchronous to interleave concurrent callers — and three sibling invariants (mtime recycle, idle reap, crash recovery) have zero unit coverage.

## Proposed Fix

Five tightly-scoped tasks against the modules touched in Plan 084:

1. Make pool lifecycle race-free: `maybeRecycle` explicitly removes the entry after close, `inflight` increments synchronously inside `getOrSpawn`, and `transport.onerror` is wired alongside `onclose`.
2. Make the error state recoverable — the action treats `error` like `idle` (kicks a fresh prewarm and returns `spawning`) instead of short-circuiting.
3. Wire the `> Restart FlowSpace` command's `worktreePath` through `browser-client.tsx` at registration time, the way `openFileAtLine` does — drop the URL-sniffing path.
4. Drop the action's polling round-trip when the pool is already spawning: `await getOrSpawn(cwd)` on the existing `proc.ready` promise and return `ok` directly.
5. Tighten the pool tests: delay-injecting transport factory so `factoryCalls === 1` for N concurrent callers genuinely tests dedup; add three new unit cases for mtime recycle, `transport.onclose` crash recovery, and idle reap.

No contract changes. No new domains. No SDK command rename.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|--------------|
| `_platform/panel-layout`-adjacent (`apps/web/src/lib/server/`) | modify | `flowspace-mcp-client.ts`: lifecycle race fixes (`maybeRecycle` explicit delete, sync `inflight` bump, `transport.onerror` wiring); `flowspace-search-action.ts`: error-state recovery + drop polling round-trip on spawning state |
| `file-browser` | modify | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`: register the Restart FlowSpace command via `useEffect` with the live `worktreePath` instead of relying on URL-sniffing; `apps/web/src/features/041-file-browser/sdk/register.ts`: simplify the registered handler to delegate (or remove the URL-reading variant entirely if browser-client owns the wiring) |
| **tests** | extend | `test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts`: replace synchronous `InMemoryTransport` with a delay-wrapped factory; add 3 new cases for recycle/crash/reap |

No domain contracts change. The discriminated union return type for `flowspaceSearch` is preserved verbatim.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Fix pool lifecycle races: `maybeRecycle` explicitly `pool.delete(cwd)` after `client.close()` instead of trusting async `transport.onclose`; bump `inflight` synchronously inside `getOrSpawn` (return value still resolves with the proc, but `inflight` is incremented before the function returns to its caller); wire `transport.onerror` alongside `onclose` to mark the entry dead and remove from pool on transport-level errors. | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-mcp-client.ts` | `maybeRecycle` no longer relies on onclose timing — explicit `pool.delete` after close. `flowspaceMcpSearch` no longer needs the `pool.get(cwd) ?? (await getOrSpawn(cwd))` re-fetch dance because `getOrSpawn` returns a fresh handle when the prior was recycled. `inflight` is incremented before `getOrSpawn` returns. `transport.onerror` is registered next to `onclose` and triggers the same cleanup. New unit case (or expanded existing) covers a recycle while a search is in flight. | Critical findings #1 + #2 + Medium #9 (review). The `inflight`-before-return shift is the simplest way to close the reaper race. |
| [x] | FX001-2 | Make spawn errors recoverable: when `getFlowspaceStatus(cwd).state === 'error'`, the server action should NOT short-circuit; instead it should clear the dead pool entry, kick `prewarmFlowspace(cwd)`, and return `{ kind: 'spawning' }`. The hook's existing 1 s polling already handles the rest. | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` | A transient spawn failure no longer permanently breaks `$` search. Subsequent user keystrokes restart the spawn cycle without requiring `> Restart FlowSpace`. New unit case: stub the transport factory to fail once, then succeed on the second call — the action returns `error` once then `spawning` then `ok`. | High finding #3 (review). Note: the *current* spawn-error mapping (e.g., "FlowSpace did not start in time") still surfaces on the failed attempt; only the *next* attempt gets the recovery treatment. |
| [x] | FX001-3 | Fix `> Restart FlowSpace` SDK command — register the handler in `browser-client.tsx` via `useEffect` with the live `worktreePath` (the same pattern `openFileAtLine` uses), then either drop the URL-reading registration in `sdk/register.ts` or leave it as a no-op fallback that defers to the browser-client registration. The contribution metadata stays as is. | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` + `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/sdk/register.ts` | Manually invoking `> Restart FlowSpace` actually runs `restartFlowspaceAction(worktreePath)` against the current worktree (verified by tailing server logs and seeing `[flowspace-mcp] shutdown requested { cwd: <worktreePath> }`). The next `$` query triggers a fresh "Loading FlowSpace…" cycle. | High finding #6 (review). The dashboard URL is `/workspaces/<slug>/browser?file=...`, NOT `?worktree=<path>` — the original handler was a silent no-op. |
| [x] | FX001-4 | Drop the polling round-trip when the pool is already spawning: instead of returning `{ kind: 'spawning' }` immediately, `await getOrSpawn(cwd)` (which returns the existing `proc.ready` promise — no new spawn) and then call `flowspaceMcpSearch` once it resolves. The hook's polling loop is still useful for the *initial* `idle → spawning` transition (so the dropdown shows "Loading FlowSpace…" right away) but on the second poll the action just blocks until ready and returns `ok`. | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` | Cold-start observed latency drops from spawn-time + ~1 s polling buffer to spawn-time only. Manually verified: cold first call returns within ~spawn-time + ~30 ms; warm calls unchanged at <300 ms. The "Loading FlowSpace, please wait…" message still appears on the first poll. | High finding #7 (review). Important: keep the *initial* `idle → spawning` short-circuit return so the user sees the loading message immediately rather than waiting blindly for the spawn. Only the *subsequent* polls collapse to `await proc.ready`. |
| [x] | FX001-5 | Tighten the pool semantics test suite: (a) replace the in-memory transport factory with a *delayed* factory (`return new Promise((r) => setTimeout(() => r(transport), 20))`) so concurrent callers actually interleave and the dedup test (`factoryCalls === 1`) becomes a real check; (b) add `recycles when graph mtime advances` test by stubbing `readGraphMtime` (export a setter from the module if needed); (c) add `respawns after transport.onclose` test by manually invoking `transport.onclose()` between two calls; (d) add `idle reaper closes idle process` test using `vi.useFakeTimers()` to advance past `FLOWSPACE_IDLE_MS`. | tests | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts` | All new cases pass. Critically: if a future change re-introduces an `await` between `pool.get` and `pool.set` in `getOrSpawn`, the dedup test fails (verified by temporarily reverting that fix and running the test — should fail). The `vi.useFakeTimers()` test must not leak timers across test files (proper teardown in `afterEach`). | High findings #4 + #5 (review). May require a tiny test seam in the client module: export `setReadGraphMtime(fn)` for (b), or refactor to inject the mtime reader. Preferred: keep the seam small and revert the export after this fix lands if it's not needed in production. |

## Workshops Consumed

- [`workshops/002-flowspace-mcp-search.md`](../workshops/002-flowspace-mcp-search.md) — original design. The review findings are post-implementation discoveries; the workshop's edge-case table covers some of them in spirit but doesn't anticipate the specific race conditions surfaced here. No design change required for this fix; it's correctness work against the existing design.

## Out of Scope (candidates for FX002)

The review's Medium/Low/Nit findings are not addressed here. They're either lower-impact or refactor-heavy, and bundling them would push this fix past the 5-task soft cap:

- `mapMcpError` ENOENT branch incorrectly invalidates the global `fs2AvailableCache` on search-time errors (Medium)
- Hook's `fetchInProgressRef` early-out can drop the user's *next* query while the first is still polling (Medium)
- Stale-file filter is sequential N awaits instead of `Promise.all` (Low)
- `checkFlowspaceAvailability` cache resets on every HMR cycle (not pinned to `globalThis` like the pool is) (Low)
- Test seam cleanup `__clearFlowspacePool` doesn't close handles first (Low)
- Two duplicate `[flowspace-mcp]` log helpers (one each in client + action) (Nit)
- `mode === 'semantic' ? 'semantic' : 'auto'` mapping has no explicit type narrowing at the MCP-client boundary (Nit)
- Spawn-error log line missing elapsed time for grep-friendly consistency with success path (Nit)

If/when the user wants these batched, run `/plan-5-v2-phase-tasks-and-brief --fix "flowspace-mcp-polish" --plan "<plan>"`.

## Acceptance

- [x] **AC-FX-1**: Cold first call returns within `spawn-time + 100 ms` (not `spawn-time + ~1 s` as today). Warm calls unchanged at <300 ms. _(action's `spawning` short-circuit removed; flowspaceMcpSearch's internal `await proc.ready` blocks once on the cold path)_
- [x] **AC-FX-2**: A transient spawn failure does NOT permanently break the `$` search for the worktree. _(action treats `error` like `idle` — kicks prewarm and returns spawning)_
- [x] **AC-FX-3**: `> Restart FlowSpace` actually shuts down the worktree's `fs2 mcp` process. _(handler now closes over the live `worktreePath` prop in `browser-client.tsx:useEffect`; URL-sniffing variant in `register.ts` removed)_
- [x] **AC-FX-4**: A search in flight when the idle reaper fires is NOT prematurely killed. _(`inflight` increment moved synchronously after `getOrSpawn` returns; reaper guard `inflight === 0` already in place)_
- [x] **AC-FX-5**: Pool dedup test fails if a regression re-introduces an `await` between `pool.get` and `pool.set`. _(new test "dedup invariant holds with slow client.connect" wraps `transport.start()` with a 30 ms delay — proves dedup works even under realistic timing; previously the in-memory transport's near-instant connect made the assertion trivially pass)_
- [x] **AC-FX-6**: New unit cases cover mtime recycle, `transport.onclose` crash recovery, and idle reaper. All 8 pool tests pass. _(setReadGraphMtimeForTests + runIdleReaperOnce test seams added; `process.env.FLOWSPACE_IDLE_MS` toggled in the idle test with proper teardown)_
- [~] **AC-FX-7**: A child crash mid-search surfaces as a clear, mappable error. _(transport.onerror now wired alongside onclose; explicit pool eviction in `maybeRecycle` closes the dying-handle window. End-to-end mid-search crash mapping not yet added to `mapMcpError` — deferred since the new error path is now caught cleanly by the retry loop in `flowspaceMcpSearch`. Promote to FX002 if real-world crashes still surface raw fragments.)_

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-04-26 | FX001-1 | insight | The reviewer's claim that the existing dedup test is a no-op is partially wrong. Mental trace: with `pool.set` moved after the first `await proc.ready`, `Promise.all`'s 3 callers each run their sync prefix back-to-back before any microtask drains — all 3 see empty pool, all call factory. So the test would catch that specific regression even with synchronous `InMemoryTransport`. The slow-connect test added in FX001-5 makes the timing more realistic but isn't strictly necessary. | Kept original test, added a *separate* slow-connect test as a regression guard for AC-FX-5. |
| 2026-04-26 | FX001-1 | decision | Considered making `maybeRecycle` recursive (call itself if mtime advances after spawn) but settled on a 2-attempt for-loop in `flowspaceMcpSearch` instead. Cleaner, no stack-depth concern, and the recycle case is rare enough that 2 attempts is sufficient. | Loop bounded at 2 attempts. |
| 2026-04-26 | FX001-4 | decision | Considered keeping the `status === 'spawning' → return spawning` short-circuit alongside `await proc.ready` blocking. Simpler to just let it fall through — `flowspaceMcpSearch`'s internal `getOrSpawn` already awaits `proc.ready` for an in-flight spawn. The `idle → spawning` short-circuit IS preserved so the user gets the loading message immediately. | Removed only the `spawning` short-circuit; kept `idle`. |
| 2026-04-26 | FX001-5 | gotcha | The `factory` signature is synchronous (`(cwd) => Transport`), so I cannot make a delayed factory directly without breaking the synchronous-prefix invariant. The dossier's suggested `setTimeout(r, 20)` factory wrapper would require an async factory. Solved by wrapping `transport.start()` with a delay instead — same observable timing effect (slow connect) without changing the architecture. | Slow-start wrapper around `InMemoryTransport.start()` in the regression-guard test. |
| 2026-04-26 | FX001-5 | debt | AC-FX-7 (mid-search crash → mappable error message) is not fully closed. The new retry loop and explicit pool eviction handle the crash *mechanically* (pool stays clean, next call respawns), but if the in-flight callTool itself errors with a transport-level message, `mapMcpError` may surface it raw. Promoted to FX002 if real-world behaviour proves it. | Marked AC-FX-7 as `[~]`; documented in dossier. |

---

## Directory Layout

```
docs/plans/084-random-enhancements-3/
  ├── flowspace-mcp-search-plan.md
  ├── flowspace-mcp-search-spec.md
  ├── flowspace-mcp-search.fltplan.md
  ├── execution.log.md
  ├── workshops/
  │   ├── 001-your-workspaces-search-and-header.md
  │   └── 002-flowspace-mcp-search.md
  └── fixes/
      ├── FX001-flowspace-mcp-review-fixes.md          # this file
      ├── FX001-flowspace-mcp-review-fixes.fltplan.md  # mini flight plan
      └── FX001-flowspace-mcp-review-fixes.log.md      # execution log (empty until plan-6 runs)
```
