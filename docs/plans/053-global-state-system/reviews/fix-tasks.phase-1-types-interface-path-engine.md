# Fix Tasks: Phase 1: Types, Interface & Path Engine

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add Full TDD evidence for Phase 1 ACs
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-1-types-interface-path-engine/execution.log.md
- **Issue**: Full TDD is required, but no RED→GREEN proof and no per-AC executable outputs are recorded for AC-11/12/15/16/17/18/19/20.
- **Fix**: Add explicit test-first trace: failing tests first, implementation step, then passing tests. Map each AC to concrete test case names and include command outputs.
- **Patch hint**:
  ```diff
  +## Test Evidence (RED → GREEN)
  +
  +### AC-11 / AC-12 / AC-15 (parsePath)
  +$ pnpm vitest test/unit/web/state/path-parser.test.ts --run
  +RED: <failing case names>
  +GREEN: <passing case names>
  +
  +### AC-16..AC-20 (createStateMatcher)
  +$ pnpm vitest test/unit/web/state/path-matcher.test.ts --run
  +RED: <failing case names>
  +GREEN: <passing case names>
  ```

### FT-002: Recompute review diff to be phase-scoped and reproducible
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff
- **Issue**: Current computed diff includes docs + package.json but omits expected Phase 1 implementation/test files, preventing code-level verification.
- **Fix**: Rebuild `_computed.diff` from the actual phase commits or file list in tasks/execution log so parser/matcher/interface/types artifacts are included.
- **Patch hint**:
  ```diff
  -# UNSTAGED_DIFF
  -diff --git a/docs/... b/docs/...
  +# PHASE_1_COMMIT_RANGE
  +git diff <commit-before-phase-1>..HEAD -- \
  +  packages/shared/src/interfaces/state.interface.ts \
  +  packages/shared/src/state/types.ts \
  +  packages/shared/src/state/path-parser.ts \
  +  packages/shared/src/state/path-matcher.ts \
  +  packages/shared/src/state/tokens.ts \
  +  packages/shared/src/state/index.ts \
  +  packages/shared/package.json \
  +  test/unit/web/state/path-parser.test.ts \
  +  test/unit/web/state/path-matcher.test.ts
  ```

## Medium / Low Fixes

### FT-003: Remove cross-plan scope bleed from Phase 1 review set
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
- **Issue**: Unrelated Plan 050 progress update appears in this Phase 1 review diff.
- **Fix**: Move this Plan 050 update to a separate change set or exclude from phase review diff.
- **Patch hint**:
  ```diff
  -| Phase 5: Q&A + Node Properties Modal + Undo/Redo | 📋 Dossier Ready | AC-16,18,19,23,24 |
  +| Phase 5: Q&A + Node Properties Modal + Undo/Redo | Pending | AC-16,18,19,23,24 |
  ```

### FT-004: Align spec scope statements
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
- **Issue**: Domain Notes defer publisher/consumer wiring while AC-38..41 now require in-plan exemplar delivery.
- **Fix**: Update Domain Notes (or AC section) so scope is internally consistent.
- **Patch hint**:
  ```diff
  -This plan implements the `_platform/state` domain infrastructure only. Wiring specific publishers ... will be done in subsequent plans.
  +This plan implements `_platform/state` infrastructure and a worktree publisher/consumer exemplar (AC-38..41).
  ```

### FT-005: Align Phase 1 path-depth wording
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-1-types-interface-path-engine/tasks.md
- **Issue**: Executive briefing references 5-segment support while T003/AC-15 enforce 2/3 segments only.
- **Fix**: Update briefing goal text to match implemented/accepted parser behavior.
- **Patch hint**:
  ```diff
  -- ✅ Path parser handling 2, 3, and 5 segment colon-delimited paths with validation
  +- ✅ Path parser handling 2 and 3 segment colon-delimited paths with validation (4+ rejected)
  ```

### FT-006: Update manifest mapping for changed spec artifact
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
- **Issue**: Spec changes appear in phase diff without explicit Domain Manifest mapping/rationale.
- **Fix**: Add mapping entry for spec document edits (or keep spec edits outside implementation diff).
- **Patch hint**:
  ```diff
  +| `docs/plans/053-global-state-system/global-state-system-spec.md` | `_platform/state` | plan-doc | Clarification + AC updates for implementation scope |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
