# Code Review: Simple Implementation

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-spec.md  
**Phase**: Simple Mode (Simple Implementation dossier)  
**Date**: 2026-02-26  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Lightweight

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness, traceability, and verification gaps remain unresolved.

**Key failure areas**:
- **Implementation**: FlowSpace `#`/`$` keyboard navigation does not delegate Arrow/Enter correctly in ExplorerPanel and can fall through to the old fallback submit path.
- **Domain compliance**: Changed test artifacts are not fully reflected in the plan/domain metadata (`Domain Manifest`, `domain.md`, and domain map currency).
- **Testing**: Execution evidence is missing, key FlowSpace tests remain skipped, and regression protection for stub removal is effectively absent.
- **Doctrine**: A tautological test (`expect(true).toBe(true)`) violates the project’s test-value rules.

## B) Summary

The phase introduces substantial FlowSpace UI wiring and type updates, but one high-impact interaction bug remains in keyboard handling for symbols/semantic modes.  
Domain traceability is incomplete: changed files are not fully mirrored in manifest/history artifacts, and domain documentation is stale against the current contract surface.  
Testing evidence quality is low for a Lightweight strategy because execution logs contain no verification output and critical tests are skipped or non-behavioral.  
No genuine cross-domain reinvention was detected in this diff.

## C) Checklist

**Testing Approach: Lightweight**

For Lightweight:
- [ ] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:159-166,333-351 | correctness | `symbols`/`semantic` modes do not delegate Arrow/Enter to dropdown results; Enter can fall through to fallback submit path. | Delegate keys for FlowSpace result modes and block fallback handler-chain submit for prefixed search. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts | domain/orphan | Changed file is not represented in Plan 051 Domain Manifest traceability mapping. | Update manifest to include this file (or align changes to manifest scope). |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md:31-46,63-76,92-103 | domain-md | Panel Layout domain contract/history still references removed stub contract and omits Plan 051 FlowSpace contract surface. | Update domain.md contracts/composition/history for Plan 051. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md:1-8 | testing-evidence | Execution log has no command/test artifacts; acceptance verification is unproven. | Add timestamped command outputs and outcomes for validation steps. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts:61-140 | testing | Primary FlowSpace action tests are skipped (`describe.skip`), leaving key parsing/availability/error contracts unverified. | Unskip and execute tests for parsing, availability, timeout/error, malformed JSON. |
| F006 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts:11-16 | doctrine/testing | Regression test is tautological (`expect(true).toBe(true)`) and does not test any behavior. | Replace with behavioral assertions (or remove file if no contract remains). |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md:148-167 | domain-md | File Browser domain history/composition does not reflect Plan 051 FlowSpace wiring changes in BrowserClient. | Add Plan 051 history/composition update entries. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:17,72 | map-nodes | Domain map contract labels for panel-layout are stale relative to Plan 051 exports/contracts. | Refresh node labels and health table contract list for panel-layout. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md | testing-evidence | Interactive ACs (keyboard behavior, debounce, context actions) have no concrete evidence artifacts. | Add focused tests or manual verification transcripts with observed outcomes. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md | quality-gate | Required quality-gate evidence (`just fft`) is not recorded for this phase. | Run and log quality-gate command results in execution log. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: ExplorerPanel key handling delegates command/search modes, but not FlowSpace result modes (`symbols`/`semantic`). This risks incorrect Enter behavior and fallback path execution.
- No additional high-confidence security or performance defects were identified in this scoped diff.

### E.2) Domain Compliance

- **F002 (HIGH)**: Changed test file is orphaned from Plan 051 Domain Manifest traceability.
- **F003 (HIGH)**: `_platform/panel-layout/domain.md` not current for Plan 051 contract/history changes.
- **F007 (MEDIUM)**: `file-browser/domain.md` currency lag for FlowSpace wiring.
- **F008 (MEDIUM)**: `domain-map.md` node contract currency lag for panel-layout.

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Changed files remain under expected domain trees. |
| Contract-only imports | ✅ | No cross-domain internal-import violation found in reviewed diff. |
| Dependency direction | ✅ | No infra→business inversion detected in reviewed changes. |
| Domain.md updated | ❌ | `_platform/panel-layout/domain.md` and `file-browser/domain.md` are stale for Plan 051. |
| Registry current | ✅ | `docs/domains/registry.md` does not require new domain entries for this phase. |
| No orphan files | ❌ | `test/unit/web/features/panel-layout/stub-handlers.test.ts` changed but not mapped in Plan 051 manifest. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` panel-layout contract labels not current with Plan 051 surface. |
| Map edges current | ✅ | No new dependency edges introduced by this diff requiring relabeling. |
| No circular business deps | ✅ | No business-domain cycle introduced by reviewed changes. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| FlowSpace enhancements added primarily within existing components (no new standalone duplicate service/adapter in this scoped diff) | None | N/A | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 18%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 5 | No timing evidence in execution log; no performance assertion in changed tests. |
| AC-02 | 55 | Result row rendering logic present in dropdown; no runtime artifact logged. |
| AC-03 | 50 | `smartContent` rendering path present; no execution proof. |
| AC-04 | 20 | No explicit test/log proof for relevance sorting behavior. |
| AC-05 | 30 | Enter path exists, but FlowSpace key delegation gap remains; no passing interaction proof. |
| AC-06 | 55 | Debounce constant and query flow present; no executed debounce proof. |
| AC-07 | 60 | Not-installed message path exists; no runtime artifact logged. |
| AC-08 | 60 | No-graph message path exists; no runtime artifact logged. |
| AC-09 | 65 | Quick Access hint updates implemented in dropdown. |
| AC-10 | 45 | Stub wiring removal present, but regression test is non-behavioral. |
| AC-11 | 60 | Loading spinner path present; no runtime artifact logged. |
| AC-12 | 40 | Error path exists, but action tests are skipped. |
| AC-13 | 50 | Mode selection/regex-upgrade logic appears implemented; tests skipped. |
| AC-14 | 55 | `--limit 20` appears in action args. |
| AC-15 | 55 | Folder distribution header rendering present; unverified in logs. |
| AC-16 | 60 | Context-menu options for FlowSpace results appear wired. |
| AC-17 | 45 | Graph age computation/rendering present; no verification artifact. |
| AC-18 | 35 | Semantic embedding precondition handling is only partially evidenced. |
| AC-19 | 65 | Semantic badge rendering appears present. |
| AC-20 | 60 | Empty-query hint logic appears present for text/semantic modes. |

### E.5) Doctrine Compliance

- **F006 (HIGH)**: Tautological test violates test doctrine expectations for behavioral value and regression signal.
- No additional substantive rules/architecture boundary violations were identified in the scoped code diff.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | `#` query returns quickly | No timing evidence logged | 5 |
| AC-02 | Result row fields render | UI rendering code present | 55 |
| AC-03 | `smart_content` one-liner | UI rendering code present | 50 |
| AC-04 | Sorted by relevance | No explicit verification artifact | 20 |
| AC-05 | Keyboard navigation/select/escape | Partial implementation; delegation gap remains | 30 |
| AC-06 | 300ms debounce | Hook logic present; no executed proof | 55 |
| AC-07 | Not-installed UX | Message path present | 60 |
| AC-08 | No-graph UX | Message path present | 60 |
| AC-09 | Quick Access hints updated | Dropdown hint updates present | 65 |
| AC-10 | Stub removed/no toast | Wiring changed, but regression test non-behavioral | 45 |
| AC-11 | Loading spinner | Spinner path present | 60 |
| AC-12 | Friendly error on failure | Error path present; tests skipped | 40 |
| AC-13 | Text vs regex/semantic mode behavior | Action logic present; unverified by active tests | 50 |
| AC-14 | Limit 20 results | Arg usage present | 55 |
| AC-15 | Folder distribution display | Header path present | 55 |
| AC-16 | Context menu actions | Actions appear wired | 60 |
| AC-17 | Graph age display | Hook/UI path present | 45 |
| AC-18 | Semantic embeddings handling | Partially evidenced only | 35 |
| AC-19 | Semantic badge | Badge rendering present | 65 |
| AC-20 | Empty-query hints | Hint logic present | 60 |

**Overall coverage confidence**: **18%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12

PLAN_DIR="/Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search"
REVIEW_DIR="$PLAN_DIR/reviews"
mkdir -p "$REVIEW_DIR"
git --no-pager diff -- \
  apps/web/src/features/_platform/panel-layout/types.ts \
  apps/web/src/lib/server/flowspace-search-action.ts \
  apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts \
  apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx \
  apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx \
  apps/web/src/features/_platform/panel-layout/stub-handlers.ts \
  apps/web/src/features/_platform/panel-layout/index.ts \
  apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx \
  test/unit/web/features/041-file-browser/flowspace-search-action.test.ts \
  test/unit/web/features/panel-layout/stub-handlers.test.ts > "$REVIEW_DIR/_computed.diff"
git --no-pager diff --staged -- [same file list] >> "$REVIEW_DIR/_computed.diff"
git --no-pager diff --name-status -- [same file list]
git --no-pager diff --staged --name-status -- [same file list]

rg "^diff --git" docs/plans/051-flowspace-search/reviews/_computed.diff -n
rg "panel-layout|file-browser|FlowSpace|createSymbolSearchStub" docs/domains/domain-map.md -n
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-spec.md  
**Phase**: Simple Mode (Simple Implementation dossier)  
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/tasks.md  
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md  
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/index.ts | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/stub-handlers.ts | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts | Modified | _platform/panel-layout | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Delegate Arrow/Enter for `symbols` + `semantic` result modes and avoid fallback submit path for prefixed FlowSpace queries | Prevent broken keyboard UX and incorrect fallback behavior (F001) |
| 2 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts | Unskip and complete FlowSpace action tests | Restore contract verification for parsing/availability/error handling (F005) |
| 3 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts | Replace tautological test with behavioral assertions or remove | Current test provides no regression protection and violates doctrine (F006) |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md | Add command-level evidence for verification and quality gate | AC coverage and quality-gate proof are currently missing (F004/F009/F010) |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-plan.md | Update Domain Manifest to include changed test artifact (or align scope) | Remove orphan traceability gap (F002) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md | Plan 051 history + contract/composition updates (remove stub contract, add FlowSpace surface) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md | Plan 051 history/composition note for BrowserClient FlowSpace integration |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Updated panel-layout contract labels/health summary for current contract surface |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-plan.md --phase "Simple Implementation"
