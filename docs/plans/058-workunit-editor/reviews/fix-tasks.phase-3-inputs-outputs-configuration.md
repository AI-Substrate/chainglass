# Fix Tasks: Phase 3: Inputs/Outputs Configuration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Serialize structural saves to prevent stale overwrite
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx
- **Issue**: Structural handlers issue flush/trigger/flush in a way that can produce overlapping whole-array writes, allowing stale payloads to win.
- **Fix**:
  1. Ensure pending debounced save is canceled or superseded before structural save.
  2. Emit exactly one structural save payload per operation.
  3. Guard against out-of-order completion (sequence token or latest-write-wins gate).
- **Patch hint**:
  ```diff
  - flushInputs();
  - triggerInputSave(JSON.stringify(stripped));
  - flushInputs();
  + cancelPendingInputSave(); // or equivalent
  + await saveInputsNow(JSON.stringify(stripped)); // single immediate write
  ```

### FT-002: Enforce mandatory Test Doc blocks in new tests
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts
- **Issue**: Tests violate R-TEST-002 / R-TEST-003 by omitting the 5-field Test Doc format.
- **Fix**:
  1. Add Test Doc block to each `it(...)`.
  2. Include required fields exactly: Why, Contract, Usage Notes, Quality Contribution, Worked Example.
- **Patch hint**:
  ```diff
   it('assigns unique _clientId to each item', () => {
  +  /*
  +  Test Doc:
  +  - Why: Preserve stable sortable identity for drag operations
  +  - Contract: hydrateClientIds returns one unique _clientId per item
  +  - Usage Notes: Input items from server must be hydrated before rendering
  +  - Quality Contribution: Catches identity collisions that break DnD reorder
  +  - Worked Example: [{name:'a'},{name:'b'}] => two distinct _clientId values
  +  */
      ...
   });
  ```

### FT-003: Add missing interaction-level component tests for AC-10/11/14/15
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts
- **Issue**: Current test suite validates helpers only; key UI interactions and reserved/min-output behavior are not covered.
- **Fix**:
  1. Add component tests with React Testing Library and `/Users/jordanknight/substrate/058-workunit-editor/test/fakes/dnd-test-wrapper.tsx`.
  2. Cover add, delete (including last-output block), reorder, reserved locked card behavior, and structural vs field callback flow.
- **Patch hint**:
  ```diff
  +describe('InputOutputCardList interactions', () => {
  +  it('blocks deleting the last output when requireMinOne is true', async () => {
  +    // render list with one output, assert delete disabled
  +  });
  +
  +  it('renders reserved params as locked and non-draggable', async () => {
  +    // render with reservedParams and assert lock/no delete/no drag handle behavior
  +  });
  +});
  ```

## Medium / Low Fixes

### FT-004: Add explicit delete confirmation before removal
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card.tsx
- **Issue**: Delete is immediate; phase task requires confirmation.
- **Fix**: Add confirmation interaction (dialog/popover/confirm state) before invoking `onDelete`.
- **Patch hint**:
  ```diff
  - onClick={onDelete}
  + onClick={() => setConfirmingDelete(true)}
  + // invoke onDelete only after explicit confirm action
  ```

### FT-005: Reuse reserved param contract source
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx
- **Issue**: Reserved params are hardcoded instead of reusing shared contract data.
- **Fix**: Import and derive from positional-graph reserved params source.
- **Patch hint**:
  ```diff
  - function getReservedParams(unitType) { ...hardcoded... }
  + import { RESERVED_INPUT_PARAMS } from '@chainglass/positional-graph';
  + function getReservedParams(unitType) {
  +   // derive by unitType from RESERVED_INPUT_PARAMS
  + }
  ```

### FT-006: Update domain governance artifacts for completed Phase 3
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
- **Issue**: Domain history/concepts and plan manifest are stale for changed Phase 3 scope.
- **Fix**:
  1. Add Phase 3 history entry in domain.md.
  2. Expand Concepts section with input/output list/card + save flow entries.
  3. Add missing changed files to plan Domain Manifest.

### FT-007: Strengthen AC-15 verification path
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card-list.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts
- **Issue**: At-least-one-output enforcement lacks direct behavior verification.
- **Fix**: Add explicit tests for last-output protection and ensure zero-output state cannot persist via structural path.

### FT-008: Improve evidence traceability and correct task filename reference
- **Severity**: LOW
- **File(s)**:  
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/execution.log.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/tasks.md
- **Issue**: Evidence references are declarative and one task path uses `.test.tsx` while actual file is `.test.ts`.
- **Fix**:
  1. Add concrete command outputs/artifact paths in execution.log.
  2. Correct the task table test path extension.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
