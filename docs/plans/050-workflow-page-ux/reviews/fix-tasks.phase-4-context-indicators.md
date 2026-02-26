# Fix Tasks: Phase 4: Context Indicators + Select-to-Reveal

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Implement actionable manual transition gate (AC-17)
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx
- **Issue**: Manual transition gate renders as visual text only; no action callback exists when preceding line is complete.
- **Fix**: Convert manual gate to a button with disabled/enabled semantics and wire callback from canvas/editor to existing transition mutation path.
- **Patch hint**:
  ```diff
  - export interface LineTransitionGateProps { transition: 'auto' | 'manual'; precedingComplete: boolean; }
  + export interface LineTransitionGateProps {
  +   transition: 'auto' | 'manual';
  +   precedingComplete: boolean;
  +   onTrigger?: () => void;
  + }
  ...
  - <span className={...}>🔒 Manual</span>
  + <button type="button" disabled={!precedingComplete} onClick={onTrigger} className={...}>
  +   🔒 Manual
  + </button>
  ```

### FT-002: Complete AC-15 selection trace behavior
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/related-nodes.ts
- **Issue**: Current implementation uses adjacent always-on indicators, not selection-scoped upstream/downstream trace behavior defined in AC-15.
- **Fix**: Render relation-aware trace overlays only when selection exists, with upstream/downstream semantics driven by related-node computation.
- **Patch hint**:
  ```diff
  - {idx > 0 && <ContextFlowIndicator rightNode={node} />}
  + {selectedNodeId && (
  +   <SelectionTrace
  +     nodeId={node.nodeId}
  +     relations={relatedRelationsByNode[node.nodeId]}
  +   />
  + )}
  ```

### FT-003: Add missing AC-15/AC-35 panel coverage and outputs section
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/node-properties-panel.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/related-nodes.test.ts
- **Issue**: Properties panel lacks explicit outputs section and there are no dedicated tests for panel rendering + related-node dimming behavior.
- **Fix**: Add outputs section (or explicit empty-state) and add focused tests for panel sections, upstream/downstream lists, and dimming classification.
- **Patch hint**:
  ```diff
  + <section>
  +   <h4 className="font-medium text-muted-foreground mb-1">Outputs</h4>
  +   {node.outputs?.length ? (...) : <div className="text-muted-foreground">No outputs</div>}
  + </section>
  ```

### FT-004: Restore Full TDD evidence in phase artifacts
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/execution.log.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/tasks.md
- **Issue**: Execution log contains placeholder text only; tasks dossier still shows “Ready for implementation” with unchecked tasks.
- **Fix**: Record per-task RED→GREEN→REFACTOR evidence and command outputs; update task status rows to reflect completed work with evidence linkage.
- **Patch hint**:
  ```diff
  - _Tasks logged as completed._
  + ### T001
  + - RED: <failing test command + output>
  + - GREEN: <passing test command + output>
  + - REFACTOR: <cleanup + re-run evidence>
  + - AC mapping: AC-13
  ```

## Medium / Low Fixes

### FT-005: Update domain documents for phase currency
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
- **Issue**: Domain history/composition and map summary metadata are stale; plan manifest test glob excludes `.test.ts`.
- **Fix**: Add Phase 4 history/composition entries, sync domain-map summary table, and broaden test manifest glob to include `.test.ts`.
- **Patch hint**:
  ```diff
  - | test/unit/web/features/050-workflow-page/*.test.tsx | workflow-ui | test | ...
  + | test/unit/web/features/050-workflow-page/*.test.ts* | workflow-ui | test | ...
  ```

### FT-006: Bring tests into project-rules Test Doc compliance
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/context-badge.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/gate-chip.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx
- **Issue**: Required 5-field Test Doc comments are missing on touched/new tests.
- **Fix**: Add Test Doc comments to all touched test cases per `docs/project-rules/rules.md` R-TEST-002/003.
- **Patch hint**:
  ```diff
  + /*
  + Test Doc:
  + - Why: ...
  + - Contract: ...
  + - Usage Notes: ...
  + - Quality Contribution: ...
  + - Worked Example: ...
  + */
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
