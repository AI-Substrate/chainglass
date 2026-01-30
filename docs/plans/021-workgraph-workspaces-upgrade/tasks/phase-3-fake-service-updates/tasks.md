# Phase 3: Fake Service Updates — Tasks + Alignment Brief

## Prior Phases Review

### Phase 1: Interface Updates (✅ Complete)

**Deliverables:**
- Updated 4 service interfaces to accept `WorkspaceContext` as first parameter (25 methods total)
- IWorkGraphService: 6 methods (create, load, show, status, addNodeAfter, removeNode)
- IWorkNodeService: 14 methods (canRun, markReady, start, end, canEnd, getInputData, getInputFile, getOutputData, saveOutputData, saveOutputFile, clear, ask, answer, getAnswer)
- IWorkUnitService: 4 methods (list, load, create, validate)
- BootstrapPromptService.generate(): 1 method

**Lessons Learned:**
- Interface-first approach enables compile-time enforcement of ctx usage
- Contract tests need stubbing during transition phases to prevent cascading failures

**Dependencies Exported:**
- Method signature pattern: `methodName(ctx: WorkspaceContext, ...args): Promise<Result>`
- ctx-first parameter position enforced at type level

---

### Phase 2: Service Layer Migration (✅ Complete)

**Deliverables:**
- WorkGraphService: 6 methods migrated + path helpers (`getGraphsDir`, `getGraphPath`)
- WorkNodeService: 14 methods migrated + path helpers (`getOutputPaths` returning `{absolute, relative}`)
- WorkUnitService: 4 methods migrated + path helpers (`getUnitsDir`, `getUnitPath`)
- All fakes accept `_ctx: WorkspaceContext` parameter (but ignore it)
- Path storage: `.chainglass/data/{work-graphs,units}/` relative to worktreePath

**Lessons Learned:**
- Dual path pattern needed: absolute for FS I/O, relative for data.json storage
- Internal call propagation required for service-to-service calls
- Fakes updated alongside services to maintain interface compatibility

**Technical Debt Identified:**
- **Fakes accept but ignore ctx** - no workspace isolation in fake implementations
- Same slug in different workspaces would overwrite each other
- `getCalls()` does not record which ctx was passed

**Dependencies Exported:**
- All services now derive paths from `ctx.worktreePath`
- Fakes satisfy interface but don't honor isolation semantics

---

## Phase 3 Objective

Transform fake services from "ctx-ignoring" to "ctx-aware" by:
1. Using **composite keys** (`${ctx.worktreePath}|${slug}`) for storage isolation
2. Recording **ctx in call capture** for test assertions
3. Ensuring **workspace isolation** behaves identically in fakes and real implementations

---

## Tasks

### T3.1: Add `getKey()` helper to FakeWorkGraphService
**Complexity:** 1  
**File:** `packages/workgraph/src/fakes/fake-workgraph-service.ts`

Add private helper method:
```typescript
private getKey(ctx: WorkspaceContext, slug: string): string {
  return `${ctx.worktreePath}|${slug}`;
}
```

**Success Criteria:**
- [x] Helper method exists and compiles
- [x] Returns composite key format `worktreePath|slug`

---

### T3.2: Update FakeWorkGraphService storage to use composite keys
**Complexity:** 2  
**File:** `packages/workgraph/src/fakes/fake-workgraph-service.ts`

Update all preset result Maps to use composite keys:
- `presetCreateResults`: `set(getKey(ctx, slug), result)` / `get(getKey(ctx, slug))`
- `presetLoadResults`: same pattern
- `presetShowResults`: same pattern  
- `presetStatusResults`: same pattern
- `presetAddNodeResults`: needs `getKey(ctx, graphSlug)` prefix to existing key
- `presetRemoveNodeResults`: needs `getKey(ctx, graphSlug)` prefix to existing key

Update `setPreset*()` methods to accept ctx parameter:
```typescript
setPresetCreateResult(ctx: WorkspaceContext, slug: string, result: GraphCreateResult): void {
  this.presetCreateResults.set(this.getKey(ctx, slug), result);
}
```

**Success Criteria:**
- [x] All 6 preset Maps use composite keys
- [x] `setPreset*()` methods accept ctx as first parameter
- [x] `create()`, `load()`, `show()`, `status()`, `addNodeAfter()`, `removeNode()` use `getKey()` for lookups

---

### T3.3: Update FakeWorkGraphService call recording to include ctx
**Complexity:** 2  
**File:** `packages/workgraph/src/fakes/fake-workgraph-service.ts`

Update call type interfaces to include ctx:
```typescript
export interface GraphCreateCall {
  ctx: WorkspaceContext;  // ADD
  slug: string;
  timestamp: string;
  result: GraphCreateResult;
}
```

Update all 6 call types: `GraphCreateCall`, `GraphLoadCall`, `GraphShowCall`, `GraphStatusCall`, `AddNodeAfterCall`, `RemoveNodeCall`

Update method implementations to record ctx:
```typescript
this.createCalls.push({
  ctx,  // ADD - no longer ignored
  slug,
  timestamp: new Date().toISOString(),
  result,
});
```

**Success Criteria:**
- [x] All 6 call types include `ctx: WorkspaceContext`
- [x] All 6 methods record actual ctx in call capture
- [x] `getCalls()` returns calls with ctx for assertion

---

### T3.4: Add `getKey()` helper to FakeWorkNodeService
**Complexity:** 1  
**File:** `packages/workgraph/src/fakes/fake-worknode-service.ts`

Add private helper (same pattern as T3.1):
```typescript
private getKey(ctx: WorkspaceContext, ...parts: string[]): string {
  return `${ctx.worktreePath}|${parts.join(':')}`;
}
```

**Success Criteria:**
- [x] Helper method exists and compiles
- [x] Returns `worktreePath|part1:part2:...` format

---

### T3.5: Update FakeWorkNodeService storage to use composite keys
**Complexity:** 3  
**File:** `packages/workgraph/src/fakes/fake-worknode-service.ts`

**NOTE (DYK#1):** There are actually 13 preset Maps (not 12). Also fix:
- Remove duplicate `presetGetOutputDataResults` declaration at line 457 (use block-level one)
- Add missing `presetCanEndResults.clear()` to reset()

Update all 13 preset result Maps to use composite keys:
- `presetCanRunResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetMarkReadyResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetStartResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetEndResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetCanEndResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetGetInputDataResults`: `getKey(ctx, graphSlug, nodeId, inputName)`
- `presetGetInputFileResults`: `getKey(ctx, graphSlug, nodeId, inputName)`
- `presetSaveOutputDataResults`: `getKey(ctx, graphSlug, nodeId, outputName)`
- `presetSaveOutputFileResults`: `getKey(ctx, graphSlug, nodeId, outputName)`
- `presetClearResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetAskResults`: `getKey(ctx, graphSlug, nodeId)`
- `presetAnswerResults`: `getKey(ctx, graphSlug, nodeId, questionId)`

Update all 14 `setPreset*()` methods to accept ctx as first parameter.

**Success Criteria:**
- [x] All 13 preset Maps use composite keys
- [x] All 14 method implementations use `getKey()` for lookups
- [x] `setPreset*()` methods accept ctx as first parameter
- [x] Duplicate `presetGetOutputDataResults` removed (use block-level declaration)

---

### T3.6: Update FakeWorkNodeService call recording to include ctx
**Complexity:** 2  
**File:** `packages/workgraph/src/fakes/fake-worknode-service.ts`

**NOTE (DYK#4):** Also rename `setCanEndResult` → `setPresetCanEndResult` for naming consistency with all other setters.

**NOTE (DYK#5):** `getAnswer()` is currently a bare stub with no preset/call-recording. Add full fake support:
- Add `getAnswerCalls` array
- Add `presetGetAnswerResults` Map  
- Add `setPresetGetAnswerResult()` setter
- Add `getGetAnswerCalls()` and `getLastGetAnswerCall()` accessors
- Update `reset()` to clear these

Update all 14 call type interfaces to include ctx (now including `GetAnswerCall`):
- `CanRunCall`, `MarkReadyCall`, `StartCall`, `EndCall`, `CanEndCall`
- `GetInputDataCall`, `GetInputFileCall`, `GetOutputDataCall`
- `SaveOutputDataCall`, `SaveOutputFileCall`, `ClearCall`
- `AskCall`, `AnswerCall`, **`GetAnswerCall`** (NEW)

Update all 15 method implementations to record ctx (now including `getAnswer`).

**Success Criteria:**
- [x] All 14 call types include `ctx: WorkspaceContext` (13 existing + 1 new GetAnswerCall)
- [x] All 15 methods record actual ctx in call capture (14 existing + getAnswer)
- [x] `setCanEndResult` renamed to `setPresetCanEndResult`
- [x] `getAnswer()` has full fake support (preset, call recording, setters)

---

### T3.7: Add `getKey()` helper to FakeWorkUnitService
**Complexity:** 1  
**File:** `packages/workgraph/src/fakes/fake-workunit-service.ts`

Add private helper:
```typescript
private getKey(ctx: WorkspaceContext, slug?: string): string {
  return slug ? `${ctx.worktreePath}|${slug}` : ctx.worktreePath;
}
```

**Success Criteria:**
- [x] Helper method exists and compiles
- [x] Handles both slug-based and list-only keys

---

### T3.8: Update FakeWorkUnitService storage to use composite keys
**Complexity:** 2  
**File:** `packages/workgraph/src/fakes/fake-workunit-service.ts`

Update all 4 preset result storages:
- `presetListResult` → `presetListResults: Map<string, UnitListResult>` (keyed by worktreePath)
- `presetLoadResults`: `getKey(ctx, slug)`
- `presetCreateResults`: `getKey(ctx, slug)`
- `presetValidateResults`: `getKey(ctx, slug)`

Update `setPresetListResult()` to accept ctx:
```typescript
setPresetListResult(ctx: WorkspaceContext, result: UnitListResult): void {
  this.presetListResults.set(this.getKey(ctx), result);
}
```

**Success Criteria:**
- [x] `presetListResult` converted to Map for workspace isolation
- [x] All 4 `setPreset*()` methods accept ctx
- [x] All 4 method implementations use `getKey()` for lookups

---

### T3.9: Update FakeWorkUnitService call recording to include ctx
**Complexity:** 2  
**File:** `packages/workgraph/src/fakes/fake-workunit-service.ts`

Update all 4 call type interfaces:
- `ListCall`, `LoadCall`, `CreateCall`, `ValidateCall`

Update all 4 method implementations to record ctx.

**Success Criteria:**
- [x] All 4 call types include `ctx: WorkspaceContext`
- [x] All 4 methods record actual ctx in call capture

---

### T3.10: Verify `reset()` clears all state
**Complexity:** 1  
**Files:** All 3 fake files

Verify `reset()` in each fake clears:
- All call arrays
- All preset result Maps
- Any other state (e.g., `defaultUnits` in FakeWorkUnitService)

**NOTE (DYK#1):** FakeWorkNodeService reset() is missing `presetCanEndResults.clear()` - add it.

**Success Criteria:**
- [x] FakeWorkGraphService.reset() clears 6 call arrays + 6 preset Maps
- [x] FakeWorkNodeService.reset() clears 13 call arrays + 13 preset Maps (including `presetCanEndResults`)
- [x] FakeWorkUnitService.reset() clears 4 call arrays + 4 preset Maps + defaultUnits

---

### T3.11a: Create shared workspace context test helper
**Complexity:** 1  
**File:** `test/helpers/workspace-context.ts` (NEW)

**NOTE (DYK#3):** The `createStubContext()` function is duplicated across contract test files. Create a shared, parameterized helper.

```typescript
import type { WorkspaceContext } from '@chainglass/workflow';

/**
 * Creates a test WorkspaceContext with customizable worktreePath.
 * Use for tests that need workspace isolation verification.
 */
export function createTestWorkspaceContext(worktreePath: string): WorkspaceContext {
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

**Success Criteria:**
- [x] Helper file created at `test/helpers/workspace-context.ts`
- [x] Function accepts `worktreePath` parameter
- [x] Exports `createTestWorkspaceContext`

---

### T3.11b: Write workspace isolation tests
**Complexity:** 2  
**File:** `test/unit/workgraph/fake-workspace-isolation.test.ts` (NEW)
**Depends on:** T3.11a

Create test file verifying isolation behavior:

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { FakeWorkGraphService } from '@chainglass/workgraph/fakes';
import { FakeWorkNodeService } from '@chainglass/workgraph/fakes';
import { FakeWorkUnitService } from '@chainglass/workgraph/fakes';
import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

describe('Fake workspace isolation', () => {
  describe('FakeWorkGraphService', () => {
    test('same slug in different workspaces are independent', async () => {
      const fake = new FakeWorkGraphService();
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');
      
      // Set different preset results per workspace
      fake.setPresetCreateResult(ctxA, 'graph', { graphSlug: 'graph', path: '/a/path', errors: [] });
      fake.setPresetCreateResult(ctxB, 'graph', { graphSlug: 'graph', path: '/b/path', errors: [] });
      
      const resultA = await fake.create(ctxA, 'graph');
      const resultB = await fake.create(ctxB, 'graph');
      
      expect(resultA.path).toBe('/a/path');
      expect(resultB.path).toBe('/b/path');
    });

    test('getCalls() records ctx for inspection', async () => {
      const fake = new FakeWorkGraphService();
      const ctx = createTestWorkspaceContext('/workspace');
      
      await fake.create(ctx, 'my-graph');
      
      const calls = fake.getCreateCalls();
      expect(calls[0].ctx.worktreePath).toBe('/workspace');
    });
  });

  // Similar tests for FakeWorkNodeService and FakeWorkUnitService
});
```

**Success Criteria:**
- [x] Test file created at `test/unit/workgraph/fake-workspace-isolation.test.ts`
- [x] Tests for all 3 fakes: isolation + ctx recording
- [x] All tests pass

---

### T3.12: Verify contract tests pass without changes
**Complexity:** 1  
**Files:** `test/contracts/*.contract.ts`

**NOTE (DYK#2):** Contract tests don't actually use `setPreset*()` methods - they test default behavior only. No updates needed.

Run contract tests to verify Phase 3 changes don't break contract compliance:

```bash
pnpm test -- test/contracts/workgraph-service.contract.test.ts
pnpm test -- test/contracts/worknode-service.contract.test.ts
pnpm test -- test/contracts/workunit-service.contract.test.ts
```

**Success Criteria:**
- [x] All 3 workgraph-related contract tests pass
- [x] No TypeScript errors in contract test files
- [x] Documented: Contract tests verify default behavior, not preset configuration

---

### T3.13: Run full test suite and verify
**Complexity:** 1  
**Command:** `just fft`

**Success Criteria:**
- [x] `pnpm build` passes
- [x] Contract tests pass (34 tests)
- [x] New isolation tests pass
- [x] No TypeScript errors

---

## Alignment Brief

### Architecture Context

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: FAKE SERVICE UPDATES                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BEFORE (Phase 2):                                             │
│  ┌──────────────────────┐                                      │
│  │  FakeWorkGraphService │                                     │
│  ├──────────────────────┤                                      │
│  │ presetCreateResults   │                                     │
│  │   Map<slug, result>   │  ← Simple key ignores ctx           │
│  │                       │                                      │
│  │ create(_ctx, slug)    │  ← ctx parameter ignored            │
│  │   key = slug          │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
│  PROBLEM: Different workspaces collide on same slug            │
│  ┌──────────┐    ┌──────────┐                                  │
│  │ ctxA     │    │ ctxB     │                                  │
│  │ /work-a  │    │ /work-b  │                                  │
│  └────┬─────┘    └────┬─────┘                                  │
│       │               │                                         │
│       │ create('g')   │ create('g')                            │
│       │               │                                         │
│       ▼               ▼                                         │
│  ┌─────────────────────────┐                                   │
│  │  Map['g'] = resultB     │  ← ctxA's result overwritten!     │
│  └─────────────────────────┘                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AFTER (Phase 3):                                              │
│  ┌──────────────────────┐                                      │
│  │  FakeWorkGraphService │                                     │
│  ├──────────────────────┤                                      │
│  │ presetCreateResults   │                                     │
│  │   Map<wsPath|slug,    │  ← Composite key includes ctx       │
│  │       result>         │                                      │
│  │                       │                                      │
│  │ create(ctx, slug)     │  ← ctx used for key                 │
│  │   key = getKey(ctx,   │                                      │
│  │         slug)         │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
│  SOLUTION: Workspace isolation via composite keys              │
│  ┌──────────┐    ┌──────────┐                                  │
│  │ ctxA     │    │ ctxB     │                                  │
│  │ /work-a  │    │ /work-b  │                                  │
│  └────┬─────┘    └────┬─────┘                                  │
│       │               │                                         │
│       │ create('g')   │ create('g')                            │
│       │               │                                         │
│       ▼               ▼                                         │
│  ┌─────────────────────────────────────┐                       │
│  │  Map['/work-a|g'] = resultA         │                       │
│  │  Map['/work-b|g'] = resultB         │  ← Independent!       │
│  └─────────────────────────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Composite Key Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPOSITE KEY FORMAT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FakeWorkGraphService:                                         │
│  ┌──────────────────────────────────────────────┐              │
│  │ create/load/show/status:                      │              │
│  │   key = "${ctx.worktreePath}|${slug}"        │              │
│  │   e.g., "/home/user/repo|my-graph"           │              │
│  │                                               │              │
│  │ addNodeAfter:                                 │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${afterNodeId}:${unitSlug}"         │              │
│  │                                               │              │
│  │ removeNode:                                   │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${nodeId}"                          │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  FakeWorkNodeService:                                          │
│  ┌──────────────────────────────────────────────┐              │
│  │ canRun/markReady/start/end/canEnd/clear/ask: │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${nodeId}"                          │              │
│  │                                               │              │
│  │ getInputData/getInputFile:                    │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${nodeId}:${inputName}"             │              │
│  │                                               │              │
│  │ getOutputData/saveOutputData/saveOutputFile:  │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${nodeId}:${outputName}"            │              │
│  │                                               │              │
│  │ answer:                                       │              │
│  │   key = "${ctx.worktreePath}|${graphSlug}:   │              │
│  │          ${nodeId}:${questionId}"            │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  FakeWorkUnitService:                                          │
│  ┌──────────────────────────────────────────────┐              │
│  │ list:                                         │              │
│  │   key = "${ctx.worktreePath}"                │              │
│  │                                               │              │
│  │ load/create/validate:                         │              │
│  │   key = "${ctx.worktreePath}|${slug}"        │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Call Recording Enhancement

```
┌─────────────────────────────────────────────────────────────────┐
│                    CALL RECORDING WITH CTX                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BEFORE:                                                       │
│  ┌──────────────────────────────────────────────┐              │
│  │ interface GraphCreateCall {                   │              │
│  │   slug: string;           // ✓               │              │
│  │   timestamp: string;      // ✓               │              │
│  │   result: GraphCreateResult;                 │              │
│  │   // ctx NOT recorded!                       │              │
│  │ }                                            │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  Test limitation: Cannot verify which workspace was passed     │
│                                                                 │
│  AFTER:                                                        │
│  ┌──────────────────────────────────────────────┐              │
│  │ interface GraphCreateCall {                   │              │
│  │   ctx: WorkspaceContext;  // ✓ NEW           │              │
│  │   slug: string;           // ✓               │              │
│  │   timestamp: string;      // ✓               │              │
│  │   result: GraphCreateResult;                 │              │
│  │ }                                            │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  Test capability: Full assertion on ctx                        │
│  ┌──────────────────────────────────────────────┐              │
│  │ const calls = fake.getCreateCalls();          │              │
│  │ expect(calls[0].ctx.worktreePath).toBe('/a'); │              │
│  │ expect(calls[0].slug).toBe('my-graph');       │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Dependencies

```
Phase 1 (✅) ──► Phase 2 (✅) ──► Phase 3 (current)
                                       │
                                       ▼
                              Phase 4 (CLI Integration)
                                       │
                                       ▼
                              Phase 5 (Test Migration)
                                       │
                                       ▼
                              Phase 6 (E2E Validation)
```

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Contract tests break with new setPreset* signatures | T3.12: Verify contract tests pass (they don't use setPreset methods) |
| Forgetting to update a method | Systematic task breakdown per method group |
| reset() misses new state | T3.10: Explicit verification of all state cleared |

---

## Execution Checklist

- [x] T3.1: `getKey()` helper in FakeWorkGraphService
- [x] T3.2: Composite keys in FakeWorkGraphService storage
- [x] T3.3: ctx recording in FakeWorkGraphService calls
- [x] T3.4: `getKey()` helper in FakeWorkNodeService
- [x] T3.5: Composite keys in FakeWorkNodeService storage
- [x] T3.6: ctx recording in FakeWorkNodeService calls
- [x] T3.7: `getKey()` helper in FakeWorkUnitService
- [x] T3.8: Composite keys in FakeWorkUnitService storage
- [x] T3.9: ctx recording in FakeWorkUnitService calls
- [x] T3.10: Verify reset() clears all state
- [x] T3.11a: Create shared workspace context test helper
- [x] T3.11b: Workspace isolation tests
- [x] T3.12: Verify contract tests pass
- [x] T3.13: Run full test suite

---

## E2E Validation Commands (Reminder)

After all phases complete, validate with:
```bash
# Mock mode (no real agent)
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# With Claude Code
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent

# With Copilot
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent --copilot
```

---

## Critical Insights Discussion

**Session**: 2026-01-28 10:44 UTC
**Context**: Phase 3 Fake Service Updates - Tasks + Alignment Brief
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: FakeWorkNodeService Has a Hidden 13th Map We Missed

**Did you know**: `FakeWorkNodeService` declares `presetGetOutputDataResults` twice and `reset()` is missing `presetCanEndResults.clear()`.

**Implications**:
- Test isolation could leak state if canEnd presets persist across tests
- The duplicate declaration is confusing and could lead to bugs
- T3.5 originally listed "12 Maps" but there are actually 13 to update

**Options Considered**:
- Option A: Fix During Phase 3 - Clean fix while already touching the code
- Option B: Document as Separate Bug Fix - Create separate issue for later

**AI Recommendation**: Option A - Fix During Phase 3
- Reasoning: Minimal extra effort since we're already touching every line; leaving known state leak bug feels wrong when improving test isolation.

**Discussion Summary**: User agreed to fix the reset() bug and remove duplicate declaration during Phase 3.

**Decision**: Fix during Phase 3 implementation

**Action Items**:
- [x] Add `presetCanEndResults.clear()` to reset() (noted in T3.10)
- [x] Remove duplicate `presetGetOutputDataResults` declaration (noted in T3.5)
- [x] Update task counts from 12→13 Maps

**Affects**: T3.5, T3.10

---

### Insight 2: Contract Tests Don't Use setPreset* Methods

**Did you know**: Contract tests don't call `setPreset*()` methods - they test default behavior only, making T3.12's original scope unnecessary.

**Implications**:
- Contract tests will pass without any changes to setPreset signatures
- T3.12 was solving a problem that doesn't exist
- Opportunity to simplify the task to verification only

**Options Considered**:
- Option A: Remove T3.12 Entirely
- Option B: Keep for Future-Proofing
- Option C: Replace with Verification Task

**AI Recommendation**: Option C - Replace with Verification
- Reasoning: Validates our assumption and documents that contract tests verify default behavior only.

**Discussion Summary**: User chose Option C to verify assumption and document behavior.

**Decision**: Replace T3.12 with verification task

**Action Items**:
- [x] Update T3.12 description to "Verify contract tests pass"
- [x] Reduce complexity from CS-2 to CS-1
- [x] Add DYK#2 note explaining contract tests test defaults

**Affects**: T3.12

---

### Insight 3: Isolation Tests Need a Helper That Doesn't Exist

**Did you know**: T3.11 references `createTestWorkspaceContext()` helper but `test/helpers/workspace-context.ts` doesn't exist. The inline `createStubContext()` is duplicated across contract tests.

**Implications**:
- T3.11 can't be implemented as written
- Opportunity to DRY up duplicated functions across contract tests
- Phase 5 test migration will be easier with shared utilities

**Options Considered**:
- Option A: Create Shared Test Helper - DRY, reusable, proper location
- Option B: Inline in Isolation Test Only - Minimal changes, more duplication
- Option C: Create Helper + Migrate Contract Tests Later

**AI Recommendation**: Option A - Create Shared Test Helper
- Reasoning: Good time to consolidate while doing test infrastructure work; prevents duplication from spreading.

**Discussion Summary**: User agreed to create the shared helper as a prerequisite task.

**Decision**: Create `test/helpers/workspace-context.ts` with parameterized helper

**Action Items**:
- [x] Split T3.11 into T3.11a (create helper) and T3.11b (write tests)
- [x] Add DYK#3 note explaining the duplication problem
- [x] Update execution checklist with new task numbers

**Affects**: T3.11 (split into T3.11a + T3.11b)

---

### Insight 4: setCanEndResult Naming Inconsistency

**Did you know**: `FakeWorkNodeService.setCanEndResult()` doesn't follow the `setPreset*Result` naming pattern used by all other setter methods.

**Implications**:
- Developers will look for `setPresetCanEndResult` and not find it
- Autocomplete won't group it with other preset methods
- API inconsistency becomes more visible after adding ctx parameter

**Options Considered**:
- Option A: Rename to `setPresetCanEndResult` - Consistent API
- Option B: Leave As-Is - No changes, permanent inconsistency
- Option C: Add Alias + Deprecation - Backward compatible but more code

**AI Recommendation**: Option A - Rename
- Reasoning: No external consumers, consistency aids future developers, trivial change while already touching the method.

**Discussion Summary**: User agreed to rename for consistency.

**Decision**: Rename `setCanEndResult` → `setPresetCanEndResult`

**Action Items**:
- [x] Add DYK#4 note to T3.6 about the rename
- [x] Add success criteria item for the rename

**Affects**: T3.6

---

### Insight 5: getAnswer() Has No Preset/Call Recording

**Did you know**: `getAnswer()` is a bare stub with no preset mechanism and no call recording - the only method in the fake without full support.

**Implications**:
- Tests can't configure what `getAnswer()` returns
- Tests can't verify `getAnswer()` was called with correct parameters
- Asymmetry between `ask()` (fully faked) and `getAnswer()` (stub only)

**Options Considered**:
- Option A: Add Full Fake Support - Complete fake, consistent with all other methods
- Option B: Leave As-Is - Less work, inconsistent API
- Option C: Add to Scope with Lower Priority - Acknowledges gap, might get skipped

**AI Recommendation**: Option A - Add Full Fake Support
- Reasoning: Already touching every method for ctx changes; consistency matters; pattern is repetitive and easy.

**Discussion Summary**: User agreed to add full fake support while we're already in the file.

**Decision**: Add full fake support for `getAnswer()`

**Action Items**:
- [x] Add DYK#5 note to T3.6 with implementation details
- [x] Update counts from 13→14 call types, 14→15 methods
- [x] Add success criteria for getAnswer() full support

**Affects**: T3.6, T3.10 (reset must clear new state)

---

## Session Summary

**Insights Surfaced**: 5 critical insights identified and discussed
**Decisions Made**: 5 decisions reached through collaborative discussion
**Action Items Created**: 5 categories of follow-up items (all noted in tasks)
**Areas Requiring Updates**: T3.5, T3.6, T3.10, T3.11, T3.12

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - All gaps identified and addressed; phase is well-scoped

**Next Steps**: Proceed to implementation with `implement` command

**Notes**:
- Total task count increased from 13 to 14 (T3.11 split into T3.11a + T3.11b)
- Several "quality of life" improvements added (naming consistency, helper consolidation)
- reset() bug fix prevents potential test isolation issues
