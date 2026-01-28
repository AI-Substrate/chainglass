# WorkGraph-Workspaces Integration Upgrade Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-28
**Spec**: [./workgraph-workspaces-upgrade-spec.md](./workgraph-workspaces-upgrade-spec.md)
**Status**: READY

**Workshops**: 
- [workspace-context-strategy.md](./workshops/workspace-context-strategy.md) - Path Resolution Strategy ✅

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Gate Validation](#gate-validation)
4. [Critical Research Findings](#critical-research-findings)
5. [Testing Philosophy](#testing-philosophy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Interface Updates](#phase-1-interface-updates)
   - [Phase 2: Service Layer Migration](#phase-2-service-layer-migration)
   - [Phase 3: Fake Service Updates](#phase-3-fake-service-updates)
   - [Phase 4: CLI Integration](#phase-4-cli-integration)
   - [Phase 5: Test Migration](#phase-5-test-migration)
   - [Phase 6: E2E Validation & Cleanup](#phase-6-e2e-validation--cleanup)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Complexity Tracking](#complexity-tracking)
9. [Progress Tracking](#progress-tracking)
10. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: WorkGraph and WorkUnit services use hardcoded paths (`.chainglass/work-graphs/` and `.chainglass/units/`), preventing per-worktree data isolation and git-native collaboration.

**Solution Approach**:
- Migrate 4 services (WorkGraphService, WorkNodeService, WorkUnitService, BootstrapPromptService) to workspace-aware path resolution
- Add `WorkspaceContext` as first parameter to all service methods (per Workshop Decision)
- Update CLI commands with `--worktree` flag for explicit context override
- Move fixture files from legacy to workspace-scoped locations
- Validate via E2E harness with mock and agent modes

**Expected Outcomes**:
- WorkGraphs stored at `<worktree>/.chainglass/data/work-graphs/`
- WorkUnits stored at `<worktree>/.chainglass/data/units/`
- E2E test passes with files in new locations only
- No legacy paths or backward compatibility code

**Success Metrics**:
- E2E test exit code 0 in both mock and agent modes
- `grep -r '.chainglass/work-graphs' packages/workgraph/` returns zero matches
- `grep -r '.chainglass/units' packages/workgraph/` returns zero matches
- All 66+ existing tests pass

---

## Technical Context

### Current System State

**Hardcoded Paths** (must change):
| Service | Path | File:Line |
|---------|------|-----------|
| WorkGraphService | `.chainglass/work-graphs` | `packages/workgraph/src/services/workgraph.service.ts:65` |
| WorkNodeService | `.chainglass/work-graphs` | `packages/workgraph/src/services/worknode.service.ts:79` |
| WorkUnitService | `.chainglass/units` | `packages/workgraph/src/services/workunit.service.ts:41` |
| BootstrapPromptService | Both paths | `packages/workgraph/src/services/bootstrap-prompt.ts:51-53` |

**Current Method Signatures** (no context):
```typescript
create(slug: string): Promise<GraphCreateResult>
load(slug: string): Promise<GraphLoadResult>
```

### Target State

**Workspace-Aware Paths**:
- `<worktreePath>/.chainglass/data/work-graphs/`
- `<worktreePath>/.chainglass/data/units/`

**Target Method Signatures** (context first - per Workshop):
```typescript
create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>
load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult>
```

### Integration Requirements

- **WorkspaceContext**: Import from `@chainglass/workflow` or extract to shared
- **CLI Pattern**: Follow `sample.command.ts` pattern for `resolveOrOverrideContext()`
- **Error Handling**: CLI layer handles missing context; services receive non-null ctx

### Assumptions

1. Plan 014 workspace system is fully implemented
2. WorkspaceContextResolver can resolve CWD to context reliably
3. Sample units exist and need moving to new location
4. No external systems depend on current path structure

---

## Gate Validation

### GATE - Clarify ✅

All clarifications resolved in spec § Clarifications:
- Workflow Mode: Full (multi-phase)
- Testing Strategy: Full TDD
- Mock Usage: Fakes Only (per R-TEST-007)
- Documentation Strategy: docs/how/ only
- Context Passing: **Workshop Complete** - Method Parameter (Option B)
- Interface Location: Extract to @chainglass/shared
- Fixture Migration: Manual git mv

### GATE - Constitution ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Architecture | ✅ Compliant | Services import interfaces only |
| Interface-First | ✅ Compliant | Updating interfaces before implementations |
| TDD | ✅ Compliant | Full TDD approach selected |
| Fakes Over Mocks | ✅ Compliant | No vi.mock(); fake updates planned |
| Fast Feedback | ✅ Compliant | Using existing test infrastructure |

**Deviation Ledger**: None required - all changes align with constitution.

### GATE - Architecture ✅

| Rule | Status | Notes |
|------|--------|-------|
| Dependency Direction | ✅ | Services → Interfaces only |
| Package Boundaries | ⚠️ Note | WorkspaceContext import creates workflow→workgraph coupling |
| Layer Separation | ✅ | CLI handles user errors, services handle business logic |

**Architectural Note**: WorkspaceContext import from @chainglass/workflow creates a new dependency. Per Q6 resolution, if this causes issues, extract interface to @chainglass/shared.

### GATE - ADR ✅

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0008 | Accepted | All | Defines split storage model (`~/.config/` registry + `<worktree>/.chainglass/data/`) |
| ADR-0004 | Accepted | Phase 2, 3 | DI container patterns (`useFactory`) |
| ADR-0002 | Accepted | All | Exemplar-driven development (SampleAdapter as pattern) |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Four Services Have Hardcoded Paths
**Impact**: Critical
**Sources**: [WG-01, WG-02, WG-03, WG-04] (research-dossier.md:341-358)
**Problem**: All four services define `private readonly graphsDir = '.chainglass/work-graphs'`
**Root Cause**: Original implementation assumed single workspace context
**Solution**: Replace hardcoded paths with context-derived paths using helper methods
**Example**:
```typescript
// ❌ WRONG - Hardcoded path
private readonly graphsDir = '.chainglass/work-graphs';
const path = this.pathResolver.join(this.graphsDir, slug);

// ✅ CORRECT - Context-derived path
protected getGraphsDir(ctx: WorkspaceContext): string {
  return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
}
const path = this.getGraphsDir(ctx);
```
**Action Required**: Update constructors and add path helper methods
**Affects Phases**: Phase 1, Phase 2

### 🚨 Critical Discovery 02: No Package Dependency Between Workgraph and Workflow
**Impact**: Critical
**Sources**: [DI-09] (research-dossier.md:362-375)
**Problem**: `packages/workgraph/package.json` has no dependency on `@chainglass/workflow`
**Root Cause**: Original packages designed for isolation
**Solution**: Either add dependency or extract WorkspaceContext to shared
**Example**:
```typescript
// Option A: Add dependency
// packages/workgraph/package.json
"dependencies": {
  "@chainglass/workflow": "workspace:*"
}

// Option B: Import from shared (if extracted)
import type { WorkspaceContext } from '@chainglass/shared';
```
**Action Required**: Resolve import strategy before implementation
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 03: CLI Already Supports --workspace-path Pattern
**Impact**: High
**Sources**: [CLI-07] (research-dossier.md:395-404)
**Problem**: Sample commands have `--workspace-path`; workgraph commands do not
**Root Cause**: Workgraph commands predate workspace system
**Solution**: Follow `sample.command.ts` pattern exactly
**Example**:
```typescript
// apps/cli/src/commands/sample.command.ts pattern
const ctx = await resolveOrOverrideContext(options.workspacePath);
if (!ctx) {
  printError({ code: 'E074', message: 'No workspace context found' });
  process.exit(1);
}
const result = await service.method(ctx, ...args);
```
**Action Required**: Add `--worktree` flag to all wg/unit commands
**Affects Phases**: Phase 4

### 🔴 High Discovery 04: Composite Key Pattern Required for Fakes
**Impact**: High
**Sources**: [PL-09] (research-dossier.md:309-321)
**Problem**: FakeWorkGraphService keys by `slug` only, not `worktreePath|slug`
**Root Cause**: Fakes predate workspace isolation
**Solution**: Use composite key `${ctx.worktreePath}|${slug}` in all fake stores
**Example**:
```typescript
// ❌ WRONG - Simple key
private graphs = new Map<string, WorkGraphDefinition>();
this.graphs.set(slug, definition);

// ✅ CORRECT - Composite key
private getKey(ctx: WorkspaceContext, slug: string): string {
  return `${ctx.worktreePath}|${slug}`;
}
this.graphs.set(this.getKey(ctx, slug), definition);
```
**Action Required**: Update all three fake services with composite keys
**Affects Phases**: Phase 3

### 🔴 High Discovery 05: Path Storage Must Be Worktree-Relative
**Impact**: High
**Sources**: [Workshop Decision 3] (workspace-context-strategy.md:346-366)
**Problem**: Paths in `data.json` must work across machines
**Root Cause**: Absolute paths break git collaboration
**Solution**: Store paths as `.chainglass/data/work-graphs/...` (no worktreePath prefix)
**Example**:
```json
// ❌ WRONG - Absolute path
{ "script": "/home/user/project/.chainglass/data/work-graphs/..." }

// ✅ CORRECT - Worktree-relative path
{ "script": ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-xxx/data/outputs/script.sh" }
```
**Action Required**: Ensure `saveOutputData()` constructs relative paths
**Affects Phases**: Phase 2

### 🔴 High Discovery 06: E2E Harness Validates Path Changes
**Impact**: High
**Sources**: [research-dossier.md:476-534]
**Problem**: E2E harness output must show new paths
**Root Cause**: Harness output includes file paths
**Solution**: E2E output should show `.chainglass/data/work-graphs/` paths
**Example**:
```bash
# Expected E2E output line
Got input: script = ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-XXX/data/outputs/script.sh"
```
**Action Required**: Verify E2E harness doesn't have hardcoded legacy paths
**Affects Phases**: Phase 6

### 🟡 Medium Discovery 07: Three-Part Fake API Must Be Preserved
**Impact**: Medium
**Sources**: [PL-06] (research-dossier.md:263-277)
**Problem**: Fakes need setState(), getCalls(), injectError() pattern
**Root Cause**: Existing contract test infrastructure depends on this
**Solution**: Preserve existing Fake API; add context to call recording
**Example**:
```typescript
// Call recording must include context
getCalls(): Array<{ method: string; ctx: WorkspaceContext; args: unknown[] }> {
  return this.calls;
}
```
**Action Required**: Extend fake APIs, don't replace them
**Affects Phases**: Phase 3

### 🟡 Medium Discovery 08: Error Code Allocation Is Safe
**Impact**: Medium
**Sources**: [PL-07] (research-dossier.md:279-291)
**Problem**: Workgraph uses E101-E199; workspace uses E074-E081
**Root Cause**: Isolated error code ranges
**Solution**: No new error codes needed; reuse E074 for "No workspace context"
**Action Required**: Use existing E074 code for context errors in CLI
**Affects Phases**: Phase 4

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Cross-cutting changes across 4 services, 3 fakes, and 20+ test files warrant comprehensive testing
**Focus Areas**:
- Contract tests for all service interfaces with WorkspaceContext
- Composite key isolation in fakes
- E2E validation with workspace paths
- Path reference correctness in data.json

### Test-Driven Development

Every implementation task follows:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation

Every test must include:
```typescript
/*
Test Doc:
- Why: [business/bug/regression reason]
- Contract: [invariant(s) this test asserts]
- Usage Notes: [how to call/configure the API]
- Quality Contribution: [what failure this will catch]
- Worked Example: [inputs/outputs for scanning]
*/
```

### Mock Usage

**Policy**: Fakes Only (per R-TEST-007 and spec)
- MUST use full fake implementations (FakeWorkGraphService, etc.)
- MUST follow three-part API: State Setup, State Inspection, Error Injection
- MUST run contract tests against both fake and real implementations
- NO vi.mock(), vi.spyOn(), or mocking libraries

---

## Implementation Phases

### Phase 1: Interface Updates

**Objective**: Update all service interfaces to accept WorkspaceContext as first parameter

**Deliverables**:
- Updated `IWorkGraphService` interface
- Updated `IWorkNodeService` interface
- Updated `IWorkUnitService` interface
- Updated `IBootstrapPromptService` interface
- WorkspaceContext import resolved (workflow or shared)

**Dependencies**: None (foundational phase)

**Phase Complete When**: All acceptance criteria met AND `just typecheck` passes

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| Circular dependency on workflow | Medium | High | Extract to shared if needed | Task 1.8 |
| TypeScript compilation errors cascade | Low | Medium | Incremental changes with builds | Tasks 1.2, 1.4, 1.6 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write contract test for IWorkGraphService with ctx parameter | 2 | Test exists, fails (methods don't accept ctx) | - | |
| 1.2 | [ ] | Update IWorkGraphService interface to add ctx as first param | 2 | Interface compiles, contract test still fails (no impl) | - | |
| 1.3 | [ ] | Write contract test for IWorkNodeService with ctx parameter | 2 | Test exists, fails | - | |
| 1.4 | [ ] | Update IWorkNodeService interface to add ctx as first param | 2 | Interface compiles | - | |
| 1.5 | [ ] | Write contract test for IWorkUnitService with ctx parameter | 2 | Test exists, fails | - | |
| 1.6 | [ ] | Update IWorkUnitService interface to add ctx as first param | 2 | Interface compiles | - | |
| 1.7 | [ ] | Update IBootstrapPromptService interface | 1 | Interface compiles | - | Smaller interface |
| 1.8 | [ ] | Resolve WorkspaceContext import strategy | 2 | Import works without circular dep | - | Add workflow dep or extract |

#### Test Examples

**Note**: Test examples use `createTestWorkspaceContext()` helper defined in Phase 5.1. During Phase 1, use inline context creation: `{ workspaceSlug: 'test', workspaceName: 'Test', workspacePath: '/test/worktree', worktreePath: '/test/worktree', worktreeBranch: null, isMainWorktree: true, hasGit: true }`

```typescript
describe('IWorkGraphService contract with WorkspaceContext', () => {
  test('create() accepts ctx as first parameter', async () => {
    /*
    Test Doc:
    - Why: Services must be workspace-aware for per-worktree isolation
    - Contract: create(ctx, slug) returns GraphCreateResult with ctx.worktreePath in path
    - Usage Notes: ctx is required, non-null
    - Quality Contribution: Catches services that bypass workspace context
    - Worked Example: create(ctx, 'test-graph') → path contains ctx.worktreePath
    */
    const ctx = createTestWorkspaceContext('/test/worktree');
    const service = createService();
    
    const result = await service.create(ctx, 'test-graph');
    
    expect(result.path).toContain(ctx.worktreePath);
    expect(result.path).toContain('.chainglass/data/work-graphs/test-graph');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] Interface method with wrong parameter order rejected by TypeScript
- [ ] Missing ctx parameter rejected by TypeScript
- [ ] Null ctx handled (should be type error, not runtime)

#### Acceptance Criteria
- [ ] All interface files updated with ctx parameter
- [ ] TypeScript compiles with strict mode: `just typecheck` passes
- [ ] Contract tests written for all interfaces
- [ ] No circular dependencies detected: `pnpm build` succeeds
- [ ] ADR-0004 patterns followed (interface-first)

#### Commands to Run
```bash
# Verify TypeScript strict mode compilation
just typecheck

# Verify no circular dependencies
pnpm build

# Verify interfaces updated (should show ctx parameter)
grep -n "ctx: WorkspaceContext" packages/workgraph/src/interfaces/*.ts
```

---

### Phase 2: Service Layer Migration

**Objective**: Implement workspace-aware path resolution in all four services

**Deliverables**:
- WorkGraphService with ctx parameter and path helpers
- WorkNodeService with ctx parameter and path helpers
- WorkUnitService with ctx parameter and path helpers
- BootstrapPromptService with ctx parameter and path helpers
- No hardcoded `.chainglass/work-graphs` or `.chainglass/units` paths

**Dependencies**: Phase 1 must be complete (interfaces updated)

**Phase Complete When**: All acceptance criteria met AND `just test` passes

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| Path construction bugs | Medium | High | Extensive contract tests | Tasks 2.4, 2.5, 2.9 |
| data.json path references wrong | High | High | Explicit test for relative paths | Task 2.10 |
| Downstream method call chain breaks | Medium | Medium | Incremental migration | Tasks 2.4-2.6, 2.9 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Remove hardcoded graphsDir from WorkGraphService | 2 | Compile fails (path undefined) | - | |
| 2.2 | [ ] | Add getGraphsDir(ctx) helper to WorkGraphService | 2 | Helper returns `<worktreePath>/.chainglass/data/work-graphs` | - | |
| 2.3 | [ ] | Add getGraphPath(ctx, slug) helper to WorkGraphService | 1 | Helper returns full graph path | - | |
| 2.4 | [ ] | Update WorkGraphService.create() to use ctx | 3 | Contract test passes, creates in workspace path | - | |
| 2.5 | [ ] | Update WorkGraphService.load() to use ctx | 2 | Contract test passes | - | |
| 2.6 | [ ] | Update remaining WorkGraphService methods | 3 | All methods accept ctx, tests pass | - | show, status, addNodeAfter, removeNode |
| 2.7 | [ ] | Remove hardcoded graphsDir from WorkNodeService | 2 | Compile fails | - | |
| 2.8 | [ ] | Add path helpers to WorkNodeService | 2 | Helpers compile | - | getNodePath, getNodeDataDir, getNodeOutputDir |
| 2.9 | [ ] | Update WorkNodeService methods to use ctx | 3 | All methods accept ctx, tests pass | - | 15+ methods |
| 2.10 | [ ] | Verify data.json paths are worktree-relative | 2 | saveOutputData writes `.chainglass/data/...` not absolute; check all files matching `**/nodes/*/data/data.json` | - | Critical for E2E |
| 2.11 | [ ] | Remove hardcoded unitsDir from WorkUnitService | 2 | Compile fails | - | |
| 2.12 | [ ] | Add path helpers to WorkUnitService | 2 | Helpers compile | - | getUnitsDir, getUnitPath |
| 2.13 | [ ] | Update WorkUnitService methods to use ctx | 2 | All methods accept ctx, tests pass | - | |
| 2.14 | [ ] | Update BootstrapPromptService to use ctx | 2 | Both graphsDir and unitsDir resolved via ctx | - | |
| 2.15 | [ ] | Verify no hardcoded paths remain | 1 | `grep -r '\.chainglass/work-graphs' packages/workgraph/src/services/` returns 0 matches; `grep -r '\.chainglass/units' packages/workgraph/src/services/` returns 0 matches | - | |

#### Test Examples

```typescript
describe('WorkGraphService.create() with WorkspaceContext', () => {
  test('creates graph in workspace-scoped location', async () => {
    /*
    Test Doc:
    - Why: Workspace-aware storage enables per-worktree isolation
    - Contract: create() stores files at <worktreePath>/.chainglass/data/work-graphs/<slug>/
    - Usage Notes: ctx must have valid worktreePath
    - Quality Contribution: Catches hardcoded path regressions
    - Worked Example: create(ctx, 'test') → /test/path/.chainglass/data/work-graphs/test/
    */
    const ctx = createTestWorkspaceContext('/test/worktree');
    const fs = new FakeFileSystem();
    const service = new WorkGraphService(fs, pathResolver, yamlParser);
    
    const result = await service.create(ctx, 'test-graph');
    
    expect(result.path).toBe('/test/worktree/.chainglass/data/work-graphs/test-graph');
    expect(fs.exists('/test/worktree/.chainglass/data/work-graphs/test-graph/work-graph.yaml')).toBe(true);
  });
});

describe('WorkNodeService.saveOutputData() path references', () => {
  test('stores worktree-relative paths in data.json', async () => {
    /*
    Test Doc:
    - Why: Relative paths enable git collaboration across machines
    - Contract: data.json outputs use .chainglass/data/... paths, not absolute
    - Usage Notes: Path prefix is constant, not derived from ctx.worktreePath
    - Quality Contribution: Catches absolute path bugs that break portability
    - Worked Example: saveOutputData() → {"script": ".chainglass/data/work-graphs/..."}
    */
    const ctx = createTestWorkspaceContext('/home/user/project');
    const fs = new FakeFileSystem();
    const service = new WorkNodeService(fs, pathResolver, yamlParser);
    
    await service.saveOutputData(ctx, 'test-graph', 'coder-123', { language: 'bash' });
    await service.saveOutputFile(ctx, 'test-graph', 'coder-123', 'script.sh', '/tmp/script.sh');
    
    const dataJson = JSON.parse(fs.readFile('/home/user/project/.chainglass/data/work-graphs/test-graph/nodes/coder-123/data/data.json'));
    
    // Path must be RELATIVE to worktree, not absolute
    expect(dataJson.outputs.script).toBe('.chainglass/data/work-graphs/test-graph/nodes/coder-123/data/outputs/script.sh');
    expect(dataJson.outputs.script).not.toContain('/home/user/project');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] ctx with empty worktreePath handled
- [ ] ctx with non-existent worktreePath handled gracefully
- [ ] Path traversal attempts blocked (ctx.worktreePath = '../..')
- [ ] Unicode characters in paths handled

#### Acceptance Criteria
- [ ] All four services accept ctx as first parameter
- [ ] All contract tests pass with both fake and real implementations
- [ ] `grep -r '.chainglass/work-graphs' packages/workgraph/src/services/` returns 0 matches
- [ ] `grep -r '.chainglass/units' packages/workgraph/src/services/` returns 0 matches
- [ ] data.json paths are worktree-relative
- [ ] TypeScript strict mode passes: `just typecheck`

#### Commands to Run
```bash
# Verify no hardcoded paths remain
grep -r '\.chainglass/work-graphs' packages/workgraph/src/services/
# Expected: 0 matches

grep -r '\.chainglass/units' packages/workgraph/src/services/
# Expected: 0 matches

# Verify TypeScript compiles
just typecheck

# Run contract tests
just test -- --filter "contract"

# Verify data.json path format in test outputs
grep -r "outputs.script" test/unit/workgraph/*.test.ts
```

---

### Phase 3: Fake Service Updates

**Objective**: Update fake services with composite keys and context-aware call recording

**Deliverables**:
- FakeWorkGraphService with composite keys
- FakeWorkNodeService with composite keys
- FakeWorkUnitService with composite keys
- Three-part API preserved (setState, getCalls, injectError)

**Dependencies**: Phase 2 must be complete (services updated)

**Phase Complete When**: All acceptance criteria met AND contract tests pass for all fakes

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| Breaking existing test helpers | Medium | Medium | Preserve API, extend don't replace | Tasks 3.4, 3.7, 3.10 |
| Composite key bugs | Low | Medium | Unit tests for key generation | Tasks 3.1, 3.5, 3.8 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write test for composite key isolation in FakeWorkGraphService | 2 | Test fails (simple keys used) | - | |
| 3.2 | [ ] | Add getKey(ctx, slug) helper to FakeWorkGraphService | 1 | Helper returns `${ctx.worktreePath}|${slug}` | - | |
| 3.3 | [ ] | Update FakeWorkGraphService stores to use composite keys | 2 | Isolation test passes | - | |
| 3.4 | [ ] | Update FakeWorkGraphService.getCalls() to include ctx | 2 | Call recording includes context | - | |
| 3.5 | [ ] | Write test for composite key isolation in FakeWorkNodeService | 2 | Test fails | - | |
| 3.6 | [ ] | Update FakeWorkNodeService with composite keys | 2 | Tests pass | - | |
| 3.7 | [ ] | Update FakeWorkNodeService.getCalls() to include ctx | 2 | Call recording includes context | - | |
| 3.8 | [ ] | Write test for composite key isolation in FakeWorkUnitService | 2 | Test fails | - | |
| 3.9 | [ ] | Update FakeWorkUnitService with composite keys | 2 | Tests pass | - | |
| 3.10 | [ ] | Verify reset() clears all state | 1 | reset() clears graphs, calls, errors | - | |
| 3.11 | [ ] | Run contract tests against updated fakes | 2 | All contract tests pass | - | |

#### Test Examples

```typescript
describe('FakeWorkGraphService workspace isolation', () => {
  test('same slug in different workspaces are independent', async () => {
    /*
    Test Doc:
    - Why: Per-worktree isolation requires separate storage per workspace
    - Contract: Graphs keyed by worktreePath|slug, not just slug
    - Usage Notes: Use createTestWorkspaceContext() for test contexts
    - Quality Contribution: Catches cross-workspace pollution bugs
    - Worked Example: create(ctxA, 'g') + create(ctxB, 'g') → 2 independent graphs
    */
    const fake = new FakeWorkGraphService();
    const ctxA = createTestWorkspaceContext('/workspace-a');
    const ctxB = createTestWorkspaceContext('/workspace-b');
    
    await fake.create(ctxA, 'shared-name');
    await fake.create(ctxB, 'shared-name');
    
    // Should be independent
    const graphA = await fake.load(ctxA, 'shared-name');
    const graphB = await fake.load(ctxB, 'shared-name');
    
    expect(graphA.path).toContain('/workspace-a/');
    expect(graphB.path).toContain('/workspace-b/');
  });

  test('getCalls() records context for inspection', async () => {
    /*
    Test Doc:
    - Why: Tests need to verify correct context was passed
    - Contract: getCalls() returns array with ctx, method, args
    - Usage Notes: Use getCalls('create') to filter by method
    - Quality Contribution: Enables precise test assertions
    - Worked Example: getCalls() → [{method: 'create', ctx: {...}, args: ['slug']}]
    */
    const fake = new FakeWorkGraphService();
    const ctx = createTestWorkspaceContext('/test');
    
    await fake.create(ctx, 'test-graph');
    
    const calls = fake.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('create');
    expect(calls[0].ctx.worktreePath).toBe('/test');
    expect(calls[0].args).toEqual(['test-graph']);
  });
});
```

#### Non-Happy-Path Coverage
- [ ] getCalls() returns empty array after reset()
- [ ] Composite key handles special characters in paths
- [ ] injectError() errors propagate correctly with new signature

#### Acceptance Criteria
- [ ] All three fake services use composite keys
- [ ] getCalls() includes ctx in all recordings
- [ ] Three-part API preserved (setState, getCalls, injectError)
- [ ] Contract tests pass against both fake and real implementations
- [ ] Workspace isolation tests pass

---

### Phase 4: CLI Integration

**Objective**: Add workspace context resolution to all workgraph CLI commands

**Deliverables**:
- `--worktree <path>` flag on all `cg wg` commands
- `--worktree <path>` flag on all `cg unit` commands
- Context resolution using `resolveOrOverrideContext()` pattern
- Error handling at CLI layer (E074)

**Dependencies**: Phase 2 must be complete (services accept ctx)

**Phase Complete When**: All acceptance criteria met AND CLI commands work from workspace CWD

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| CLI flag naming inconsistency | Low | Low | Follow sample command pattern exactly | Task 4.1 |
| Context resolution fails in non-workspace | Medium | Medium | Clear error messages with remediation | Task 4.8 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Add resolveOrOverrideContext() helper to wg command file | 2 | Helper compiles, follows sample.command.ts pattern (see `apps/cli/src/commands/sample.command.ts:100-117` for template) | - | |
| 4.2 | [ ] | Add --worktree option to `cg wg create` command | 2 | Option parsed, passed to handler | - | |
| 4.3 | [ ] | Update wgCreate handler to resolve and pass ctx | 2 | Service called with ctx | - | |
| 4.4 | [ ] | Add --worktree to remaining wg commands | 3 | All wg commands have flag | - | show, status, node, etc. |
| 4.5 | [ ] | Update all wg handlers to resolve and pass ctx | 3 | All handlers use ctx | - | |
| 4.6 | [ ] | Add --worktree option to `cg unit` commands | 2 | Option parsed | - | list, show |
| 4.7 | [ ] | Update unit handlers to resolve and pass ctx | 2 | All handlers use ctx | - | |
| 4.8 | [ ] | Add error handling for missing context | 2 | E074 error with helpful message | - | |
| 4.9 | [ ] | Test CLI in actual workspace | 2 | Commands work from workspace CWD | - | Manual verification |

#### Test Examples

```typescript
describe('wg create command with --worktree flag', () => {
  test('uses explicit worktree path when provided', async () => {
    /*
    Test Doc:
    - Why: Users need to operate on workspaces from any CWD
    - Contract: --worktree flag overrides CWD-based resolution
    - Usage Notes: Path must be valid workspace or worktree
    - Quality Contribution: Catches flag parsing and context override bugs
    - Worked Example: cg wg create test --worktree /other → creates in /other
    */
    const fakeService = new FakeWorkGraphService();
    const handler = createWgCreateHandler(fakeService);
    
    await handler('test-graph', { worktree: '/explicit/path' });
    
    const calls = fakeService.getCalls();
    expect(calls[0].ctx.worktreePath).toBe('/explicit/path');
  });

  test('shows error when not in workspace and no --worktree', async () => {
    /*
    Test Doc:
    - Why: Clear error messages help users understand what to do
    - Contract: Missing context → E074 error with remediation advice
    - Usage Notes: Error includes "Run: cg workspace list" suggestion
    - Quality Contribution: Catches silent failures
    - Worked Example: cg wg create test (outside workspace) → E074 error
    */
    const mockResolver = createMockResolver(null); // Returns null
    const handler = createWgCreateHandler(service, mockResolver);
    
    const result = await handler('test-graph', {});
    
    expect(result.errors[0].code).toBe('E074');
    expect(result.errors[0].message).toContain('workspace');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] --worktree with non-existent path shows error
- [ ] --worktree with relative path resolved correctly
- [ ] Missing context error includes actionable suggestion

#### Acceptance Criteria
- [ ] All `cg wg` commands accept `--worktree <path>` flag
- [ ] All `cg unit` commands accept `--worktree <path>` flag
- [ ] Context resolution follows sample.command.ts pattern
- [ ] E074 error shown with helpful message when context missing
- [ ] Commands work when CWD is in registered workspace

---

### Phase 5: Test Migration

**Objective**: Update all tests to use workspace-prefixed paths and pass WorkspaceContext

**Deliverables**:
- All unit tests updated with ctx parameter
- All integration tests updated
- Contract tests run against both fake and real
- Test helper for creating WorkspaceContext

**Dependencies**: Phases 2-4 must be complete

**Phase Complete When**: All acceptance criteria met AND `just test` shows 66+ tests passed with 0 failures

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| Missing test updates | High | Medium | Systematic grep for old paths | Task 5.8 |
| Test helper inconsistencies | Low | Low | Single createTestWorkspaceContext() helper | Task 5.1 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Create createTestWorkspaceContext() helper | 1 | Helper returns valid WorkspaceContext | - | |
| 5.2 | [ ] | Update workgraph-service.test.ts to pass ctx | 2 | All tests pass | - | |
| 5.3 | [ ] | Update worknode-service.test.ts to pass ctx | 3 | All tests pass | - | Larger file |
| 5.4 | [ ] | Update workunit-service.test.ts to pass ctx | 2 | All tests pass | - | |
| 5.5 | [ ] | Update bootstrap-prompt.test.ts to pass ctx | 1 | All tests pass | - | |
| 5.6 | [ ] | Update integration tests to use workspace paths | 2 | Integration tests pass | - | |
| 5.7 | [ ] | Run contract tests for all services | 2 | Fake and real parity verified | - | **REMINDER**: Phase 1 stubbed ctx in contract tests (DYK#1). Must fully update contract tests here to test ctx behavior, not just pass stubs. |
| 5.8 | [ ] | grep for hardcoded legacy paths in test files | 1 | Zero matches | - | |
| 5.9 | [ ] | Run full test suite | 1 | All 66+ tests pass; verify output shows passed count | - | `just test` |

#### Test Examples

```typescript
// test/helpers/workspace-test-helpers.ts
export function createTestWorkspaceContext(
  worktreePath: string = '/test/worktree'
): WorkspaceContext {
  /*
  Test Doc:
  - Why: Tests need consistent, predictable WorkspaceContext
  - Contract: Returns valid context with required fields
  - Usage Notes: Override worktreePath for isolation tests
  - Quality Contribution: Reduces test boilerplate
  - Worked Example: createTestWorkspaceContext('/a') → {worktreePath: '/a', ...}
  */
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}
```

#### Non-Happy-Path Coverage
- [ ] Tests with intentionally invalid context fail appropriately
- [ ] Tests verify error messages for edge cases

#### Acceptance Criteria
- [ ] All test files updated to pass ctx
- [ ] createTestWorkspaceContext() helper used consistently
- [ ] `grep -r '.chainglass/work-graphs' test/` returns 0 matches (except in validation tests)
- [ ] `just test` passes with all 66+ tests
- [ ] Contract tests verify fake-real parity

---

### Phase 6: E2E Validation & Cleanup

**Objective**: Validate complete implementation with E2E harness and remove legacy artifacts

**Deliverables**:
- E2E test passes in mock mode with new paths
- E2E test passes in agent mode (optional)
- Sample units moved to `data/units/` location
- No files in legacy locations
- Documentation updated

**Dependencies**: All previous phases complete

**Phase Complete When**: E2E mock mode passes (exit code 0) AND no files exist in legacy locations

**Risks**:
| Risk | Likelihood | Impact | Mitigation | Mitigated By |
|------|------------|--------|------------|--------------|
| E2E harness has hardcoded paths | Medium | Medium | Update harness as needed | Task 6.2 |
| Agent mode fails due to timing | Low | Low | Mock mode is primary validation | Task 6.3 |

#### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Move sample units: `git mv .chainglass/units/ .chainglass/data/units/` | 1 | Units in new location | - | |
| 6.1a | [ ] | Delete legacy directories if present: `rm -rf .chainglass/work-graphs .chainglass/units` | 1 | Legacy paths removed | - | DYK#4: No backwards compat; clean slate for new paths |
| 6.2 | [ ] | Verify E2E harness doesn't have legacy paths | 1 | grep returns 0 matches | - | |
| 6.3 | [ ] | Run E2E mock mode | 2 | Exit code 0, output shows new paths | - | `npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts` |
| 6.4 | [ ] | Verify files in new location after E2E | 1 | `.chainglass/data/work-graphs/sample-e2e/` exists | - | |
| 6.5 | [ ] | Verify NO files in legacy location | 1 | `.chainglass/work-graphs/sample-e2e/` does NOT exist | - | |
| 6.6 | [ ] | Verify data.json paths are correct | 1 | Contains `.chainglass/data/work-graphs/` | - | |
| 6.7 | [ ] | Run E2E agent mode (optional) | 2 | Exit code 0 | - | `--with-agent` flag |
| 6.8 | [ ] | Update docs/how/dev/workgraph-workspaces.md | 2 | Architecture documented: path structure, --worktree flag examples, migration from legacy paths | - | |
| 6.9 | [ ] | Run validation script from research dossier | 1 | All checks pass | - | |
| 6.10 | [ ] | Final grep for legacy paths | 1 | Zero matches in packages/ | - | |
| 6.11 | [ ] | Update docs/how/dev/workgraph-run/README.md | 1 | E2E docs updated | - | |

#### Test Examples

```bash
# E2E Validation Commands (from research-dossier.md)

# Step 1: Clean slate
rm -rf .chainglass/work-graphs/sample-e2e 2>/dev/null || true
rm -rf .chainglass/data/work-graphs/sample-e2e 2>/dev/null || true

# Step 2: Run E2E test
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# Step 3: Verify NEW location
ls .chainglass/data/work-graphs/sample-e2e/work-graph.yaml
ls .chainglass/data/work-graphs/sample-e2e/state.json
ls .chainglass/data/units/sample-input/unit.yaml

# Step 4: Verify NOT in OLD location
! ls .chainglass/work-graphs/sample-e2e 2>/dev/null
! ls .chainglass/units/sample-input 2>/dev/null

# Step 5: Verify path references
grep ".chainglass/data/work-graphs" .chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-*/data/data.json
```

#### Non-Happy-Path Coverage
- [ ] E2E fails gracefully if units not found
- [ ] E2E shows clear error if workspace not registered

#### Acceptance Criteria
- [ ] E2E mock mode passes (exit code 0)
- [ ] Output shows `.chainglass/data/work-graphs/` paths
- [ ] No files created in legacy `.chainglass/work-graphs/` location
- [ ] data.json contains worktree-relative paths with new prefix
- [ ] Documentation updated
- [ ] E2E agent mode passes (optional but recommended)

---

## Cross-Cutting Concerns

### Security Considerations

- **Path Traversal**: Validate `ctx.worktreePath` doesn't contain `..` sequences
- **Input Validation**: Slugs must be alphanumeric with hyphens only
- **File Permissions**: No changes to permission model

### Observability

- **Logging**: No changes to logging strategy
- **Metrics**: Not applicable (no metrics in workgraph)
- **Error Tracking**: E074 for missing workspace context

### Documentation

- **Location**: `docs/how/` only (per spec)
- **Content Structure**:
  - `docs/how/dev/workgraph-workspaces.md`: Architecture guide
  - `docs/how/dev/workgraph-run/README.md`: E2E test documentation
- **Target Audience**: Developers extending workgraph, future domain implementers
- **Maintenance**: Update when storage patterns change

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkNodeService migration | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=1 | 15+ methods to update | Incremental per-method |
| CLI integration | 3 | Medium | S=1,I=1,D=0,N=0,F=0,T=1 | Multiple commands to update | Follow sample.command.ts pattern |
| Test migration | 3 | Medium | S=2,I=0,D=0,N=0,F=0,T=1 | 20+ test files | Systematic grep and update |

---

## Progress Tracking

### DYK Session Decisions

**DYK#1 (2026-01-28)**: Contract tests stubbed in Phase 1
- **Issue**: Existing contract tests break when interfaces change (compile error, not test failure)
- **Decision**: Stub ctx parameter in contract tests during Phase 1 using `createStubContext()` helper
- **Deferred to Phase 5**: Full contract test updates with ctx behavior validation
- **REMINDER in Phase 5 Task 5.7**: Must replace stubs with real ctx testing

**DYK#4 (2026-01-28)**: Phases 1-2 must be completed together
- **Issue**: After Phase 1, `pnpm build` fails because service implementations don't match updated interfaces
- **Decision**: Accept broken build window; complete Phase 1 and Phase 2 in same work session
- **WARNING**: Do NOT push to shared branch between Phase 1 and Phase 2 completion
- **Build will pass again**: After Phase 2 completes

### Phase Completion Checklist

- [x] Phase 1: Interface Updates - COMPLETE
- [x] Phase 2: Service Layer Migration - COMPLETE
- [ ] Phase 3: Fake Service Updates - NOT STARTED (partially done: ctx param added, but composite keys still needed)
- [ ] Phase 4: CLI Integration - NOT STARTED
- [ ] Phase 5: Test Migration - NOT STARTED
- [ ] Phase 6: E2E Validation & Cleanup - NOT STARTED

### Note on Phase 2 → Phase 3 Overlap

During Phase 2, we added `_ctx: WorkspaceContext` parameter to all 27 fake service methods to make the build pass. However, **Phase 3 is still required** because:

1. **Composite keys not implemented** - Fakes still use `slug` as key, not `${ctx.worktreePath}|${slug}`
2. **ctx is ignored** - The `_ctx` parameter is unused; fakes don't provide workspace isolation
3. **Call recording missing ctx** - `getCalls()` doesn't record which context was passed
4. **No isolation tests** - Same slug in different workspaces would collide

Phase 3 will implement true workspace isolation in fakes.

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After validating:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]

---

**Next Steps**:
1. Run `/plan-4-complete-the-plan` to validate plan readiness
2. Then run `/plan-5-phase-tasks-and-brief --phase 1` to generate Phase 1 dossier
3. Implement phases sequentially with E2E validation at end
