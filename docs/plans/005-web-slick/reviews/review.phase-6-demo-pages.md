# Phase 6: Demo Pages – Code Review Report

**Review Date**: 2026-01-23
**Plan**: [../web-slick-plan.md](../web-slick-plan.md)
**Phase Dossier**: [../tasks/phase-6-demo-pages/tasks.md](../tasks/phase-6-demo-pages/tasks.md)
**Execution Log**: [../tasks/phase-6-demo-pages/execution.log.md](../tasks/phase-6-demo-pages/execution.log.md)
**Diff Base**: 35488b6 (Phase 5 SSE infrastructure)
**Diff Head**: Working tree (uncommitted Phase 6 changes)

---

## A) Verdict

# ⚠️ REQUEST_CHANGES

**Reason**: Multiple HIGH severity issues found in graph integrity (missing footnotes), mock usage policy, and code correctness. The implementation is functionally complete and passes all quality gates, but documentation/traceability artifacts and some code quality issues must be addressed before merge.

**Blocking Issues** (must fix):
1. **Graph Integrity**: Phase 6 footnotes missing from Change Footnotes Ledger (plan-6a not run)
2. **Mock Policy**: `vi.mock('next/navigation')` in dashboard-navigation.test.tsx violates policy
3. **Correctness**: Position calculation logic in kanban drag-drop has off-by-one risk

---

## B) Summary

Phase 6 successfully implements the ReactFlow Workflow Visualization and Kanban Board demo pages with the following deliverables:

- **WorkflowPage** (`/workflow`): Custom node types (WorkflowNode, PhaseNode, AgentNode), interactive ReactFlow graph with pan/zoom controls, node detail panel via shadcn Sheet
- **KanbanPage** (`/kanban`): Drag-and-drop columns/cards via dnd-kit, keyboard accessibility (Space→Arrow→Space), SSE integration for real-time updates
- **Tests**: 15 new integration tests (7 workflow + 8 kanban), 323 total tests passing
- **Quality Gates**: Typecheck ✓, Lint ✓, Build ✓

**TDD Compliance**: ✅ EXCELLENT - Strict test-first discipline with documented RED→GREEN cycles.

**Key Technical Decisions**:
- DYK-02: Client wrapper pattern (WorkflowContent.tsx, KanbanContent.tsx) preserves server component pages
- DYK-06: Custom node types in DEMO_FLOW fixture (workflow|phase|agent)
- DYK-08: Keyboard testing only in jsdom (pointer drag unreliable)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior)
- [ ] Mock usage matches spec: Targeted mocks - **FAIL**: vi.mock() on app module detected
- [x] Negative/edge cases covered

**Universal**:
- [x] BridgeContext patterns followed (client boundary, no Node modules in client)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (via @/ alias)

**Graph Integrity**:
- [ ] Task↔Log links present - **FAIL**: Missing log anchors in Notes column
- [ ] Task↔Footnote links present - **FAIL**: No footnotes created for Phase 6
- [ ] Plan↔Dossier synchronized - **FAIL**: Plan shows [ ] while dossier shows [x]
- [x] Parent↔Subtask links (N/A - no subtasks)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | CRITICAL | tasks.md, plan.md | Phase 6 footnotes missing from Change Footnotes Ledger | Run `plan-6a-update-progress` to populate footnotes [^16]+ |
| LINK-002 | CRITICAL | tasks.md, execution.log.md | Missing bidirectional Task↔Log links | Add log anchors to Notes column; add metadata to log entries |
| LINK-003 | CRITICAL | plan.md, tasks.md | Plan shows [ ] while dossier shows [x] for all tasks | Run `plan-6a` to sync task statuses |
| MOCK-001 | CRITICAL | dashboard-navigation.test.tsx:19-31 | vi.mock('next/navigation') violates policy | Replace with test wrapper pattern |
| MOCK-002 | HIGH | workflow-page.test.tsx, kanban-page.test.tsx | Duplicate browser API mocks (ResizeObserver, matchMedia) | Extract to shared setup file |
| SEC-001 | CRITICAL | useSSE.ts:109 | SSE messages parsed without Zod validation | Add sseEventSchema.parse() after JSON.parse |
| SEC-002 | HIGH | workflow-content.tsx:68 | Unvalidated sseChannel in URL | Add regex validation matching server-side |
| CORR-001 | HIGH | kanban-content.tsx:96-120 | Position calculation doesn't handle insertion direction | Add direction logic for same-column moves |
| CORR-002 | HIGH | useBoardState.ts:83-84 | splice position not bounds-checked | Add Math.max/min bounds check |
| PERF-001 | HIGH | workflow-content.tsx:127-140 | Inline functions in MiniMap props | Extract to useCallback |
| PERF-003 | MEDIUM | workflow-content.tsx:30-34 | nodeTypes recreated inside component | Move outside component |
| PERF-005 | MEDIUM | kanban-content.tsx:72-81 | sensors recreated on every render | Wrap in useMemo |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: Not executed (prior phases stable; no test failures detected in 323 passing tests)

Phase 6 builds on Phases 4-5 hooks and SSE infrastructure. All prior phase tests continue to pass, indicating no regression.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

**Task↔Log Validator** (CRITICAL):
- All 9 completed tasks missing `log#anchor` links in Notes column
- Execution log entries lack **Dossier Task** and **Plan Task** metadata headers
- Zero bidirectional links established between tasks and execution evidence

**Task↔Footnote Validator** (CRITICAL):
- Plan § 12 Change Footnotes Ledger ends at [^15] (Phase 5)
- No Phase 6 footnotes ([^16]+) created
- Dossier Phase Footnote Stubs table is empty
- DYK references (DYK-02, DYK-06, etc.) not formalized as footnotes

**Plan↔Dossier Sync Validator** (CRITICAL):
- Task count mismatch: Plan has 11 tasks (6.1-6.11) vs dossier has 9 (T001-T009)
- Status mismatch: All plan tasks [ ] vs all dossier tasks [x]
- No execution log anchors ([📋] links) in plan Log column

**Resolution**: Run `/plan-6a-update-progress` to:
1. Update plan task statuses to [x]
2. Add footnotes [^16]+ to Change Footnotes Ledger
3. Populate dossier Phase Footnote Stubs
4. Add log anchors to task Notes columns

#### TDD Compliance (PASS)

TDD discipline fully verified:
- T001 (WorkflowPage tests) preceded T002-T004 (implementation)
- T005 (KanbanPage tests) preceded T006-T007 (implementation)
- RED phases documented with failing test errors
- GREEN phases documented with passing test counts
- Test files include comprehensive Test Doc blocks

#### Mock Usage Compliance (FAIL)

**Policy**: Targeted mocks (fakes preferred)

**Violations**:
1. **MOCK-001 (CRITICAL)**: `vi.mock('next/navigation')` in dashboard-navigation.test.tsx violates policy prohibiting vi.mock() on application modules
2. **MOCK-002 (HIGH)**: ResizeObserver and matchMedia mocks duplicated across 3 test files

**Positives**:
- DEMO_FLOW and DEMO_BOARD real fixtures properly used
- DndTestWrapper follows test infrastructure pattern (fake, not mock)

### E.2) Quality & Safety Analysis

**Safety Score: 45/100** (CRITICAL: 1, HIGH: 4, MEDIUM: 4, LOW: 2)
**Verdict: REQUEST_CHANGES**

#### Security Findings

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| SEC-001 | CRITICAL | SSE messages parsed without Zod validation | Add `sseEventSchema.parse(data)` in useSSE.ts |
| SEC-002 | HIGH | Unvalidated sseChannel in workflow-content.tsx | Add `/^[a-zA-Z0-9_-]+$/` regex validation |
| SEC-003 | HIGH | Unvalidated sseChannel in kanban-content.tsx | Add client-side validation for defense-in-depth |

#### Correctness Findings

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| CORR-001 | HIGH | Position calculation doesn't account for insertion direction | Add direction logic for same-column moves |
| CORR-002 | HIGH | splice position not bounds-checked in useBoardState | Add `Math.max(0, Math.min(position, array.length))` |
| CORR-003 | MEDIUM | Redundant statusMap in workflow-content.tsx | Remove and use phase directly |
| CORR-004 | MEDIUM | Missing fallback for invalid status values | Add fallback: `statusLabels[status] ?? 'Unknown'` |

#### Performance Findings

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| PERF-001 | HIGH | Inline functions in MiniMap nodeStrokeColor/nodeColor | Extract to useCallback |
| PERF-002 | HIGH | handleNodeClick not memoized | Wrap in useCallback |
| PERF-003 | MEDIUM | nodeTypes object inside component | Move outside component |
| PERF-004 | MEDIUM | cardIds array recreated in KanbanColumn | Wrap in useMemo |
| PERF-005 | MEDIUM | sensors recreated in KanbanContent | Wrap in useMemo |
| PERF-006 | MEDIUM | handleDragEnd not memoized | Wrap in useCallback |

### E.3) Plan Compliance

**Status**: ✅ PASS - All 9 tasks fully implemented

| Task | Status | Notes |
|------|--------|-------|
| T001 | PASS | 7 WorkflowPage integration tests |
| T002 | PASS | 3 custom node components with React.memo |
| T003 | PASS | WorkflowContent with ReactFlowProvider |
| T004 | PASS | NodeDetailPanel with shadcn Sheet |
| T005 | PASS | 8 KanbanPage tests + DndTestWrapper |
| T006 | PASS | KanbanColumn/KanbanCard with useSortable |
| T007 | PASS | KanbanContent with DndContext |
| T008 | PASS | SSE integration in both pages |
| T009 | PASS | All quality gates pass |

**Acceptance Criteria Met**:
- AC-9 to AC-12: WorkflowPage (interactive graph, pan/zoom, node details, distinct node types) ✓
- AC-13 to AC-17: KanbanPage (multi-column, drag between, reorder, keyboard, real-time) ✓

**Scope Creep**: None detected. All changes confined to Phase 6 target paths.

### E.4) Doctrine Evolution Recommendations

**New Rules Candidates**:
1. **Test Infrastructure Pattern**: DndTestWrapper demonstrates proper test fake pattern. Consider documenting in idioms.md as reference for future drag-drop tests.
2. **Client Boundary Pattern**: WorkflowContent/KanbanContent client wrapper pattern should be documented for RSC/client component separation.

**ADR Considerations**:
- ADR-0005 (seed): Consider documenting ReactFlow integration patterns (nodeTypes, custom nodes, context providers)
- ADR-0006 (seed): Consider documenting dnd-kit patterns (sensors, sortable contexts, keyboard accessibility)

---

## F) Coverage Map

**Testing Approach**: Full TDD

| Acceptance Criterion | Test File:Assertion | Confidence |
|---------------------|---------------------|------------|
| AC-9: Interactive workflow graph | workflow-page.test.tsx:59-90 | 100% explicit |
| AC-10: Pan and zoom | workflow-page.test.tsx:125-151 | 100% explicit |
| AC-11: Node detail panel | workflow-page.test.tsx:155-191 | 100% explicit |
| AC-12: Distinct node types | workflow-page.test.tsx:92-121, 195-245 | 100% explicit |
| AC-13: Multi-column board | kanban-page.test.tsx:50-69 | 100% explicit |
| AC-14: Drag between columns | kanban-page.test.tsx:163-183 | 75% behavioral |
| AC-15: Reorder within column | kanban-page.test.tsx:163-183 | 75% behavioral |
| AC-16: Keyboard accessibility | kanban-page.test.tsx:96-159 | 100% explicit |
| AC-17: Real-time updates | SSE integration via sseChannel prop | 75% behavioral |

**Overall Coverage Confidence**: 91%

---

## G) Commands Executed

```bash
# Quality gates verification
pnpm vitest run                     # 323 tests passed
pnpm exec tsc --noEmit              # Clean
pnpm exec biome check --write .     # Clean (2 auto-fixed)
pnpm turbo run build                # Success

# Diff generation
git diff --unified=3 HEAD
```

---

## H) Decision & Next Steps

**Decision**: REQUEST_CHANGES

**Required Before Merge** (Priority Order):

1. **Run `/plan-6a-update-progress`** to fix graph integrity:
   - Add Phase 6 footnotes [^16]+ to plan Change Footnotes Ledger
   - Sync plan task statuses to [x]
   - Add log anchors to dossier Notes column

2. **Fix security issues**:
   - Add Zod validation in useSSE.ts (SEC-001)
   - Add sseChannel validation in components (SEC-002, SEC-003)

3. **Fix correctness issues**:
   - Add bounds checking in useBoardState.ts (CORR-002)
   - Review position calculation logic (CORR-001)

4. **Fix mock policy violation**:
   - Replace vi.mock('next/navigation') with test wrapper

5. **Performance improvements** (recommended but not blocking):
   - Add useCallback/useMemo where identified
   - Move nodeTypes outside component

**After Fixes**: Rerun `/plan-6-implement-phase` for fix verification, then rerun `/plan-7-code-review`.

---

## I) Footnotes Audit

| Diff Path | Task | Footnote | Status |
|-----------|------|----------|--------|
| apps/web/app/(dashboard)/workflow/page.tsx | T003 | - | ❌ Missing |
| apps/web/app/(dashboard)/kanban/page.tsx | T007 | - | ❌ Missing |
| apps/web/src/components/workflow/*.tsx | T002-T004 | - | ❌ Missing |
| apps/web/src/components/kanban/*.tsx | T006-T007 | - | ❌ Missing |
| apps/web/src/data/fixtures/flow.fixture.ts | T002 | - | ❌ Missing |
| apps/web/src/hooks/useFlowState.ts | T009 | - | ❌ Missing |
| test/integration/web/*.test.tsx | T001, T005 | - | ❌ Missing |
| test/fakes/dnd-test-wrapper.tsx | T005 | - | ❌ Missing |

**Action Required**: Run `/plan-6a-update-progress` to populate footnotes.

---

*Review generated by plan-7-code-review*
*Reviewer: AI Code Review Agent*
