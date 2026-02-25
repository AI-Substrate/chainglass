# Code Review: Phase 3: Wire Into BrowserClient + Migration

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 3: Wire Into BrowserClient + Migration
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness/process issues remain (missing user-visible error path in Explorer handler context, doctrine test-rule violations, and incomplete TDD evidence for key acceptance criteria).

**Key failure areas**:
- **Implementation**: Explorer path failures are silently dropped because `showError` is a no-op in BrowserClient context wiring.
- **Domain compliance**: Cross-domain imports consume `_platform/panel-layout/types` internals instead of public contract barrel, and Domain Manifest omits new Phase 3 files.
- **Reinvention**: New clipboard/path-handler logic overlaps existing file-browser capabilities and should be consolidated.
- **Testing**: Full-TDD evidence is incomplete for RED→GREEN sequencing and for AC-9/22/23/24/25 verification.
- **Doctrine**: New test file uses `vi.fn()` and lacks required per-test Test Doc blocks.

## B) Summary

Phase 3 integration is substantial and mostly aligned with intended UI outcomes, but the current implementation has at least one user-facing behavioral defect and several compliance gaps. Domain topology remains directionally correct (business consumes infrastructure), and domain docs/map were updated, but contract-boundary and manifest-currency checks are not fully met. Anti-reinvention review found overlap in newly extracted hooks/helpers with existing file-browser capabilities; this is manageable but should be rationalized before approval. Testing evidence demonstrates broad activity, yet critical acceptance criteria still lack direct, auditable verification evidence under the declared Full TDD approach.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED-GREEN-REFACTOR evidence captured per implemented task
- [ ] Test-first sequencing is demonstrated for changed behavior
- [ ] High-risk acceptance criteria have explicit automated assertions

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:112-114 | error-handling | `showError` callback is a no-op; ExplorerPanel not-found path gives no user feedback. | Wire `showError` to `toast.error(message)` (or equivalent visible notification). |
| F002 | HIGH | /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-path-handler.test.ts:14-107 | doctrine | Tests use `vi.fn()`/mock style despite project rule requiring fakes-over-mocks. | Replace with concrete fake context implementation and state-based assertions. |
| F003 | HIGH | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/execution.log.md:66-70 | testing | Full-TDD evidence is incomplete and key ACs (9,22,23,24,25) lack direct test proof. | Add explicit RED→GREEN records and targeted integration tests/evidence for missing ACs. |
| F004 | MEDIUM | /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts:23-25 | correctness | Worktree prefix stripping lacks boundary check; similarly-prefixed absolute paths can normalize incorrectly. | Strip only when path equals worktree root or starts with `worktreePath + '/'`. |
| F005 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md:33-52 | domain/orphan | Domain Manifest does not list new Phase 3 files (hooks + file-path-handler). | Add all new files with domain/classification rationale. |
| F006 | MEDIUM | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:32; /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts:13; /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts:11 | domain/contract-imports | File-browser imports `_platform/panel-layout/types` internal path across domain boundary. | Import types/contracts from `@/features/_platform/panel-layout` barrel only. |
| F007 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/tasks.md:165; /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/execution.log.md:69 | testing/evidence | Task table claims `just fft` pass while execution log says full suite pending at commit time. | Reconcile claim and attach concrete command output evidence. |
| F008 | MEDIUM | /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-path-handler.test.ts:28-107 | doctrine | Required 5-field Test Doc is missing in new test cases. | Add Test Doc block for each `it(...)` case per project rules. |
| F009 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md:1 | scope | Commit range for Phase 3 includes unrelated Plan 045 artifacts. | Exclude unrelated files from Phase 3 diff scope or split commits for reviewability. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: User-facing error feedback missing in BrowserClient `barContext.showError`.
- **F004 (MEDIUM)**: Path normalization can over-strip if absolute path only shares a prefix with `worktreePath`.
- **F009 (MEDIUM)**: Diff scope includes unrelated Plan 045 artifacts.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code files are under file-browser domain tree. |
| Contract-only imports | ❌ | Imports from `@/features/_platform/panel-layout/types` bypass public barrel (F006). |
| Dependency direction | ✅ | business (`file-browser`) → infrastructure (`_platform/*`) only; no reverse dependency detected. |
| Domain.md updated | ✅ | `file-browser/domain.md` and `_platform/panel-layout/domain.md` include Phase 3 updates. |
| Registry current | ✅ | `docs/domains/registry.md` includes active domains and events rename. |
| No orphan files | ❌ | Domain Manifest in plan omits new Phase 3 files (F005). |
| Map nodes current | ✅ | Domain map includes panel-layout and events nodes with current contracts. |
| Map edges current | ✅ | file-browser→panel-layout edge is active and labeled; no unlabeled edge found for active dependencies. |
| No circular business deps | ✅ | Single business domain (`file-browser`) with no business-to-business cycle. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `createFilePathHandler` | `fileExists`/`pathExists` action pipeline | file-browser | Extend existing path workflow docs/tests; no hard blocker |
| `usePanelState` | Existing changed/recent services and panel param handling | file-browser | Proceed, but keep API consolidation in mind |
| `useClipboard` | Clipboard fallback pattern in `paste-upload-modal.tsx` | file-browser | Consider shared helper to avoid duplicated fallback logic |
| `useFileNavigation` | Similar diff-state ownership pattern in viewer hooks | _platform/viewer | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 63%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-5 | 95 | `file-path-handler.test.ts` path navigation handling |
| AC-6 | 95 | `file-path-handler.test.ts` existence/not-found cases |
| AC-7 | 100 | explicit worktree-prefix strip test |
| AC-9 | 40 | implementation logged, no direct changed test evidence |
| AC-13 | 100 | `params.test.ts` panel param parsing/default |
| AC-14 | 85 | invalid panel fallback behavior supports graceful degradation |
| AC-22 | 45 | context menu wiring claimed, direct changed test proof missing |
| AC-23 | 50 | cross-mode sync claimed, direct changed test proof missing |
| AC-24 | 50 | reverse sync claimed, direct changed test proof missing |
| AC-25 | 70 | URL sharing implied, no dedicated integration assertion in changed tests |
| AC-29 | 90 | `file-tree.test.tsx` reflects header removal |
| AC-30 | 90 | viewer path-row removal reflected in code/evidence |
| AC-31 | 90 | execution log + component updates indicate single-row toolbar |
| AC-32 | 95 | affected tests updated and passing per log |
| AC-33 | 60 | stated as done in tasks, but execution log says full suite pending (F007) |

### E.5) Doctrine Compliance

- **F002 (HIGH)**: R-TEST-007 violation (`vi.fn()` usage in new test file).
- **F008 (MEDIUM)**: R-TEST-002 / Test Doc format violations in new tests.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-9 | Ctrl/Cmd+P focuses explorer and suppresses print | Implementation present; no dedicated changed test | 40 |
| AC-13 | `?panel=tree|changes` URL state | `test/unit/web/features/041-file-browser/params.test.ts` | 100 |
| AC-14 | `?changed=true` ignored gracefully | params fallback behavior to tree | 85 |
| AC-22 | Changes view context menu parity | Claimed in execution log, lacking explicit changed assertions | 45 |
| AC-23 | changes→tree sync | Claimed in execution log, no direct test proof in changed files | 50 |
| AC-24 | tree→changes sync | Claimed in execution log, no direct test proof in changed files | 50 |
| AC-25 | selected file persists across modes | implied by URL param usage; no explicit integration assertion | 70 |
| AC-29 | FileTree header removed | `file-tree.tsx` + updated tests | 90 |
| AC-30 | FileViewerPanel path row removed | `file-viewer-panel.tsx` + log evidence | 90 |
| AC-33 | `just fft` passes | contradictory evidence between tasks and execution log | 60 |

**Overall coverage confidence**: 63%

## G) Commands Executed

```bash
rg -n "\*\*Mode\*\*:\s*(Simple|Full)" /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
mkdir -p /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews
git --no-pager diff 7972cb1..HEAD > /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews/_computed.diff
git --no-pager diff --name-status 7972cb1..HEAD
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 3: Wire Into BrowserClient + Migration
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews/review.phase-3-wire-into-browserclient.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | modified | file-browser | Yes (F001, F006) |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/changes-view.tsx | modified | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-tree.tsx | modified | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx | modified | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-clipboard.ts | added | file-browser | Optional consolidation |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts | added | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts | added | file-browser | Yes (F006) |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/params/file-browser.params.ts | modified | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts | added | file-browser | Yes (F004, F006) |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/recent-files.ts | modified | file-browser | No |
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx | modified | _platform/panel-layout | Optional contract cleanup |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md | modified | docs/domains | No |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | modified | docs/domains | No |
| /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | modified | docs/domains | No |
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | modified | docs/domains | No |
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | modified | plan docs | Yes (F005) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-path-handler.test.ts | added | tests | Yes (F002, F008) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-tree.test.tsx | modified | tests | No |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/params.test.ts | modified | tests | No |
| /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md | added | unrelated plan | Yes (scope split) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Implement `barContext.showError` visible notification | Current no-op violates AC-6 style UX and hides navigation failures |
| 2 | /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-path-handler.test.ts | Replace mocks with fakes and add 5-field Test Doc blocks | Required by project doctrine (R-TEST-007, R-TEST-002) |
| 3 | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/execution.log.md and relevant tests | Add missing Full-TDD evidence + explicit tests/evidence for AC-9/22/23/24/25 | Current coverage confidence too low and evidence incomplete |
| 4 | /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts | Fix worktree-prefix boundary normalization | Prevent false-positive prefix stripping |
| 5 | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx, /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts, /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts | Replace `.../panel-layout/types` imports with public barrel imports | Enforce contract-only cross-domain imports |
| 6 | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | Update Domain Manifest with all newly created Phase 3 files | Remove orphan-file compliance gap |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | Domain Manifest entries for new hooks and `services/file-path-handler.ts` |

### Next Step

/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md --phase 'Phase 3: Wire Into BrowserClient + Migration'
