# Fix Tasks: Phase 1: NodeStatusResult + Display Status

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Wire `awaiting-input` into runtime card status
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx
- **Issue**: Runtime mapping returns raw `node.status`, so `awaiting-input` is never surfaced even though helper/map exist.
- **Fix**: Import/use `getDisplayStatus(node.unitType, node.status, node.ready)` in `nodeStatusToCardProps`, then add a test asserting user-input + pending + ready renders `Awaiting Input`.
- **Patch hint**:
  ```diff
  - export function nodeStatusToCardProps(node: NodeStatusResult, lineIndex: number): WorkflowNodeCardProps {
  + export function nodeStatusToCardProps(node: NodeStatusResult, lineIndex: number): WorkflowNodeCardProps {
      return {
        nodeId: node.nodeId,
        unitSlug: node.unitSlug,
        unitType: node.unitType,
  -     status: node.status as NodeStatus,
  +     status: getDisplayStatus(node.unitType, node.status, node.ready) as NodeStatus,
        contextColor: computeContextBadge(node, lineIndex),
        noContext: node.noContext,
        nodeStatus: node,
      };
    }
  ```

### FT-002: Fail fast on malformed `user-input` unit definitions
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/adapter/instance-workunit.adapter.ts
- **Issue**: `type: 'user-input'` without `user_input` silently degrades to `agent`, masking configuration errors.
- **Fix**: Add explicit validation branch for `user-input` type and return a structured `UNIT_LOAD_ERROR` when `user_input` is absent.
- **Patch hint**:
  ```diff
  - if (unitDef.type === 'user-input' && unitDef.user_input) {
  + if (unitDef.type === 'user-input') {
  +   if (!unitDef.user_input) {
  +     return {
  +       errors: [{ message: `Unit '${slug}' has type 'user-input' but is missing user_input config`, code: 'UNIT_LOAD_ERROR' }],
  +     };
  +   }
        const unit: NarrowWorkUnit = {
          ...base,
          type: 'user-input' as const,
          userInput: {
            prompt: unitDef.user_input.prompt,
            questionType: unitDef.user_input.question_type,
            options: unitDef.user_input.options,
            default: unitDef.user_input.default,
          },
        };
        return { unit, errors: [] };
      }
  ```

## Medium / Low Fixes

### FT-003: Add missing discriminated status test evidence (T004)
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/ (appropriate node-status test file)
- **Issue**: No concrete test change proving `getNodeStatus()` returns `UserInputNodeStatus` with `userInput` config via narrowing.
- **Fix**: Add the test and record command output in execution log.
- **Patch hint**:
  ```diff
  + it('returns UserInputNodeStatus with userInput config for user-input units', async () => {
  +   // arrange user-input fixture
  +   // act getNodeStatus()
  +   // assert narrowed userInput.prompt/questionType/options/default
  + });
  ```

### FT-004: Align dev/test graph helpers with strict user-input validation
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/helpers.ts
  - /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/graph-test-runner.ts
- **Issue**: Helpers mirror silent `user-input`→`agent` coercion, hiding malformed fixtures.
- **Fix**: Apply same validation semantics as runtime adapter (error on missing `user_input`).
- **Patch hint**:
  ```diff
  - const type = unit.type === 'code' ? 'code' : unit.type === 'user-input' && unit.user_input ? 'user-input' : 'agent';
  + if (unit.type === 'user-input' && !unit.user_input) {
  +   throw new Error(`Malformed user-input unit '${unit.slug}': missing user_input`);
  + }
  + const type = unit.type === 'code' ? 'code' : unit.type === 'user-input' ? 'user-input' : 'agent';
  ```

### FT-005: Update domain artifacts for Plan 054 Phase 1
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
- **Issue**: Domain history/contracts/composition/concepts/manifest/map metadata lag behind actual changed files/contracts.
- **Fix**: Add Plan 054 history entries, concepts table updates, map refresh, and complete domain manifest coverage.
- **Patch hint**:
  ```diff
  + ## History
  + | Plan | Change | Date |
  + |------|--------|------|
  + | 054 P1 | Discriminated NodeStatusResult/NarrowWorkUnit; awaiting-input display status plumbing | 2026-02-27 |
  +
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + |--------|-------------|--------------|
  + | UserInputNodeStatus | .../positional-graph-service.interface.ts | Carries user-input config in discriminated status variant |
  ```

### FT-006: Add required Test Doc comments per R-TEST-002
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts
- **Issue**: New/changed tests lack mandatory 5-field Test Doc blocks.
- **Fix**: Add Why / Contract / Usage Notes / Quality Contribution / Worked Example in each affected `it(...)`.
- **Patch hint**:
  ```diff
    it('resolves available when data.json uses Format A wrapper', async () => {
  +   /*
  +   Test Doc:
  +   - Why: ...
  +   - Contract: ...
  +   - Usage Notes: ...
  +   - Quality Contribution: ...
  +   - Worked Example: ...
  +   */
      // Arrange...
    });
  ```

### FT-007: Add concrete execution evidence
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md
- **Issue**: Broad pass-count claims are narrative without command transcript snippets.
- **Fix**: Append exact commands and condensed pass/fail outputs (or CI links).
- **Patch hint**:
  ```diff
  + ### Command Evidence
  + - `pnpm --filter @chainglass/positional-graph test` → PASS (1052 passed)
  + - `pnpm --filter @chainglass/positional-graph build` → PASS (0 errors)
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
