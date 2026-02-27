# Fix Tasks: Phase 5: Q&A + Node Properties Modal + Undo/Redo

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Wire real snapshot capture and undo/redo payloads
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-mutations.ts
- **Issue**: Undo/redo currently receives placeholder snapshots (`nodeConfigs: {}`) and no pre-mutation snapshot capture is wired.
- **Fix**: Capture a full `WorkflowSnapshot` (definition + nodeConfigs) before every mutation and pass real current snapshot data to `undo()`/`redo()`.
- **Patch hint**:
  ```diff
  - onUndo={() => undoRedo.undo({ definition, nodeConfigs: {} })}
  - onRedo={() => undoRedo.redo({ definition, nodeConfigs: {} })}
  + onUndo={() => undoRedo.undo(buildCurrentSnapshot())}
  + onRedo={() => undoRedo.redo(buildCurrentSnapshot())}
  ```

### FT-002: Make restore failures transactional to undo state
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-undo-redo.ts
- **Issue**: `onRestore` currently ignores action errors, allowing stack transitions to proceed even when restore fails.
- **Fix**: Propagate restore failures and only finalize undo/redo stack mutation after successful restore (or rollback stack state on failure).
- **Patch hint**:
  ```diff
  - if (result.graphStatus) setGraphStatus(result.graphStatus)
  + if (result.errors.length > 0) throw new Error(result.errors[0]?.message ?? 'restore failed')
  + if (result.graphStatus) setGraphStatus(result.graphStatus)
  ```

### FT-003: Provide Full TDD evidence and missing phase tests
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/execution.log.md
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/qa-modal.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/node-edit-modal.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/undo-redo-manager.test.ts
- **Issue**: Current evidence does not satisfy spec-mandated Full TDD and lacks AC-35 verification artifacts.
- **Fix**: Add/confirm Phase 5 test coverage and log red→green→refactor evidence with exact commands and outcomes.
- **Patch hint**:
  ```diff
  + ## T001 ...
  + - RED: <failing test command + output>
  + - GREEN: <passing test command + output>
  + - REFACTOR: <notes>
  ```

## Medium / Low Fixes

### FT-004: Persist freeform Q&A content
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts
- **Issue**: Editor forwards only `structured` answer; freeform notes are dropped.
- **Fix**: Include freeform payload in action contract and persist through service call schema.
- **Patch hint**:
  ```diff
  - onAnswer={async ({ structured }) => {
  + onAnswer={async ({ structured, freeform }) => {
      ...
  -   structured,
  +   { structured, freeform },
  ```

### FT-005: Add atomicity/rollback for restoreSnapshot writes
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts
- **Issue**: Sequential graph/node writes can leave partial restore state on failure.
- **Fix**: Add atomic temp-write/swap strategy or rollback to previous persisted snapshot on write failure.
- **Patch hint**:
  ```diff
  - await this.persistGraph(...)
  - for (...) await this.persistNodeConfig(...)
  + const backup = await this.captureSnapshot(...)
  + try { ...writes... } catch (e) { await this.restoreSnapshot(...backup); throw e }
  ```

### FT-006: Resolve AC-23 keyboard shortcut mismatch
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/tasks.md
- **Issue**: Spec AC-23 requires Ctrl+Z/Ctrl+Shift+Z, but current phase tasking dropped keybindings.
- **Fix**: Either implement keyboard shortcuts or formally update spec/plan/task AC mapping to reflect toolbar-only behavior.

### FT-007: Refresh workflow-ui domain artifact
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
- **Issue**: Domain history and source/action inventory are stale through Phase 5.
- **Fix**: Add Phase 4/5 history rows and update source listings for new actions/components.

### FT-008: Sync domain map summary with diagram edges
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: `_platform/workspace-url` consumer summary misses `workflow-ui`.
- **Fix**: Update health summary consumer cell to match mermaid graph.

### FT-009: Reuse/align existing question input capability
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/components/phases/question-input.tsx
- **Issue**: Potential reinvention in question-answer rendering path.
- **Fix**: Evaluate extraction/reuse of shared question-input behavior to reduce divergence.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
