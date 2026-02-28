# Code Review: Simple Mode (Built-in Content Search)

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-spec.md  
**Phase**: Simple Mode  
**Date**: 2026-02-26  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Lightweight (expected)

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness, domain-compliance, and evidence gaps remain unmitigated.

**Key failure areas**:
- **Implementation**: `#` mode is still blocked by FlowSpace availability gates, and the git-grep hook can drop newer debounced queries.
- **Domain compliance**: Three changed files are not represented in the plan's Domain Manifest; domain docs and domain map are stale for Plan 052 contract changes.
- **Reinvention**: Minor helper duplication (`isGitAvailable`/repo checks) duplicates existing git-diff helper logic.
- **Testing**: No `execution.log.md` evidence and no new tests for planned T007 despite behavior-sensitive changes.

## B) Summary

The phase introduces the intended git-grep path and most UI/data wiring, but the current dropdown gating still ties `#` mode to FlowSpace readiness, which violates the feature intent and AC-11 behavior. The hook implementation has an in-flight guard that can leave stale results when users type quickly. Domain governance artifacts were not kept current for all touched files and renamed contracts, causing orphan/mapping documentation failures. Testing evidence quality is insufficient: no execution log and no changed test files for planned parser/error cases. Reinvention risk is low and limited to duplicated preflight helpers.

## C) Checklist

**Testing Approach: Lightweight**

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
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx:335-360 | correctness | `#` content search is gated by FlowSpace availability states (`not-installed`/`no-graph`) | Apply availability gating only for semantic (`$`) mode; allow grep (`#`) mode to render independently |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts:49-73 | correctness | In-flight guard drops newer debounced queries and can leave stale results | Use request-id/abort strategy; commit only latest request and rerun when query changed mid-flight |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts | domain/orphan | Changed file is not listed in Domain Manifest | Add file to plan Domain Manifest with domain/classification |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts | domain/orphan | Changed file is not listed in Domain Manifest | Add file to plan Domain Manifest with domain/classification |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/index.ts | domain/orphan | Changed file is not listed in Domain Manifest | Add file to plan Domain Manifest with domain/classification |
| F006 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md | testing/evidence | Execution log missing; no verifiable command/test evidence | Add execution log with exact commands and outputs |
| F007 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/git-grep-action.test.ts | testing/evidence | Planned test task T007 has no implementation evidence (no changed test files) | Add targeted unit tests for parser/grouping/error edge cases |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts:120-130 | security | Query is passed positionally; leading `-` can be parsed as option | Pass query with `-e` to force pattern interpretation |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md | domain-md | Domain history/composition/contracts not updated for Plan 052 additions | Add Plan 052 history and relevant contract/composition updates |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md | domain-md | Domain contract names are stale (FlowSpace-only naming) for current code search types | Update contracts/history to current `CodeSearch*`/`GrepSearchResult` surface |
| F011 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | map-nodes | Panel-layout node/health summary contracts are stale | Refresh node label and health summary contracts |
| F012 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | map-edges | Edge labels do not reflect updated code-search contract naming | Update labeled edges for current consumed contracts |
| F013 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx:497 | testing/behavior | Empty-state copy is `"No results"` instead of AC-12 `"No matches"` | Update copy and add assertion coverage |
| F014 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md | testing/evidence | No measured evidence for AC-01 latency target | Record timing evidence for debounce + response behavior |
| F015 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts | reinvention | Preflight helpers duplicate existing git-diff helper capability | Reuse/extend existing helper or extract shared utility |
| F016 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx:441-443 | testing/behavior | AC-02 mentions highlighted query text; snippet is plain | Add query-term highlight or update AC/spec wording and tests |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `#` mode can incorrectly show FlowSpace install/index messages despite git-grep being available.
- **F002 (HIGH)**: In-flight dedupe in `use-git-grep-search` can prevent latest query execution after rapid typing.
- **F008 (MEDIUM)**: Query should be passed using `-e` to avoid option-style input interpretation.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under expected domain trees |
| Contract-only imports | ✅ | No cross-domain internal import violation identified in changed files |
| Dependency direction | ✅ | No infrastructure → business inversion found |
| Domain.md updated | ❌ | `file-browser` and `_platform/panel-layout` docs are stale for Plan 052 |
| Registry current | ✅ | No new domain introduced; registry remains valid |
| No orphan files | ❌ | Three changed files are missing from plan Domain Manifest (F003-F005) |
| Map nodes current | ❌ | Domain map node/health contracts are stale (F011) |
| Map edges current | ❌ | Domain map edge labels stale for code-search contracts (F012) |
| No circular business deps | ✅ | No business-domain cycle introduced |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| git-grep action preflight helpers (`isGitAvailable`, `isGitRepo`) | `isGitAvailable` + `isGitRepository` in `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-diff-action.ts` | file-browser | LOW risk; prefer **extend** over duplicate |

### E.4) Testing & Evidence

**Coverage confidence**: **42%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 40 | 300ms debounce exists in hook; no timing evidence artifact |
| AC-02 | 50 | Filename/line/content render exists; highlight behavior not evidenced |
| AC-03 | 72 | Server groups by file and exposes `matchCount`; UI shows `+N more` |
| AC-04 | 70 | Keyboard handling includes Arrow/Enter/Escape and line navigation |
| AC-05 | 88 | Explicit debounce logic implemented (`DEBOUNCE_MS = 300`) |
| AC-06 | 86 | Source globs + `-I` binary skip are implemented |
| AC-07 | 63 | Regex intent + invalid-pattern error mapping present; no tests provided |
| AC-08 | 90 | `-i` case-insensitive flag present |
| AC-09 | 90 | Exact repo-required error string returned |
| AC-10 | 78 | Loading spinner renders while code search loading |
| AC-11 | 35 | Hint updated, but grep path still blocked by FlowSpace availability guards |
| AC-12 | 25 | No-result path returns `"No results"` not `"No matches"` |
| AC-13 | 82 | Context menu actions present on result rows |
| AC-14 | 88 | Results are sorted and capped to top 20 files |

### E.5) Doctrine Compliance

No violations reported against:
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/idioms.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/architecture.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/constitution.md

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | `#` search shows content matches within 500ms | Debounce implemented, but no execution timing evidence logged | 40 |
| AC-02 | Results show filename, line number, matching line content | Rendering present for all three fields; highlight behavior not evidenced | 50 |
| AC-03 | Multiple matches per file grouped with count | Grouping logic + `matchCount` and UI `+N more` present | 72 |
| AC-04 | Arrow/Enter/Escape navigation behavior | Keyboard handlers and select callback present | 70 |
| AC-05 | 300ms debounce | Hook constant and debounce effect present | 88 |
| AC-06 | Only configured source extensions searched | `SOURCE_GLOBS` and `-I` implemented | 86 |
| AC-07 | Regex support | Regex intent detection + server error mapping present | 63 |
| AC-08 | Case-insensitive default | `-i` flag in git grep args | 90 |
| AC-09 | Repo-required error when not git repo | Explicit repo-check and error string present | 90 |
| AC-10 | Loading spinner during search | `codeSearchLoading` drives spinner UI | 78 |
| AC-11 | Quick Access hint + availability expectation | Hint updated, but behavior blocked by FlowSpace availability branch | 35 |
| AC-12 | "No matches" empty state | Current copy is `"No results"` | 25 |
| AC-13 | Context menu on results | Copy/download actions present on result context menu | 82 |
| AC-14 | Limit to 20 files | Server-side `.slice(0, 20)` implemented | 88 |

**Overall coverage confidence**: **42%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager log --oneline -- docs/plans/052-built-in-text-search | head -20
for f in apps/web/src/lib/server/git-grep-action.ts apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts apps/web/src/features/_platform/panel-layout/types.ts apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx 'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' test/unit/web/features/041-file-browser/git-grep-action.test.ts; do git --no-pager log --oneline -1 -- "$f"; done
mkdir -p /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/reviews
git --no-pager diff --no-color 8b50690..HEAD > /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/reviews/_computed.diff
git --no-pager diff --name-status 8b50690..HEAD
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-spec.md  
**Phase**: Simple Mode  
**Tasks dossier**: inline in plan  
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md  
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts | Modified | file-browser | Yes (manifest update) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts | Added | file-browser | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx | Modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Modified | _platform/panel-layout | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/index.ts | Modified | _platform/panel-layout | Yes (manifest update) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts | Modified | _platform/panel-layout | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts | Modified | file-browser | Yes (manifest update) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts | Added | file-browser | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md | Modified (phase artifact) | planning | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx | Remove FlowSpace availability gating from grep (`#`) mode | `#` mode should work without FlowSpace installation/indexing |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts | Replace in-flight boolean short-circuit with latest-request-safe strategy | Prevent stale results when users type during in-flight request |
| 3 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts | Pass user pattern with `-e` | Avoid option-style input interpretation for leading `-` queries |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md | Add missing changed files to Domain Manifest | Resolve orphan-file domain compliance failures |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md | Add concrete test/quality command evidence | Required for acceptance-criteria verification |
| 6 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/git-grep-action.test.ts | Implement planned parser/error/limit tests | T007 planned but not evidenced |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md | Domain Manifest missing 3 changed files |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md | Plan 052 history/composition/contracts not reflected |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md | Plan 052 history + current code-search contract naming not reflected |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Panel-layout node and edge labels stale for current code-search contracts |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md
