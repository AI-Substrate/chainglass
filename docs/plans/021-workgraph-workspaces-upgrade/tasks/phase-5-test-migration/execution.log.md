# Phase 5: Test Migration - Execution Log

**Plan**: [../../workgraph-workspaces-upgrade-plan.md](../../workgraph-workspaces-upgrade-plan.md)
**Dossier**: [tasks.md](./tasks.md)
**Started**: 2026-01-28T21:26:00Z

---

## Task T000: PlanPak Scaffold
**Started**: 2026-01-28T21:26:00Z
**Status**: ✅ Complete

### What I Did
1. Moved 5 test files from `test/unit/workgraph/` to pack at `docs/plans/021-workgraph-workspaces-upgrade/code/tests/` using `git mv` to preserve history
2. Created symlinks from original project paths pointing to pack files
3. Added provenance headers to each file identifying pack location and plan
4. Validated all 5 symlinks resolve correctly
5. Verified vitest can find and run tests through symlinks

### Files Moved (git mv)
- `test/unit/workgraph/workgraph-service.test.ts` → `code/tests/workgraph-service.test.ts`
- `test/unit/workgraph/worknode-service.test.ts` → `code/tests/worknode-service.test.ts`
- `test/unit/workgraph/workunit-service.test.ts` → `code/tests/workunit-service.test.ts`
- `test/unit/workgraph/bootstrap-prompt.test.ts` → `code/tests/bootstrap-prompt.test.ts`
- `test/unit/workgraph/interface-contracts.test.ts` → `code/tests/interface-contracts.test.ts`

### Symlinks Created
```
test/unit/workgraph/workgraph-service.test.ts → ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/workgraph-service.test.ts
test/unit/workgraph/worknode-service.test.ts → ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/worknode-service.test.ts
test/unit/workgraph/workunit-service.test.ts → ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/workunit-service.test.ts
test/unit/workgraph/bootstrap-prompt.test.ts → ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/bootstrap-prompt.test.ts
test/unit/workgraph/interface-contracts.test.ts → ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/interface-contracts.test.ts
```

### Evidence
```
=== Symlink validation ===
✓ OK: test/unit/workgraph/workgraph-service.test.ts -> ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/workgraph-service.test.ts
✓ OK: test/unit/workgraph/worknode-service.test.ts -> ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/worknode-service.test.ts
✓ OK: test/unit/workgraph/workunit-service.test.ts -> ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/workunit-service.test.ts
✓ OK: test/unit/workgraph/bootstrap-prompt.test.ts -> ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/bootstrap-prompt.test.ts
✓ OK: test/unit/workgraph/interface-contracts.test.ts -> ../../../docs/plans/021-workgraph-workspaces-upgrade/code/tests/interface-contracts.test.ts
```

Vitest test run through symlink:
```
Test Files  1 failed (1)
     Tests  51 failed | 3 passed (54)
```
Tests are found and executed (failures expected - ctx migration not done yet).

**Completed**: 2026-01-28T21:27:00Z

---

## Task T001: Verify helper exists + validate failures
**Started**: 2026-01-28T21:28:00Z
**Status**: ✅ Complete

### What I Did
1. Verified `createTestWorkspaceContext()` helper exists at `/test/helpers/workspace-context.ts`
2. Ran parallel subagents to test each file individually
3. Documented actual failure counts per file

### Helper Verification
`/test/helpers/workspace-context.ts` exports `createTestWorkspaceContext(worktreePath: string): WorkspaceContext`

### Test File Failure Counts

| File | Passed | Failed | Total | Status | Notes |
|------|--------|--------|-------|--------|-------|
| workgraph-service.test.ts | 3 | 51 | 54 | ❌ Needs migration | ctx.worktreePath undefined |
| worknode-service.test.ts | 2 | 56 | 58 | ❌ Needs migration | ctx.worktreePath undefined |
| workunit-service.test.ts | 0 | 15 | 15 | ❌ Needs migration | path argument undefined |
| bootstrap-prompt.test.ts | 0 | 4 | 4 | ❌ Needs migration | options undefined (signature change) |
| interface-contracts.test.ts | 24 | 0 | 24 | ✅ Already passing | Uses createStubContext() |
| fake-workspace-isolation.test.ts | 11 | 0 | 11 | ✅ Already passing | Phase 3 compliant |

**Total Failures: 126** (51 + 56 + 15 + 4 = 126 failing tests in 4 files)

### Key Findings
- 4 files need migration: workgraph-service, worknode-service, workunit-service, bootstrap-prompt
- 2 files already pass: interface-contracts, fake-workspace-isolation
- Root cause confirmed: `ctx.worktreePath` is undefined because tests don't pass WorkspaceContext

**Completed**: 2026-01-28T21:29:00Z

---

## Task T001a: Update ALL test helper functions
**Started**: 2026-01-28T21:30:00Z
**Status**: ✅ Complete

### What I Did
1. Added `WorkspaceContext` import and `createTestWorkspaceContext` import to all 4 test files
2. Added `wsCtx: WorkspaceContext` to TestContext interfaces (or module-level variable for workunit)
3. Updated `createTestContext()` functions to create wsCtx and add to return
4. Updated base directory setup from `.chainglass/work-graphs` → `${wsCtx.worktreePath}/.chainglass/data/work-graphs`
5. Updated `setupGraph()` helpers to use absolute paths with new prefix
6. Updated `setupNodeData()` helper in worknode-service to use absolute paths
7. Updated `setupUnit()` helper in workunit-service to use absolute paths with new prefix
8. Fixed relative import paths for PlanPak (files moved to deeper location in pack)

### Files Modified
- **code/tests/workgraph-service.test.ts**: Added wsCtx to TestContext, updated createTestContext(), updated setupGraph()
- **code/tests/worknode-service.test.ts**: Added wsCtx to TestContext, updated createTestContext(), updated setupGraph(), setupNodeData()
- **code/tests/workunit-service.test.ts**: Added wsCtx module-level variable, updated beforeEach(), updated setupUnit()
- **code/tests/bootstrap-prompt.test.ts**: Added wsCtx to TestContext, updated createContext()

### Discovery: PlanPak Import Path Gotcha
When files are moved to the pack (`docs/plans/.../code/tests/`), relative imports need adjustment.

**OLD path** (from `test/unit/workgraph/`):
```typescript
import { ... } from '../../helpers/workspace-context.js';
```

**NEW path** (from `docs/plans/.../code/tests/`):
```typescript
import { ... } from '../../../../../test/helpers/workspace-context.js';
```

### Evidence
Tests compile and run (failures expected - service calls not yet updated):
```
Test Files  1 failed (1)
     Tests  15 failed (15)  # workunit-service.test.ts
```

**Completed**: 2026-01-28T21:32:00Z

---

## Tasks T002-T007: Service Call + Path Updates
**Started**: 2026-01-28T21:33:00Z
**Status**: ✅ Complete

### What I Did

#### T002: workgraph-service.test.ts
- Updated all 71 `ctx.service.method()` calls to `ctx.service.method(ctx.wsCtx, ...)`
- Fixed path references from `.chainglass/work-graphs/` to `${ctx.wsCtx.worktreePath}/.chainglass/data/work-graphs/`

#### T003: worknode-service.test.ts
- Updated all 66 `ctx.service.method()` calls to `ctx.service.method(ctx.wsCtx, ...)`
- Fixed fake service `setPreset*` calls to include ctx
- Fixed path references to absolute paths with new prefix
- Added `data` subdirectory setup in `saveOutputFile()` tests

#### T004: workunit-service.test.ts
- Added `wsCtx` module-level variable (per DYK#2 different pattern)
- Updated all 15 `service.method()` calls to `service.method(wsCtx, ...)`
- Fixed path references from `.chainglass/units/` to `${wsCtx.worktreePath}/.chainglass/data/units/`

#### T005: bootstrap-prompt.test.ts
- Added `wsCtx` to TestContext
- Updated all 4 `ctx.service.generate()` calls to include `ctx.wsCtx`
- Fixed node path setup to use absolute paths

#### T007: Path Assertions
- All path assertions updated from old to new format
- Used sed for bulk replacements with manual fixes for template literal syntax

### Evidence
```bash
# All 196 workgraph unit tests pass
pnpm vitest run test/unit/workgraph/
Test Files  9 passed (9)
     Tests  196 passed (196)
```

**Completed**: 2026-01-28T21:42:00Z

---

