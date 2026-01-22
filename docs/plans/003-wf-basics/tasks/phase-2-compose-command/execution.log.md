# Phase 2: Compose Command – Execution Log

**Plan**: [../../wf-basics-plan.md](../../wf-basics-plan.md)
**Dossier**: [tasks.md](./tasks.md)
**Started**: 2026-01-22

---

## Task T001: Define IWorkflowService Interface

**Started**: 2026-01-22
**Dossier Task**: T001
**Plan Task**: 2.1
**Status**: ✅ Complete

### What I Did
Created the `IWorkflowService` interface with `compose()` method signature.

### Files Changed
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/interfaces/workflow-service.interface.ts` — Created interface with compose() method and detailed JSDoc
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/interfaces/index.ts` — Added export for IWorkflowService
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/index.ts` — Added re-export for IWorkflowService

### Evidence
Type check passed:
```bash
pnpm -F @chainglass/workflow exec tsc --noEmit
# No errors
```

### Interface Signature
```typescript
export interface IWorkflowService {
  compose(template: string, runsDir: string): Promise<ComposeResult>;
}
```

**Completed**: 2026-01-22

---

## Task T002: Write WorkflowService Tests (TDD RED)

**Started**: 2026-01-22
**Dossier Task**: T002
**Plan Task**: 2.3
**Status**: ✅ Complete

### What I Did
Created comprehensive test suite for `WorkflowService.compose()` with 18 tests covering:
- Happy path: create run folder from template
- Error E020: template not found
- Error E021: YAML parse error
- Error E022: schema validation failure
- Core schemas copied to each phase
- Template schemas copied to phases
- wf-phase.yaml extracted per phase
- Commands (main.md + wf.md) copied
- wf-status.json created with metadata
- Run folder naming (date-ordinal)
- Template name resolution (search paths)
- Template path resolution (direct)
- Tilde expansion in paths
- Directory structure creation
- Ordinal gap handling
- Phase sorting by order

### Files Changed
- `/home/jak/substrate/003-wf-basics/test/unit/workflow/workflow-service.test.ts` — Created test file with 18 tests
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/fakes/fake-schema-validator.ts` — Added setDefaultResult() helper

### Evidence (RED Phase - Tests Fail)
```bash
pnpm test -- --run test/unit/workflow/workflow-service.test.ts

 ❯ unit/workflow/workflow-service.test.ts (18 tests | 18 failed) 12ms
   × WorkflowService > compose() > should create run folder from template
     → Cannot read properties of undefined (reading 'compose')
   [... all 18 tests fail ...]
```

All tests fail as expected - service is undefined because WorkflowService is not yet implemented.

**Completed**: 2026-01-22

---

## Task T003: Implement WorkflowService.compose()

**Started**: 2026-01-22
**Dossier Task**: T003
**Plan Task**: 2.3
**Status**: ✅ Complete

### What I Did
Implemented `WorkflowService.compose()` following TDD GREEN phase:
- Created embedded schemas module (`src/schemas/index.ts`) per DYK-01
- Implemented template resolution (name vs path detection) per DYK-02
- Implemented tilde expansion using `os.homedir()`
- Implemented run folder ordinal discovery per DYK-03
- Implemented complete compose algorithm:
  - Resolve template → read wf.yaml → parse → validate → create run folder → copy files
- Fixed FakeFileSystem bug with relative path handling in mkdir

### Files Changed
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/schemas/index.ts` — Created embedded schemas module
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/workflow.service.ts` — Created WorkflowService implementation
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/index.ts` — Created services barrel export
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/index.ts` — Added exports for WorkflowService and schemas
- `/home/jak/substrate/003-wf-basics/packages/shared/src/fakes/fake-filesystem.ts` — Fixed relative path handling in mkdir
- `/home/jak/substrate/003-wf-basics/test/unit/workflow/workflow-service.test.ts` — Updated tests to use WorkflowService

### Evidence (GREEN Phase - Tests Pass)
```bash
pnpm test -- --run test/unit/workflow/workflow-service.test.ts

 ✓ unit/workflow/workflow-service.test.ts (18 tests) 28ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
```

### Discoveries
- **FakeFileSystem Bug**: Relative paths like `.chainglass/runs/...` were being stored with leading slash (e.g., `/.chainglass/...`) due to incorrect path building in `mkdir({ recursive: true })`. Fixed by handling relative paths separately.
- **Path Normalization**: `path.join('./custom/template', 'wf.yaml')` normalizes to `custom/template/wf.yaml` (no leading `./`). Tests must account for this.

**Completed**: 2026-01-22

---

## Task T004: Implement FakeWorkflowService

**Started**: 2026-01-22
**Dossier Task**: T004
**Plan Task**: 2.4
**Status**: ✅ Complete

### What I Did
Implemented FakeWorkflowService following FakeOutputAdapter pattern per DYK-04:
- Call capture with `getLastComposeCall()`, `getComposeCalls()`, `getComposeCallCount()`
- Preset results with `setComposeResult()`, `setDefaultResult()`, `setComposeError()`
- Static helpers `createSuccessResult()` and `createErrorResult()`
- Auto-generated success responses for out-of-box usage
- `reset()` for test isolation

### Files Changed
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/fakes/fake-workflow-service.ts` — Created FakeWorkflowService
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/fakes/index.ts` — Added export
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/index.ts` — Added re-export
- `/home/jak/substrate/003-wf-basics/test/unit/workflow/fake-workflow-service.test.ts` — Created tests

### Evidence
```bash
pnpm test -- --run test/unit/workflow/fake-workflow-service.test.ts

 ✓ unit/workflow/fake-workflow-service.test.ts (12 tests) 3ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Completed**: 2026-01-22

---

## Task T005: Write Contract Tests for IWorkflowService

**Started**: 2026-01-22
**Dossier Task**: T005
**Plan Task**: 2.5
**Status**: ✅ Complete

### What I Did
Created contract tests verifying both WorkflowService and FakeWorkflowService satisfy the IWorkflowService contract:
- Return type validation (ComposeResult shape)
- Phases array shape (name, order, status)
- Success behavior (empty errors, valid runDir)
- Error behavior (code, message, empty runDir)

### Files Changed
- `/home/jak/substrate/003-wf-basics/test/contracts/workflow-service.contract.test.ts` — Created contract tests

### Evidence
```bash
pnpm test -- --run test/contracts/workflow-service.contract.test.ts

 ✓ contracts/workflow-service.contract.test.ts (12 tests) 12ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Completed**: 2026-01-22

---

## Task T006: Create wf.command.ts

**Started**: 2026-01-22
**Dossier Task**: T006
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Created the `wf` command group skeleton with `registerWfCommands()` function following the web.command.ts pattern.

### Files Changed
- `/home/jak/substrate/003-wf-basics/apps/cli/src/commands/wf.command.ts` — Created command module with wf command group
- `/home/jak/substrate/003-wf-basics/apps/cli/src/commands/index.ts` — Added export for registerWfCommands

### Evidence
```bash
pnpm -F @chainglass/cli exec tsc --noEmit
# No errors
```

**Completed**: 2026-01-22

---

## Task T007: Implement compose action handler

**Started**: 2026-01-22
**Dossier Task**: T007
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Implemented `cg wf compose <slug>` action handler with `--json` and `--runs-dir` options:
- Created `handleCompose()` function per DYK-05 (pure wiring)
- Created `createWorkflowService()` factory for real implementations
- Created `createOutputAdapter()` factory for JSON/Console selection
- Outputs formatted result via adapter

### Files Changed
- `/home/jak/substrate/003-wf-basics/apps/cli/src/commands/wf.command.ts` — Added compose subcommand with action handler

### Evidence
Type check passed and command is registered.

**Completed**: 2026-01-22

---

## Task T008: Register wf commands in cg.ts

**Started**: 2026-01-22
**Dossier Task**: T008
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Registered the wf command group in the main CLI entry point.

### Files Changed
- `/home/jak/substrate/003-wf-basics/apps/cli/src/bin/cg.ts` — Added import and registration of registerWfCommands

### Evidence
```bash
pnpm -F @chainglass/cli exec tsc --noEmit
# No errors

pnpm -F @chainglass/cli exec cg wf --help
# Shows compose subcommand
```

**Completed**: 2026-01-22

---

## Task T009: Write CLI integration tests

**Started**: 2026-01-22
**Dossier Task**: T009
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Created comprehensive CLI integration tests for `cg wf compose` command:
- AC-06: Help shows compose command options
- AC-07: Compose creates run folder from template
- AC-07a: JSON output returns valid envelope
- AC-08: wf-status.json contains correct metadata (phases as object keyed by name)
- AC-09: Each phase folder has wf-phase.yaml (with `phase:` key per schema)
- Additional tests: commands directory, schemas directory, date-ordinal naming, ordinal increment
- Error handling: E020 for non-existent template

### Files Changed
- `/home/jak/substrate/003-wf-basics/test/integration/cli/wf-compose.test.ts` — Created 10 integration tests

### Evidence
```bash
pnpm test -- --run test/integration/cli/wf-compose.test.ts

 ✓ integration/cli/wf-compose.test.ts (10 tests) 134ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Discoveries
- **wf-status.json phases structure**: `phases` is `Record<string, WfStatusPhase>` (object keyed by phase name), not an array
- **wf-phase.yaml key name**: Uses `phase:` not `name:` per wf-phase.schema.json
- **JSON error format**: Error responses have `error` object (with code, message, action, details), not top-level `errors` array

**Completed**: 2026-01-22

---

## Task T010: Add DI tokens and containers

**Started**: 2026-01-22
**Dossier Task**: T010
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Added WORKFLOW_SERVICE DI token and updated both production and test containers:
- Added `WORKFLOW_SERVICE: 'IWorkflowService'` to WORKFLOW_DI_TOKENS
- Production container: WorkflowService with resolved dependencies
- Test container: FakeWorkflowService for test isolation

### Files Changed
- `/home/jak/substrate/003-wf-basics/packages/shared/src/di-tokens.ts` — Added WORKFLOW_SERVICE token
- `/home/jak/substrate/003-wf-basics/packages/workflow/src/container.ts` — Added registrations for both containers

### Evidence
```bash
pnpm -F @chainglass/workflow exec tsc --noEmit
# No errors

pnpm test -- --run test/unit/workflow/ test/contracts/workflow-service.contract.test.ts test/integration/cli/wf-compose.test.ts
 Test Files  11 passed (11)
      Tests  201 passed (201)
```

**Completed**: 2026-01-22

---

## Task T011: Verify all exports

**Started**: 2026-01-22
**Dossier Task**: T011
**Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
Verified all exports from @chainglass/workflow work correctly:
- IWorkflowService interface exported
- WorkflowService implementation exported
- FakeWorkflowService fake exported
- ComposeCall type exported
- ComposeErrorCodes enum exported
- Embedded schemas (WF_SCHEMA, etc.) exported
- DI container functions exported

### Evidence
```bash
pnpm -F @chainglass/workflow build
# Builds successfully

pnpm -F @chainglass/cli build
# Builds successfully (uses workflow exports)

pnpm test -- --run test/contracts/workflow-service.contract.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Completed**: 2026-01-22

---

# Phase 2 Complete

**All Tasks Completed**: 2026-01-22

## Summary

Phase 2: Compose Command implementation is complete with all 11 tasks finished:

| Task | Status | Description |
|------|--------|-------------|
| T001 | ✅ | IWorkflowService interface |
| T002 | ✅ | WorkflowService tests (TDD RED) |
| T003 | ✅ | WorkflowService implementation (TDD GREEN) |
| T004 | ✅ | FakeWorkflowService |
| T005 | ✅ | Contract tests |
| T006 | ✅ | wf.command.ts skeleton |
| T007 | ✅ | Compose action handler |
| T008 | ✅ | Register wf commands |
| T009 | ✅ | CLI integration tests (10 tests) |
| T010 | ✅ | DI tokens and containers |
| T011 | ✅ | Export verification |

## Test Results

- Unit tests: 18 WorkflowService + 12 FakeWorkflowService
- Contract tests: 12 tests (fake/real parity)
- Integration tests: 10 CLI tests (AC-06 through AC-09)
- All 201 workflow-related tests pass

## Key Deliverables

1. **IWorkflowService.compose()** - Core compose method
2. **WorkflowService** - Full implementation with:
   - Template resolution (name vs path)
   - Tilde expansion
   - Run folder ordinal discovery
   - Complete folder structure creation
3. **FakeWorkflowService** - Call capture pattern
4. **cg wf compose <slug>** - CLI command with --json support
5. **DI Integration** - WORKFLOW_SERVICE token and containers

## Critical Discoveries Applied

- **DYK-01**: Embedded schemas as TypeScript modules
- **DYK-02**: Tilde expansion using os.homedir()
- **DYK-03**: Ordinal discovery via regex filter
- **DYK-04**: FakeWorkflowService call capture pattern
- **DYK-05**: ConsoleOutputAdapter already ready

---
