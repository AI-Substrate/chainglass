# Execution Log: Phase 3 — Priority Consumer Migration

**Plan**: 072-sse-multiplexing
**Phase**: Phase 3: Priority Consumer Migration
**Started**: 2026-03-08

---

## Pre-Implementation

- **Harness**: Not applicable (user override)
- **DYK session**: 5 discoveries captured (orphaned fetchItems, loose typing, connectionState simplification, test wrapper helper, mountedRef retention)

---

## T001: Migrate QuestionPopperProvider to useChannelCallback

**Status**: ✅ DONE
**File**: `apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx`

**What**: Replaced ~80 lines of direct EventSource lifecycle with `useChannelCallback('event-popper', cb)`:
- Removed: `eventSourceRef`, `reconnectTimeoutRef`, `reconnectAttemptsRef`, `connectSSE`, `disconnectSSE`, SSE lifecycle useEffect
- Added: `useChannelCallback('event-popper', cb)` + separate `useEffect` for initial `fetchItems()` (DYK #1)
- Added: `useEffect` syncing `sseConnected` → `isConnected` state (context exposes isConnected)
- Kept: `mountedRef` for async API guards (DYK #5), all business logic unchanged
- Import: `useChannelCallback` from `@/lib/sse` barrel

**Evidence**: 86/86 question-popper tests pass.

---

## T002: Migrate FileChangeProvider to useChannelCallback

**Status**: ✅ DONE
**File**: `apps/web/src/features/045-live-file-events/file-change-provider.tsx`

**What**: Replaced ~100 lines of direct EventSource lifecycle with `useChannelCallback(WorkspaceDomain.FileChanges, cb)`:
- Removed: `connect` callback, `eventSourceRef`, `reconnectAttemptsRef`, `reconnectTimerRef`, `MAX_RECONNECT_ATTEMPTS`, `RECONNECT_BASE_DELAY`, `RECONNECT_MAX_DELAY`, SSE lifecycle useEffect, `eventSourceFactory` prop
- Added: `useChannelCallback(WorkspaceDomain.FileChanges, cb)` with worktreePath filtering + hub dispatch
- Simplified: `connectionState` derived from `isConnected ? 'connected' : 'disconnected'` (DYK #3: zero consumers of granular state)
- Kept: hub creation, worktreePath filtering, hub.dispatch, context providers
- Removed unused imports: `useCallback`, `useEffect`, `useRef`

**Evidence**: 35/35 file-change tests pass.

---

## T003: Update FileChangeProvider tests

**Status**: ✅ DONE
**Files**: `test/unit/web/features/045-live-file-events/use-file-changes.test.tsx`, `test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx`

**What**: Migrated both test files from `FakeEventSource` to `FakeMultiplexedSSE`:
- Replaced `createFakeEventSourceFactory` → `createFakeMultiplexedSSEFactory`
- Wrapped in `MultiplexedSSEProvider` + `FileChangeProvider` (DYK #4: two-layer wrapper)
- Replaced `fakeES.simulateMessage(JSON.stringify(...))` → `fakeMux.simulateChannelMessage('file-changes', 'file-changed', {changes})`
- Replaced `fakeES.simulateOpen()` → `fakeMux.simulateOpen()`
- Updated cleanup test to check `fakeMux.instance?.readyState`

**Evidence**: 35/35 file-change tests pass (including 6 tree-directory tests).

---

## T004: Full test suite verification

**Status**: ✅ DONE
**Evidence**: `pnpm test` — 5173 passed, 80 skipped, 0 failures (173s)

---

## T005: E2E verification (manual)

**Status**: ✅ DONE
**Evidence**:
- Question popper: `cg question ask --text "Quick confirm - SSE mux working?" --type confirm` → UI notification appeared → user answered `true` → CLI received in 3s
- File changes: verified UI notification appears through multiplexed SSE
- Connection count: reduced from 3 → 1 per tab (mux endpoint only)

---

## Summary

| Metric | Value |
|--------|-------|
| Tasks completed | 5/5 |
| Lines removed | ~180 (SSE boilerplate from both providers) |
| Lines added | ~30 (useChannelCallback calls + initial fetch effect) |
| Net | ~-150 lines |
| Full suite | 5173 passed, 0 failures |
| Files modified | 4 (2 providers + 2 test files) |
| Domain docs updated | 3 (question-popper, file-browser, _platform/events) |

