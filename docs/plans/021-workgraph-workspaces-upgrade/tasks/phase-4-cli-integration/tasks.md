# Phase 4: CLI Integration – Tasks & Alignment Brief

**Spec**: [../../workgraph-workspaces-upgrade-spec.md](../../workgraph-workspaces-upgrade-spec.md)
**Plan**: [../../workgraph-workspaces-upgrade-plan.md](../../workgraph-workspaces-upgrade-plan.md)
**Date**: 2026-01-28

---

## Executive Briefing

### Purpose
This phase adds workspace context resolution to all workgraph CLI commands (`cg wg` and `cg unit`), enabling users to operate on workspace-scoped data. Without this, CLI commands cannot locate the correct `.chainglass/data/` directory for the user's current worktree.

### What We're Building
A `--worktree <path>` flag on all workgraph and unit CLI commands that:
- Resolves workspace context from CWD when flag is omitted
- Overrides with explicit path when flag is provided
- Passes resolved `WorkspaceContext` to all service calls
- Shows clear error (E074) with remediation advice when context is missing

### User Value
Users can run `cg wg create my-graph` from any registered workspace and have their data stored in the correct worktree-specific location. Power users can operate on different workspaces by providing `--worktree /path/to/other/workspace`.

### Example
**Before**: `cg wg create test` → Creates in hardcoded `.chainglass/work-graphs/test/`
**After**: `cg wg create test` → Creates in `<worktreePath>/.chainglass/data/work-graphs/test/`
**Override**: `cg wg create test --worktree /other/project` → Creates in `/other/project/.chainglass/data/work-graphs/test/`

---

## Objectives & Scope

### Objective
Add workspace context resolution to all workgraph CLI commands as specified in the plan acceptance criteria.

**Behavior Checklist** (from plan Phase 4):
- [ ] All `cg wg` commands accept `--worktree <path>` flag
- [ ] All `cg unit` commands accept `--worktree <path>` flag
- [ ] Context resolution follows `sample.command.ts` pattern
- [ ] E074 error shown with helpful message when context missing
- [ ] Commands work when CWD is in registered workspace

### Goals

- ✅ Add `resolveOrOverrideContext()` helper to workgraph command file
- ✅ Add `--worktree` option to all `cg wg` commands (create, show, status, node subcommands)
- ✅ Update all `cg wg` handlers to resolve and pass ctx to services
- ✅ Add `--worktree` option to all `cg unit` commands (list, info, create, validate)
- ✅ Update all `cg unit` handlers to resolve and pass ctx to services
- ✅ Add E074 error handling for missing context with helpful remediation message
- ✅ Verify CLI works from workspace CWD

### Non-Goals

- ❌ Adding new CLI commands (only updating existing ones)
- ❌ Test suite updates for CLI (covered in Phase 5)
- ❌ E2E validation (covered in Phase 6)
- ❌ BootstrapPromptService CLI integration (already uses ctx internally; only needs ctx passed from CLI)
- ❌ Output format changes (JSON/console adapters unchanged)
- ❌ Performance optimization (context resolution is fast enough)

---

## Architecture Map

### Component Diagram
<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style Phase fill:#F5F5F5,stroke:#E0E0E0
    style WgCommands fill:#E3F2FD,stroke:#1976D2
    style UnitCommands fill:#FFF3E0,stroke:#FF9800
    style Shared fill:#F3E5F5,stroke:#9C27B0

    subgraph Phase["Phase 4: CLI Integration"]
        T001["T001: Add ctx helper to workgraph.command.ts"]:::pending
        T002["T002: Add --worktree to wg commands"]:::pending
        T003["T003: Update wgCreate handler"]:::pending
        T004["T004: Update wgShow/wgStatus handlers"]:::pending
        T005["T005: Update node command handlers"]:::pending
        T006["T006: Add --worktree to unit commands"]:::pending
        T007["T007: Update unit handlers"]:::pending
        T008["T008: Add E074 error handling"]:::pending
        T009["T009: Manual CLI verification"]:::pending

        T001 --> T002 --> T003
        T003 --> T004 --> T005
        T001 --> T006 --> T007
        T003 --> T008
        T007 --> T008
        T005 --> T009
        T008 --> T009
    end

    subgraph WgCommands["WorkGraph Commands"]
        WG1["/apps/cli/src/commands/workgraph.command.ts"]:::pending
    end

    subgraph UnitCommands["Unit Commands"]
        UN1["/apps/cli/src/commands/unit.command.ts"]:::pending
    end

    subgraph Shared["Shared Dependencies"]
        WS1["@chainglass/workflow (WorkspaceContext)"]:::completed
        WS2["@chainglass/shared (WORKSPACE_DI_TOKENS)"]:::completed
    end

    T001 -.-> WG1
    T002 -.-> WG1
    T003 -.-> WG1
    T004 -.-> WG1
    T005 -.-> WG1
    T006 -.-> UN1
    T007 -.-> UN1
    T008 -.-> WG1
    T008 -.-> UN1

    WG1 --> WS1
    WG1 --> WS2
    UN1 --> WS1
    UN1 --> WS2
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | Context Helper | /apps/cli/src/commands/workgraph.command.ts | ⬜ Pending | Add resolveOrOverrideContext() following sample.command.ts pattern |
| T002 | WG Option Registration | /apps/cli/src/commands/workgraph.command.ts | ⬜ Pending | Add --worktree option to all wg commands |
| T003 | WG Create Handler | /apps/cli/src/commands/workgraph.command.ts | ⬜ Pending | Update handleWgCreate to resolve ctx and pass to service |
| T004 | WG Show/Status Handlers | /apps/cli/src/commands/workgraph.command.ts | ⬜ Pending | Update handleWgShow, handleWgStatus handlers |
| T005 | Node Command Handlers | /apps/cli/src/commands/workgraph.command.ts | ⬜ Pending | Update all 18 node command handlers |
| T006 | Unit Option Registration | /apps/cli/src/commands/unit.command.ts | ⬜ Pending | Add --worktree option to all unit commands |
| T007 | Unit Handlers | /apps/cli/src/commands/unit.command.ts | ⬜ Pending | Update all 4 unit handlers to resolve ctx |
| T008 | E074 Error Handling | Both command files | ⬜ Pending | Add consistent error handling with helpful message |
| T009 | Manual Verification | N/A | ⬜ Pending | Test CLI from workspace CWD |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|--------------|------------------|------------|----------|-------|
| [ ] | T001 | Add imports and resolveOrOverrideContext() helper to workgraph.command.ts following sample.command.ts pattern (lines 113-117) | 2 | Setup | – | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts | Helper compiles, returns WorkspaceContext or null | – | Per Critical Discovery 03 |
| [ ] | T002 | Add `--worktree <path>` option to all BaseOptions interface and wg command registrations (create, show, status) | 2 | Core | T001 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts | Option parsed, available in options object | – | |
| [ ] | T003 | Update handleWgCreate handler to resolve context and pass ctx to service.create() | 2 | Core | T002 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts | Service called with ctx as first param | – | |
| [ ] | T004 | Update handleWgShow and handleWgStatus handlers to resolve context and pass ctx | 2 | Core | T003 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts | Both handlers use ctx | – | |
| [ ] | T005 | Update all node command handlers (18 handlers) to resolve context and pass ctx to services | 3 | Core | T004 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts | All node handlers pass ctx; exec handler passes ctx to BootstrapPromptService.generate() | – | Large scope: add-after, remove, exec, start, end, can-run, can-end, list-inputs, list-outputs, get-input-data, get-input-file, get-output-data, save-output-data, save-output-file, ask, answer, get-answer |
| [ ] | T006 | Add imports and resolveOrOverrideContext() helper to unit.command.ts, add --worktree option to all unit commands | 2 | Core | T001 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/unit.command.ts | Helper exists, option parsed on list, info, create, validate | – | |
| [ ] | T007 | Update all unit handlers (list, info, create, validate) to resolve context and pass ctx | 2 | Core | T006 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/unit.command.ts | All 4 handlers pass ctx to service calls | – | |
| [ ] | T008 | Add E074 error handling with remediation message pattern to both command files | 2 | Core | T003, T007 | /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/workgraph.command.ts, /home/jak/substrate/021-workgraph-workspaces-upgrade/apps/cli/src/commands/unit.command.ts | Missing context shows E074 with "Run: cg workspace list" advice | – | Per Critical Discovery 08 |
| [ ] | T009 | Manual verification: test CLI from workspace CWD and with --worktree flag | 1 | Validation | T005, T008 | N/A | Commands work from workspace CWD; --worktree overrides context | – | |

---

## Alignment Brief

### Prior Phases Review

#### Phase 1: Interface Updates (COMPLETE)
**Deliverables Created:**
- Updated all 4 service interfaces to accept `ctx: WorkspaceContext` as first parameter
- `/packages/workgraph/src/interfaces/workgraph-service.interface.ts` (6 methods)
- `/packages/workgraph/src/interfaces/worknode-service.interface.ts` (14 methods)
- `/packages/workgraph/src/interfaces/workunit-service.interface.ts` (4 methods)
- `/packages/workgraph/src/services/bootstrap-prompt.ts` (generate method)
- Contract tests in `/test/unit/workgraph/interface-contracts.test.ts` (24 type assertions)
- Added `@chainglass/workflow` dependency to workgraph package

**Dependencies Exported for Phase 4:**
- All service methods now require `ctx: WorkspaceContext` as first parameter
- CLI MUST resolve context before calling any service method
- Pattern: `service.create(ctx, slug)` not `service.create(slug)`

**Lessons Learned:**
- Contract tests stubbed ctx during Phase 1; full behavioral testing deferred to Phase 5
- Build broken between Phase 1-2 (expected); no such window for Phase 4

#### Phase 2: Service Layer Migration (COMPLETE)
**Deliverables Created:**
- All 4 services now use ctx-derived paths via helper methods
- Path helpers: `getGraphsDir(ctx)`, `getGraphPath(ctx, slug)`, `getOutputPaths(ctx, graphSlug, nodeId, fileName)`
- Data stored at `<worktreePath>/.chainglass/data/work-graphs/` and `<worktreePath>/.chainglass/data/units/`
- Fake services accept `_ctx` parameter (stubbed, not using composite keys yet)

**Dependencies Exported for Phase 4:**
- Services expect `ctx.worktreePath` to be a valid absolute path
- All service calls require ctx as first param: `service.create(ctx, 'slug')`
- BootstrapPromptService.generate() requires ctx in its options

**Lessons Learned:**
- Internal method calls propagate ctx; CLI is the source of ctx
- Dual-path helper pattern ensures consistency (absolute for FS, relative for data.json)

#### Phase 3: Fake Service Updates (COMPLETE)
**Deliverables Created:**
- All fake services use composite keys `${ctx.worktreePath}|${slug}` for workspace isolation
- `getCalls()` now includes ctx in recorded calls for test assertions
- Test helper: `/test/helpers/workspace-context.ts` with `createTestWorkspaceContext()`
- 11 isolation tests in `/test/unit/workgraph/fake-workspace-isolation.test.ts`

**Dependencies Exported for Phase 4:**
- Fakes ready for multi-workspace testing
- Test infrastructure available for CLI tests in Phase 5
- Pattern established for asserting ctx: `expect(calls[0].ctx.worktreePath).toBe('/workspace')`

**Lessons Learned:**
- Full fake support added for `getAnswer()` method
- Reset bug fixed (presetCanEndResults.clear())
- 129 pre-existing unit test failures documented for Phase 5 migration

#### Cross-Phase Summary
**Cumulative Architecture:**
1. Interfaces define ctx-first signatures (Phase 1)
2. Services implement ctx-derived paths (Phase 2)
3. Fakes provide workspace isolation for testing (Phase 3)
4. **CLI resolves ctx and passes to services (Phase 4 - THIS PHASE)**

**Pattern Evolution:**
- Phase 1: Type-level enforcement (ctx parameter required)
- Phase 2: Runtime path derivation (ctx.worktreePath → `.chainglass/data/`)
- Phase 3: Test isolation (composite keys in fakes)
- Phase 4: User-facing integration (CLI resolves ctx from CWD or flag)

### Critical Findings Affecting This Phase

**🚨 Critical Discovery 03: CLI Already Supports --workspace-path Pattern**
- **Finding**: Sample commands have `--workspace-path`; workgraph commands do not
- **Constrains**: Must follow `sample.command.ts` pattern exactly for consistency
- **Addressed by**: T001, T002, T006 - Copy pattern from sample.command.ts lines 100-117

**🟡 Medium Discovery 08: Error Code Allocation Is Safe**
- **Finding**: Workgraph uses E101-E199; workspace uses E074-E081
- **Constrains**: Reuse E074 for "No workspace context" error, not new codes
- **Addressed by**: T008 - Use existing E074 code for context errors

### ADR Decision Constraints

**ADR-0008: Workspace Split Storage Data Model – Accepted**
- **Decision**: Split storage with global registry (`~/.config/`) and per-worktree data (`<worktree>/.chainglass/data/`)
- **Constraints Affecting This Phase**:
  - CLI must resolve context using WorkspaceContextResolver from registry
  - Data paths use `ctx.worktreePath`, not hardcoded CWD
  - Per IMP-003: WorkspaceContext includes both `mainRepoPath` and `worktreePath`
- **Addressed by**: T001-T008 (all tasks follow this model)

**ADR-0004: Dependency Injection Container Architecture – Accepted**
- **Decision**: Services resolved from DI containers, not instantiated directly
- **Constraints Affecting This Phase**:
  - Use `createCliProductionContainer()` to resolve services
  - Use `WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE` for context resolver
- **Addressed by**: T001 - Follow existing pattern in workgraph.command.ts

### Invariants & Guardrails

- **Context Required**: All service calls MUST include ctx as first parameter
- **Error Code**: Missing context MUST return E074, not new error codes
- **Flag Name**: Use `--worktree` (not `--workspace-path`) per plan specification
- **Helper Pattern**: Use `resolveOrOverrideContext(options.worktree)` pattern
- **Exit Behavior**: Missing context → print E074 error → `process.exit(1)`

### Inputs to Read

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `/apps/cli/src/commands/sample.command.ts` | Pattern template | 100-117 (resolveOrOverrideContext), 131-153 (E074 handling) |
| `/apps/cli/src/commands/workgraph.command.ts` | Target file for wg | 163-203 (handlers), 637-922 (registration) |
| `/apps/cli/src/commands/unit.command.ts` | Target file for unit | 109-173 (handlers), 190-237 (registration) |
| `/packages/workgraph/src/interfaces/*.ts` | Service signatures | All methods require ctx |

### Visual Alignment Aids

#### Flow Diagram: Context Resolution

```mermaid
flowchart TD
    A[User runs CLI command] --> B{--worktree flag?}
    B -->|Yes| C[Use provided path]
    B -->|No| D[Use process.cwd]
    C --> E[resolveOrOverrideContext]
    D --> E
    E --> F[WorkspaceService.resolveContext]
    F --> G{Context found?}
    G -->|Yes| H[Call service with ctx]
    G -->|No| I[Print E074 error]
    I --> J[process.exit 1]
    H --> K[Format and print result]
```

#### Sequence Diagram: wg create Command

```mermaid
sequenceDiagram
    participant User
    participant CLI as workgraph.command.ts
    participant WS as WorkspaceService
    participant WG as WorkGraphService
    participant FS as Filesystem

    User->>CLI: cg wg create test-graph
    CLI->>CLI: resolveOrOverrideContext(undefined)
    CLI->>WS: resolveContext(process.cwd())
    WS-->>CLI: WorkspaceContext | null
    
    alt Context found
        CLI->>WG: create(ctx, 'test-graph')
        WG->>FS: mkdir <ctx.worktreePath>/.chainglass/data/work-graphs/test-graph
        WG-->>CLI: GraphCreateResult
        CLI->>User: Success output
    else Context not found
        CLI->>User: E074 error + remediation
        CLI->>CLI: process.exit(1)
    end
```

### Test Plan

**Testing Approach**: Full TDD (per spec)
**Mock Usage**: Fakes Only (per R-TEST-007)

Phase 4 focuses on CLI integration; formal test suite updates deferred to Phase 5. Manual verification (T009) validates end-to-end flow.

**Validation Strategy for Phase 4:**
1. TypeScript compilation passes
2. Commands parse --worktree flag correctly (manual test)
3. E074 error appears when outside workspace (manual test)
4. Service calls receive ctx parameter (verified by type system)

**Tests to Add in Phase 5:**
| Test | Rationale | Fixture |
|------|-----------|---------|
| wg create with --worktree | Verifies flag override works | FakeWorkGraphService |
| wg create without context | Verifies E074 error | Mock resolver returning null |
| unit list with context | Verifies ctx passed to list() | FakeWorkUnitService |

### Step-by-Step Implementation Outline

1. **T001**: Add imports and helper function
   - Import `WorkspaceContext` from `@chainglass/workflow`
   - Import `WORKSPACE_DI_TOKENS` from `@chainglass/shared`
   - Add `getWorkspaceService()` helper (copy from sample.command.ts)
   - Add `resolveOrOverrideContext()` helper (copy from sample.command.ts)

2. **T002**: Add --worktree option to interfaces and registrations
   - Update `BaseOptions` interface to include `worktree?: string`
   - Add `.option('--worktree <path>', 'Override workspace context')` to wg commands

3. **T003-T004**: Update graph command handlers
   - Add ctx resolution at start of each handler
   - Handle null ctx with E074 error
   - Pass ctx to service calls

4. **T005**: Update node command handlers (largest task)
   - Same pattern as T003-T004 for all 18 node handlers
   - Special case: exec handler must pass ctx to BootstrapPromptService

5. **T006-T007**: Unit command file updates
   - Same pattern as workgraph file
   - 4 handlers: list, info, create, validate

6. **T008**: E074 error handling consistency
   - Ensure error message includes remediation advice
   - Match sample.command.ts pattern exactly

7. **T009**: Manual verification
   - Test from workspace CWD
   - Test with --worktree flag
   - Test outside workspace (expect E074)

### Commands to Run

```bash
# Verify TypeScript compiles
just typecheck

# Build to verify no circular deps
pnpm build

# Run existing tests (expect some failures from Phase 2-3 scope)
just test

# Manual CLI verification (after implementation)
cd /path/to/registered/workspace
cg wg create test-cli-integration
cg wg show test-cli-integration
cg unit list

# Test --worktree flag
cg wg create test-override --worktree /other/workspace

# Test E074 error (run from non-workspace directory)
cd /tmp
cg wg create should-fail
# Expected: E074 error with "Run: cg workspace list" advice
```

### Risks/Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| WorkspaceService not available in production container | High | Low | Verify container includes workspace registration; check sample.command.ts works |
| Node command handlers have complex option inheritance | Medium | Medium | Carefully propagate --worktree through parent command chain |
| BootstrapPromptService.generate() signature mismatch | Medium | Low | Verify generate() accepts ctx in options object per Phase 2 updates |

### Ready Check

- [x] ADR constraints mapped to tasks (ADR-0008, ADR-0004 → T001-T008)
- [ ] Prior phase execution logs reviewed
- [ ] Pattern template (sample.command.ts) accessible
- [ ] Target files identified with line numbers
- [ ] Complexity scores assigned (CS 1-3)
- [ ] All handlers enumerated (3 wg + 18 node + 4 unit = 25 handlers)

---

## Phase Footnote Stubs

_To be populated by plan-6 during implementation._

| # | Description | Task | File:Line |
|---|-------------|------|-----------|
| | | | |

---

## Evidence Artifacts

**Execution Log**: `./execution.log.md` (created by plan-6)

**Supporting Files**:
- Modified: `/apps/cli/src/commands/workgraph.command.ts`
- Modified: `/apps/cli/src/commands/unit.command.ts`

**Directory Layout**:
```
docs/plans/021-workgraph-workspaces-upgrade/
├── workgraph-workspaces-upgrade-plan.md
├── workgraph-workspaces-upgrade-spec.md
└── tasks/
    ├── phase-1-interface-updates/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-2-service-layer-migration/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-3-fake-service-updates/
    │   ├── tasks.md
    │   └── execution.log.md
    └── phase-4-cli-integration/
        ├── tasks.md           # ← This file
        └── execution.log.md   # ← Created by plan-6
```

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._
