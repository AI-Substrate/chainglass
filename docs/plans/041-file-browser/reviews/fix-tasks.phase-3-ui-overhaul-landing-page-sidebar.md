# Fix Tasks — Phase 3: UI Overhaul — Landing Page & Sidebar

## Priority 0 (CRITICAL): Restore traceability graph

### FT-001 — Sync plan Phase 3 task table with dossier
- **Files**:  
  - `docs/plans/041-file-browser/file-browser-plan.md`
- **Issue**: Plan task statuses/log columns are stale (`[ ]`, `-`) while dossier/log show completion.
- **Fix**:
  1. Update Phase 3 rows to final status and include per-task log links.
  2. Ensure Notes include matching footnote refs.
  3. Re-run `/plan-6a-update-progress` for authoritative sync.

### FT-002 — Populate Phase 3 footnote stubs and plan ledger entries
- **Files**:  
  - `docs/plans/041-file-browser/tasks/phase-3-ui-overhaul-landing-page-sidebar/tasks.md`  
  - `docs/plans/041-file-browser/file-browser-plan.md`
- **Issue**: No footnote stubs and no Phase 3 ledger entries for modified files.
- **Fix**:
  1. Add `[^N]` tags in dossier Notes for each changed file/task.
  2. Populate `## Phase Footnote Stubs`.
  3. Add matching Phase 3 entries to `## Change Footnotes Ledger` (with node-ID provenance format).

### FT-003 — Add missing task↔log anchors
- **Files**:  
  - `docs/plans/041-file-browser/tasks/phase-3-ui-overhaul-landing-page-sidebar/tasks.md`
  - `docs/plans/041-file-browser/tasks/phase-3-ui-overhaul-landing-page-sidebar/execution.log.md`
- **Issue**: Completed tasks are not backlinking to execution log anchors.
- **Fix**:
  1. Add `log#...` anchors in dossier Notes.
  2. Verify heading-derived anchors resolve correctly.

## Priority 1 (HIGH): Full TDD + policy compliance

### FT-004 — Remove/justify mock-policy violations in modified tests
- **Files**:
  - `test/unit/web/components/dashboard-sidebar.test.tsx`
  - `test/unit/web/components/navigation/bottom-tab-bar.test.tsx`
  - `test/integration/web/dashboard-navigation.test.tsx`
- **Issue**: Tests use `vi.mock(...)` under phase policy “No mocks. Fakes only.”
- **Fix (tests-first)**:
  1. Replace direct mocks with existing fake/test harnesses where feasible.
  2. If exception is required, add explicit policy-deviation entry in plan + execution log and scope it tightly.

### FT-005 — Complete RED/GREEN/REFACTOR evidence per task
- **Files**:
  - `docs/plans/041-file-browser/tasks/phase-3-ui-overhaul-landing-page-sidebar/execution.log.md`
- **Issue**: Incomplete/uneven TDD cycle evidence.
- **Fix**:
  1. Add explicit RED, GREEN, REFACTOR subsections (or explicit “no-refactor-needed”) for each completed task.
  2. Link each subsection to concrete test evidence.

## Priority 2 (HIGH): Missing phase deliverables

### FT-006 — Implement workspace identity in sidebar header
- **Files**:
  - `apps/web/src/components/dashboard-sidebar.tsx`
  - related tests
- **Issue**: Header currently renders slug string; does not meet emoji + name identity requirement.
- **Fix (test-first)**:
  1. Add tests asserting emoji + display name in workspace context.
  2. Wire identity data into sidebar and render fallback behavior.

### FT-007 — Wire `useAttentionTitle` into real workspace pages
- **Files**:
  - workspace page/layout consumer files (where tab title should reflect workspace context)
  - `apps/web/src/features/041-file-browser/hooks/use-attention-title.ts` tests (integration-level)
- **Issue**: Hook exists but is not used in user-facing page flow.
- **Fix (test-first)**:
  1. Add integration test proving title updates from workspace context.
  2. Apply hook in workspace page shell.

## Priority 3 (MEDIUM): Behavioral completeness

### FT-008 — Finish WorktreePicker interaction scope
- **Files**:
  - `apps/web/src/features/041-file-browser/components/worktree-picker.tsx`
  - `test/unit/web/features/041-file-browser/worktree-picker.test.tsx`
- **Issue**: Keyboard navigation/recently-used behavior not fully implemented.
- **Fix (test-first)**:
  1. Add tests for arrow-key/enter interaction and recent section behavior.
  2. Implement corresponding state/handlers.

### FT-009 — Surface mutation failure path in `toggleWorkspaceStar`
- **Files**:
  - `apps/web/app/actions/workspace-actions.ts`
  - star-toggle interaction tests
- **Issue**: Invalid input/update failure is effectively silent to caller.
- **Fix**:
  1. Return explicit action result or wire user-visible failure handling.
  2. Add test coverage for invalid slug/update failure.

## Verification gate after fixes
```bash
just fft
git --no-pager diff --name-only
# rerun phase review
/plan-7-code-review --phase "Phase 3: UI Overhaul — Landing Page & Sidebar" --plan "/home/jak/substrate/041-file-browser/docs/plans/041-file-browser/file-browser-plan.md"
```
