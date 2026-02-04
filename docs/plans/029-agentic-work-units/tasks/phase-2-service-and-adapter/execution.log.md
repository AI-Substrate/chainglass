# Execution Log: Phase 2 — Service and Adapter

**Plan**: [../../agentic-work-units-plan.md](../../agentic-work-units-plan.md)
**Dossier**: [./tasks.md](./tasks.md)
**Started**: 2026-02-04

---

## Task T001: Write tests for WorkUnitAdapter path resolution
**Started**: 2026-02-04
**Dossier Task**: T001
**Plan Task**: 2.1
**Status**: ✅ Complete

### What I Did
Wrote TDD RED tests for WorkUnitAdapter path resolution methods:
- `getUnitDir(ctx, slug)` - Returns `.chainglass/units/<slug>/` path
- `getUnitYamlPath(ctx, slug)` - Returns path to `unit.yaml`
- `getTemplatePath(ctx, slug, relativePath)` - Returns absolute template path
- `listUnitSlugs(ctx)` - Lists all unit slugs in directory
- `unitExists(ctx, slug)` - Checks if unit.yaml exists

### Evidence
Tests fail with `Cannot find module 'workunit.adapter.js'` - expected for TDD RED phase.

```
Error: Cannot find module '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.js'
```

### Files Created
- `test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts`

### Key Design Decisions
- Per DYK #1: Uses `.chainglass/units/` not `.chainglass/data/units/`
- Validates slug format (matches `/^[a-z][a-z0-9-]*$/`)
- Rejects empty slugs and directory traversal attempts

**Completed**: 2026-02-04

---

## Task T002: Implement WorkUnitAdapter extending WorkspaceDataAdapterBase
**Started**: 2026-02-04
**Dossier Task**: T002
**Plan Task**: 2.2
**Status**: ✅ Complete

### What I Did
Implemented WorkUnitAdapter extending WorkspaceDataAdapterBase:
- Override `getDomainPath()` to return `.chainglass/units/` per DYK #1
- `getUnitDir(ctx, slug)` — validates slug, returns unit directory
- `getUnitYamlPath(ctx, slug)` — returns path to unit.yaml
- `getTemplatePath(ctx, slug, relativePath)` — returns absolute template path
- `listUnitSlugs(ctx)` — lists all unit directories
- `unitExists(ctx, slug)` — checks if unit.yaml exists
- Slug validation using `/^[a-z][a-z0-9-]*$/`

### Evidence
All 17 adapter tests pass:

```
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts (17 tests) 9ms

Test Files  1 passed (1)
     Tests  17 passed (17)
```

### Files Created
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts`

### Files Modified
- `packages/positional-graph/src/features/029-agentic-work-units/index.ts` — added `WorkUnitAdapter` export

**Completed**: 2026-02-04

---

## Task T003-T006: Write tests for WorkUnitService (combined)
**Started**: 2026-02-04
**Dossier Tasks**: T003, T004, T005, T006
**Plan Tasks**: 2.3, 2.4, 2.5, 2.6
**Status**: ✅ Complete

### What I Did
Wrote comprehensive TDD RED tests for WorkUnitService in a single file:
- T003: `list()` - empty, multiple units, partial failure (skip-and-warn)
- T004: `load()` - AgenticWorkUnit, CodeUnit, UserInputUnit, E180/E181/E182 errors
- T005: `validate()` - valid/invalid units, missing units
- T006: Unit class template methods - `getPrompt()`, `setPrompt()`, `getScript()`, `setScript()`, E184/E185 errors

### Evidence
Tests fail with `Cannot find module 'workunit.service.js'` - expected for TDD RED phase.

### Files Created
- `test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts`

### Key Test Coverage
- list() with skip-and-warn per DYK #5
- Rich domain objects per DYK #6 (AgenticWorkUnitInstance.getPrompt(), CodeUnitInstance.getScript())
- UserInputUnit has no template methods (compile-time safety)
- Path escape security tests (E184)
- Template not found tests (E185)

**Completed**: 2026-02-04

---

## Task T007: Implement WorkUnitService + unit classes
**Started**: 2026-02-04
**Dossier Task**: T007
**Plan Task**: 2.7
**Status**: ✅ Complete

### What I Did
Implemented WorkUnitService and rich domain classes to make tests pass (TDD GREEN):

1. **workunit-service.interface.ts** - Service interface and result types:
   - `IWorkUnitService` interface with `list()`, `load()`, `validate()` methods
   - `WorkUnitSummary`, `ListUnitsResult`, `LoadUnitResult`, `ValidateUnitResult` types
   - Type guards: `isAgenticWorkUnit()`, `isCodeUnit()`, `isUserInputUnit()`

2. **workunit.classes.ts** - Rich domain class interfaces and factories:
   - `AgenticWorkUnitInstance` with `getPrompt()`, `setPrompt()` methods
   - `CodeUnitInstance` with `getScript()`, `setScript()` methods
   - `UserInputUnitInstance` with NO template methods (per DYK #6)
   - Factory functions: `createAgenticWorkUnitInstance()`, `createCodeUnitInstance()`, `createUserInputUnitInstance()`
   - `validatePathContainment()` security function using `startsWith(unitDir + path.sep)` per DYK #3

3. **workunit.service.ts** - Service implementation:
   - Constructor takes `WorkUnitAdapter`, `IFileSystem`, `IYamlParser`
   - `list()` with skip-and-warn per DYK #5 - returns valid units + errors array
   - `load()` returns rich domain instances based on type discrimination
   - `validate()` for quick validation without full load
   - Uses Zod schema validation with `formatZodErrors()` for E182 errors

### Evidence
All 76 tests pass across 5 test files:

```
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts (17 tests) 4ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts (24 tests) 8ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts (17 tests) 4ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts (10 tests) 2ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts (8 tests) 2ms

Test Files  5 passed (5)
     Tests  76 passed (76)
```

### Files Created
- `packages/positional-graph/src/features/029-agentic-work-units/workunit-service.interface.ts`
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts`
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts`

### Files Modified
- `packages/positional-graph/src/features/029-agentic-work-units/index.ts` — added service, interface, and class exports

### Key Design Decisions
- Per DYK #3: Path escape check uses `startsWith(unitDir + path.sep)` to prevent prefix attacks
- Per DYK #5: `list()` collects errors but continues processing valid units
- Per DYK #6: Rich domain objects with type-specific methods, not plain data objects
- Factory functions create closures over adapter and fs for template methods

**Completed**: 2026-02-04

---

## Task T008: Write security tests for path escape prevention
**Started**: 2026-02-04
**Dossier Task**: T008
**Plan Task**: 2.8
**Status**: ✅ Complete

### What I Did
Added comprehensive security tests for path escape prevention (7 new tests):

1. **Absolute path in prompt_template** — `/etc/passwd` → E184
2. **Absolute path in script** — `/etc/passwd` → E184
3. **Slug-prefix attack (DYK #3)** — `../my-agent-evil/../../.env` → E184
4. **Nested ../ escape attempts** — `../../other-unit/prompts/secret.md` → E184
5. **Valid nested paths within unit folder** — `prompts/nested/deep/main.md` → succeeds
6. **Path escape in setPrompt()** — `../../../etc/passwd` → E184
7. **Path escape in setScript()** — `../../../etc/passwd` → E184

Also enhanced `validatePathContainment()` in `workunit.classes.ts` to explicitly check for absolute paths, since `path.join()` neutralizes them (joins `/base` + `/etc` → `/base/etc`). Now rejecting absolute paths indicates malicious intent.

### Evidence
All 83 tests pass:

```
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts (31 tests) 9ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts (17 tests) 4ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts (17 tests) 4ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts (10 tests) 2ms
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts (8 tests) 2ms

Test Files  5 passed (5)
     Tests  83 passed (83)
```

### Files Modified
- `test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts` — added T008 security test section
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts` — enhanced validatePathContainment() for absolute path detection

### Key Technical Insight
`path.join('/base', '/etc/passwd')` produces `/base/etc/passwd` on POSIX, NOT `/etc/passwd`. The leading slash is stripped and the path is joined normally. So we explicitly check `path.isAbsolute(templatePath)` to reject absolute paths as a security measure, even though `path.join` would neutralize them.

**Completed**: 2026-02-04

---

## Task T009: Create FakeWorkUnitService
**Started**: 2026-02-04
**Dossier Task**: T009
**Plan Task**: 2.9
**Status**: ✅ Complete

### What I Did
Created FakeWorkUnitService for Phase 3/4 testing:

1. **fake-workunit.service.ts** — Test double implementing IWorkUnitService:
   - `addUnit()` — register fake units with preset content
   - `removeUnit()` — remove a fake unit
   - `setTemplateContent()` — override getPrompt()/getScript() return value
   - `setErrors()` — preset errors for specific slugs
   - `getListCalls()`, `getLoadCalls()`, `getValidateCalls()` — call tracking
   - `reset()` — clear all state

2. **fake-workunit.service.test.ts** — 20 tests verifying fake behavior:
   - list() returns empty/registered units
   - load() returns E180 for unregistered, works for all 3 types
   - validate() works correctly
   - Template methods (getPrompt, setPrompt, getScript, setScript) work
   - Template content override via setTemplateContent()
   - Error injection via setErrors()
   - Call tracking verification

### Evidence
All 103 tests pass across 6 test files:

```
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts (31 tests)
✓ test/unit/positional-graph/features/029-agentic-work-units/fake-workunit.service.test.ts (20 tests)
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts (17 tests)
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts (17 tests)
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts (10 tests)
✓ test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts (8 tests)

Test Files  6 passed (6)
     Tests  103 passed (103)
```

### Files Created
- `packages/positional-graph/src/features/029-agentic-work-units/fake-workunit.service.ts`
- `test/unit/positional-graph/features/029-agentic-work-units/fake-workunit.service.test.ts`

### Files Modified
- `packages/positional-graph/src/features/029-agentic-work-units/index.ts` — added FakeWorkUnitService export

**Completed**: 2026-02-04

---

## Task T010: Add DI tokens to positional-graph-tokens
**Started**: 2026-02-04
**Dossier Task**: T010
**Plan Task**: 2.10
**Status**: ✅ Complete

### What I Did
Added DI tokens for WorkUnitAdapter and IWorkUnitService to POSITIONAL_GRAPH_DI_TOKENS:

```typescript
export const POSITIONAL_GRAPH_DI_TOKENS = {
  // ... existing tokens ...
  /** WorkUnitAdapter — filesystem adapter for work units (Plan 029: Phase 2) */
  WORKUNIT_ADAPTER: 'WorkUnitAdapter',
  /** IWorkUnitService — service for loading/listing/validating work units (Plan 029: Phase 2) */
  WORKUNIT_SERVICE: 'IWorkUnitService',
} as const;
```

### Files Modified
- `packages/shared/src/di-tokens.ts` — added WORKUNIT_ADAPTER and WORKUNIT_SERVICE to POSITIONAL_GRAPH_DI_TOKENS

**Completed**: 2026-02-04

---

## Task T011: Refactor and verify coverage
**Started**: 2026-02-04
**Dossier Task**: T011
**Plan Task**: 2.11
**Status**: ✅ Complete

### What I Did
Final verification and cleanup:

1. **Fixed TypeScript errors**:
   - Made `WorkUnitAdapter.validateSlug()` public (was private, needed by service)
   - Fixed `yamlParser.parse()` to pass both arguments (content + filePath)

2. **Fixed linting issues**:
   - Fixed import ordering in test files and implementation files
   - Applied biome formatter to all modified files

3. **Verified all tests pass**:
   - All 103 feature tests pass (6 test files)
   - All 3199 tests pass across the entire project
   - `just fft` completes successfully

### Evidence
Full project test suite passes:

```
Test Files  220 passed | 5 skipped (225)
     Tests  3199 passed | 41 skipped (3240)
```

Feature test files (6 files, 103 tests):
- workunit.service.test.ts (31 tests)
- fake-workunit.service.test.ts (20 tests)
- workunit.adapter.test.ts (17 tests)
- workunit.schema.test.ts (17 tests)
- workunit-errors.test.ts (10 tests)
- workunit.types.test.ts (8 tests)

### Files Modified
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts` — made validateSlug() public
- `packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts` — fixed yamlParser.parse() arguments
- Various files — import ordering fixes via biome

**Completed**: 2026-02-04

---

## Phase 2 Summary

**Phase Status**: ✅ Complete

**Total Tasks**: 11
**Completed**: 11
**Total Tests**: 103 (across 6 test files)

### Files Created (Phase 2)
1. `workunit.adapter.ts` — WorkUnitAdapter extending WorkspaceDataAdapterBase
2. `workunit.service.ts` — WorkUnitService implementing IWorkUnitService
3. `workunit-service.interface.ts` — IWorkUnitService interface + type guards
4. `workunit.classes.ts` — Rich domain class interfaces and factory functions
5. `fake-workunit.service.ts` — FakeWorkUnitService for testing
6. `workunit.adapter.test.ts` — 17 adapter tests
7. `workunit.service.test.ts` — 31 service tests (including security tests)
8. `fake-workunit.service.test.ts` — 20 fake service tests

### Files Modified (Phase 2)
1. `index.ts` — Added all new exports
2. `di-tokens.ts` — Added WORKUNIT_ADAPTER and WORKUNIT_SERVICE tokens

### Key Learnings
1. **DYK #1**: WorkUnits use `.chainglass/units/` NOT `.chainglass/data/units/` — override getDomainPath()
2. **DYK #3**: Path escape check must use `startsWith(unitDir + sep)` — trailing separator prevents prefix attacks
3. **DYK #5**: list() uses skip-and-warn — returns valid units + errors array for malformed ones
4. **DYK #6**: Rich domain objects — AgenticWorkUnit.getPrompt(), CodeUnit.getScript(), no template methods on UserInputUnit
5. **path.join behavior**: `path.join('/base', '/etc/passwd')` → `/base/etc/passwd` — need explicit isAbsolute() check

---
