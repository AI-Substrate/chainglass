# Fix Tasks: Phase 2: TDD — Path Engine & Contract Tests

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add required Test Doc blocks to all new tests
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts
- **Issue**: New tests do not include mandatory 5-field Test Doc comments (`R-TEST-002`).
- **Fix**: Add `Test Doc` comments (Why, Contract, Usage Notes, Quality Contribution, Worked Example) inside each `it(...)` block.
- **Patch hint**:
  ```diff
   it('parses domain:property', () => {
  +  /*
  +  Test Doc:
  +  - Why: Ensure singleton path shape is stable and regression-safe.
  +  - Contract: parsePath('domain:property') returns domain/property with null instanceId.
  +  - Usage Notes: Use for singleton domains only; instanceId appears only in 3-segment form.
  +  - Quality Contribution: Catches parser regressions in segment interpretation.
  +  - Worked Example: worktree:active-file -> { domain:'worktree', instanceId:null, property:'active-file' }
  +  */
      const result = parsePath('worktree:active-file');
   ```

### FT-002: Strengthen contract C05 fan-out assertion
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts
- **Issue**: C05 does not prove the throwing subscriber was invoked; broken subscriber fan-out could pass.
- **Fix**: Track and assert thrower invocation, and keep assertion that non-throwing subscriber still receives event.
- **Patch hint**:
  ```diff
   it('C05: throwing subscriber does not block other subscribers', () => {
     registerTestDomain(service);
     const received: string[] = [];
  +  let throwerCalled = false;
 
     service.subscribe('test-domain:wf-1:status', () => {
  +    throwerCalled = true;
       throw new Error('subscriber explosion');
     });
     service.subscribe('test-domain:wf-1:status', (change) => {
       received.push(change.value as string);
     });
 
     service.publish('test-domain:wf-1:status', 'running');
  +  expect(throwerCalled).toBe(true);
     expect(received).toEqual(['running']);
   });
  ```

### FT-003: Capture RED→GREEN evidence for Full TDD claims
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md
- **Issue**: Execution log contains GREEN evidence but no explicit RED failing-first evidence.
- **Fix**: Add command/output snippets showing failing runs before implementation and passing runs after implementation for parser/matcher/contract targets.
- **Patch hint**:
  ```diff
   ## T001: Path Parser Unit Tests
  +**RED Evidence**:
  +```
  +$ npx vitest run test/unit/web/state/path-parser.test.ts
  +✗ [expected failure summary before implementation]
  +```
  +
   **Evidence**:
   ```
   $ npx vitest run test/unit/web/state/path-parser.test.ts
   ✓ 25 tests passed (25)
   ```
  ```

## Medium / Low Fixes

### FT-004: Replace relative cross-package imports with public alias imports
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts
- **Issue**: Imports use `../../..../packages/shared/src/...`, violating `R-CODE-004`.
- **Fix**: Import from public exports (for example `@chainglass/shared/state`), adding barrel exports if needed.
- **Patch hint**:
  ```diff
  -import { parsePath } from '../../../../packages/shared/src/state/path-parser';
  +import { parsePath } from '@chainglass/shared/state';
  ```

### FT-005: Update `_platform/state` domain documentation for Phase 2
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md
- **Issue**: Domain history/composition/source listing is stale for Phase 2 artifacts.
- **Fix**: Add `053-P2` history entry and list new Phase 2 tests.
- **Patch hint**:
  ```diff
   | 053-P1 | Phase 1 implemented: types, IStateService interface, path parser ... | 2026-02-26 |
  +| 053-P2 | Phase 2 implemented: path parser tests, path matcher tests, contract test factory. | 2026-02-27 |
  ```

### FT-006: Assert descriptive error content for C11
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts
- **Issue**: C11 only asserts throw presence; it does not enforce descriptive messaging quality.
- **Fix**: Assert message text includes unregistered domain/path context.
- **Patch hint**:
  ```diff
   it('C11: publish to unregistered domain throws', () => {
  -  expect(() => service.publish('unknown:wf-1:status', 'val')).toThrow();
  +  expect(() => service.publish('unknown:wf-1:status', 'val')).toThrow(/unknown|unregistered/i);
   });
  ```

### FT-007: Improve contract-evidence traceability for AC-34/AC-35 mapping
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md
- **Issue**: AC-level evidence mapping is implied but not explicit.
- **Fix**: Add explicit AC mapping lines under each task evidence block and note Phase 3 runner dependency for AC-34.
- **Patch hint**:
  ```diff
   **Runner**: Will be created in Phase 3 when real + fake implementations exist.
  +**AC Mapping**:
  +- AC-34: Contract suite defined in this phase; execution against real+fake deferred to Phase 3.
  +- AC-35: Parser/matcher unit tests executed and passing in this phase.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
