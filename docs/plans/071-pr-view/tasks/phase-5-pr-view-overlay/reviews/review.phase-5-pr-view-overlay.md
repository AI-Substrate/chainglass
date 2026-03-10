# Code Review: Phase 5: PR View Overlay

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 5: PR View Overlay
**Date**: 2026-03-10
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight (Phase 5 UI within the spec's Hybrid strategy)

## A) Verdict

**REQUEST_CHANGES**

High-severity validation and domain-boundary gaps remain before this phase is ready to commit.

**Key failure areas**:
- **Implementation**: The header stops at a mode badge instead of the documented disabled Working/Branch toggle placeholder for Phase 5.
- **Domain compliance**: Business-domain SDK registrations are still composed from a file that lives under the `_platform/sdk` source tree, and the supporting domain artifacts are not fully synchronized.
- **Testing**: Phase 5 ships 14 UI-facing source changes but still has no phase-specific lightweight UI validation or concrete per-AC evidence.
- **Doctrine**: The current phase-scoped Biome check fails on `pr-view-overlay-wrapper.tsx`, so the claimed zero-Biome-error quality gate is not actually green.

## B) Summary

Phase 5 largely follows the existing overlay and SDK contribution patterns, and the pre-existing PR View data-layer suite still passes locally (`49 passed` across 6 test files). However, that passing suite is still Phase 4-only; this review did not find direct automated or manual verification for the new overlay interactions, scroll-sync behavior, or reviewed/collapsed UI flows introduced in this phase. Domain compliance is also incomplete: SDK registration composition still sits under the `_platform/sdk` tree, the plan's Domain Manifest omits two changed files, and the domain map / SDK domain doc are stale for the Phase 5 public surface. Reinvention risk is low overall — the new files appropriately reuse established overlay, data-hook, and SDK patterns rather than duplicating another domain's capability.

## C) Checklist

**Testing Approach: Lightweight**

- [ ] Core validation tests present for the Phase 5 overlay behaviors
- [ ] Critical paths covered (open/toggle, mutual exclusion, Escape, scroll sync, viewed collapse, worktree gating)
- [ ] Key verification points documented with concrete observed outcomes
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (Biome currently fails on `pr-view-overlay-wrapper.tsx`; typecheck was not independently re-run)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/execution.log.md:11-13,131-137 | testing | Phase 5 records aggregate pass counts, but the review found no phase-specific lightweight UI tests or manual evidence for the new overlay behaviors. | Add focused PR View UI validation (tests and/or concrete manual evidence) for the Phase 5 acceptance criteria, then update the execution log with exact commands and observed outcomes. |
| F002 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-domain-registrations.ts:12-27 | domain | Business-domain SDK registrations are still composed from a file that lives under the `_platform/sdk` source tree and is invoked during SDK bootstrap. | Move this registration composition to an app-level composition root outside `_platform/sdk`, or reclassify/relocate the file and synchronize the domain docs accordingly. |
| F003 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx:47-52 | scope | Phase 5 task T004 called for a visible disabled Working/Branch toggle placeholder, but the header only renders a single mode badge. | Replace the badge with the planned two-option placeholder toggle (or narrow the phase/task claims and evidence to match the shipped UI). |
| F004 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx:20-22 | pattern | `PRViewDiffSection` lazy-loads `DiffViewer` from the viewer domain's internal file path instead of its public barrel export. | Import `DiffViewer` from `@/components/viewers` so `pr-view` consumes the viewer public surface rather than an internal module. |
| F005 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md:30-77 | domain | The plan's Domain Manifest does not map `use-pr-view-data.ts` or `sdk-domain-registrations.ts`, so the changed-file set is not fully accounted for. | Add explicit Domain Manifest rows for both files, or relocate/reclassify `sdk-domain-registrations.ts` and document the justified placement. |
| F006 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:42-45,163-164 | domain | The `prView` node/health summary still describe only the Phase 4 data layer and omit the Phase 5 UI + SDK contracts and provider edges. | Update the `prView` node label, labeled edges, and Domain Health Summary so Phase 5 contracts/consumers/providers are current. |
| F007 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/sdk/domain.md:55-62,75-110 | domain | `_platform/sdk` still documents itself as having no domain dependencies even though its listed source tree includes a file that imports business domains. | Either move the composition file out of `_platform/sdk` or update the SDK domain's Source Location, Dependencies, and History sections to match the current wiring. |
| F008 | LOW | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx:26-55 | doctrine | The phase-scoped Biome check fails on `pr-view-overlay-wrapper.tsx`, so the phase does not currently meet its claimed zero-Biome-error quality gate. | Re-run Biome on the Phase 5 files and commit the formatting change before attempting to commit the phase. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F003 (MEDIUM)** — `pr-view-header.tsx` currently renders a one-state badge (`Working` / `Branch`) instead of the documented Phase 5 placeholder toggle. That leaves the shipped UI short of Task T004's stated "mode toggle visible but disabled" requirement and weakens the AC-03 evidence.
- No additional high-signal runtime defect was confirmed during spot checks of `use-pr-view-data.ts`, `pr-view-overlay-panel.tsx`, `pr-view-diff-area.tsx`, and the wrapper/sidebar wiring. The strongest implementation concern in this review is therefore the documented scope mismatch in the header control rather than a confirmed logic failure.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | Most new files live under `apps/web/src/features/071-pr-view/`, but `apps/web/src/lib/sdk/sdk-domain-registrations.ts` still lives under the `_platform/sdk` source tree while importing business-domain registration code. |
| Contract-only imports | ❌ | `pr-view-diff-section.tsx` imports `DiffViewer` from `@/components/viewers/diff-viewer` instead of the viewer public barrel. |
| Dependency direction | ❌ | `sdk-provider.tsx` bootstraps `registerAllDomains()` from a file that imports `registerFileBrowserSDK()`, `registerFileNotesSDK()`, and `registerPRViewSDK()`, so infrastructure bootstrap still reaches into business domains. |
| Domain.md updated | ❌ | `docs/domains/pr-view/domain.md` is current, but `docs/domains/_platform/sdk/domain.md` is stale for the current placement/history/dependency story around `sdk-domain-registrations.ts`. |
| Registry current | ✅ | `docs/domains/registry.md` already contains the Plan 071 `pr-view` and `file-notes` domains. |
| No orphan files | ❌ | `pr-view-plan.md` omits both `apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts` and `apps/web/src/lib/sdk/sdk-domain-registrations.ts` from the Domain Manifest. |
| Map nodes current | ❌ | The `prView` node and health summary still describe the Phase 4 data layer rather than the Phase 5 UI/hook/SDK surface. |
| Map edges current | ❌ | The domain map does not show the new labeled `prView` dependencies on `_platform/viewer`, `_platform/panel-layout`, and `_platform/sdk`. |
| No circular business deps | ✅ | The review did not identify a new business-to-business cycle in the current Phase 5 wiring. |
| Concepts documented | ✅ | `docs/domains/pr-view/domain.md` includes a Level 1 Concepts table, and the Phase 5 public contracts appear there. |

**Domain notes**:
- **F002 (HIGH)** is the blocking boundary issue: the composition file's path/classification still places business-domain imports under `_platform/sdk` even though its header comment says it should be app-level wiring.
- **F004-F007 (MEDIUM)** capture the remaining artifact drift: one internal viewer import plus stale plan/domain-map/SDK-doc records.

### E.3) Anti-Reinvention

No blocking reinvention findings surfaced.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| PR view overlay provider hook | `use-notes-overlay.tsx`, `use-activity-log-overlay.tsx`, `use-terminal-overlay.tsx` | file-notes, activity-log, terminal | ✅ Proceed — proven overlay pattern reuse |
| PR view data hook | `use-notes.ts` | file-notes | ✅ Proceed — same cached-hook pattern, different domain capability |
| PR view overlay panel | `notes-overlay-panel.tsx`, `activity-log-overlay-panel.tsx`, `terminal-overlay-panel.tsx` | file-notes, activity-log, terminal | ✅ Proceed — overlay-shell reuse, not duplication |
| PR view header | None | — | ✅ Proceed |
| PR view file list | `changes-view.tsx` | file-browser | ⚠️ Extend if the file-list abstraction ever needs another consumer |
| PR view diff section | `DiffViewer` consumer pattern | _platform/viewer | ✅ Proceed |
| PR view diff area | None | — | ✅ Proceed |
| PR view overlay wrapper | Existing overlay wrappers | file-notes, activity-log, terminal | ✅ Proceed |
| PR view SDK contribution | Existing SDK contribution pattern | file-notes, events, file-browser | ✅ Proceed |
| PR view SDK register | Existing SDK registration pattern | file-notes, events, file-browser | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 41%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 48 | `dashboard-sidebar.tsx:294-303`, `layout.tsx`, and `pr-view-overlay-wrapper.tsx` statically wire the sidebar button and overlay mount. No UI test or recorded manual interaction proves the button actually opens the overlay. |
| AC-02 | 45 | `use-pr-view-overlay.tsx:66-113` dispatches and listens for `overlay:close-all` with an `isOpeningRef` guard. Runtime mutual-exclusion behavior was not directly exercised in this review. |
| AC-03 | 20 | `pr-view-header.tsx` shows branch/stats/progress, but only as a badge — not the documented disabled Working/Branch toggle placeholder. No manual or automated evidence covers the final header behavior. |
| AC-04 | 52 | `pr-view-file-list.tsx` renders status badges, dir/name split, +/- counts, and viewed checkboxes. Evidence is still source-level only. |
| AC-05 | 50 | `pr-view-diff-section.tsx` renders collapsible per-file sections, sticky headers, viewed controls, and the "Previously viewed" banner. No interaction evidence confirms the section behavior in a live UI. |
| AC-06 | 38 | `pr-view-diff-area.tsx` implements `scrollIntoView` plus `IntersectionObserver`-based active-file tracking, but the scroll-sync behavior is untested and undocumented in the execution log. |
| AC-07 | 44 | `use-pr-view-data.ts` optimistically marks reviewed files and collapses them, while `pr-view-file-list.tsx` dims reviewed rows. No direct proof shows the checkbox-to-collapse behavior end-to-end. |
| AC-09 | 47 | `pr-view-header.tsx` exposes Expand All / Collapse All buttons and `use-pr-view-data.ts` implements the handlers. No UI evidence shows those controls being exercised successfully. |
| AC-11 | 43 | The provider/panel arrangement suggests state can survive close/reopen within the mounted provider, but the execution log does not record a close/reopen verification. |
| AC-13 | 58 | `pr-view-overlay-panel.tsx:83-94` installs an Escape key handler that closes the overlay. This is one of the stronger static signals, but it still lacks direct verification evidence. |
| AC-14 | 50 | `dashboard-sidebar.tsx` gates the button on `currentWorktree`, and `use-pr-view-overlay.tsx:80-87` refuses to open if no worktree path resolves. No run-time verification shows the overlay remaining unavailable in non-worktree contexts. |

**Testing notes**:
- **F001 (HIGH)** remains blocking even after a local `vitest` run because the passing suite still covers only Phase 4 data-layer utilities/entrypoints; it does not validate the new Phase 5 overlay interactions.
- `pnpm exec vitest run test/unit/web/features/071-pr-view/` passed locally with **49 passed / 0 failed**, which increases confidence in the existing data layer but not in the new UI phase.
- `pnpm exec biome check ...` currently fails on `pr-view-overlay-wrapper.tsx`, so the execution log's zero-Biome-error claim is not reproduced.

### E.5) Doctrine Compliance

- **F001 (HIGH)** also maps to `docs/project-rules/rules.md:94-99` (`R-TEST-001`) because the approved Phase 5 TDD deviation still required lightweight validation after implementation, not zero phase-specific validation.
- **F008 (LOW)** is a direct quality-gate miss rather than a style nit: `pnpm exec biome check apps/web/src/features/071-pr-view apps/web/src/components/dashboard-sidebar.tsx apps/web/src/lib/sdk/sdk-domain-registrations.ts 'apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx'` currently fails.
- Outside those issues, the reviewed Phase 5 code generally follows the repository's naming and placement idioms (`kebab-case` files, client-only hooks/components where interactivity is required, and feature-local barrels/SDK modules).

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` is absent, so live validation was skipped.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Sidebar / explorer action opens PR View overlay | Sidebar event dispatch + layout/wrapper mount exist in code; no direct interaction proof | 48 |
| AC-02 | Opening PR View closes other overlays | `overlay:close-all` wiring present in `use-pr-view-overlay.tsx`; no run-time evidence | 45 |
| AC-03 | Header shows branch, mode control, stats, and progress | Branch/stats/progress exist; placeholder Working/Branch toggle is missing and unverified | 20 |
| AC-04 | File list shows flat changed-file rows with status and +/- counts | `pr-view-file-list.tsx` renders the expected fields; no direct UI validation | 52 |
| AC-05 | Right side renders collapsible diff sections | `pr-view-diff-section.tsx` implements sections, sticky header, banner, and diff viewer wrapper | 50 |
| AC-06 | Clicking a file scrolls to its diff section | `pr-view-diff-area.tsx` exposes `scrollToFile`; behavior untested | 38 |
| AC-07 | Marking a file viewed collapses the diff and dims the list row | `use-pr-view-data.ts` + `pr-view-file-list.tsx` encode the behavior; no end-to-end evidence | 44 |
| AC-09 | Expand All / Collapse All controls affect every section | Handler plumbing exists in header + data hook; no interaction evidence | 47 |
| AC-11 | Viewed/collapsed state persists across close/reopen in-session | Provider/panel structure suggests persistence, but the phase log does not prove it | 43 |
| AC-13 | Escape key closes PR View | Escape handler exists in `pr-view-overlay-panel.tsx`; no direct verification | 58 |
| AC-14 | PR View only appears for worktrees | Button gating + no-worktree guard are present; not directly exercised | 50 |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
python - <<'PY'  # wrote /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/reviews/_computed.diff and _manifest.tsv for the Phase 5 file manifest
pnpm exec vitest run test/unit/web/features/071-pr-view/
pnpm exec biome check apps/web/src/features/071-pr-view apps/web/src/components/dashboard-sidebar.tsx apps/web/src/lib/sdk/sdk-domain-registrations.ts 'apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx'
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 5: PR View Overlay
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/reviews/review.phase-5-pr-view-overlay.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-overlay.tsx | Created | pr-view | Cover overlay toggle / mutual-exclusion behavior via lightweight validation (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts | Created | pr-view | Add Phase 5 validation for reviewed/collapsed flows; add Domain Manifest row (F001/F005) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx | Created | pr-view | Cover open/close/Escape states via lightweight validation (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx | Created | pr-view | Replace mode badge with the planned disabled toggle placeholder (F003) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx | Created | pr-view | Cover click-to-scroll and viewed-row rendering in lightweight validation (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx | Created | pr-view | Import `DiffViewer` through the viewer public barrel (F004) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-diff-area.tsx | Created | pr-view | Cover scroll-sync behavior in lightweight validation (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx | Created | pr-view | Re-run Biome / commit the wrapper formatting fix (F008) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Modified | workspace-layout | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/components/dashboard-sidebar.tsx | Modified | _platform/panel-layout | Include worktree-gated button behavior in validation evidence (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/sdk/contribution.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/sdk/register.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-domain-registrations.ts | Modified | composition / _platform-sdk path | Relocate/reclassify composition root and sync docs (F002/F005/F007) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/index.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Existing | plan-docs | Add missing Domain Manifest rows (F005) |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Existing | domain-docs | Add Phase 5 pr-view contracts, labeled edges, and summary entries (F006) |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/sdk/domain.md | Existing | domain-docs | Align Source Location / Dependencies / History with current SDK composition wiring (F007) |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/execution.log.md | Existing | phase-artifact | Replace hand-wavy pass counts with concrete per-AC evidence (F001) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/execution.log.md and /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/ | Add lightweight Phase 5 UI validation/evidence for overlay open/toggle, mutual exclusion, Escape, scroll sync, viewed collapse, expand/collapse, and worktree gating | Phase 5 currently has no direct verification for the behaviors introduced in this phase (F001) |
| 2 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-domain-registrations.ts and /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-provider.tsx | Move or reclassify domain-registration composition so `_platform/sdk` no longer imports business domains during bootstrap | Current placement still violates the documented dependency direction / domain boundary (F002) |
| 3 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx | Replace the mode badge with the planned disabled Working/Branch placeholder toggle | The shipped header does not satisfy Phase 5 Task T004 / AC-03's documented placeholder-control expectation (F003) |
| 4 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx | Import `DiffViewer` from the viewer public barrel | Avoid cross-domain internal imports and keep `pr-view` on the published viewer surface (F004) |
| 5 | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md, and /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/sdk/domain.md | Sync the Domain Manifest, pr-view map node/edges, and SDK domain metadata with the Phase 5 code | The supporting domain artifacts are stale/incomplete for this phase (F005/F006/F007) |
| 6 | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx | Run Biome and commit the wrapper formatting change | Current Biome output is red for a phase file, so the quality gate is not clean (F008) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Domain Manifest rows for `apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts` and `apps/web/src/lib/sdk/sdk-domain-registrations.ts` |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Phase 5 `pr-view` contracts in the node label/health summary plus labeled edges to `_platform/viewer`, `_platform/panel-layout`, and `_platform/sdk` |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/sdk/domain.md | Updated Source Location / Dependencies / History if `sdk-domain-registrations.ts` remains under the SDK path |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 5: PR View Overlay'
