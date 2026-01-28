# Phase 3: Fake Service Updates — Execution Log

## Session Info
- **Started**: 2026-01-28T10:54:00Z
- **Completed**: 2026-01-28T11:05:00Z
- **Testing Approach**: Lightweight (contract tests verify behavior)

---

## Tasks T3.1-T3.3: FakeWorkGraphService Updates
**Status**: ✅ Complete

### What I Did
1. Added `getKey()` private helper for composite key generation
2. Updated all 6 call type interfaces to include `ctx: WorkspaceContext`
3. Updated all 6 `setPreset*()` methods to accept ctx as first parameter
4. Updated all 6 method implementations to use composite keys and record ctx

### Files Changed
- `packages/workgraph/src/fakes/fake-workgraph-service.ts`
  - Added `getKey(ctx, ...parts)` helper
  - Call types now include ctx field
  - Methods use `getKey()` for preset lookups
  - Methods record ctx in call arrays

---

## Tasks T3.4-T3.6: FakeWorkNodeService Updates
**Status**: ✅ Complete

### What I Did
1. Added `getKey()` private helper
2. Updated all 14 call types (13 existing + new GetAnswerCall) to include ctx
3. Updated all 14 preset Maps to use composite keys
4. Removed duplicate `presetGetOutputDataResults` declaration (line 457)
5. Renamed `setCanEndResult` → `setPresetCanEndResult` (DYK#4)
6. Added full fake support for `getAnswer()` (DYK#5):
   - Added `getAnswerCallsArr` array
   - Added `presetGetAnswerResults` Map
   - Added `setPresetGetAnswerResult()` setter
   - Added `getGetAnswerCalls()` and `getLastGetAnswerCall()` accessors
7. Fixed `reset()` to clear all state including:
   - `canEndCalls` array (was missing)
   - `presetCanEndResults.clear()` (was missing - DYK#1)
   - `getAnswerCallsArr` array (new)
   - `presetGetAnswerResults.clear()` (new)

### Files Changed
- `packages/workgraph/src/fakes/fake-worknode-service.ts`
  - Comprehensive update to all 15 methods

### Discovery
- Field naming: Renamed `getAnswerCalls` → `getAnswerCallsArr` to avoid conflict with `getAnswerCalls()` accessor method from Answer section

---

## Tasks T3.7-T3.9: FakeWorkUnitService Updates  
**Status**: ✅ Complete

### What I Did
1. Added `getKey()` private helper with optional slug parameter
2. Updated all 4 call types to include ctx
3. Converted `presetListResult` (single value) → `presetListResults` (Map) for workspace isolation
4. Updated all 4 `setPreset*()` methods to accept ctx
5. Updated `reset()` to clear Maps instead of setting null

### Files Changed
- `packages/workgraph/src/fakes/fake-workunit-service.ts`

---

## Task T3.10: Verify reset() clears all state
**Status**: ✅ Complete

All reset() methods verified and fixed:
- FakeWorkGraphService: 6 call arrays + 6 preset Maps ✓
- FakeWorkNodeService: 14 call arrays + 14 preset Maps ✓ (added missing `presetCanEndResults.clear()`)
- FakeWorkUnitService: 4 call arrays + 4 preset Maps + defaultUnits ✓

---

## Task T3.11a: Create shared workspace context test helper
**Status**: ✅ Complete

### Files Created
- `test/helpers/workspace-context.ts`
  - Exports `createTestWorkspaceContext(worktreePath: string): WorkspaceContext`

---

## Task T3.11b: Write workspace isolation tests
**Status**: ✅ Complete

### Files Created
- `test/unit/workgraph/fake-workspace-isolation.test.ts`
  - 11 tests total across 3 describe blocks
  - FakeWorkGraphService: 3 tests (isolation, ctx recording, reset)
  - FakeWorkNodeService: 4 tests (isolation, ctx recording, reset, getAnswer support)
  - FakeWorkUnitService: 4 tests (slug isolation, list isolation, ctx recording, reset)

### Evidence
```
 ✓ test/unit/workgraph/fake-workspace-isolation.test.ts (11 tests) 3ms
   ✓ Fake workspace isolation > FakeWorkGraphService > same slug in different workspaces are independent
   ✓ Fake workspace isolation > FakeWorkGraphService > getCalls() records ctx for inspection
   ✓ Fake workspace isolation > FakeWorkGraphService > reset() clears all state
   ✓ Fake workspace isolation > FakeWorkNodeService > same graph:node in different workspaces are independent
   ✓ Fake workspace isolation > FakeWorkNodeService > getCalls() records ctx for inspection
   ✓ Fake workspace isolation > FakeWorkNodeService > reset() clears all state including canEndCalls
   ✓ Fake workspace isolation > FakeWorkNodeService > getAnswer() has full fake support
   ✓ Fake workspace isolation > FakeWorkUnitService > same slug in different workspaces are independent
   ✓ Fake workspace isolation > FakeWorkUnitService > list() isolates by workspace
   ✓ Fake workspace isolation > FakeWorkUnitService > getCalls() records ctx for inspection
   ✓ Fake workspace isolation > FakeWorkUnitService > reset() clears all state
```

---

## Task T3.12: Verify contract tests pass
**Status**: ✅ Complete

### Evidence
```
 ✓ test/contracts/workunit-service.contract.test.ts (16 tests) 3ms
 ✓ test/contracts/workgraph-service.contract.test.ts (9 tests) 3ms
 ✓ test/contracts/worknode-service.contract.test.ts (9 tests) 3ms

 Test Files  3 passed (3)
      Tests  34 passed (34)
```

Note: Contract tests verify default behavior only - they don't call setPreset* methods (as identified in DYK#2).

---

## Task T3.13: Run lint/format/tests
**Status**: ✅ Complete

### Evidence
- Build: ✓ All packages compile
- Lint: ✓ `Checked 582 files in 133ms. No fixes applied.`
- Format: ✓ `Formatted 582 files in 102ms. No fixes applied.`
- New isolation tests: ✓ 11/11 pass
- Contract tests: ✓ 34/34 pass

### Note on Unit Test Failures
The `just fft` command shows 129 failing unit tests in `test/unit/workgraph/` files. These are **pre-existing failures** from Phase 2 (verified by stashing Phase 3 changes and re-running). The failures are caused by unit tests passing undefined ctx.worktreePath to services that now require it. These tests need updating in a future phase but are out of scope for Phase 3 (fake service updates).

---

## Summary

Phase 3 complete. All fake services now:
1. Use composite keys (`${ctx.worktreePath}|${slug}`) for workspace isolation
2. Record ctx in all call arrays for test assertions
3. Accept ctx as first parameter in all setPreset* methods
4. Have complete reset() implementations that clear all state

### Key DYK Fixes Applied
- DYK#1: Fixed missing `presetCanEndResults.clear()` in reset()
- DYK#4: Renamed `setCanEndResult` → `setPresetCanEndResult`
- DYK#5: Added full fake support for `getAnswer()`

### Files Changed
- `packages/workgraph/src/fakes/fake-workgraph-service.ts`
- `packages/workgraph/src/fakes/fake-worknode-service.ts`
- `packages/workgraph/src/fakes/fake-workunit-service.ts`

### Files Created
- `test/helpers/workspace-context.ts`
- `test/unit/workgraph/fake-workspace-isolation.test.ts`
