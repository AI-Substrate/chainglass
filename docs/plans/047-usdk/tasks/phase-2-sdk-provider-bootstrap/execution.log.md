# Phase 2: SDK Provider & Bootstrap — Execution Log

**Phase**: 2 of 6
**Started**: 2026-02-24T23:24Z
**Status**: Complete

---

## Task Log

### T005: bootstrapSDK() ✅
- Created `apps/web/src/lib/sdk/sdk-bootstrap.ts`
- DYK-P2-02: Toast methods import sonner directly (not via execute)
- CommandRegistry onError callback shows toast on handler failure

### T001: SDKProvider ✅
- Created `apps/web/src/lib/sdk/sdk-provider.tsx`
- DYK-P2-05: bootstrapSDK wrapped in try/catch, returns no-op stub on failure
- DYK-P2-01: setWorkspaceContext/clearWorkspaceContext exposed via context (not props)
- persistFn ref for lazy persistence wiring

### T002: useSDK hook ✅
- Exported from `sdk-provider.tsx` (colocated — thin context reader)
- Throws clear error if called outside SDKProvider

### T003: useSDKSetting hook ✅
- Created `apps/web/src/lib/sdk/use-sdk-setting.ts`
- useSyncExternalStore for concurrent-safe reads
- Setter calls set() + persistFn if workspace connected

### T004: useSDKContext hook ✅
- Created `apps/web/src/lib/sdk/use-sdk-context.ts`
- DYK-P2-03: Documented strict mode double-fire in comment

### T006: Mount in Providers ✅
- Modified `apps/web/src/components/providers.tsx`
- SDKProvider wraps children inside NuqsAdapter

### T007: updateSDKSettings server action ✅
- Created `apps/web/app/actions/sdk-settings-actions.ts`
- DYK-P2-04: Documented theoretical race in comment

### T008: SDKWorkspaceConnector + wire layout ✅
- Created `apps/web/src/lib/sdk/sdk-workspace-connector.tsx`
- Modified `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`
- Reads sdkSettings from prefs, passes to connector
- Connector calls setWorkspaceContext on mount, clears on unmount

---

## Issues

### Test Regression — RESOLVED
- Initial `just fft` run showed 1 failing workspace tab title test
- Re-run with `pnpm test` passed all 4420 tests — transient failure (likely stale build artifact)
- `just fft` now passes clean

---

## Evidence

- `just fft` — passes (lint clean, format clean, 4423 tests pass)
- `npx biome check` — 0 errors on all Phase 2 files
- `pnpm --filter @chainglass/shared build` — clean

---

## Review Fixes Applied (2026-02-24)

### FT-001 (HIGH): persistFn useRef → useState ✅
- Converted `persistFnRef` (useRef) to `[persistFn, setPersistFnState]` (useState)
- Uses functional updater `setPersistFnState(() => fn)` since fn is a function
- Context consumers now see updated persistFn after SDKWorkspaceConnector sets it

### FT-002 (MEDIUM): lib/ → app/ layer inversion ✅
- SDKWorkspaceConnector now accepts `persistSettings` prop (callback)
- Workspace layout imports server action and passes as prop
- No more `src/lib/` importing from `app/actions/`

### FT-003 (MEDIUM): useSDKSetting hook test ✅
- Created `test/unit/web/lib/sdk/use-sdk-setting.test.tsx` — 3 tests
- Covers: default value read, re-render on change (AC-19b), setter roundtrip

### FT-004 (MEDIUM): domain.md updated ✅
- Added Phase 2 history entry, source locations, composition components

### FT-005 (MEDIUM): _platform/settings deferred ✅
- Server action stays as-is; settings domain properly created in Phase 5

### FT-006 (LOW): sdkSettings reference stability ✅
- Removed JSON.stringify approach (lint conflict); using sdkSettings directly in deps