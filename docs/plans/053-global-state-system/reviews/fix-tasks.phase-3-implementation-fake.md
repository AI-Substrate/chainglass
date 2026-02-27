# Fix Tasks: Phase 3: Implementation + Fake

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make list() cache invalidation pattern-scoped (AC-26)
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/global-state-system.ts
  - /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts
- **Issue**: `storeVersion` + `listCache.clear()` invalidates all patterns on any change, so non-matching updates still change snapshot references and violate AC-26.
- **Fix**: Invalidate only cache entries whose pattern matches the changed path (or maintain per-pattern match-sensitive versioning).
- **Patch hint**:
  ```diff
   this.store.set(path, entry);
   this.storeVersion++;
  -this.listCache.clear();
  +for (const [pattern] of this.listCache) {
  +  const patternMatcher = createStateMatcher(pattern);
  +  if (patternMatcher(path)) {
  +    this.listCache.delete(pattern);
  +  }
  +}
  ```

### FT-002: Add required Test Doc blocks to unit tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts
- **Issue**: `R-TEST-002` requires a 5-field Test Doc comment in each `it(...)`; current tests omit this.
- **Fix**: Add Test Doc comments (Why, Contract, Usage Notes, Quality Contribution, Worked Example) for each test case.
- **Patch hint**:
  ```diff
   it('stores and retrieves value (AC-01)', () => {
  +  /*
  +  Test Doc:
  +  - Why: Ensure publish/get contract remains stable for cross-domain consumers.
  +  - Contract: publish(path, value) stores value retrievable via get(path).
  +  - Usage Notes: Domain must be registered before publish.
  +  - Quality Contribution: Catches regressions where store write/read diverge.
  +  - Worked Example: publish('test-domain:wf-1:status', 'running') -> get(...) === 'running'
  +  */
     registerMultiDomain(svc);
     svc.publish('test-domain:wf-1:status', 'running');
  ```

## Medium / Low Fixes

### FT-003: Replace deep relative imports with aliases
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts
- **Issue**: Cross-package relative imports violate `R-CODE-004`.
- **Fix**: Use configured aliases (e.g., `@chainglass/web/...`) instead of `../../.../apps/web/...`.
- **Patch hint**:
  ```diff
  -import { GlobalStateSystem } from '../../apps/web/src/lib/state/global-state-system';
  +import { GlobalStateSystem } from '@chainglass/web/lib/state/global-state-system';
  ```

### FT-004: Add direct AC-33 assertions for fake inspection methods
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts
  - /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts
- **Issue**: Fake inspection methods are implemented but not directly validated by tests.
- **Fix**: Add a focused fake test block asserting `getPublished()`, `getSubscribers()`, `wasPublishedWith()`, and `reset()`.
- **Patch hint**:
  ```diff
  +describe('FakeGlobalStateSystem inspection methods (AC-33)', () => {
  +  it('tracks published values and reset lifecycle', () => {
  +    const fake = new FakeGlobalStateSystem();
  +    // register domain, publish, assert getPublished/wasPublishedWith/getSubscribers, then reset()
  +  });
  +});
  ```

### FT-005: Record concrete RED/GREEN evidence in execution log
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/execution.log.md
- **Issue**: Full-TDD claim is currently narrative without failing-first and passing command output snippets.
- **Fix**: Add command outputs (or CI links/IDs) showing RED then GREEN for T001/T003/T004.
- **Patch hint**:
  ```diff
   ### T001: TDD Unit Tests (RED → GREEN)
  +**RED Evidence**:
  +```
  +$ pnpm vitest run test/unit/web/state/global-state-system.test.ts
  +✗ Cannot find module .../global-state-system
  +```
  +
   **GREEN evidence**: All 31 tests pass after T003 implementation.
  ```

### FT-006: Align phase artifacts with touched-file manifest
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.md
- **Issue**: `packages/shared/src/fakes/index.ts` was changed but is not explicitly called out in phase path mapping artifacts.
- **Fix**: Add explicit row/path mention so domain ownership and scope traceability are complete.
- **Patch hint**:
  ```diff
   | `packages/shared/src/fakes/fake-state-system.ts` | `_platform/state` | contract | FakeGlobalStateSystem test double |
  +| `packages/shared/src/fakes/index.ts` | `_platform/state` | contract | Export FakeGlobalStateSystem from fakes barrel |
  ```

### FT-007: Add explicit same-tick publish notification assertion
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts
- **Issue**: Synchronous notification behavior is inferred but not explicitly pinned in a dedicated assertion.
- **Fix**: Add a test that asserts subscriber side effect immediately after `publish()` call without async waits.
- **Patch hint**:
  ```diff
  +it('publish notifies subscribers synchronously', () => {
  +  let called = false;
  +  svc.subscribe('test-domain:wf-1:status', () => { called = true; });
  +  svc.publish('test-domain:wf-1:status', 'running');
  +  expect(called).toBe(true);
  +});
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
