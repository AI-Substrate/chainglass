# Code Review: Phase 2: FileTree UI Extensions

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 2: FileTree UI Extensions
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 2 is close, but it still has one real interaction bug and the evidence package does not substantiate the core UI flows that this phase claims to deliver.

**Key failure areas**:
- **Implementation**: `handleTreeKeyDown()` treats focused hover/action buttons as rename targets, so pressing Enter on a mutation button can incorrectly enter rename mode.
- **Domain compliance**: Plan artifacts still document the smoke test as `inline-edit-input.test.ts` even though the committed file is `inline-edit-input.test.tsx`, and the touched `file-browser/domain.md` still lacks a `## Concepts` section.
- **Testing**: Hover create, context-menu rename/delete, keyboard rename, root-row create, and delete dialog behavior have no direct automated or manual verification evidence.
- **Doctrine**: The new test file uses `vi.fn()` and omits the required five-field `Test Doc` blocks.

## B) Summary

The phase structure follows the plan well, and the new UI pieces stay inside the `file-browser` boundary without introducing reinvention or cross-domain import violations. The main functional blocker is the rename shortcut handler, which is currently too broad and can trigger from mutation buttons instead of only from the focused tree item. The component contract around optional CRUD callbacks is also only partially honored, and `InlineEditInput` does not implement the focus-restoration behavior promised by the tasks dossier. Testing/evidence quality is the larger gap: the execution log claims key Phase 2 behaviors without direct proof, and the automated coverage only exercises `InlineEditInput` rather than the FileTree CRUD flows.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Lightweight smoke tests exist for `InlineEditInput`
- [ ] Critical FileTree CRUD flows are directly covered
- [ ] Manual verification steps are documented with observed outcomes
- [x] Only in-scope files changed
- [x] Linters/type checks clean (execution log reports `just fft: PASS`)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:229-244 | correctness | Enter/F2 rename shortcuts climb to any ancestor with `data-tree-path`, so focused hover/action buttons can incorrectly enter rename mode. | Restrict rename shortcuts to the actual tree-item trigger and explicitly ignore mutation buttons/controls. |
| F002 | HIGH | /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md:19-49; /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx:1-87 | testing | The phase evidence does not directly verify the main Phase 2 UI flows (hover create, rename/delete context menus, keyboard rename, delete dialog, root create row). | Add lightweight `FileTree` / `DeleteConfirmationDialog` coverage and record manual verification steps with observed outcomes. |
| F003 | MEDIUM | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:186-226; /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:452-537; /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:672-687 | scope | Mutation UI is gated by `hasMutations` (any callback) instead of by the specific callback needed for that action, so Rename/Delete/New File/New Folder can render even when that action is undefined. | Gate each action independently with `onCreateFile`, `onCreateFolder`, `onRename`, and `onDelete`. |
| F004 | MEDIUM | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/inline-edit-input.tsx:46-59 | correctness | `InlineEditInput` auto-focuses on mount but never restores focus on teardown, despite the task dossier and execution log claiming that it does. | Capture the previously focused element on mount and restore it during cleanup/cancel/confirm when it is still connected. |
| F005 | MEDIUM | /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx:1-87 | doctrine | The new tests use `vi.fn()` and omit the required five-field `Test Doc` format. | Replace mock callbacks with simple fake recorders/plain closures and add complete `Test Doc:` blocks to each test. |
| F006 | MEDIUM | /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md:25-36; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md:77,125,149; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md:24,90 | domain-compliance | The plan, dossier, and flight plan still point at `inline-edit-input.test.ts`, so the actual committed `inline-edit-input.test.tsx` file is misdocumented. | Update all plan-phase artifacts to the committed `.test.tsx` path. |
| F007 | LOW | /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md:1-187 | domain-compliance | The touched `file-browser` domain document still has no `## Concepts` table required by the current domain review rules. | Add a Level 1 Concepts table covering the domain’s primary entry points, including tree CRUD concepts. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 / HIGH** — `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:229-244`
  - `handleTreeKeyDown()` calls `target.closest('[data-tree-path]')` and immediately opens rename mode for that path.
  - Directory hover buttons and other controls live under the same `data-tree-path` wrapper, so pressing Enter on a focused action button can open rename mode for the containing item instead of only invoking the focused control.
  - This is a genuine behavior bug because the dossier defines Enter/F2 for the focused tree item, not for mutation buttons.

- **F003 / MEDIUM** — `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:186-226`, `:452-537`, `:672-687`
  - `hasMutations` enables all mutation UI whenever any one callback exists.
  - That means partial consumers can see no-op create/rename/delete affordances even when the specific callback is absent, violating Task T008’s “hide corresponding UI when callback is undefined” contract.

- **F004 / MEDIUM** — `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/inline-edit-input.tsx:46-59`
  - The component does a good job of winning the Radix focus race on mount, but it never restores the previously focused element on teardown.
  - That leaves the keyboard-focus story incomplete relative to the task dossier and the execution log’s stated behavior.

No new security or performance issues were found in the Phase 2 code itself.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New UI components and tests remain under the `file-browser` source/test trees. |
| Contract-only imports | ✅ | Cross-domain imports are limited to shared/public UI primitives (`@/components/ui/...`) plus package dependencies (`lucide-react`). |
| Dependency direction | ✅ | `file-browser` continues consuming infrastructure capabilities; no infrastructure→business dependency was introduced. |
| Domain.md updated | ✅ | `docs/domains/file-browser/domain.md` was updated for history/composition/source location. |
| Registry current | ✅ | No new domains were introduced, so `docs/domains/registry.md` remains current. |
| No orphan files | ❌ | Plan-phase artifacts still reference `inline-edit-input.test.ts` while the committed file is `inline-edit-input.test.tsx`. |
| Map nodes current | ✅ | No new domain node or topological change was introduced in this phase. |
| Map edges current | ✅ | No new cross-domain contract edge was added by the Phase 2 diff. |
| No circular business deps | ✅ | No business→business dependency was added. |
| Concepts documented | ⚠️ | `docs/domains/file-browser/domain.md` still lacks the required `## Concepts` section/table. |

Domain-specific findings:
- **F006 / MEDIUM** — the changed test file is not documented consistently across the plan/dossier artifacts.
- **F007 / LOW** — the touched domain document still lacks the required Concepts section.

### E.3) Anti-Reinvention

No genuine duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `InlineEditInput` | None | — | Proceed |
| `DeleteConfirmationDialog` | None (shared `Dialog`/`Button` primitives are reused, not duplicated) | `_platform/viewer` primitives reused | Proceed |
| FileTree CRUD state machine | None | — | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 41%

_Note: the coverage assessment below focuses on Phase 2-owned acceptance criteria (AC-01..AC-07, AC-13). AC-08 belongs to the Phase 1 service layer and AC-09..AC-12 depend on Phase 3 wiring._

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 35 | Code path exists in `file-tree.tsx`, but there is no direct test or manual proof that hover → inline input → Enter works end-to-end. |
| AC-02 | 35 | Code path exists for folder creation, but no automated or manual evidence exercises it. |
| AC-03 | 68 | `InlineEditInput` directly verifies Escape → `onCancel`; no FileTree-level evidence proves the create row is removed in-tree. |
| AC-04 | 28 | `file-tree.tsx` implements Enter/F2 rename, but there is no direct proof of rename-mode entry, text selection, or blur-commit behavior. |
| AC-05 | 25 | Rename menu items exist, but there is no evidence that selecting them actually enters rename mode. |
| AC-06 | 22 | Delete menu items and dialog wiring exist, but there is no evidence that the dialog opens and confirm invokes the callback correctly. |
| AC-07 | 32 | The dialog includes recursive folder copy, but neither the recursive message nor the too-large branch is exercised by tests or manual proof. |
| AC-13 | 82 | `inline-edit-input.test.tsx` directly verifies invalid-name rejection for `bad:name` and blocks confirmation. |

Testing/evidence violations:
- **F002 / HIGH** — core FileTree CRUD flows have no direct automated or manual verification evidence.
- Additional evidence gaps observed during synthesis:
  - Rename-mode `selectOnMount` and `commitOnBlur={true}` are unverified.
  - Focus restoration is claimed but not implemented.
  - The execution log contains behavior claims that are stronger than the available evidence.

### E.5) Doctrine Compliance

Project rules are present and otherwise the phase generally respects naming, placement, and layer boundaries.

- **F005 / MEDIUM** — `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx:1-87`
  - Uses `vi.fn()` callbacks even though the project rules prefer fakes/plain deterministic harnesses over mock functions.
  - Omits the required `Test Doc:` block with `Why`, `Contract`, `Usage Notes`, `Quality Contribution`, and `Worked Example` in each test.

### E.6) Harness Live Validation

N/A — no harness configured.

- `docs/project-rules/harness.md` is absent.
- The phase dossier explicitly states: “No agent harness configured.”
- Live validation was skipped accordingly.

## F) Coverage Map

_Phase 2-owned acceptance criteria only._

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Create file via hover button | Implemented in `file-tree.tsx`; no direct automated/manual proof. | 35 |
| AC-02 | Create folder via hover button | Implemented in `file-tree.tsx`; no direct automated/manual proof. | 35 |
| AC-03 | Cancel creation with Escape | `inline-edit-input.test.tsx` verifies Escape→cancel; no tree-level proof. | 68 |
| AC-04 | Rename via Enter/F2 | Implemented in `file-tree.tsx`; no direct proof, and F001 shows a shortcut bug. | 28 |
| AC-05 | Rename via context menu | Menu items implemented; no direct proof that they enter rename mode. | 25 |
| AC-06 | Delete via context menu | Menu items and dialog wiring implemented; no direct proof of open/confirm behavior. | 22 |
| AC-07 | Delete folder recursively | Dialog copy indicates recursive delete; no proof of folder-path behavior or too-large branch. | 32 |
| AC-13 | Invalid name rejection | Directly covered by `inline-edit-input.test.tsx`. | 82 |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager log --oneline -- apps/web/src/features/041-file-browser/components/file-tree.tsx apps/web/src/features/041-file-browser/components/inline-edit-input.tsx apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx test/unit/web/features/041-file-browser/inline-edit-input.test.tsx
git --no-pager diff 8e2e366..276bea7 -- apps/web/src/features/041-file-browser/components/file-tree.tsx apps/web/src/features/041-file-browser/components/inline-edit-input.tsx apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx test/unit/web/features/041-file-browser/inline-edit-input.test.tsx docs/domains/file-browser/domain.md docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md > /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews/_computed.diff
git --no-pager diff --name-status 8e2e366..276bea7
git --no-pager diff --stat 8e2e366..276bea7
git --no-pager show --stat --format=fuller 276bea7 -- apps/web/src/features/041-file-browser/components/file-tree.tsx apps/web/src/features/041-file-browser/components/inline-edit-input.tsx apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx test/unit/web/features/041-file-browser/inline-edit-input.test.tsx
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 2: FileTree UI Extensions
**Tasks dossier**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md
**Execution log**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md
**Review file**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews/review.phase-2-filetree-ui-extensions.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx | Issues found | file-browser | Fix rename shortcut scoping and gate mutation UI per callback. |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/inline-edit-input.tsx | Issues found | file-browser | Implement focus restoration on teardown. |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx | Reviewed clean | file-browser | No code issue found; add direct coverage/manual evidence. |
| /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx | Issues found | file-browser | Replace `vi.fn()`, add full `Test Doc:` blocks, and extend coverage to the missing Phase 2 flows. |
| /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | Issues found | file-browser | Add `## Concepts` table. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md | Issues found | planning artifact | Correct the smoke-test path to `.test.tsx`. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md | Issues found | planning artifact | Correct `.test.tsx` references. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md | Issues found | planning artifact | Correct `.test.tsx` references. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md | Issues found | planning artifact | Add manual verification evidence and align claims to the delivered behavior. |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx | Restrict Enter/F2 rename shortcuts to the actual focused tree item trigger. | Prevent rename mode from firing when a hover action button has focus. |
| 2 | /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md | Add direct evidence for FileTree CRUD flows and manual verification outcomes. | Current evidence does not substantiate the core Phase 2 UI behaviors. |
| 3 | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx | Hide each mutation affordance when its specific callback prop is absent. | Current implementation violates Task T008’s prop contract and can expose no-op UI. |
| 4 | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/inline-edit-input.tsx | Restore focus to the invoking tree element after confirm/cancel/teardown. | The task dossier explicitly requires focus restoration. |
| 5 | /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx | Replace `vi.fn()` and add full `Test Doc:` blocks. | Required by project rules and constitution. |
| 6 | /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md | Update smoke-test references from `.test.ts` to `.test.tsx`. | Keeps the manifest/dossier consistent with the committed file set. |
| 7 | /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | Add the missing `## Concepts` section. | Required by current domain review rules for touched domains with contracts. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md | Smoke-test file path still uses `.test.ts` instead of `.test.tsx`. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md | Smoke-test file path still uses `.test.ts` instead of `.test.tsx`. |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md | Smoke-test file path still uses `.test.ts` instead of `.test.tsx`. |
| /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | `## Concepts` section/table is missing. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md --phase 'Phase 2: FileTree UI Extensions'
