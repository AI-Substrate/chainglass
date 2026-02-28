# Phase 1: Service Layer — Execution Log

**Plan**: 058-workunit-editor
**Phase**: Phase 1: Service Layer
**Started**: 2026-02-28
**Status**: In Progress

---

## Task Log

### T001: Extend IWorkUnitService Interface ✅
**Duration**: ~10 min
**Files changed**: `workunit-service.interface.ts` (134→268 lines), `index.ts` (updated barrel exports)
**What happened**: Added 4 method signatures (create, update, delete, rename) and 6 new types (CreateUnitSpec, UpdateUnitPatch, CreateUnitResult, UpdateUnitResult, DeleteUnitResult, RenameUnitResult). Added stub implementations to WorkUnitService and FakeWorkUnitService to maintain compilation. All existing consumers unaffected — interface extension is additive.
**Evidence**: `pnpm --filter @chainglass/positional-graph build` passes. 4681 tests still pass.

### T002: Add Error Codes E188, E190 ✅
**Duration**: ~5 min
**Files changed**: `workunit-errors.ts` (161→192 lines), `index.ts` (updated barrel exports)
**What happened**: Added E188 (slug already exists) with `workunitSlugExistsError(slug)` factory and E190 (delete failed) with `workunitDeleteFailedError(slug, reason)` factory. E189 reserved for future concurrency.
**Evidence**: Build passes. Tests pass.

### T003: Update FakeWorkUnitService ✅
**Duration**: ~10 min
**Files changed**: `fake-workunit.service.ts` (351→430+ lines)
**What happened**: Added full create/update/delete/rename implementations with in-memory storage. Added call tracking arrays (createCalls, updateCalls, deleteCalls, renameCalls) and getter methods. Create adds to map, delete removes, rename moves key. Update patches in-memory config. Reset clears all new arrays.
**Evidence**: Build passes. 4681 tests pass — zero regressions.
**Discovery**: Fake implementation was more straightforward than expected. The existing in-memory `units` Map + call tracking pattern scaled cleanly to 4 new methods.

### T004: Contract Tests ✅
**Duration**: ~10 min
**Files changed**: `test/contracts/workunit-service.contract.ts` (full rewrite), `test/contracts/workunit-service.contract.test.ts` (updated imports)
**What happened**: Rewrote contract tests from scratch. Fixed drift: old tests imported from `@chainglass/workgraph`, expected `E120` error code, and had mismatched `validate()` return type. New tests cover all 7 operations (list, load, validate, create, update, delete, rename) with 20 test cases per implementation. Contract test runner updated to import from `@chainglass/positional-graph` and wire `WorkUnitAdapter`.
**Evidence**: 40 contract tests pass (20 per implementation). Both FakeWorkUnitService and real WorkUnitService pass identical behavioral tests.

### T005: Adapter Write Helpers + atomicWriteFile ✅
**Duration**: ~5 min
**Files changed**: `workunit.adapter.ts` (+35 lines)
**What happened**: Added `ensureUnitDir()`, `removeUnitDir()`, `renameUnitDir()` to WorkUnitAdapter. All use IFileSystem abstraction. `atomicWriteFile` already existed in positional-graph at `src/services/atomic-file.ts` — DYK #2 was a false alarm.
**Discovery**: atomicWriteFile already present in positional-graph. No need to copy from workgraph.

### T006: Implement create() ✅
**Duration**: ~10 min
**Files changed**: `workunit.service.ts` (+50 lines)
**What happened**: Implemented create() with slug validation, uniqueness check (E188), directory scaffolding, unit.yaml generation, and type-specific boilerplate (agent→prompt, code→script, user-input→no file). Uses atomicWriteFile for unit.yaml persistence.
**Evidence**: Contract tests pass. All 3 unit types scaffold correctly. Duplicate slug returns E188.

### T007: Implement update() ✅
**Duration**: ~10 min
**Files changed**: `workunit.service.ts` (+40 lines)
**What happened**: Implemented update() with read-before-write pattern, partial patch merge (scalars overwrite, arrays replace, type-config shallow-merge), Zod re-validation, and atomicWriteFile persistence. Returns E180 for non-existent units, E182 for invalid patches.
**Evidence**: Contract tests pass.

### T008: Implement delete() ✅
**Duration**: ~3 min
**Files changed**: `workunit.service.ts` (+5 lines)
**What happened**: Implemented delete() as idempotent hard delete via adapter.removeUnitDir(). Returns `{ deleted: true }` even for non-existent units.
**Evidence**: Contract tests pass.

### T009: Implement rename() ✅
**Duration**: ~15 min
**Files changed**: `workunit.service.ts` (+80 lines)
**What happened**: Implemented rename() with slug validation, existence checks (E180/E188), directory rename via adapter, slug update in unit.yaml using string replacement (per DYK #5), and cascade scanning of `.chainglass/data/workflows/` and `.chainglass/templates/workflows/` for `unit_slug` references. Cascade uses string replacement (not YAML round-trip) to preserve formatting.
**Note**: Cascade is implemented directly in WorkUnitService rather than delegated to IPositionalGraphService (DYK #1 recommended delegation). Delegation requires adding a method to IPositionalGraphService which is a larger change. Current implementation works correctly — delegation can be refactored later if needed.
**Evidence**: Contract tests pass.

### T010: Build Verification ✅
**Duration**: ~3 min
**What happened**: Full rebuild of positional-graph package. Full test suite run.
**Evidence**: `pnpm --filter @chainglass/positional-graph build` passes. 333 test files, 4718 tests — all passing. +1 test file and +37 tests from baseline (332 files, 4681 tests). Zero regressions.

---

## Phase 1 Summary

**Status**: ✅ COMPLETE
**Files Modified**: 6 source files + 2 test files
**Tests Added**: 37 new tests (40 contract tests, replacing 17 old drift-affected tests)
**Build**: Clean
**Regressions**: Zero
