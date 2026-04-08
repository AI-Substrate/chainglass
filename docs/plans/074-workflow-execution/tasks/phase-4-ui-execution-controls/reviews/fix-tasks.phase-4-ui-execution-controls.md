# Fix Tasks: Phase 4: UI Execution Controls

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Close execution-lock bypasses in `WorkflowEditor`
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-line.tsx _(if helper reuse changes)_
- **Issue**: Phase 4's lock is only enforced inside `WorkflowLine`. `WorkflowEditor` still deletes `selectedNodeId` on Backspace and still opens the node edit modal regardless of execution-aware editability.
- **Fix**: Derive `selectedNodeEditable` from the selected node's containing line via `isLineEditable(line, execution.status)` and gate the Backspace handler, `handleDeleteNode`, and `onEditProperties` on that boolean. Add a regression test proving a locked node cannot be mutated through those paths.
- **Patch hint**:
  ```diff
  + import { isLineEditable } from './workflow-line';
  ...
  + const selectedNodeLine = useMemo(
  +   () => graphStatus.lines.find((line) => line.nodes.some((n) => n.nodeId === selectedNodeId)) ?? null,
  +   [selectedNodeId, graphStatus.lines]
  + );
  + const selectedNodeEditable = selectedNodeLine
  +   ? isLineEditable(selectedNodeLine, execution.status)
  +   : false;
  ...
  - if (e.key === 'Backspace' && selectedNodeId) {
  + if (e.key === 'Backspace' && selectedNodeId && selectedNodeEditable) {
      e.preventDefault();
      handleDeleteNode(selectedNodeId);
    }
  ...
  - onEditProperties={() => setEditModalNodeId(selectedNodeId)}
  + onEditProperties={selectedNodeEditable && selectedNodeId ? () => setEditModalNodeId(selectedNodeId) : undefined}
  ```

### FT-002: Add mandatory Test Doc blocks to all new durable tests
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-button-state.test.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts
- **Issue**: All 28 new tests omit the required 5-field Test Doc comment mandated by `docs/project-rules/rules.md` §§ `R-TEST-002` / `R-TEST-003` and `docs/project-rules/constitution.md` §3.2.
- **Fix**: Add a full Test Doc block inside every `it(...)` case. Use the exact 5 required fields: Why, Contract, Usage Notes, Quality Contribution, Worked Example.
- **Patch hint**:
  ```diff
    it('idle: Run visible+enabled, Stop hidden, Restart hidden', () => {
  +   /*
  +   Test Doc:
  +   - Why: Protect the Phase 4 toolbar state machine for idle workflows.
  +   - Contract: deriveButtonState('idle', null, false) exposes only an enabled Run button.
  +   - Usage Notes: This is the source-of-truth pure utility used by WorkflowTempBar.
  +   - Quality Contribution: Catches regressions where idle workflows show the wrong controls.
  +   - Worked Example: status='idle' -> run.visible=true, stop.visible=false, restart.visible=false.
  +   */
        const state = deriveButtonState('idle', null, false);
        expect(state.run).toEqual({ visible: true, enabled: true, label: 'Run' });
      });
  ```

### FT-003: Resolve domain ownership for the 074 execution-support tree
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-button-state.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md _(only if you keep this as a separate domain)_
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md _(only if you keep this as a separate domain)_
- **Issue**: The new Phase 4 files were added under `apps/web/src/features/074-workflow-execution/`, but no registered domain currently claims that tree.
- **Fix**: Choose one owner and make all artifacts consistent. Preferred options:
  1. Move the hook/utility under `workflow-ui`'s declared tree (`apps/web/src/features/050-workflow-page/{hooks,lib}/`), or
  2. Explicitly claim `apps/web/src/features/074-workflow-execution/` in `workflow-ui/domain.md` and update the plan's Domain Manifest accordingly, or
  3. Formalize/register/map a real separate domain if that is truly intended.
- **Patch hint**:
  ```diff
  - Primary: `apps/web/src/features/050-workflow-page/`
  + Primary: `apps/web/src/features/050-workflow-page/`
  + Supporting: `apps/web/src/features/074-workflow-execution/` — execution hook + button-state utility
  ...
  + | `apps/web/src/features/074-workflow-execution/` | Execution control support | `useWorkflowExecution`, `deriveButtonState`, execution action wiring |
  ```

## Medium / Low Fixes

### FT-004: Add direct evidence for hook and UI wiring
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/execution.log.md
- **Issue**: The phase's actual evidence is limited to pure-function tests. There is no direct proof for mount hydration, GlobalState merge behavior, Run/Stop/Restart callback wiring, progress rendering, or undo/redo disablement.
- **Fix**: Add lightweight hook/component coverage (or equivalent browser evidence) for `useWorkflowExecution`, `WorkflowTempBar`, and `WorkflowEditor`, then append the exact commands/artifacts to `execution.log.md`.
- **Patch hint**:
  ```diff
  + renderHook(() => useWorkflowExecution({ workspaceSlug: 'ws', worktreePath: '/tmp/wt', graphSlug: 'graph' }))
  + render(<WorkflowTempBar executionStatus="running" buttonState={...} iterations={3} lastMessage="step" />)
  + expect(screen.getByTestId('execution-status-badge')).toHaveTextContent('Running')
  + expect(screen.getByTestId('undo-button')).toBeDisabled()
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
