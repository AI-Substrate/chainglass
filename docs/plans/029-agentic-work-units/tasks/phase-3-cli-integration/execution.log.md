# Execution Log: Phase 3 — CLI Integration

**Plan**: [../../agentic-work-units-plan.md](../../agentic-work-units-plan.md)
**Dossier**: [./tasks.md](./tasks.md)
**Started**: 2026-02-04

---

## Task T008: Add DI registration to positional-graph container.ts
**Started**: 2026-02-04
**Dossier Task**: T008
**Plan Task**: 3.8
**Status**: ✅ Complete

### What I Did
Registered WorkUnitAdapter and WorkUnitService in the DI container per Critical Insight #1 (dependency order):

1. **Updated `packages/positional-graph/src/container.ts`**:
   - Added import for `WorkUnitAdapter` and `WorkUnitService`
   - Registered `WORKUNIT_ADAPTER` with factory resolving IFileSystem and IPathResolver
   - Registered `WORKUNIT_SERVICE` with factory resolving WorkUnitAdapter, IFileSystem, IYamlParser

2. **Updated `apps/cli/src/lib/container.ts` (production container)**:
   - Per Critical Insight #1: Moved `registerPositionalGraphServices()` BEFORE `WORK_UNIT_LOADER` bridge registration
   - Updated bridge to resolve from `POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE` instead of `WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE`
   - Added import for `IWorkUnitService` type

3. **Updated `apps/cli/src/lib/container.ts` (test container)**:
   - Added import for `FakeWorkUnitService`
   - Registered `FakeWorkUnitService` for both `WORKUNIT_SERVICE` and `WORK_UNIT_LOADER` tokens
   - Per Critical Insight #5: Same fake instance for both tokens

### Evidence
TypeScript compiles without errors:
```bash
pnpm typecheck  # Success
```

All 103 existing tests pass:
```bash
pnpm test test/unit/positional-graph/features/029-agentic-work-units/
# ✓ workunit.service.test.ts (31 tests)
# ✓ workunit.adapter.test.ts (17 tests)
# ✓ workunit.schema.test.ts (17 tests)
# ✓ fake-workunit.service.test.ts (20 tests)
# ✓ workunit-errors.test.ts (10 tests)
# ✓ workunit.types.test.ts (8 tests)
# Test Files  6 passed (6)
#      Tests  103 passed (103)
```

### Files Changed
- `packages/positional-graph/src/container.ts` — added WorkUnitAdapter and WorkUnitService registrations
- `apps/cli/src/lib/container.ts` — updated production and test containers

### Key Design Decisions
- Per Critical Insight #1: Register `WorkUnitService` BEFORE setting up `WORK_UNIT_LOADER` bridge
- Per Critical Insight #5: Wire both `WORKUNIT_SERVICE` and `WORK_UNIT_LOADER` to same instance

**Completed**: 2026-02-04

---

## Task T009: Write DI resolution tests
**Started**: 2026-02-04
**Dossier Task**: T009
**Plan Task**: 3.9
**Status**: ✅ Complete

### What I Did
Created comprehensive DI resolution tests in `test/unit/positional-graph/container.test.ts` to verify:

1. **WorkUnitAdapter resolution** — WORKUNIT_ADAPTER token resolves to WorkUnitAdapter instance
2. **WorkUnitService resolution** — WORKUNIT_SERVICE token resolves to WorkUnitService instance
3. **IWorkUnitLoader bridge** — WORK_UNIT_LOADER token resolves to WorkUnitService instance (backward compat)
4. **Transient lifetime** — Each resolve() call returns a new instance
5. **Container isolation** — Different child containers have independent instances
6. **Interface contracts** — Resolved services have list(), load(), validate() methods

### Evidence
All 9 tests pass:
```bash
pnpm test test/unit/positional-graph/container.test.ts
# ✓ test/unit/positional-graph/container.test.ts (9 tests) 3ms
# Test Files  1 passed (1)
#      Tests  9 passed (9)
```

### Files Created
- `test/unit/positional-graph/container.test.ts` — 9 tests for DI resolution

### Key Test Patterns
- Uses child container isolation per test (beforeEach/afterEach)
- Registers prerequisite shared tokens before testing positional-graph services
- Tests both IWorkUnitService (rich interface) and IWorkUnitLoader (narrow interface) resolution

**Completed**: 2026-02-04

---

## Task T001: Write tests for reserved parameter detection
**Started**: 2026-02-04
**Dossier Task**: T001
**Plan Task**: 3.1
**Status**: ✅ Complete

### What I Did
Created reserved parameter infrastructure and tests:

1. **Created `reserved-params.ts`**:
   - `RESERVED_INPUT_PARAMS` constant: `['main-prompt', 'main-script']`
   - `ReservedInputParam` type for type-safe reserved param names
   - `isReservedInputParam()` utility function for detection

2. **Updated feature barrel `index.ts`**:
   - Exported `RESERVED_INPUT_PARAMS`, `ReservedInputParam`, `isReservedInputParam`

3. **Created `test/unit/cli/positional-graph-command.test.ts`**:
   - 12 tests for reserved parameter detection
   - Tests verify: `main-prompt` reserved, `main-script` reserved, user inputs not reserved
   - Edge cases: empty string, whitespace, similar names (main_prompt vs main-prompt)

### Evidence
All 12 detection tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Reserved Input Parameter Detection > RESERVED_INPUT_PARAMS constant (2 tests)
# ✓ Reserved Input Parameter Detection > isReservedInputParam function (4 tests)
# ✓ Non-Reserved Input Passthrough (2 tests)
```

### Files Created
- `packages/positional-graph/src/features/029-agentic-work-units/reserved-params.ts`
- `test/unit/cli/positional-graph-command.test.ts`

### Files Modified
- `packages/positional-graph/src/features/029-agentic-work-units/index.ts`

**Completed**: 2026-02-04

---

## Task T002: Write tests for type mismatch error (E186)
**Started**: 2026-02-04
**Dossier Task**: T002
**Plan Task**: 3.2
**Status**: ✅ Complete

### What I Did
Extended test file with E186 type mismatch tests:

1. **Added 4 tests for type mismatch scenarios**:
   - `main-prompt` on CodeUnit → no getPrompt method
   - `main-script` on AgenticWorkUnit → no getScript method
   - `main-prompt` on UserInputUnit → no getPrompt method
   - `main-script` on UserInputUnit → no getScript method

2. **Tests verify type-level constraints** that prevent calling wrong methods

### Evidence
All 4 type mismatch tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Type Mismatch Error E186 (4 tests)
```

### Files Modified
- `test/unit/cli/positional-graph-command.test.ts` — added E186 test suite

**Completed**: 2026-02-04

---

## Task T003: Implement reserved parameter routing
**Started**: 2026-02-04
**Dossier Task**: T003
**Plan Task**: 3.3
**Status**: ✅ Complete

### What I Did
Implemented reserved parameter routing in CLI:

1. **Updated `positional-graph.command.ts`**:
   - Added imports: `isReservedInputParam`, `workunitTypeMismatchError`, `IWorkUnitService`
   - Added `getWorkUnitService()` helper function
   - Modified `handleNodeGetInputData()` to detect reserved params:
     - If `main-prompt`: load unit, verify type=agent, call `getPrompt()`
     - If `main-script`: load unit, verify type=code, call `getScript()`
     - Type mismatch returns E186 error via `workunitTypeMismatchError()`
     - Non-reserved params passthrough to normal `getInputData()`

### Evidence
All 16 tests pass, routing works correctly:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Reserved Parameter Routing — AgenticWorkUnit (2 tests)
# ✓ Reserved Parameter Routing — CodeUnit (2 tests)
# ✓ Type Mismatch Error E186 (4 tests)
```

### Files Modified
- `apps/cli/src/commands/positional-graph.command.ts` — added reserved param routing logic

**Completed**: 2026-02-04

---

## Task T004: Write tests for `cg wf unit list` command
**Started**: 2026-02-04
**Dossier Task**: T004
**Plan Task**: 3.4
**Status**: ✅ Complete

### What I Did
Added 3 tests for unit list command:

1. **`should list all available units`** — verifies all registered units returned
2. **`should return unit summary with slug, type, and version`** — verifies summary fields
3. **`should return empty array when no units exist`** — verifies edge case

### Evidence
All 3 list tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Unit Subcommand: cg wf unit list (3 tests)
```

### Files Modified
- `test/unit/cli/positional-graph-command.test.ts` — added unit list test suite

**Completed**: 2026-02-04

---

## Task T005: Write tests for `cg wf unit info` command
**Started**: 2026-02-04
**Dossier Task**: T005
**Plan Task**: 3.5
**Status**: ✅ Complete

### What I Did
Added 3 tests for unit info command:

1. **`should load full unit details by slug`** — verifies all fields returned
2. **`should include inputs and outputs in unit info`** — verifies I/O contract
3. **`should return E180 for non-existent unit`** — verifies error handling

### Evidence
All 3 info tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Unit Subcommand: cg wf unit info (3 tests)
```

### Files Modified
- `test/unit/cli/positional-graph-command.test.ts` — added unit info test suite

**Completed**: 2026-02-04

---

## Task T006: Write tests for `cg wf unit get-template` command
**Started**: 2026-02-04
**Dossier Task**: T006
**Plan Task**: 3.6
**Status**: ✅ Complete

### What I Did
Added 3 tests for unit get-template command:

1. **`should get prompt template for agent unit`** — verifies getPrompt() works
2. **`should get script content for code unit`** — verifies getScript() works
3. **`should not have template methods for user-input unit`** — verifies type safety

### Evidence
All 3 get-template tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ Unit Subcommand: cg wf unit get-template (3 tests)
```

### Files Modified
- `test/unit/cli/positional-graph-command.test.ts` — added unit get-template test suite

**Completed**: 2026-02-04

---

## Task T007: Implement unit subcommands (list, info, get-template)
**Started**: 2026-02-04
**Dossier Task**: T007
**Plan Task**: 3.7
**Status**: ✅ Complete

### What I Did
Implemented all three unit subcommands:

1. **Added handler functions**:
   - `handleUnitList()` — calls `workUnitService.list()`, outputs unit summaries
   - `handleUnitInfo()` — calls `workUnitService.load()`, outputs full unit details
   - `handleUnitGetTemplate()` — calls `getPrompt()`/`getScript()` based on unit type, returns E183 for user-input

2. **Added command registration**:
   - `cg wf unit list` — list all available work units
   - `cg wf unit info <slug>` — show detailed unit information
   - `cg wf unit get-template <slug>` — get prompt/script content

### Evidence
All 25 tests pass:
```bash
pnpm test test/unit/cli/positional-graph-command.test.ts
# ✓ 25 tests pass
# Test Files  1 passed (1)
```

### Files Modified
- `apps/cli/src/commands/positional-graph.command.ts` — added unit handlers and command registration

**Completed**: 2026-02-04

---

## Task T010: Refactor CLI command structure
**Started**: 2026-02-04
**Dossier Task**: T010
**Plan Task**: 3.10
**Status**: ✅ Complete

### What I Did
Cleaned up lint issues and finalized code quality:

1. **Fixed non-null assertions**:
   - Changed `loadResult.unit!` to proper null checks with early returns
   - Pattern: `if (loadResult.errors.length > 0 || !loadResult.unit) { ... exit }`

2. **Fixed import organization**:
   - Ran `pnpm biome check --write` to sort imports
   - Fixed `noExplicitAny` lint issues by using proper type assertions

3. **Updated test file types**:
   - Added imports for `AgenticWorkUnitInstance`, `CodeUnitInstance`, `WorkUnitInstance`
   - Replaced `as any` casts with proper typed assertions

### Evidence
All quality checks pass:
```bash
just fft
# Lint: ✓ Checked 848 files. No fixes applied.
# Test: ✓ 3233 passed | 41 skipped
```

### Files Modified
- `apps/cli/src/commands/positional-graph.command.ts` — fixed lint issues
- `apps/cli/src/lib/container.ts` — fixed import organization
- `test/unit/cli/positional-graph-command.test.ts` — fixed type assertions
- `test/unit/positional-graph/container.test.ts` — fixed import organization

**Completed**: 2026-02-04

---

## Phase 3 Summary

**All 10 tasks completed**: T001-T010
**Total tests added**: 34 tests (9 DI + 25 CLI command)
**All tests pass**: 3233 passed
**Lint status**: Clean

### Key Deliverables
1. Reserved parameter routing (`main-prompt`, `main-script`) in CLI
2. E186 type mismatch error for wrong unit types
3. DI registration for WorkUnitAdapter and WorkUnitService
4. Unit subcommands: `cg wf unit list`, `cg wf unit info`, `cg wf unit get-template`

### Files Created
- `packages/positional-graph/src/features/029-agentic-work-units/reserved-params.ts`
- `test/unit/positional-graph/container.test.ts`
- `test/unit/cli/positional-graph-command.test.ts`

### Files Modified
- `packages/positional-graph/src/container.ts`
- `packages/positional-graph/src/features/029-agentic-work-units/index.ts`
- `apps/cli/src/lib/container.ts`
- `apps/cli/src/commands/positional-graph.command.ts`

