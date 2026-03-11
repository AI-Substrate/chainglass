# Code Review: Phase 6: PR View Live Updates + Branch Mode

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 6: PR View Live Updates + Branch Mode
**Date**: 2026-03-10
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 6 wires the intended live-update and mode-toggle surfaces, but one user-visible correctness bug remains in the mode-switch path, and the new Phase 6 tests do not exercise the real hook/panel behavior that would catch it.

**Key failure areas**:
- **Implementation**: `usePRViewData` only force-fetches on mode change when cached data already exists, so an early toggle can strand the overlay in Branch mode while showing Working-mode data.
- **Domain compliance**: `docs/domains/domain-map.md` and `docs/domains/pr-view/domain.md` do not fully reflect the new `_platform/events` dependency and live-update ownership added in Phase 6.
- **Reinvention**: PR View adds a second `FileChangeProvider` instance instead of extending the existing workspace-level provider path, so T003's shared-SSE design is still not realized.
- **Testing**: `pr-view-mode-switch.test.ts` and `pr-view-live-updates.test.ts` restate local boolean/state logic instead of exercising the real hook/panel code paths, leaving AC-10 and AC-14b under-verified.
- **Doctrine**: The new phase-specific tests do not meet the project's documented behavior-first testing intent or the per-test Test Doc convention.

## B) Summary

Overall code quality is close, and the live-update wiring, lint, typecheck, and targeted 071 test suite all complete successfully. The main blocker is a stale-data path in `usePRViewData`: switching modes before the initial fetch settles can leave the UI showing Working data while the header says Branch. Domain artifacts were only partially updated; the domain map and PR View domain doc lag the new `_platform/events` dependency and Phase 6 ownership boundaries. No new standalone service was introduced, but the panel-local `FileChangeProvider` duplicates an existing workspace provider path instead of reusing it. Evidence quality is mixed: commands pass, but the new Phase 6 tests do not execute the real `usePRViewData` / panel behavior and therefore miss the primary regression found in this review.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid:
- [ ] Hook/data logic covered by behavior-focused tests against the real implementation
- [ ] UI wiring validated by lightweight component or manual checks
- [ ] Critical acceptance criteria mapped to concrete evidence

Universal:
- [ ] Only in-scope files changed
- [x] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts:137-143` | correctness | Mode changes only force-fetch when `data` already exists, so toggling during the first load can leave Branch mode showing Working data. | Force a refetch on every mode change and include the real dependencies in the effect. |
| F002 | HIGH | `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-mode-switch.test.ts:14-134` | testing | The mode-switch tests reimplement local state transitions instead of exercising `usePRViewData` / header wiring, so they miss user-visible regressions like F001. | Replace them with behavioral tests that mount the real hook/component path and assert fetch behavior. |
| F003 | HIGH | `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-live-updates.test.ts:12-161` | testing | The live-update tests only replay booleans and counters and never render `PRViewPanelContent`, `FileChangeProvider`, or `useFileChanges`. | Add lightweight behavioral coverage for the real SSE-triggered refresh and invalidation flow. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:127-167` | domain compliance | The domain map and health summary omit the new `pr-view -> _platform/events` dependency introduced in Phase 6. | Add a labeled `prView --> events` edge and update the summary rows. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md:26-29,124-129` | domain compliance | The PR View domain doc still says live updates are not owned and lists a phase, not a real domain, as a dependent. | Update ownership and dependency prose to reflect the implemented Phase 6 behavior. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:81-93`<br/>`/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx:198-201` | reinvention | Phase 6 still mounts separate `FileChangeProvider` instances for the browser and PR View overlay instead of extending the existing workspace-level provider path. | Consolidate the provider into an existing client wrapper, or explicitly document the accepted deviation. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `usePRViewData.switchMode()` invalidates cache, but the follow-up `useEffect` only calls `fetchData(true)` when `data` is already truthy. If the user clicks Branch before the initial Working fetch resolves, no second fetch is launched, the in-flight Working response can still win, and the UI can show Working diffs while the header says Branch. The fix is to refetch on every mode change and depend on the real fetch callback / worktree path.
- No additional security or error-handling defects were found in the reviewed Phase 6 code paths.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Changed implementation files remain under the expected `pr-view`, `file-browser`, and workspace wrapper trees. |
| Contract-only imports | ✅ | No cross-domain import reached into another business domain's obvious private implementation files. |
| Dependency direction | ✅ | The new dependency is `pr-view -> _platform/events`, which is business → infrastructure and allowed. |
| Domain.md updated | ❌ | `docs/domains/pr-view/domain.md` still says `SSE/live update integration (Phase 6)` is not owned and lists a phase label instead of a real dependent domain. |
| Registry current | ✅ | `pr-view` is already present in `docs/domains/registry.md`; no registry additions were needed. |
| No orphan files | ❌ | The current phase diff also includes `/Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts` and `/Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-provider.tsx`, which are outside the Phase 6 task table / manifest. |
| Map nodes current | ✅ | No new domain nodes were introduced in Phase 6. |
| Map edges current | ❌ | `docs/domains/domain-map.md` is missing the new `prView --> events` edge, and its health summary still omits `pr-view` as an `_platform/events` consumer. |
| No circular business deps | ✅ | No new business-to-business cycle was introduced by this phase. |
| Concepts documented | ✅ | `docs/domains/pr-view/domain.md` has a Concepts table and now includes live updates / switch-mode entries. |

- **F004 (MEDIUM)** — `docs/domains/domain-map.md` must be updated for the new `_platform/events` dependency. The current map lacks the edge label (`FileChangeProvider`, `useFileChanges`) and the health summary still treats live updates as an abstract future consumer instead of a concrete provider relationship.
- **F005 (MEDIUM)** — `docs/domains/pr-view/domain.md` is internally inconsistent after Phase 6. The `Does NOT Own` section says live updates are outside the boundary, while the History and Concepts sections describe them as implemented behavior.
- **Supporting note** — `/Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/events/domain.md:154-157` also omits `pr-view` from `Domains That Depend On This` and should be updated with the Phase 6 consumer relationship.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Panel-local `FileChangeProvider` wrapper in PR View overlay | BrowserClient already mounts `FileChangeProvider`, and `/Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx` is an existing client-side mounting point that could host a shared provider | `_platform/events` / `pr-view` | ⚠️ **Extend existing provider placement** rather than duplicating it |

- **F006 (MEDIUM)** — The current Phase 6 implementation still opens a second file-change SSE provider when the PR View overlay is open. That may be an acceptable trade-off, but it is not the shared-provider design called out in T003 and should be either consolidated or documented as an intentional deviation.

### E.4) Testing & Evidence

**Coverage confidence**: 41%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-03 | 35% | Static inspection of `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx` shows the header renders branch name, Working/Branch toggle, stats, and progress, but no dedicated behavior test covers it. |
| AC-08 | 50% | Existing Phase 4 data-layer coverage (`pr-view-entrypoints.test.ts`, `content-hash.test.ts`) still supports content-hash invalidation; Phase 6 adds the refresh trigger, but no direct UI test proves the banner path end to end. |
| AC-10 | 25% | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx` wires `useFileChanges('*', { debounce: 300 })`, but the new live-update tests are synthetic and do not render the real provider/panel flow. |
| AC-14a | 65% | Existing branch-mode data tests (`git-branch-service.test.ts`, `get-all-diffs.test.ts`) plus the new mode-switch test file provide partial evidence that both comparison modes exist. |
| AC-14b | 30% | Header buttons and `switchMode` wiring exist in code, but F001 and the lack of behavioral tests mean the visible file-list/diff update behavior is not reliably verified. |

- `just test-feature 071` passed with **11 test files / 102 tests**.
- `just lint` passed.
- `just typecheck` passed.
- **F002 (HIGH)** and **F003 (HIGH)** remain because the new Phase 6 tests do not execute the real hook/component code paths and therefore would not catch the regression in F001.

### E.5) Doctrine Compliance

The only doctrine-level issues are the testing-rule gaps captured by **F002** and **F003**: the new phase-specific tests do not validate the actual hook/component behavior, and they do not follow the project's documented per-test Test Doc convention. No additional naming, directory, or layer-boundary violations were found, and `just lint` / `just typecheck` both passed.

### E.6) Harness Live Validation

N/A — no harness configured (`/Users/jordanknight/substrate/071-pr-view/docs/project-rules/harness.md` does not exist).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-03 | Header shows branch name, mode toggle, stats, and viewed progress | Static inspection of `pr-view-header.tsx`; no dedicated behavior test | 35% |
| AC-08 | Viewed status auto-resets and "Previously viewed" appears after file changes | Existing data-layer hash invalidation tests plus Phase 6 refresh wiring; no direct UI verification | 50% |
| AC-10 | PR View updates live when files change on disk | `useFileChanges('*', { debounce: 300 })` wiring in `pr-view-overlay-panel.tsx`; synthetic tests only | 25% |
| AC-14a | PR View supports Working and Branch comparison modes | Existing branch-mode data tests plus new mode-switch test file | 65% |
| AC-14b | Toggle updates file list and diffs for the selected mode | Header toggle + `switchMode` wiring exist, but F001 and missing behavioral tests leave this under-verified | 30% |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
phase_dir='/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-6-pr-view-live-updates'
review_dir="$phase_dir/reviews"
tmp="$review_dir/_computed.diff"
: > "$tmp"
git --no-pager diff --no-ext-diff --binary >> "$tmp"
if ! git --no-pager diff --staged --quiet; then
  printf '\n' >> "$tmp"
  git --no-pager diff --staged --no-ext-diff --binary >> "$tmp"
fi
git ls-files --others --exclude-standard \
  | grep -v '^docs/plans/071-pr-view/tasks/phase-6-pr-view-live-updates/reviews/' \
  | while IFS= read -r f; do
      git --no-pager diff --no-index --binary /dev/null "$f" >> "$tmp" || true
    done
just test-feature 071
just lint
just typecheck
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 6: PR View Live Updates + Branch Mode
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-6-pr-view-live-updates/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-6-pr-view-live-updates/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-6-pr-view-live-updates/reviews/review.phase-6-pr-view-live-updates.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts | Modified | pr-view | Fix F001 |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx | Modified | pr-view | Reconcile shared provider placement (F006) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx | Modified | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | Reconcile shared provider placement (F006) |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-mode-switch.test.ts | New | pr-view tests | Replace per F002 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-live-updates.test.ts | New | pr-view tests | Replace per F003 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-overlay.test.ts | Modified | pr-view tests | None |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md | Modified | pr-view docs | Update per F005 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Reviewed | domain docs | Update per F004 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/events/domain.md | Reviewed | _platform/events docs | Add `pr-view` consumer note |
| /Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts | Modified | generated | Verify/remove incidental drift |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-provider.tsx | Modified | _platform/sdk | Verify that the bundled Phase 5 fix is intentionally included |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts | Ensure every mode change launches a fresh fetch, even before initial data exists, and cannot leave Branch mode showing Working data. | Current logic violates AC-14b in a real user interaction path. |
| 2 | /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-mode-switch.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-live-updates.test.ts | Replace synthetic logic tests with real behavioral coverage of `usePRViewData`, the header toggle, and the live-refresh path. | Current tests do not execute the real Phase 6 implementation and miss F001. |
| 3 | /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Add the `pr-view -> _platform/events` edge and update health summary rows. | Domain-map validation is mandatory and currently stale for Phase 6. |
| 4 | /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/events/domain.md | Align ownership and dependency sections with the implemented live-update behavior. | Domain documentation is internally inconsistent / incomplete after Phase 6. |
| 5 | /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx; /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx; /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx | Consolidate or explicitly document `FileChangeProvider` placement. | T003 called for one shared SSE connection per workspace; the current shape still duplicates the provider path. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | `prView --> events` edge label and health summary rows for `_platform/events` / `pr-view` |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md | Correct Phase 6 ownership boundary and real dependent-domain list |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/events/domain.md | `pr-view` in `Domains That Depend On This` |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 6: PR View Live Updates + Branch Mode'
