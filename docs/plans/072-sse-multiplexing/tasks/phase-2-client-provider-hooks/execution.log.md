# Execution Log: Phase 2 — Client Provider + Hooks

**Plan**: 072-sse-multiplexing
**Phase**: Phase 2: Client Provider + Hooks
**Started**: 2026-03-08

---

## Pre-Implementation

- **Harness**: Not applicable (user override — transport layer, unit tests sufficient)
- **Directories created**: `apps/web/src/lib/sse/`, `test/unit/web/sse/`
---

## T001: Define SSE multiplexing contracts in `types.ts`

**Status**: ✅ DONE
**File**: `apps/web/src/lib/sse/types.ts`

**What**: Created 3 type definitions:
- `MultiplexedSSEMessage` — wire format with required `channel` + `type` + index signature
- `EventSourceFactory` — injectable factory (intentionally re-declared, DYK #5)
- `MultiplexedSSEContextValue` — context value with `subscribe()`, `isConnected`, `error`

**Evidence**: `pnpm exec tsc --noEmit --project tsconfig.json` — 0 errors. Barrel export updated.

---

## T002: Create FakeMultiplexedSSE test utility

**Status**: ✅ DONE
**Files**: `test/fakes/fake-multiplexed-sse.ts`, `test/fakes/index.ts`

**What**: Created `createFakeMultiplexedSSEFactory()` wrapping `FakeEventSource`:
- `factory` — injectable `EventSourceFactory` for provider
- `instance` / `instanceCount` — inspection getters (matches FakeEventSource factory pattern)
- `simulateChannelMessage(channel, type, data)` — builds JSON with channel tag
- `simulateOpen()` / `simulateError()` — lifecycle simulation
- All methods throw if no instance created yet (guard against test ordering bugs)
- Exported from `test/fakes/index.ts` barrel

**Evidence**: `pnpm exec tsc --noEmit` — 0 errors. Barrel compiles.

---

## T003: Create MultiplexedSSEProvider + contract tests (TDD)

**Status**: ✅ DONE
**Files**: `apps/web/src/lib/sse/multiplexed-sse-provider.tsx`, `test/unit/web/sse/multiplexed-sse-provider.test.tsx`

**What**: Implemented MultiplexedSSEProvider with 13 contract tests:
- Single EventSource to `/api/events/mux?channels=...`
- Subscribe/unsubscribe per channel via React context
- Demux by `msg.channel` with snapshot-before-dispatch (DYK #1, PL-01)
- Error isolation per subscriber callback (try/catch)
- True exponential backoff with jitter: `Math.min(2000 * 2^(n-1), 15000) + random(0-1000)` (DYK #3)
- URL memoized by `channels.join(',')` (DYK #4 — RSC boundary stability)
- `maxReconnectAttempts` configurable prop (default 15)
- Cleanup on unmount (EventSource.close + clear timeout)
- `useMultiplexedSSE()` hook for context access

**Tests (13/13 pass)**:
1. Connects to mux endpoint with channels (AC-11)
2. Creates exactly one EventSource (AC-11)
3. Routes channel events to correct subscriber (AC-12)
4. Delivers events to multiple subscribers on same channel
5. Isolates subscriber errors (AC-13)
6. Reconnects with exponential backoff (AC-14)
7. Stops reconnecting after max attempts (AC-14)
8. Cleans up EventSource on unmount (AC-15)
9. Exposes isConnected and error state (AC-16)
10. Testable via injected factory (AC-20)
11. Unsubscribe removes callback
12. Ignores malformed JSON
13. Resets reconnect counter on successful open

**Evidence**: `pnpm exec vitest run test/unit/web/sse/multiplexed-sse-provider.test.tsx` — 13/13 pass (20ms)

---

## T004 + T005: Create useChannelEvents + useChannelCallback hooks + tests (TDD)

**Status**: ✅ DONE
**Files**: `apps/web/src/lib/sse/use-channel-events.ts`, `apps/web/src/lib/sse/use-channel-callback.ts`, `test/unit/web/sse/use-channel-hooks.test.tsx`

**What**:
- `useChannelEvents<T>(channel, options?)` — accumulates messages per channel, independent array per subscriber (Finding 06), maxMessages pruning, clearMessages
- `useChannelCallback(channel, callback)` — fire-and-forget per event, stable ref pattern (callbackRef.current = callback), no re-subscription on callback change
- 11 contract tests covering AC-17, AC-18, AC-19

**Tests (11/11 pass)**:
- useChannelEvents: accumulation (AC-17), channel filtering (AC-19), maxMessages pruning, unlimited (maxMessages=0), clearMessages, independent arrays (Finding 06), isConnected
- useChannelCallback: callback fires (AC-18), channel filtering (AC-19), stable ref pattern, isConnected

**Evidence**: `pnpm exec vitest run test/unit/web/sse/use-channel-hooks.test.tsx` — 11/11 pass (16ms)

---

## T006: Create barrel export index.ts

**Status**: ✅ DONE
**File**: `apps/web/src/lib/sse/index.ts`

**What**: Barrel export for public API: `MultiplexedSSEProvider`, `useMultiplexedSSE`, `useChannelEvents`, `useChannelCallback`, all types.

---

## T007: Mount MultiplexedSSEProvider in workspace layout

**Status**: ✅ DONE
**File**: `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`

**What**:
- Added `MultiplexedSSEProvider` inside `TerminalOverlayWrapper`, wrapping `ActivityLogOverlayWrapper` and all children
- Static channels: `['event-popper', 'file-changes', 'work-unit-state']` as const outside component
- Import via barrel: `import { MultiplexedSSEProvider } from '../../../../src/lib/sse'`
- Spread `[...WORKSPACE_SSE_CHANNELS]` to convert readonly tuple to mutable array for prop

**Evidence**: Full test suite — 5173 passed, 0 failures (173s). 24 new Phase 2 tests added.

---

## Summary

| Metric | Value |
|--------|-------|
| Tasks completed | 7/7 |
| New tests | 24 (13 provider + 11 hooks) |
| Total suite | 5173 passed, 80 skipped, 0 failures |
| Files created | 7 (types.ts, provider, 2 hooks, barrel, fake, 2 test files) |
| Files modified | 2 (layout.tsx, test/fakes/index.ts) |

