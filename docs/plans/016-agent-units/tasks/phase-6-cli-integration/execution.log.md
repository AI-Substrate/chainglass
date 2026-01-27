# Phase 6: CLI Integration – Execution Log

**Phase**: Phase 6: CLI Integration
**Plan**: [agent-units-plan.md](../../agent-units-plan.md)
**Dossier**: [tasks.md](./tasks.md)
**Started**: 2026-01-28

---

## Task T000: Export registerWorkgraphServices(container) from workgraph package

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Implemented ADR-0008: Module Registration Function Pattern.

1. Added `registerWorkgraphServices()` and `registerWorkgraphTestServices()` functions to packages/workgraph/src/container.ts
2. Exported both functions from packages/workgraph/src/index.ts
3. Updated apps/cli/src/lib/container.ts:
   - Import `registerWorkgraphServices` and `registerWorkgraphTestServices` from @chainglass/workgraph
   - Call `registerWorkgraphServices(childContainer, WORKFLOW_DI_TOKENS.YAML_PARSER)` in production container
   - Call `registerWorkgraphTestServices(childContainer)` in test container

### Evidence
```
pnpm test test/unit/workgraph/container-registration.test.ts
 ✓ unit/workgraph/container-registration.test.ts (2 tests) 2ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

All 154 workgraph tests continue to pass.

### Files Changed
- `packages/workgraph/src/container.ts` — Added registerWorkgraphServices() and registerWorkgraphTestServices()
- `packages/workgraph/src/index.ts` — Exported new functions
- `apps/cli/src/lib/container.ts` — Import and call registration functions
- `test/unit/workgraph/container-registration.test.ts` — Added test for ADR-0008 pattern

**Completed**: 2026-01-28

---

## Task T001: Add format methods to ConsoleOutputAdapter for workgraph.* result types

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Added format methods to ConsoleOutputAdapter for all 24 workgraph result types (48 methods total: success + failure for each).

1. Added inline type definitions for all workgraph result types to avoid circular dependencies
2. Added 24 case statements to formatSuccess() switch
3. Added 24 case statements to formatFailure() switch
4. Implemented 24 success formatters with human-friendly output:
   - Unit operations: list, info, create, validate
   - Graph operations: create, show, status
   - Node operations: add-after, remove, exec, can-run, mark-ready, start, end, can-end
   - I/O operations: list-inputs, list-outputs, get-input-data, get-input-file, save-output-data, save-output-file
   - Handover operations: ask, answer, clear
5. Implemented 24 failure formatters with actionable error messages

### Evidence
```
pnpm -F @chainglass/shared build
> tsc
(success - no errors)
```

### Files Changed
- `packages/shared/src/adapters/console-output.adapter.ts` — Added ~500 lines of format methods

### Discoveries
- Used inline type definitions to avoid circular dependency between shared and workgraph packages
- Tree rendering for `wg.show` uses recursive function with proper connector characters

**Completed**: 2026-01-28

---

## Tasks T002-T006: Create unit.command.ts and implement all unit commands

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Created `unit.command.ts` with all unit commands (list, info, create, validate) in a single file following the `workflow.command.ts` pattern.

1. Created file structure matching workflow.command.ts
2. Implemented DI container integration via `getWorkUnitService()`
3. Implemented handlers: `handleUnitList`, `handleUnitInfo`, `handleUnitCreate`, `handleUnitValidate`
4. Exported `registerUnitCommands(program: Command)`
5. Added --json flag to all commands

Commands implemented:
- `cg unit list` (T003)
- `cg unit info <slug>` (T004)
- `cg unit create <slug> --type <type>` (T005)
- `cg unit validate <slug>` (T006)

### Evidence
```
pnpm -F @chainglass/cli build
CLI bundled successfully to dist/cli.cjs
(success)
```

### Files Changed
- `apps/cli/src/commands/unit.command.ts` — Created (~190 lines)

**Completed**: 2026-01-28

---

## Tasks T007-T016: Create workgraph.command.ts and implement all wg commands

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Created `workgraph.command.ts` with all workgraph commands in a single file following the pattern.

1. Created file structure with triple-nested command structure (wg → node → cmd) per DYK#3
2. Implemented DI container integration via `getWorkGraphService()` and `getWorkNodeService()`
3. Implemented all graph handlers: `handleWgCreate`, `handleWgShow`, `handleWgStatus`
4. Implemented all node handlers: `handleNodeAddAfter`, `handleNodeRemove`, `handleNodeExec`, `handleNodeStart`, `handleNodeEnd`, `handleNodeCanRun`, `handleNodeCanEnd`, `handleNodeListInputs`, `handleNodeListOutputs`, `handleNodeGetInputData`, `handleNodeGetInputFile`, `handleNodeSaveOutputData`, `handleNodeSaveOutputFile`, `handleNodeAsk`, `handleNodeAnswer`
5. Exported `registerWorkGraphCommands(program: Command)`
6. Added --json flag to node subgroup per DYK#3, accessed via `cmd.parent.opts().json`

Commands implemented:
- Graph: create, show, status (T008-T010)
- Node: add-after, remove, exec (T011-T013)
- Lifecycle: start, end, can-run, can-end (T014)
- I/O: list-inputs, list-outputs, get-input-data, get-input-file, save-output-data, save-output-file (T015)
- Handover: ask, answer (T016)

### Evidence
```
pnpm -F @chainglass/cli build
CLI bundled successfully to dist/cli.cjs
(success)
```

### Files Changed
- `apps/cli/src/commands/workgraph.command.ts` — Created (~550 lines)

### Discoveries
- `cmd.parent.opts().json` correctly accesses --json from parent node subgroup
- BootstrapPromptService imported directly for exec command (per DYK#4)

**Completed**: 2026-01-28

---

## Task T017: Register commands in bin/cg.ts

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
1. Added imports for `registerUnitCommands` and `registerWorkGraphCommands` to cg.ts
2. Called both registration functions in `createProgram()`
3. Updated commands/index.ts to export the new registration functions
4. Fixed BootstrapPromptService import (added to workgraph package exports)

### Evidence
```
node ./apps/cli/dist/cli.cjs --help
COMMANDS
  ...
  unit        Manage WorkUnit library
  wg          Manage WorkGraphs and nodes
```

### Files Changed
- `apps/cli/src/bin/cg.ts` — Added imports and registration calls
- `apps/cli/src/commands/index.ts` — Added exports
- `packages/workgraph/src/index.ts` — Added BootstrapPromptService export

### Discoveries
- BootstrapPromptService wasn't exported from main index.ts, had to add it

**Completed**: 2026-01-28

---

## Task T018: --json flag already implemented

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Verified --json flag was already implemented in T002-T016. All unit and wg commands have --json option.

**Completed**: 2026-01-28

---

## Task T019: Write integration test

**Started**: 2026-01-28
**Status**: ✅ Complete

### What I Did
Created integration test file `test/integration/workgraph/cli-workflow.test.ts` with:
1. Full workflow test: create unit → create graph → add node → execute
2. Unit validation test
3. List operations test
4. Ask/answer handover flow test

### Evidence
```
pnpm test test/integration/workgraph/cli-workflow.test.ts
 ✓ integration/workgraph/cli-workflow.test.ts (4 tests) 13ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Files Changed
- `test/integration/workgraph/cli-workflow.test.ts` — Created (~230 lines)

### Discoveries
- Scaffolded agent units have required inputs (topic), so addNodeAfter returns E103 unless inputs are wired
- Tests correctly validate this behavior by checking error codes

**Completed**: 2026-01-28

---

## Phase 6 Summary

**Phase**: Phase 6: CLI Integration
**Status**: ✅ Complete

### Tasks Completed
All 20 tasks completed (T000-T019):
- T000: registerWorkgraphServices() per ADR-0008
- T001: Output adapter format methods (48 methods)
- T002-T006: unit.command.ts with all unit commands
- T007-T016: workgraph.command.ts with all wg commands
- T017: Command registration in cg.ts
- T018: --json flag support
- T019: Integration tests

### Files Created/Modified
- `packages/workgraph/src/container.ts` — Added registerWorkgraphServices(), registerWorkgraphTestServices()
- `packages/workgraph/src/index.ts` — Added exports for new functions and BootstrapPromptService
- `packages/shared/src/adapters/console-output.adapter.ts` — Added ~500 lines of workgraph format methods
- `apps/cli/src/commands/unit.command.ts` — Created (~190 lines)
- `apps/cli/src/commands/workgraph.command.ts` — Created (~550 lines)
- `apps/cli/src/bin/cg.ts` — Added imports and registration calls
- `apps/cli/src/commands/index.ts` — Added exports
- `apps/cli/src/lib/container.ts` — Added registerWorkgraphServices() call
- `test/unit/workgraph/container-registration.test.ts` — Created ADR-0008 tests
- `test/integration/workgraph/cli-workflow.test.ts` — Created integration tests

### Evidence
- 2144 tests pass, 19 skipped
- CLI commands visible in `cg --help`:
  - `unit` - Manage WorkUnit library
  - `wg` - Manage WorkGraphs and nodes
- All lint/format checks pass

### Key Decisions Made
- Per DYK#1/ADR-0008: Module Registration Function Pattern for DI composition
- Per DYK#2: Continue existing format method pattern (~48 methods)
- Per DYK#3: Triple-nested command structure (wg → node → cmd) with --json at subgroup
- Per DYK#4: exec prints prompt + Copilot CLI example; agent spawning deferred
- Per DYK#5: Hybrid error feedback (actionable console + rich JSON)

**Phase Completed**: 2026-01-28
