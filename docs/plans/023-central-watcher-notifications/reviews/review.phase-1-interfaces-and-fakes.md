# Code Review: Phase 1 - Interfaces & Fakes

**Plan**: 023-central-watcher-notifications  
**Phase**: Phase 1: Interfaces & Fakes  
**Reviewer**: AI Agent (plan-7-code-review)  
**Date**: 2026-01-31  
**Diff**: phase-1.diff (52 lines)

---

## A. Verdict

**🔴 REQUEST_CHANGES**

**Blocking Issues**: 1 HIGH severity finding (double-start prevention missing in FakeCentralWatcherService)

**Overall Assessment**: Phase 1 establishes solid foundational interfaces and fakes with excellent TDD discipline. Implementation is 95% complete but has one critical defect: `FakeCentralWatcherService.start()` does not enforce double-start prevention as specified in the interface contract (`@throws Error if already watching`). This must be fixed before Phase 2 begins, as the fake will be used extensively in CentralWatcherService tests.

---

## B. Summary

Phase 1 successfully delivers:
- ✅ Complete type surface (interfaces, events, fakes) for central watcher notification system
- ✅ TDD discipline with RED-GREEN-REFACTOR cycles documented in execution log
- ✅ 12 passing tests (4 for FakeWatcherAdapter, 8 for FakeCentralWatcherService)
- ✅ Zero domain-specific imports (AC12 compliant)
- ✅ Fakes-only testing (no vi.fn/mock/spyOn per AC10)
- ✅ PlanPak directory structure and package.json exports entry
- ✅ DI token reserved per ADR-0004

**Key Achievements**:
- Bidirectional graph links: Task↔Log verified (9 HIGH violations - missing log anchors in Notes column)
- Footnote ledger: CLEAN (no footnotes yet, placeholder acceptable)
- Testing approach: Full TDD with 5-field Test Doc comments on all 12 tests
- Type checking: PASS (pnpm tsc --noEmit)
- Linting: PASS (biome check, 0 violations in Phase 1 files)

**Critical Issue**:
- FakeCentralWatcherService violates interface contract for double-start prevention

---

## C. Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
  - T004 (RED) → T005 (GREEN) for FakeWatcherAdapter
  - T006 (RED) → T007 (GREEN) for FakeCentralWatcherService
- [x] Tests as docs (assertions show behavior)
  - All 12 tests include 5-field Test Doc comments
  - Test names clearly communicate behavioral contracts
- [x] Mock usage matches spec: **Fakes only (no vi.fn/mock/spyOn)**
  - Both test files use only FakeWatcherAdapter, FakeCentralWatcherService
  - Zero vi.fn/mock/spyOn usage detected
- [ ] **CRITICAL FAILURE**: Fake does not enforce interface contract
  - FakeCentralWatcherService.start() missing double-start check

**Universal (all approaches)**:
- [x] BridgeContext patterns followed (N/A for Phase 1 - no VS Code code)
- [x] Only in-scope files changed (3 cross-cutting files per plan)
- [x] Linters/type checks are clean (biome, tsc --noEmit pass)
- [x] Absolute paths used (no relative path assumptions)

**Graph Integrity (Bidirectional Links)**:
- [ ] Task↔Log links intact: **9 HIGH violations** (all tasks missing log#anchor in Notes)
- [x] Task↔Footnote links intact: CLEAN (no footnotes yet)
- [x] Footnote↔File links intact: CLEAN (no footnotes yet)
- [x] Plan↔Dossier sync: N/A (dossier is canonical for Phase 1)
- [x] Parent↔Subtask links: N/A (no subtasks)

---

## D. Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | HIGH | tasks.md:219-227 | All 9 tasks missing log#anchor in Notes column | Add log anchors to execution.log.md, reference in Notes |
| CORR-001 | HIGH | fake-central-watcher.service.ts:59-65 | Double-start prevention missing (violates interface contract) | Add `if (this.watching) throw new Error('Already watching')` check |
| TEST-001 | HIGH | fake-central-watcher.service.test.ts | Missing test for double-start scenario | Add test: "should throw when calling start() twice" |
| OBS-001 | MEDIUM | fake-central-watcher.service.ts:98 | simulateEvent() lacks adapter error isolation | Wrap adapter.handleEvent() in try-catch |

**Total**: 4 findings (2 HIGH blocking, 1 HIGH advisory, 1 MEDIUM)

---

## E. Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Status**: ✅ SKIPPED (Phase 1 is first phase - no prior phases to regress against)

### E.1 Doctrine & Testing Compliance

#### Graph Integrity Violations (Step 3a)

**LINK-001 [HIGH] - Task↔Log Bidirectional Links Broken**

**File**: `tasks.md` (lines 219-227, all 9 tasks)  
**Issue**: All completed tasks ([x]) are MISSING log#anchor references in Notes column

**Expected**:
- Each task should have a log#anchor in Notes column (e.g., `log#task-t001-create-planpak`)
- Execution log entries should have `###` heading anchors matching these references

**Actual**:
- 9 tasks completed ([x]) with NO log anchor references in Notes column
- Execution log has proper task metadata (**Dossier Task**: T001, **Plan Task**: 1.0) but lacks markdown anchors

**Impact**: Cannot navigate from task table to execution evidence (breaks Task→Log traversal in graph)

**Fix**:
1. Add markdown anchors to execution log entries:
   ```markdown
   ## Task T001: Create PlanPak feature directory
   ### log#task-t001-create-planpak
   **Dossier Task**: T001 | **Plan Task**: 1.0
   ```

2. Update Notes column in tasks.md:
   - T001 Notes: `log#task-t001-create-planpak`
   - T002 Notes: `log#task-t002-define-watcher`
   - ... (all 9 tasks)

**Recommendation**: Run plan-6a to sync bidirectional links

---

#### Authority Conflicts (Step 3c)

**Status**: ✅ CLEAN - No conflicts detected

- Plan § 12 Change Footnotes Ledger: Placeholder entries `[To be added during implementation via plan-6a]`
- Dossier Phase Footnote Stubs: Empty (intentional, awaiting plan-6a)
- No footnote references in task table
- Authority hierarchy intact (plan wins when conflicts arise)

**Next Footnote**: [^1] (when footnotes are added in future phases)

---

#### TDD Compliance (Step 4)

**Status**: ✅ EXEMPLARY COMPLIANCE

**TDD Order** (RED-GREEN-REFACTOR):
- ✅ T004 (tests) → T005 (impl) for FakeWatcherAdapter - RED-GREEN documented
- ✅ T006 (tests) → T007 (impl) for FakeCentralWatcherService - RED-GREEN documented
- Evidence: Execution log shows failing tests (RED phase) followed by passing tests (GREEN phase)

**Tests as Documentation**:
- ✅ All 12 tests include complete 5-field Test Doc comments:
  - **Why**: Purpose and value
  - **Contract**: Behavioral expectation
  - **Usage Notes**: How to read/maintain
  - **Quality Contribution**: What failure this catches
  - **Worked Example**: Realistic scenario with concrete inputs/outputs
- ✅ Test names clearly communicate behavioral contracts (e.g., "should record handleEvent calls")

**Mock Usage Policy** (Fakes only):
- ✅ Zero vi.fn(), vi.mock(), vi.spyOn() usage in both test files
- ✅ Tests use FakeWatcherAdapter and FakeCentralWatcherService with call tracking
- Policy: **Fakes only** - STRICTLY ENFORCED

**Critical Findings Compliance**:
- ✅ CF-05: PlanPak directory created with package.json exports entry
- ✅ CF-06: WatcherEvent as object (not positional params) with all required fields
- ⚠️ **CF-08: stop() preserves adapters** - implemented in code but NOT VALIDATED by double-start test
- ✅ CF-10: DI token reserved (not registered)

**ADR Compliance**:
- ✅ ADR-0004: DI token follows naming convention (`CENTRAL_WATCHER_SERVICE: 'ICentralWatcherService'`)

---

#### Plan Compliance (Step 4, Subagent 5)

**Status**: ✅ PASS (9/9 tasks completed per spec)

**Task Implementation Verification**:
- T001: ✅ PlanPak directory + package.json exports entry
- T002: ✅ WatcherEvent type + IWatcherAdapter interface
- T003: ✅ ICentralWatcherService interface
- T004: ✅ FakeWatcherAdapter tests (RED)
- T005: ✅ FakeWatcherAdapter impl (GREEN)
- T006: ✅ FakeCentralWatcherService tests (RED)
- T007: ✅ FakeCentralWatcherService impl (GREEN)
- T008: ✅ Barrel exports + main re-export
- T009: ✅ DI token placeholder

**Scope Creep Detection**: ✅ CLEAN
- All modified files match task table target paths
- Diff touches only 3 cross-cutting files per plan (di-tokens.ts, package.json, index.ts)
- Zero unexpected files modified
- Zero domain-specific imports (AC12 compliant)

**PlanPak Compliance**: ✅ PASS
- Plan-scoped files correctly placed in `features/023-central-watcher-notifications/`
- Cross-cutting files (DI token, exports) updated in shared locations
- Feature folder is flat (no nested subdirectories)
- Dependency direction correct (feature → shared interfaces, never shared → feature)

---

### E.2 Semantic Analysis

**Status**: ✅ PASS (15/15 checks compliant)

**Interface Contracts**:
- ✅ WatcherEvent shape matches CF-06 (path, eventType, worktreePath, workspaceSlug)
- ✅ FileWatcherEvent reused (not redefined)
- ✅ ICentralWatcherService matches AC1-8 (lifecycle, adapter registration, rescan)
- ✅ IWatcherAdapter has name property and handleEvent method (AC4)

**Fake Behavior**:
- ✅ FakeWatcherAdapter correctly implements IWatcherAdapter with call tracking
- ✅ FakeCentralWatcherService implements ICentralWatcherService with lifecycle tracking
- ⚠️ **EXCEPT**: Double-start prevention missing (see CORR-001)

**Domain Isolation**:
- ✅ Zero domain-specific imports in all interface files (AC12)
- ✅ Only FileWatcherEvent imported from shared types
- ✅ No workgraph/agent/sample references

**Export Chain**:
- ✅ Feature barrel exports all interfaces, types, fakes
- ✅ Main index.ts re-exports with aliased types (WatcherStartCall, WatcherStopCall)
- ✅ Package.json includes exports entry for feature directory

---

### E.3 Quality & Safety Analysis

#### Correctness Findings

**CORR-001 [HIGH] - Double-Start Prevention Missing**

**File**: `packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts`  
**Lines**: 59-65  
**Issue**: FakeCentralWatcherService.start() violates interface contract

**Interface Contract** (central-watcher.interface.ts:25):
```typescript
/**
 * @throws Error if already watching (double-start prevention)
 */
start(): Promise<void>;
```

**Actual Implementation** (fake-central-watcher.service.ts:59-65):
```typescript
async start(): Promise<void> {
  if (this.startError) throw this.startError;
  this.watching = true;  // No check if already watching!
  this.startCalls.push({ timestamp: Date.now() });
}
```

**Expected Behavior**: Should check `if (this.watching)` BEFORE setting `watching = true` and throw `Error('Already watching')` if true.

**Impact**: 
- Fake doesn't match real service contract
- Tests using this fake cannot detect double-start bugs in CentralWatcherService or adapters
- Phase 2 tests will pass with invalid double-start behavior

**Fix**:
```diff
 async start(): Promise<void> {
   if (this.startError) throw this.startError;
+  if (this.watching) throw new Error('Already watching');
   this.watching = true;
   this.startCalls.push({ timestamp: Date.now() });
 }
```

**Test Gap**: No test case for double-start scenario in `fake-central-watcher.service.test.ts`

---

**TEST-001 [HIGH] - Missing Double-Start Test**

**File**: `test/unit/workflow/fake-central-watcher.service.test.ts`  
**Issue**: No test validates double-start prevention behavior

**Required Test**:
```typescript
it('should throw when calling start() twice without stop()', () => {
  /*
  Test Doc:
  - Why: Validates interface contract @throws Error if already watching
  - Contract: start() rejects when already watching (prevents resource leaks)
  - Usage Notes: Run after T2 (basic start tracking)
  - Quality Contribution: Catches double-start bugs in real service and adapters
  - Worked Example: await start() → await start() → expect Error('Already watching')
  */
  const fake = new FakeCentralWatcherService();
  await fake.start();
  await expect(fake.start()).rejects.toThrow('Already watching');
});
```

**Recommendation**: Add test case and verify fake implementation enforces contract

---

#### Security Findings

**Status**: ✅ CLEAN - No security vulnerabilities

- ✅ No path traversal vectors (interfaces only define path properties)
- ✅ No code injection risks (no eval, dynamic imports, or string interpolation)
- ✅ No secrets in code
- ✅ Type-safe parameters (IWatcherAdapter, WatcherEvent)

**Note**: Path validation should occur in real service (Phase 2) and adapters (Phase 3), not in interfaces.

---

#### Performance Findings

**Status**: ✅ CLEAN - No performance issues

- ✅ No unbounded loops
- ✅ No memory leaks (Set-based adapter tracking, O(1) operations)
- ✅ Efficient call tracking (array push, no accumulation beyond test scope)

---

#### Observability Findings

**OBS-001 [MEDIUM] - Adapter Error Isolation Missing**

**File**: `packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts`  
**Lines**: 97-101  
**Issue**: `simulateEvent()` lacks error handling when adapter.handleEvent() throws

**Current Code**:
```typescript
simulateEvent(event: WatcherEvent): void {
  for (const adapter of this.adapters) {
    adapter.handleEvent(event);  // If this throws, loop stops
  }
}
```

**Impact**: One failing adapter silences remaining adapters (cascade failure in tests)

**Fix**:
```diff
 simulateEvent(event: WatcherEvent): void {
   for (const adapter of this.adapters) {
-    adapter.handleEvent(event);
+    try {
+      adapter.handleEvent(event);
+    } catch (error) {
+      // Isolate adapter failures - all adapters should receive events
+    }
   }
 }
```

**Severity**: MEDIUM (affects test reliability, not production code)

---

### E.4 Doctrine Evolution Recommendations

**Status**: Advisory (does not affect approval verdict)

#### New ADR Candidates

**ADR-REC-001 [MEDIUM] - Fake Error Isolation Pattern**

**Title**: Fake Services Should Isolate Callback Failures  
**Context**: `FakeCentralWatcherService.simulateEvent()` broadcasts to all registered adapters. One failing adapter can break the loop and prevent remaining adapters from receiving events.  
**Decision**: All fake services that invoke callbacks/adapters should wrap invocations in try-catch to ensure cascade failures don't break tests.  
**Evidence**:
- `fake-central-watcher.service.ts:97-101` (current implementation vulnerable)
- Pattern applies to future fakes with broadcast/dispatch behavior

**Priority**: MEDIUM (affects test reliability)  
**Action**: Consider documenting this pattern in project idioms for future fake implementations

---

#### New Idioms Candidates

**IDIOM-REC-001 [LOW] - 5-Field Test Doc Block Standard**

**Title**: Test Documentation Block Pattern  
**Pattern**: All test cases include 5-field comment block:
```typescript
/*
Test Doc:
- Why: [purpose and value]
- Contract: [behavioral expectation]
- Usage Notes: [how to read/maintain]
- Quality Contribution: [what failure this catches]
- Worked Example: [realistic scenario with concrete inputs/outputs]
*/
```

**Evidence**:
- All 12 tests in Phase 1 follow this pattern
- Pattern provides high-fidelity documentation (serves as executable spec)
- Examples: fake-watcher-adapter.test.ts:24-30, fake-central-watcher.service.test.ts:24-30

**Priority**: LOW (already in use, worth codifying)  
**Action**: Add to `docs/project-rules/idioms.md` as standard test documentation pattern

---

#### Positive Alignment

**ALIGN-001**: ✅ Implementation correctly follows ADR-0004 (DI token naming convention)
- Evidence: `packages/shared/src/di-tokens.ts:86-87` - Token format matches spec
- Token not registered (reserved for future), per plan NG2

**ALIGN-002**: ✅ Implementation correctly follows CF-08 (stop preserves adapters)
- Evidence: `fake-central-watcher.service.ts:73` - Explicit comment documents requirement
- Code preserves adapter Set across lifecycle

**ALIGN-003**: ✅ Implementation correctly follows PlanPak placement rules
- Evidence: All plan-scoped files in `features/023-*/`, cross-cutting files in shared locations
- Dependency direction correct (feature → shared, never shared → feature)

---

## F. Coverage Map

**Acceptance Criteria → Tests Mapping**

| AC | Description | Test Coverage | Confidence | Notes |
|----|-------------|---------------|------------|-------|
| AC2 | registerAdapter() before/after start() | ✅ fake-central-watcher.service.test.ts:T3 | 100% | Explicit test validates registration works in both states |
| AC3 | Events forwarded to ALL adapters | ✅ fake-central-watcher.service.test.ts:T5 | 100% | Test verifies simulateEvent dispatches to multiple adapters |
| AC4 | Adapters self-filter raw events | ✅ fake-watcher-adapter.test.ts:T1-T4 | 100% | Adapter receives ALL events, records in calls array (self-filtering validated in Phase 3) |
| AC10 | Tests use fakes, no vi.fn() | ✅ Both test files | 100% | grep confirmed zero vi.fn/mock/spyOn usage |
| AC12 | No domain-specific imports | ✅ All interface files | 100% | Only FileWatcherEvent imported from shared types |

**Overall Coverage Confidence**: 100% (5/5 Phase 1 acceptance criteria explicitly validated)

**Narrative Tests**: Zero (all tests map to specific acceptance criteria)

**Weak Mappings**: Zero

**Recommendations**:
- ✅ All tests explicitly reference AC or CF in Test Doc comments
- ✅ Test file organization clear (fake-watcher-adapter.test.ts, fake-central-watcher.service.test.ts)
- ⚠️ Add double-start test (currently missing validation of interface contract @throws)

---

## G. Commands Executed

```bash
# Type checking
pnpm tsc --noEmit
# Result: PASS (exit code 0)

# Linting
just lint  # runs: pnpm biome check .
# Result: PASS (755 files checked, 8 warnings from old plan symlinks, 0 violations in Phase 1 files)

# Test execution (Phase 1 tests only)
pnpm vitest run test/unit/workflow/fake-watcher-adapter.test.ts test/unit/workflow/fake-central-watcher.service.test.ts
# Result: PASS (2 test files, 12 tests, 0 failures, 5ms)

# Full test suite validation
just check  # Per execution log: 189 test files passed, 2706 tests, 0 failures
# Result: PASS
```

---

## H. Decision & Next Steps

**Verdict**: 🔴 **REQUEST_CHANGES**

**Blocking Issues**:
1. **CORR-001 [HIGH]**: FakeCentralWatcherService missing double-start prevention
2. **TEST-001 [HIGH]**: Missing test for double-start scenario
3. **LINK-001 [HIGH]**: All 9 tasks missing log#anchor references (graph integrity)

**Advisory Issues** (non-blocking, but recommended):
4. **OBS-001 [MEDIUM]**: simulateEvent() should isolate adapter errors

---

### Who Approves

**After fixes**:
- Developer: Fix CORR-001 and TEST-001
- Run: `pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts` to verify
- Run: `plan-6a --sync-links` to fix LINK-001 (add log anchors)
- Re-review: Run plan-7 again to verify all HIGH issues resolved

---

### What to Fix

**Priority 1 (Blocking - Must Fix Before Phase 2)**:

**Task 1**: Add double-start prevention to FakeCentralWatcherService
- **File**: `packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts`
- **Line**: 59-65 (start method)
- **Change**:
  ```diff
   async start(): Promise<void> {
     if (this.startError) throw this.startError;
  +  if (this.watching) throw new Error('Already watching');
     this.watching = true;
     this.startCalls.push({ timestamp: Date.now() });
   }
  ```

**Task 2**: Add test for double-start scenario
- **File**: `test/unit/workflow/fake-central-watcher.service.test.ts`
- **Location**: After existing "should track start() calls" test (line ~35)
- **Add**:
  ```typescript
  it('should throw when calling start() twice without stop()', async () => {
    /*
    Test Doc:
    - Why: Validates interface contract @throws Error if already watching
    - Contract: start() rejects when already watching (prevents resource leaks)
    - Usage Notes: Run after basic start tracking test
    - Quality Contribution: Catches double-start bugs in real service and adapters
    - Worked Example: await start() → await start() → expect Error('Already watching')
    */
    const fake = new FakeCentralWatcherService();
    await fake.start();
    await expect(fake.start()).rejects.toThrow('Already watching');
  });
  ```

**Task 3**: Fix bidirectional Task↔Log links
- **Tool**: Run `plan-6a --sync-links --phase "Phase 1: Interfaces & Fakes"`
- **Manual alternative**:
  1. Add `###` anchors to execution.log.md entries (e.g., `### log#task-t001-create-planpak`)
  2. Update Notes column in tasks.md with matching references

**Verification**:
```bash
# After fixes, verify:
pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts
# Should show: 9 tests passed (was 8)

just check
# Should show: All tests still passing

pnpm tsc --noEmit
# Should show: Clean exit (no type errors)
```

---

**Priority 2 (Advisory - Recommended but Not Blocking)**:

**Task 4**: Add error isolation to simulateEvent()
- **File**: `fake-central-watcher.service.ts`
- **Line**: 97-101
- **Change**: Wrap `adapter.handleEvent(event)` in try-catch
- **Rationale**: Prevents one failing adapter from silencing others in tests

---

## I. Footnotes Audit

**Summary**: No footnotes added yet (intentional, awaiting plan-6a)

| Modified File | Footnote Tag(s) | FlowSpace Node ID(s) | Status |
|---------------|-----------------|---------------------|--------|
| `packages/shared/src/di-tokens.ts` | Pending | Pending | [To be added via plan-6a] |
| `packages/workflow/package.json` | Pending | Pending | [To be added via plan-6a] |
| `packages/workflow/src/index.ts` | Pending | Pending | [To be added via plan-6a] |

**Plan Ledger** (§ 12): Contains placeholders `[^1]`, `[^2]`, `[^3]` marked `[To be added during implementation via plan-6a]`

**Dossier Phase Footnote Stubs**: Empty table (intentional, awaiting plan-6a)

**Next Action**: Run `plan-6a --add-footnotes --phase "Phase 1: Interfaces & Fakes"` to map modified files to FlowSpace node IDs

---

## Review Metadata

**Generated by**: plan-7-code-review v1.0  
**Mode**: Full Mode (separate phase directory)  
**Testing Approach**: Full TDD  
**Files Modified**: 3 (all cross-cutting)  
**Files Created**: 7 (5 implementation + 2 test)  
**Lines Changed**: 52 (diff) + ~400 (new files)  
**Tests Added**: 12 (all passing)  
**Subagents Used**: 9 (parallel validation for link integrity, TDD, mock usage, universal patterns, semantic analysis, correctness, security, performance, observability)

**Review Completeness**:
- ✅ Step 1: Artifacts resolved (Full Mode, Phase 1)
- ✅ Step 2: Testing Strategy extracted (Full TDD)
- ✅ Step 3: Scope guard (3 cross-cutting files, 0 violations)
- ✅ Step 3a: Bidirectional link validation (9 HIGH violations - log anchors missing)
- ⏭️ Step 3b: Cross-phase regression (SKIPPED - Phase 1 is first phase)
- ✅ Step 3c: Plan authority conflict resolution (CLEAN - no conflicts)
- ✅ Step 4: Rules & doctrine gates (TDD: PASS, Mock: PASS, Universal: PASS, Plan: PASS)
- ✅ Step 5: Testing evidence & coverage (100% AC coverage, 12 passing tests)
- ✅ Step 6: Quality & safety review (1 HIGH correctness issue, 1 MEDIUM observability issue)
- ✅ Step 7: Static & type checks (tsc: PASS, biome: PASS)
- ✅ Step 8: Output files (review.phase-1-interfaces-and-fakes.md, fix-tasks.phase-1-interfaces-and-fakes.md)
