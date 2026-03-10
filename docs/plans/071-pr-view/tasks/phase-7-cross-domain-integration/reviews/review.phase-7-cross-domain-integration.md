# Code Review: Phase 7: Cross-Domain Integration

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 7: Cross-Domain Integration
**Date**: 2026-03-10
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid — TDD for data layer, Lightweight for UI

## A) Verdict

**REQUEST_CHANGES**

Deleted-file note badging is still unreliable for the filtered/displayed note set, so OQ-2 is not fully satisfied in the reviewed snapshot, and the phase lacks the required verification artifact coverage for the new deleted-file and cross-domain indicator flows.

**Key failure areas**:
- **Implementation**: Deleted-file badge logic is driven by open-note data and `groupedByFile.size`, so displayed note groups can miss the `Deleted` badge.
- **Domain compliance**: `file-browser` / `file-notes` docs and the domain map do not fully reflect the new Phase 7 contracts and dependencies.
- **Testing**: No Phase 7 `execution.log.md` exists, and the new deleted-file/helper integration flows do not have dedicated coverage.
- **Doctrine**: New shared/helper and cross-domain behaviors shipped without the verification expected by the repo's hybrid/TDD rules.

## B) Summary

This review is pinned to `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/reviews/_computed.diff`, generated from `90043a6a..3d67eac2da71f1901d0c9a9e32cd3f76002423da`, so the findings stay deterministic despite branch churn during review. The latest follow-up commits fixed the earlier stale-closure and nested-button issues, and no blocking security or dependency-direction violations were found. However, the notes overlay still computes deleted-file state from the wrong source of truth for some filtered views, leaving OQ-2 unreliable. No blocking concept reinvention was found, but there is an opportunity to consolidate duplicated note-file-path refresh logic with existing file-notes contracts. Testing evidence is incomplete: `just test-feature 071` and `pnpm tsc --noEmit` pass, but there is no Phase 7 execution log and no targeted tests for the new deleted-file helper or the note-indicator/filter integration paths.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Data-layer additions covered by TDD where applicable
- [ ] Lightweight integration validation exists for the new UI paths
- [ ] Key verification points are documented in phase evidence
- [ ] Only in-scope files changed
- [x] Type checks clean (`pnpm tsc --noEmit`)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx:80-94 | correctness | Deleted-file badging only checks the default open-note set and only reruns on `groupedByFile.size`, so filtered or completed-only deleted-note groups can miss the `Deleted` badge. | Recompute `deletedFiles` from the displayed file keys or make the detailed fetch filter-aware and key-aware. |
| F002 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:681-701 | correctness | The notes-only tree filter hides its own toggle when `noteFilePaths` becomes empty, which can strand the tree in an empty filtered state. | Keep the toggle visible while active or automatically clear the filter when the note set becomes empty. |
| F003 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md | testing | The expected Phase 7 execution log is missing, so there is no persisted AC-by-AC verification artifact for AC-21, AC-22, AC-27, AC-15, or OQ-2. | Create `execution.log.md` with the actual commands, observed outcomes, and explicit AC mapping. |
| F004 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:85-93 | testing | The new deleted-file helper and cross-domain note indicator/filter flows ship without dedicated automated coverage. | Add targeted tests for `listFilesWithNotesDetailed()` plus the FileTree / Notes Overlay / PR View integration paths. |
| F005 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md | domain-md | `file-browser/domain.md` does not record the new file-notes dependency, the Add Note tree flow, or the has-notes filter behavior introduced by Phase 7. | Update the file-browser domain doc `Dependencies`, `Concepts`, and `History` sections for Phase 7. |
| F006 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | domain-md | The file-notes docs/map omit or misdescribe the exported Phase 7 contracts (`fetchFilesWithNotes`, `notes:changed`, `FileWithExistence.path`). | Sync the domain doc and map with the actual exported contracts and edge labels. |
| F007 | LOW | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:32; /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/041-file-browser/components/file-tree.tsx:23; /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx:12 | pattern | Cross-domain imports reach into file-notes internals instead of using the feature barrel. | Import from `@/features/071-file-notes` to keep business-domain dependencies on the public contract surface. |
| F008 | LOW | /Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts:1-3 | scope | Generated Next.js type-reference drift is included in the pinned phase diff but is not part of the Phase 7 dossier/domain manifest. | Remove it from the phase commit if unintentional, or explicitly document its ownership if it must stay. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx:80-94`  
  `deletedFiles` is fetched via `fetchFilesWithNotesDetailed(worktreePath)` with the default open-note behavior, then only refreshed when `groupedByFile.size` changes. The visible note groups come from `useNotes(worktreePath)` with the active overlay filter applied, so deleted files that only have completed notes or file-set changes with the same count can render without the required `Deleted` badge.
- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:681-701`  
  The has-notes filter button is only rendered when `noteFilePaths.size > 0`. If the filter is already active and the last noted file disappears from the set, the tree stays filtered while the escape hatch vanishes.
- No blocking security findings, auth bypasses, or dependency-direction errors were found in the pinned snapshot.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New review/task artifacts are under the phase task tree; code changes stay under existing domain trees. |
| Contract-only imports | ❌ | `browser-client.tsx`, `file-tree.tsx`, and `pr-view-file-list.tsx` import file-notes internals instead of `@/features/071-file-notes`. |
| Dependency direction | ✅ | No infrastructure → business inversion or business-cycle introduction was found. |
| Domain.md updated | ❌ | `file-browser/domain.md` was not updated for Phase 7; `file-notes/domain.md` is incomplete/inaccurate for new public contracts. |
| Registry current | ✅ | No new domains were introduced, and `/Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md` is still current. |
| No orphan files | ❌ | `/Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts` appears in the pinned diff but is outside the phase manifest/dossier. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md` does not list all externally consumed Phase 7 file-notes contracts. |
| Map edges current | ❌ | The `file-browser -> file-notes` and `pr-view -> file-notes` edge labels omit `notes:changed`. |
| No circular business deps | ✅ | No circular business dependency was introduced. |
| Concepts documented | ⚠️ | `file-notes/domain.md` does not yet document deleted-file detection / change notification as concepts, and `file-browser/domain.md` lacks Phase 7 concepts entirely. |

### E.3) Anti-Reinvention

No blocking reinvention was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `fetchFilesWithNotesDetailed()` | `fetchFilesWithNotes(worktreePath)` | file-notes | Reuse opportunity — extend the existing note-file-path contract if deleted-status queries remain server-side |
| BrowserClient note-file-path fetch + `notes:changed` refresh block | `useNotes(worktreePath).noteFilePaths + refresh()` | file-notes | Reuse opportunity — not blocking |
| PR View note-file-path fetch + `notes:changed` refresh block | `useNotes(worktreePath).noteFilePaths + refresh()` | file-notes | Reuse opportunity — not blocking |
| FileTree ancestor-preserving notes filter | None | — | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 41%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-21 | 50% | `FileTree` accepts `filesWithNotes` and renders `NoteIndicatorDot`; `browser-client.tsx` fetches note file paths and passes them through. `just test-feature 071` passed, but no test asserts note-dot rendering in the tree. |
| AC-22 | 47% | `pr-view-file-list.tsx` renders `NoteIndicatorDot`, and `pr-view-overlay-panel.tsx` fetches note file paths on mount / `notes:changed`. Existing PR View tests pass, but none target note indicators. |
| AC-27 | 30% | The toggle/filter implementation exists in `browser-client.tsx`, including ancestor-path preservation, but there is no direct test or execution-log evidence, and F002 exposes an empty-state trap. |
| AC-15 | 45% | The tree context menu now exposes `Add Note`, and `browser-client.tsx` wires it to `useNotesOverlay().openModal({ target })`. The latest fix commit addressed worktree resolution, but no durable evidence artifact exists. |
| OQ-2 | 22% | `listFilesWithNotesDetailed()` plus the `Deleted` badge were added, but F001 shows the current implementation does not reliably track the displayed note groups. |

### E.5) Doctrine Compliance

- **MEDIUM** — `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts`  
  `listFilesWithNotesDetailed()` is a new shared/data-layer helper, but no matching test updates were added for the deleted-file existence branch.
- **MEDIUM** — `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx`; `/Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`; `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx`  
  Cross-domain runtime behavior (`notes:changed`, note indicators, has-notes filter, deleted badge) shipped without the targeted verification expected by the repo's hybrid/TDD rules.

### E.6) Harness Live Validation

N/A — no harness configured. `/Users/jordanknight/substrate/071-pr-view/docs/project-rules/harness.md` is absent.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-21 | File tree shows indicator dot | Static code path exists in `browser-client.tsx` + `file-tree.tsx`; no direct assertion or execution-log artifact | 50% |
| AC-22 | PR View file list shows indicator dot | Static code path exists in `pr-view-overlay-panel.tsx` + `pr-view-file-list.tsx`; no dedicated note-indicator test | 47% |
| AC-27 | Tree can be filtered to show only files with notes | Ancestor-preserving filter exists, but F002 exposes an empty-state failure mode and no direct evidence artifact exists | 30% |
| AC-15 | Users can add a markdown note via the tree context path | `FileTree` menu + `openModal({ target })` wiring exists; no persisted verification artifact | 45% |
| OQ-2 | Deleted-file notes remain visible with a Deleted indicator | `listFilesWithNotesDetailed()` and badge were added, but F001 shows the behavior is not reliable for displayed/filtered groups | 22% |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff --stat --find-renames 90043a6a..3d67eac2
git --no-pager diff --name-status --find-renames 90043a6a..3d67eac2
git --no-pager diff --find-renames 90043a6a..3d67eac2 > /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/reviews/_computed.diff
git --no-pager diff 90043a6a..3d67eac2 -- apps/web/next-env.d.ts
git --no-pager log --oneline -- apps/web/next-env.d.ts | head -5
test -f docs/project-rules/harness.md && echo EXISTS || echo MISSING
just test-feature 071
pnpm tsc --noEmit
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 7: Cross-Domain Integration
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/reviews/review.phase-7-cross-domain-integration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Reviewed | planning artifact | Reference only |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md | Reviewed | planning artifact | Reference only |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/tasks.md | Added | planning artifact | Keep as task reference |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/tasks.fltplan.md | Added | planning artifact | No action required for this review |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md | Missing | planning artifact | Create with concrete Phase 7 verification evidence |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/reviews/_computed.diff | Added | review artifact | Keep as deterministic review basis |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | Fix has-notes empty-state trap; switch to file-notes public barrel import |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/041-file-browser/components/file-tree.tsx | Modified | file-browser | Switch `NoteIndicatorDot` import to file-notes public barrel |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/notes-actions.ts | Modified | file-notes | Consider extending the detailed note-file query if the deleted-state fix stays server-driven |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx | Modified | file-notes | Fix deleted-file badge fidelity for filtered/displayed groups |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/note-file-group.tsx | Modified | file-notes | No further action from this review |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx | Modified | pr-view | No blocking issue; keep in sync with any shared note-file refresh refactor |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx | Modified | pr-view | Switch `NoteIndicatorDot` import to file-notes public barrel |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts | Modified | file-notes shared | Add coverage for `listFilesWithNotesDetailed()`; extend only if deleted-state logic moves shared-side |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/index.ts | Modified | file-notes shared | Keep exports aligned with any detailed-query contract changes |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md | Reviewed | domain docs | Update Dependencies / Concepts / History for Phase 7 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | Modified | domain docs | Fix contract table, concepts, and `FileWithExistence` field name |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md | Modified | domain docs | No blocking issue from this review |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Modified | domain docs | Add missing file-notes contracts to node/edge labels |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md | Reviewed | domain docs | No action required |
| /Users/jordanknight/substrate/071-pr-view/docs/project-rules/rules.md | Reviewed | project rules | Reference only |
| /Users/jordanknight/substrate/071-pr-view/docs/project-rules/idioms.md | Reviewed | project rules | Reference only |
| /Users/jordanknight/substrate/071-pr-view/docs/project-rules/architecture.md | Reviewed | project rules | Reference only |
| /Users/jordanknight/substrate/071-pr-view/docs/project-rules/constitution.md | Reviewed | project rules | Reference only |
| /Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts | Modified | tooling / unowned | Remove from the phase diff if accidental or document why it belongs |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx | Make deleted-file badging follow the displayed note-group set (or extend the detailed query so it is filter-aware and file-key aware). | OQ-2 is currently unreliable and is the blocking HIGH finding. |
| 2 | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Preserve an escape hatch for the has-notes filter when the note set becomes empty. | Users can otherwise get stuck in an empty filtered tree. |
| 3 | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md | Record actual Phase 7 verification commands, outcomes, and AC mapping. | Review evidence is incomplete without a phase execution log. |
| 4 | /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/041-file-browser/file-tree.test.tsx; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-overlay.test.ts | Add coverage for the deleted-file helper and the new note-indicator / notes:changed / filter flows. | New shared and cross-domain behavior shipped without targeted verification. |
| 5 | /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Bring the docs/map up to date with the implemented contracts and dependencies. | The domain artifacts currently lag the code. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md | Phase 7 history, file-notes dependency, Add Note tree flow, has-notes filter concept |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | `fetchFilesWithNotes` contract row, correct `FileWithExistence.path` field, deleted-file detection / `notes:changed` concepts |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | File-notes node/health summary contracts and `notes:changed` edge labels |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 7: Cross-Domain Integration'
