# Code Review: Phase 3: BrowserClient Wiring & Integration

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 3: BrowserClient Wiring & Integration
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Three high-severity correctness regressions remain in the rename/worktree-switch flows, and the phase evidence/documentation is not yet complete enough to sign off.

**Key failure areas**:
- **Implementation**: Renaming the open file still reloads from disk and drops dirty editor content; folder rename also routes through file-selection logic.
- **Domain compliance**: `domain.md` was updated, but the composition table dropped the existing `validateFileName` entry.
- **Testing**: The execution log records `just fft`, but not direct verification of the new browser-wiring flows this phase introduced.
- **Doctrine**: The file-browser C4 component diagram was not updated to reflect the new mutation orchestration layer.

## B) Summary

The phase is close, but the highest-risk edge case - renaming the currently open file - is not actually safe in the current implementation. `browser-client.tsx` comments say `setParams()` avoids a reload, but `use-file-navigation.ts` still re-reads any URL-driven file change and overwrites `editContent`, so dirty edits are lost after rename. The rename handler also treats renamed folders like files by calling `handleSelect()` unconditionally on the non-selected path branch. Domain placement and dependency direction are otherwise clean, and the anti-reinvention pass found no meaningful duplication, but the documentation and evidence trail still need follow-through before approval.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Lightweight coverage added for the new BrowserClient / `useFileMutations` wiring paths
- [ ] Manual verification recorded for create-at-root, rename-open-file, delete-open-file, folder rename/delete, and green fade-in behavior
- [ ] Key verification points documented with observed outcomes
- [x] Only in-scope files changed
- [x] Linters/type checks clean (execution log records `just fft` PASS)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:220-227`; `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts:136-149` | correctness | Open-file rename still triggers the URL-change reload path and overwrites dirty editor content. | Add a rename-aware navigation path that updates the selected path/mtime without re-reading from disk when the buffer is dirty. |
| F002 | HIGH | `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:220-229` | correctness | Folder rename falls into `handleSelect(newPath)`, which is file-only logic and can push a directory path into the `file` URL param. | Pass entry type into the rename callback (or derive it from the tree) and only call `handleSelect()` for files. |
| F003 | HIGH | `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:73-92,108-109` | correctness | `rootEntries` snapshots the first `initialEntries` value, so switching `?worktree=` can leave the previous worktree's root listing visible. | Sync `rootEntries` to `[initialEntries, worktreePath]` or remount `BrowserClientInner` per worktree. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:43-55` | testing | Phase 3 records `just fft`, but not direct verification of the new BrowserClient mutation flows. | Add concise manual verification results and/or lightweight tests for the phase-specific wiring behaviors. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md:13-42` | doctrine | The file-browser L3 C4 diagram still omits `useFileMutations` and the new mutation orchestration relationships. | Update the C4 component diagram in the same phase as the domain composition change. |
| F006 | LOW | `/Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md:71-76` | domain | The Phase 3 `domain.md` edit replaced the existing `validateFileName` composition row instead of adding `useFileMutations` alongside it. | Restore `validateFileName` as its own composition row and keep `useFileMutations` as a separate entry. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 - Open-file rename still discards dirty edits
The selected-file branch in `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:224-227` updates the URL with `setParams()` and comments that this preserves unsaved edits. That is not what the surrounding system does: `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts:138-146` reloads any changed `initialFile` and immediately calls `setEditContent(result.content)`. In practice, renaming the active dirty file still replaces the in-memory editor buffer with on-disk content from the renamed file.

#### F002 - Folder rename is routed through file selection
`FileTree` exposes `onRename` for both files and folders, but the non-selected branch in `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:227-228` unconditionally calls `fileNav.handleSelect(result.newPath)`. `handleSelect()` is file-viewer logic: it writes `file=` into the URL and calls `readFile()`. Renaming a folder can therefore leave the browser trying to open a directory as though it were a file.

#### F003 - Root tree state can drift when worktree changes
Phase 3 introduced `const [rootEntries, setRootEntries] = useState(initialEntries)` at `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:108-109`, but there is no effect that resets that state when `initialEntries` or `worktreePath` changes. Because `BrowserClientInner` is rendered in place under the same route component (`.../browser-client.tsx:73-92`), switching to a different worktree on the same browser page can retain the prior root listing until some later refresh happens.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source file lives under `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts`, matching the file-browser domain manifest. |
| Contract-only imports | ✅ | No cross-domain internal imports were introduced; Phase 3 composes same-domain server actions and hooks. |
| Dependency direction | ✅ | The business domain still depends only on infrastructure/public contracts (`events`, `panel-layout`, `workspace-url`, `file-ops`). |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md:71-76` dropped `validateFileName` from the Composition table while adding `useFileMutations`. |
| Registry current | ✅ | No new/renamed domains were introduced, so `/Users/jordanknight/substrate/068-add-files/docs/domains/registry.md` remains current for this phase. |
| No orphan files | ✅ | Changed source files align with the plan's Domain Manifest; plan-task artifacts are intentionally outside the domain source tree. |
| Map nodes current | ✅ | No new domain nodes or renamed domains were introduced in Phase 3. |
| Map edges current | ✅ | Phase 3 did not add any new cross-domain dependencies; existing edge set is unchanged. |
| No circular business deps | ✅ | The phase adds no new business-to-business dependency path. |
| Concepts documented | ✅ | `/Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md:153-163` contains a Level 1 Concepts table, and Phase 3 adds no new public contract that would require a new Concepts row. |

**Domain finding**
- **F006 (LOW)**: `/Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md:71-76` should list both `validateFileName` and `useFileMutations` in Composition.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `useFileMutations` hook | None | file-browser | Proceed - no genuine duplication found; it packages existing server actions + toasts for this domain. |
| BrowserClient CRUD orchestration | `useFileNavigation.handleRefreshDir()` / `handleSelect()` primitives | file-browser | Proceed - composes existing primitives rather than reinventing service-layer behavior. |

### E.4) Testing & Evidence

**Coverage confidence**: 75%

**Evidence gaps**
- **F004 (MEDIUM)**: `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:43-55` records the final `just fft` pass but not direct browser verification of the new mutation orchestration.
- The code changes add no targeted tests for rename-open-file, delete-open-file, root refresh, or folder rename behavior.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 72 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` (create UI), `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:193-214`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:395-410` |
| AC2 | 70 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` (folder-create UI), `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:206-216` |
| AC3 | 93 | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` (Escape cancel behavior) |
| AC4 | 60 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` (Enter/F2 rename task notes), `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:237-256` |
| AC5 | 55 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` (context menu rename/delete wiring) |
| AC6 | 67 | `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:336-349`, `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` (delete dialog coverage) |
| AC7 | 94 | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` (recursive folder delete service coverage) |
| AC8 | 97 | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` (path traversal / symlink rejection) |
| AC9 | 81 | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts:76-155` |
| AC10 | 63 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:25-30`, `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:219-233`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts:136-149` |
| AC11 | 65 | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:28-33`, `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:235-246` |
| AC12 | 71 | `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts:76-155` |
| AC13 | 96 | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/validate-filename.test.ts`, `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` |

### E.5) Doctrine Compliance

- **F005 (MEDIUM)**: `/Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md:13-42` still shows the pre-Phase-3 component graph. The new `useFileMutations` orchestration layer and its relationship to BrowserClient / server actions are absent, even though this phase updated the domain composition.
- Rules/idioms/architecture documents were otherwise consistent with the placement and naming of the new hook; no cross-layer or naming violations were found in the source changes.

### E.6) Harness Live Validation

N/A - no harness configured. `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/tasks.md:185-187` explicitly says the phase runs without an agent harness.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Hover folder -> New File -> Enter creates file with green fade-in | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` for UI affordance; `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:193-214` for wiring; no recorded browser proof of the end-to-end flow | 72 |
| AC2 | Hover folder -> New Folder -> Enter creates folder | `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md` plus `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:206-216` | 70 |
| AC3 | Escape during inline create cancels | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` | 93 |
| AC4 | Enter/F2 on selected file enters rename mode | `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:237-256`; no direct happy-path browser evidence logged | 60 |
| AC5 | Context-menu Rename enters inline rename mode | Phase 2 execution log task notes; no direct browser or integration evidence captured in Phase 3 | 55 |
| AC6 | Context-menu Delete shows confirmation and deletes item | `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx:336-349`; dialog coverage in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` | 67 |
| AC7 | Folder delete is recursive and dialog indicates it | Recursive delete service tests in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` plus Phase 2 dialog work | 94 |
| AC8 | Path traversal and symlink escape are rejected | Strong service-layer TDD coverage in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` | 97 |
| AC9 | Duplicate name shows already-exists error | Duplicate handling covered in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`; toast mapping visible in `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts:76-155` | 81 |
| AC10 | Rename currently viewed file updates viewer and URL | Code + task-log evidence only: `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:25-30`, `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:219-233`; currently blocked by F001 | 63 |
| AC11 | Delete currently viewed file clears viewer and URL | Code + task-log evidence only: `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md:28-33`, `/Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:235-246` | 65 |
| AC12 | Toast feedback on all operations | `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts:76-155`; not explicitly exercised in logs | 71 |
| AC13 | Invalid names rejected client-side | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/validate-filename.test.ts` and `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx` | 96 |

**Overall coverage confidence**: 75%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '
---STAGED---
' && git --no-pager diff --staged --stat && printf '
---STATUS---
' && git --no-pager status --short && printf '
---LOG---
' && git --no-pager log --oneline -10
mkdir -p '/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews' && git --no-pager diff --find-renames b0d3681..f498ce0 > '/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews/_computed.diff' && git --no-pager diff --find-renames --name-status b0d3681..f498ce0 && git --no-pager diff --find-renames --stat b0d3681..f498ce0
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review - only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 3: BrowserClient Wiring & Integration
**Tasks dossier**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/tasks.md
**Execution log**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md
**Review file**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews/review.phase-3-browserclient-wiring-integration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Reviewed | file-browser | Fix F001, F002, F003 |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts | Reviewed | file-browser | None directly; keep behavior aligned with rename/root-refresh fixes |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts | Reviewed (supporting context) | file-browser | Fix F001 |
| /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | Reviewed | file-browser | Fix F006 |
| /Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md | Reviewed (affected artifact) | file-browser | Fix F005 |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md | Reviewed | plan-artifact | Fix F004 |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/tasks.md | Reviewed | plan-artifact | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx; /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts | Make rename of the active file preserve the dirty buffer instead of reloading from disk. | Current `setParams()` path still triggers the URL-change effect that resets `editContent`. |
| 2 | /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Stop routing folder rename through `handleSelect()`. | The current branch treats directories like files and can write a folder path into the `file` URL param. |
| 3 | /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Re-sync `rootEntries` when `initialEntries` / `worktreePath` changes. | The Phase 3 root-refresh state introduces stale root listings across worktree switches. |
| 4 | /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md and/or targeted test files under `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/` | Record direct verification for the new BrowserClient mutation flows. | The current evidence is mostly code inspection plus `just fft`, which is not enough for the new edge cases. |
| 5 | /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md; /Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md | Restore `validateFileName` in Composition and update the L3 diagram for mutation orchestration. | Phase 3 domain docs are incomplete/inaccurate. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | Restore the `validateFileName` composition row and keep `useFileMutations` as an additional entry. |
| /Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md | Add the Phase 3 mutation orchestration component(s) and relationships. |

### Next Step

`/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md --phase 'Phase 3: BrowserClient Wiring & Integration'`
