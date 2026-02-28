# Fix Tasks: Phase 1: NodeStatusResult + Display Status

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add Test Doc blocks to display-status tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts
- **Issue**: New tests violate R-TEST-002/R-TEST-003 because required 5-field Test Doc comments are missing.
- **Fix**: Add complete Test Doc blocks to each added `it(...)` and keep one behavior per test.
- **Patch hint**:
  ```diff
   it('returns awaiting-input for user-input + pending + ready', () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
      expect(getDisplayStatus('user-input', 'pending', true)).toBe('awaiting-input');
   });
  ```

### FT-002: Add Test Doc blocks to discriminated status tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/status.test.ts
- **Issue**: New Plan 054 discriminated NodeStatusResult tests are undocumented per required Test Doc format.
- **Fix**: Add 5-field Test Doc comments to each newly added `it(...)` under `describe('discriminated NodeStatusResult', ...)`.
- **Patch hint**:
  ```diff
   it('returns UserInputNodeStatus with userInput config for user-input units', async () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
      const loader = createFakeUnitLoader([userInputUnit]);
   });
  ```

### FT-003: Add Test Doc block to Format A collateInputs regression test
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts
- **Issue**: New Format A regression coverage lacks mandatory Test Doc block.
- **Fix**: Add a complete Test Doc block for the new wrapper-resolution test.
- **Patch hint**:
  ```diff
   it('resolves available when data.json uses Format A wrapper', async () => {
  +  /*
  +  Test Doc:
  +  - Why: Prevent regression on wrapped outputs format.
  +  - Contract: collateInputs resolves outputs[name] with backward-compatible fallback.
  +  - Usage Notes: Uses writeNodeData helper writing { outputs: {...} }.
  +  - Quality Contribution: Catches data-shape mismatch between writer and reader.
  +  - Worked Example: outputs.spec.value='The spec content' becomes available downstream.
  +  */
      // Setup...
   });
  ```

## Medium / Low Fixes

### FT-004: Reconcile Domain Manifest with actual phase file delta
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
- **Issue**: Not all changed non-artifact files are represented in Domain Manifest.
- **Fix**: Add missing files (or remove unintended scope) so manifest maps every changed file.
- **Patch hint**:
  ```diff
   | `packages/positional-graph/src/services/input-resolution.ts` | _platform/positional-graph | internal | ... |
  +| `packages/positional-graph/src/adapter/instance-workunit.adapter.ts` | _platform/positional-graph | internal | Build discriminated unit variants from YAML |
  +| `packages/positional-graph/src/interfaces/index.ts` | _platform/positional-graph | contract | Export new union/guard contracts |
  +| `dev/test-graphs/shared/helpers.ts` | dev/test-graphs | internal | Keep discriminated loader helper aligned |
  ```

### FT-005: Update workflow-ui domain documentation for Plan 054 Phase 1
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
- **Issue**: Domain history/composition/source listings are stale relative to new display-status behavior.
- **Fix**: Add a Plan 054 history row and include display-status helper/awaiting-input mapping in composition/source sections.
- **Patch hint**:
  ```diff
   | Plan 050 Phase 7 | ... | 2026-02-27 |
  +| Plan 054 Phase 1 | Added display-status helper and awaiting-input badge mapping on node cards | 2026-02-27 |
  ```

### FT-006: Update positional-graph domain documentation + Concepts section
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md
- **Issue**: Domain docs do not reflect discriminated `NarrowWorkUnit`/`NodeStatusResult` contract changes; Concepts section missing.
- **Fix**: Add Plan 054 history entry, update contracts/composition notes, and add `## Concepts` table.
- **Patch hint**:
  ```diff
  +## Concepts
  +| Concept | Entry Point | What It Does |
  +|---------|-------------|--------------|
  +| Node status variants | NodeStatusResult | Discriminated union by unitType |
  +| Work unit variants | NarrowWorkUnit | Discriminated union by type |
  +| User-input guards | isNarrowUserInputUnit / isUserInputNodeStatus | Safe narrowing for user-input paths |
  ```

### FT-007: Strengthen hybrid testing evidence in execution log
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md
- **Issue**: T004 RED step and AC-tagged evidence traceability are not explicit.
- **Fix**: Add explicit failing command/output before fix and AC-tagged evidence references.
- **Patch hint**:
  ```diff
   ## Stage 2: Discriminated Type Unions (T005–T012)
  +**T004 (RED)**: [command] -> failing assertion ...
  +**T004 (GREEN)**: [command] -> pass after implementation ...
  +**AC mapping**: AC-01 -> ..., AC-02 -> ..., AC-15 -> ...
  ```

### FT-008: Add explicit STATUS_MAP contract assertion
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts
- **Issue**: T015 requests display status + STATUS_MAP confidence; current tests focus only on `getDisplayStatus`.
- **Fix**: Add one test that validates awaiting-input display label/color contract via exported mapping or card-props path.
- **Patch hint**:
  ```diff
  +it('surfaces Awaiting Input badge contract in card props', () => {
  +  // assert nodeStatusToCardProps(...).status === 'awaiting-input' and rendered label contract
  +});
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
