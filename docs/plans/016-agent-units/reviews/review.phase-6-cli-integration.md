# Phase 6: CLI Integration – Code Review Report

**Phase**: Phase 6: CLI Integration
**Plan**: [agent-units-plan.md](../agent-units-plan.md)
**Dossier**: [tasks/phase-6-cli-integration/tasks.md](../tasks/phase-6-cli-integration/tasks.md)
**Reviewed**: 2026-01-28
**Diff Range**: Working directory vs HEAD (b9bf74e)

---

## A) Verdict

**REQUEST_CHANGES**

Phase 6 implementation is largely complete and functional (177 tests pass, lint/typecheck clean), but has **1 critical logic defect** and **2 high-severity correctness issues** that must be addressed before merge.

---

## B) Summary

Phase 6 delivers CLI integration for WorkGraph (`cg wg`) and WorkUnit (`cg unit`) commands as specified:
- ✅ All 20 tasks (T000-T019) marked complete
- ✅ 177 workgraph tests pass
- ✅ Lint/typecheck clean
- ✅ CLI commands visible in `cg --help`
- ✅ ADR-0008 module registration pattern implemented correctly
- ⚠️ No footnote references in task table (graph integrity gap)
- ❌ Critical: `can-end` command actually ends the node (state mutation bug)
- ❌ High: DI token mismatch in `handleNodeExec()`
- ❌ High: Missing error handling in async action handlers

---

## C) Checklist

**Testing Approach: Full TDD** (per plan § 4.1)

- [x] Tests exist for new functionality (6 tests in 2 files)
- [x] Integration test covers workflow (create unit → create graph → add node → execute)
- [x] Tests follow TDD: test assertions show behavior expectations
- [ ] RED-GREEN-REFACTOR cycles documented (**not explicitly documented in execution log**)

**Mock Usage: Fakes over mocks**

- [x] FakeFileSystem used in integration tests
- [x] No `vi.mock()` or `jest.mock()` usage detected

**Universal Patterns**:

- [x] No relative paths in code (all via IPathResolver/container)
- [x] DI container pattern followed (createCliProductionContainer)
- [x] Exit code 1 on errors (all handlers check result.errors)
- [ ] **FAIL**: DI token strings instead of constants in handleNodeExec()
- [ ] **FAIL**: Missing try-catch in async action handlers

**BridgeContext patterns**: N/A (CLI code, not VS Code extension)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| COR-001 | **CRITICAL** | workgraph.command.ts:331 | `can-end` calls `service.end()` which mutates state | Add `canEnd()` method or document behavior |
| COR-002 | HIGH | workgraph.command.ts:236-237 | Uses string 'IFileSystem' instead of SHARED_DI_TOKENS | Use DI token constants |
| COR-003 | HIGH | unit.command.ts, workgraph.command.ts | No try-catch in async action handlers | Wrap handlers in try-catch |
| COR-004 | MEDIUM | workgraph.command.ts:467 | No path traversal validation on sourcePath | Reject paths with '..' |
| COR-005 | MEDIUM | workgraph.command.ts:243 | BootstrapPromptService directly instantiated | Consider DI registration |
| TAD-001 | MEDIUM | tasks.md | No footnote references in Notes column | Add [^N] for file changes |
| TAD-002 | LOW | test/integration/cli-workflow.test.ts:105-110 | Test accepts E103 silently | Add explicit assertion |
| TAD-003 | LOW | workgraph.command.ts:98-115 | parseInputMappings loose validation | Validate split result |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: No previous Phase 6 implementation to regress against (first implementation).

All 177 workgraph tests pass, confirming Phases 1-5 services remain functional.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

**Task↔Log**: PASS
- All 20 tasks (T000-T019) have corresponding execution log entries
- Log entries document actions, evidence, and files changed

**Task↔Footnote**: FAIL
- No footnote references [^N] in task table Notes column
- Phase Footnote Stubs section is empty (lines 558-564)
- Plan § 10 Change Footnotes Ledger contains only skeleton stubs
- **Impact**: Cannot traverse from changed files back to tasks

**Verdict**: ⚠️ MINOR_ISSUES (footnote gap is documentation debt, not blocking)

#### Plan Compliance

- Testing Approach: **Full TDD** (correctly identified)
- Tasks Complete: **20/20** ✓
- Scope Violations: **0** ✓
- All files modified match declared Absolute Path(s) in task table

### E.2) Semantic Analysis

No spec violations detected. Implementation matches acceptance criteria:
- AC-01 through AC-17 behavior implemented in CLI commands
- DI container pattern followed per Critical Discovery 01
- Result types pattern followed per Critical Discovery 02

### E.3) Quality & Safety Analysis

**Safety Score: 45/100** (CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 2)
**Verdict: REQUEST_CHANGES**

#### COR-001: State Mutation in Query Command (CRITICAL)

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 323-347

```typescript
async function handleNodeCanEnd(...) {
  const result = await service.end(graphSlug, nodeId);  // BUG: Actually ends the node!
  // For can-end, we check if it would succeed without actually ending
  // Since there's no dedicated canEnd method, we use end and format accordingly
```

**Issue**: The `cg wg node can-end` command is supposed to CHECK if a node CAN be ended (query), but it calls `service.end()` which ACTUALLY ENDS the node (mutation). This is a severe semantic violation.

**Impact**: Running `cg wg node can-end my-graph my-node` will transition the node to 'complete' status as a side effect of what appears to be a read-only check.

**Fix Options**:
1. **Preferred**: Add `canEnd(graphSlug, nodeId)` method to IWorkNodeService that returns validation result without mutation
2. **Alternative**: Document that `can-end` actually ends the node (breaking user expectations)
3. **Workaround**: Check node outputs/status without calling end() - but this duplicates logic

**Patch Hint**:
```typescript
// In IWorkNodeService interface, add:
canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult>;

// In WorkNodeService, implement:
async canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult> {
  // Validate without mutation - check outputs exist, node is in correct state
  const node = await this.loadNode(graphSlug, nodeId);
  if (!node) return { canEnd: false, errors: [/* E101 */] };
  
  const missingOutputs = this.findMissingRequiredOutputs(node);
  return {
    nodeId,
    canEnd: missingOutputs.length === 0,
    missingOutputs,
    errors: []
  };
}
```

#### COR-002: DI Token Mismatch (HIGH)

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 236-237

```typescript
const fs = container.resolve<import('@chainglass/shared').IFileSystem>('IFileSystem');
const pathResolver = container.resolve<import('@chainglass/shared').IPathResolver>('IPathResolver');
```

**Issue**: Uses string literals `'IFileSystem'` and `'IPathResolver'` instead of `SHARED_DI_TOKENS.FILESYSTEM` and `SHARED_DI_TOKENS.PATH_RESOLVER`. This bypasses DI consistency (ADR-0004) and will fail if token names change.

**Fix**:
```typescript
import { SHARED_DI_TOKENS, type IFileSystem, type IPathResolver } from '@chainglass/shared';

const fs = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
```

#### COR-003: Missing Error Handling (HIGH)

**File**: `apps/cli/src/commands/unit.command.ts` (lines 181-211)
**File**: `apps/cli/src/commands/workgraph.command.ts` (lines 561-767)

**Issue**: All async action handlers lack try-catch blocks. If service methods throw exceptions (instead of returning errors), the process crashes with uncaught promise rejection.

**Fix**: Wrap all async handlers in try-catch:
```typescript
.action(async (slug: string, options: BaseOptions) => {
  try {
    await handleWgCreate(slug, options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
```

#### COR-004: Path Traversal (MEDIUM)

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 467-485

**Issue**: `sourcePath` parameter in `handleNodeSaveOutputFile()` is passed directly to service without validation. A user could reference files outside intended directory.

**Fix**:
```typescript
if (sourcePath.includes('..')) {
  console.error('Error: Path traversal not allowed');
  process.exit(1);
}
```

#### COR-005: Direct Service Instantiation (MEDIUM)

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Line**: 243

**Issue**: `BootstrapPromptService` is directly instantiated with `new` instead of being registered in the DI container.

**Impact**: Violates ADR-0004 pattern. However, this is a stateless utility service, so impact is low.

**Fix**: Register BootstrapPromptService in container or document exception to ADR-0004.

### E.4) Doctrine Evolution Recommendations

**Advisory** - Does not affect approval verdict.

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 0 |
| Idioms | 1 | 0 | 0 |

**New Rule Candidate**:
- **Rule**: All async Commander.js action handlers MUST be wrapped in try-catch blocks
- **Evidence**: COR-003 finding in both command files
- **Enforcement**: Code review checklist / ESLint rule

**New Idiom Candidate**:
- **Pattern**: Command handler wrapper function
- **Example**:
```typescript
function wrapAction<T extends unknown[]>(
  handler: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  };
}

// Usage:
unit.command('list').action(wrapAction(handleUnitList));
```

---

## F) Coverage Map

**Testing Approach**: Full TDD

| Acceptance Criteria | Test File | Test Name | Confidence |
|---------------------|-----------|-----------|------------|
| AC-01: wg create | cli-workflow.test.ts | should create unit, graph... | 100% |
| AC-02: wg show | cli-workflow.test.ts | should create unit, graph... | 75% (implicit) |
| AC-03: wg status | cli-workflow.test.ts | should create unit, graph... | 75% (implicit) |
| AC-04: node add-after | cli-workflow.test.ts | should create unit, graph... | 75% (tests E103 case) |
| AC-05: reject missing inputs (E103) | cli-workflow.test.ts | should create unit, graph... | 100% |
| AC-14: unit list | cli-workflow.test.ts | should list units and graphs | 100% |
| AC-17: DI container | container-registration.test.ts | both tests | 100% |

**Overall Coverage Confidence**: 75%
- Good coverage of happy path and E103 error case
- Missing explicit coverage for: wg show tree format, wg status table, node remove, node exec, node lifecycle, node I/O, ask/answer

**Recommendation**: Add explicit tests for under-covered acceptance criteria.

---

## G) Commands Executed

```bash
# Test execution
pnpm test test/integration/workgraph/cli-workflow.test.ts test/unit/workgraph/container-registration.test.ts
# Result: 6 tests passed

pnpm test test/unit/workgraph test/contracts/workgraph test/integration/workgraph
# Result: 177 tests passed

# Quality checks
pnpm typecheck  # pass
pnpm lint       # pass

# Build verification
pnpm -F @chainglass/cli build  # success

# CLI verification
node ./apps/cli/dist/cli.cjs --help
# Commands: unit, wg visible
```

---

## H) Decision & Next Steps

### Required Fixes (blocking merge)

1. **COR-001**: Fix `handleNodeCanEnd()` to not mutate state
   - Add `canEnd()` method to IWorkNodeService
   - Update workgraph.command.ts to call canEnd() instead of end()

2. **COR-002**: Replace string tokens with SHARED_DI_TOKENS constants
   - Update lines 236-237 in workgraph.command.ts

3. **COR-003**: Add try-catch to all async action handlers
   - Consider wrapAction helper pattern for consistency

### Recommended Fixes (non-blocking)

4. **COR-004**: Add path traversal validation for sourcePath
5. **TAD-001**: Add footnote references to task table Notes column

### Approval Conditions

- [ ] Fix COR-001 (critical logic defect)
- [ ] Fix COR-002 (DI pattern violation)
- [ ] Fix COR-003 (error handling gap)
- [ ] Re-run tests to confirm no regression

After fixes: Re-run `/plan-7-code-review --phase "Phase 6: CLI Integration"` for final approval.

---

## I) Footnotes Audit

| File | Footnote Tag | Node ID | Status |
|------|--------------|---------|--------|
| packages/workgraph/src/container.ts | – | – | ⚠️ No footnote |
| packages/workgraph/src/index.ts | – | – | ⚠️ No footnote |
| packages/shared/src/adapters/console-output.adapter.ts | – | – | ⚠️ No footnote |
| apps/cli/src/commands/unit.command.ts | – | – | ⚠️ No footnote |
| apps/cli/src/commands/workgraph.command.ts | – | – | ⚠️ No footnote |
| apps/cli/src/bin/cg.ts | – | – | ⚠️ No footnote |
| apps/cli/src/commands/index.ts | – | – | ⚠️ No footnote |
| apps/cli/src/lib/container.ts | – | – | ⚠️ No footnote |
| test/unit/workgraph/container-registration.test.ts | – | – | ⚠️ No footnote |
| test/integration/workgraph/cli-workflow.test.ts | – | – | ⚠️ No footnote |

**Note**: No footnotes were added during Phase 6 implementation. The Change Footnotes Ledger (plan § 10) remains a skeleton.

---

*Review generated by plan-7-code-review*
