# Code Review: Phase 4: PR View Data Layer

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 4: PR View Data Layer
**Date**: 2026-03-09
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity security, data-completeness, and testing gaps remain in the Phase 4 data layer.

**Key failure areas**:
- **Implementation**: `computeContentHash()` accepts unsafe file paths, untracked working-tree files get no diff/stat payload, and deleted reviewed files can remain marked reviewed.
- **Domain compliance**: `pr-view` reaches into `file-browser` internals instead of a documented contract, and the supporting domain artifacts are not fully synchronized.
- **Testing**: The new API/actions surface is untested, and the aggregate invalidation path lacks direct coverage for modified/deleted reviewed files.
- **Doctrine**: The PR View L3 C4 diagram redraws cross-domain relationships that should stay at L2.

## B) Summary

Phase 4 establishes most of the planned PR View data-layer surface and the low-level git/JSONL helpers are generally well structured. However, the review found two high-severity implementation defects: caller-controlled file paths are hashed without worktree-bound validation, and working-mode untracked files reach the aggregate output without diffs or per-file stats. Domain compliance is partially complete, but `pr-view` currently depends on a `file-browser` internal service rather than a documented contract, and the supporting architecture docs are not fully synchronized. Reinvention risk is low overall; the only notable overlap is the new per-file diff stats helper versus `file-browser`'s aggregate diff stats service, which is adjacent rather than duplicative. Testing evidence is incomplete at the phase entrypoints: local Phase 4 tests pass (42/42), but the aggregate invalidation path and the new API/actions surface still lack direct verification.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Data-layer entrypoints are covered with TDD-grade tests
- [ ] API route and server action request contracts are tested
- [x] Core utility tests are present and pass (`pnpm exec vitest run test/unit/web/features/071-pr-view/`)
- [ ] Every Phase 4 acceptance criterion is mapped to concrete evidence
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not re-verified in this review)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/content-hash.ts:21-29 | security | `computeContentHash()` hashes caller-supplied absolute/traversal paths without enforcing the selected worktree boundary. | Validate `filePath` with `PathResolverAdapter` (or equivalent) before `git hash-object`, and add negative tests for traversal/absolute-path inputs. |
| F002 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts:61-69 | correctness | Working mode includes `untracked` files in the file list, but `git diff HEAD` / `--numstat` provide no diff or stats for them, so Phase 5 would receive incomplete file payloads. | Synthesize untracked-file diffs/stats (or fetch them via a dedicated path) before assembling `PRViewFile[]`, and cover the case with a real-repo test. |
| F003 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/pr-view/route.ts:30-119 | testing | The new PR View API/actions surface has no direct request-contract tests for auth, validation, or successful GET/POST/DELETE flows. | Add route/action tests covering 401, invalid worktree/mode/action, mark/unmark, clear, and successful working/branch fetches. |
| F004 | HIGH | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts:75-122 | testing | The aggregate invalidation path is untested, and deleted reviewed files currently remain reviewed because empty current hashes are ignored. | Treat a missing current hash as a change when prior review state exists, and add integration tests for reviewed files that are modified or deleted after review. |
| F005 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts:11-12 | domain | `pr-view` imports `file-browser`'s internal `working-changes` service directly instead of consuming a published contract, leaving the new business-to-business dependency undocumented at the contract layer. | Promote/extract a documented working-changes contract, then update `file-browser`/`pr-view` domain docs and the domain map to match the published provider. |
| F006 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/pr-view-state.ts:60-113 | performance | Stale-entry pruning exists only as an optional helper and is never exercised by the shipped mutation paths, so reviewed-state can grow without bound and still be re-hashed on later loads. | Thread the active changed-file set into rewrites (or prune during aggregation/load) so stale branch entries are actually removed. |
| F007 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/docs/c4/components/pr-view.md:38-43 | doctrine | The PR View L3 C4 diagram redraws external `Auth` and `File Browser` nodes plus cross-domain arrows, which violates the L3 “internal relationships only” rule. | Remove external nodes/arrows from the L3 diagram and keep those dependencies in prose or the L2 web-app diagram. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `content-hash.ts` resolves `filePath` with `path.isAbsolute(...) ? filePath : path.join(...)` and passes it directly to `git hash-object`. Because `markFileAsReviewed()` and `POST /api/pr-view` forward caller-controlled `filePath`, an authenticated request can hash files outside the selected worktree. Align this helper with the `PathResolverAdapter` pattern already used by `git-diff-action.ts`.
- **F002 (HIGH)** — `aggregatePRViewData()` uses `getWorkingChanges()` for file discovery, so `untracked` files appear in `fileEntries`, but `getAllDiffs(worktreePath)` and `getPerFileDiffStats(worktreePath)` both rely on `git diff HEAD`, which omits truly untracked files. Those entries currently surface as `diff: null` with `0/0` stats.
- **F004 (HIGH)** — The reviewed-state invalidation branch only fires when `currentHash` is truthy. A reviewed file that was later deleted therefore stays `reviewed: true` instead of flipping to `previouslyReviewed: true`, because `computeContentHash()` returns `''` for missing files and the comparison short-circuits.
- **F006 (MEDIUM)** — `saveReviewedState(..., activeFiles)` can prune stale entries, but `markFileReviewed()` / `unmarkFileReviewed()` never pass an active set. The stale-branch mitigation described in T003 / DYK-P4-05 is therefore not enforced by the live mutation paths.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New runtime files live under `apps/web/src/features/071-pr-view/`, web entrypoints under `apps/web/app/`, tests under `test/unit/web/features/071-pr-view/`, and docs under `docs/`. |
| Contract-only imports | ❌ | `diff-aggregator.ts` imports `@/features/041-file-browser/services/working-changes` directly even though `file-browser` does not publish that service in its Contracts table. |
| Dependency direction | ❌ | The new `pr-view -> file-browser` relationship is business-to-business via an internal implementation import instead of a published contract. |
| Domain.md updated | ✅ | `docs/domains/pr-view/domain.md` was created with Purpose, Boundary, Contracts, Concepts, Composition, Dependencies, and History sections. |
| Registry current | ✅ | `docs/domains/registry.md` includes `PR View | pr-view | business | — | Plan 071 Phase 4 | active`. |
| No orphan files | ❌ | The plan-level Domain Manifest is stale for Phase 4 and does not enumerate several changed artifacts (for example `lib/content-hash.ts`, `lib/get-all-diffs.ts`, `docs/c4/components/pr-view.md`, `docs/c4/README.md`, the updated registry/map files, and the Phase 4 test files). |
| Map nodes current | ✅ | `docs/domains/domain-map.md` now contains `prView` and `fileNotes` nodes plus health summary rows for both domains. |
| Map edges current | ❌ | The `prView --> getWorkingChanges() --> fileBrowser` edge is labeled, but the label does not correspond to a published `file-browser` contract, and the `_platform/auth` / provider-consumer summary rows are not fully synchronized with the new dependency. |
| No circular business deps | ✅ | Review did not find a new business-domain cycle; the new edge is one-way `pr-view -> file-browser`. |
| Concepts documented | ✅ | `docs/domains/pr-view/domain.md` includes a Level 1 Concepts table with entry points and behavior summaries. |

**Domain notes**:
- **F005 (MEDIUM)** captures the core contract-boundary issue.
- The map uses labels on every new edge, so there is no unlabeled-edge defect; the problem is contract publication/currency rather than missing labels.
- The plan artifact drift (`pr-view-plan.md` Domain Manifest) is documentation debt rather than a runtime failure, but it does violate the review requirement that every changed file map cleanly to a declared domain artifact list.

### E.3) Anti-Reinvention

No blocking reinvention findings surfaced.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Content hash service | None | — | ✅ Proceed |
| Reviewed state persistence | File Notes JSONL reader/writer pattern | file-notes | ✅ Reuses a proven pattern; not duplicate capability |
| Git branch service | None | — | ✅ Proceed |
| Per-file diff stats | `getDiffStats()` aggregate shortstat helper | file-browser | ⚠️ Adjacent overlap only; consider extraction if another consumer appears |
| Combined diff splitter | `getGitDiff()` per-file helper | file-browser | ✅ Fills missing combined-diff capability |
| Diff aggregation service | None | — | ✅ Proceed |
| PR View API/actions | Notes route/action pattern | file-notes | ✅ Pattern reuse, not reinvention |

### E.4) Testing & Evidence

**Coverage confidence**: 65%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-03 | 60 | `diff-aggregator.ts` returns `branch`, `mode`, and header stats; low-level branch/stat helpers are covered by `git-branch-service.test.ts` and `per-file-diff-stats.test.ts`, and the Phase 4 test run passed 42/42. No direct aggregator test asserts the final header payload. |
| AC-04 | 58 | Status parsing, per-file +/- counts, and reviewed-state persistence each have utility-level coverage, but no test proves `aggregatePRViewData()` assembles final `PRViewFile[]` entries with all fields together. |
| AC-08 | 42 | `content-hash.test.ts` proves hash computation and `diff-aggregator.ts` contains invalidation logic, but there is no end-to-end test that a reviewed file becomes `reviewed: false` / `previouslyReviewed: true` after an on-disk change. |
| AC-12 | 88 | `pr-view-state.test.ts` covers empty load, JSONL parsing, save/reload, prune, mark/update, unmark, and clear against the filesystem, and the state file path matches `.chainglass/data/pr-view-state.jsonl`. |
| AC-14a | 76 | Real-repo tests cover `getCurrentBranch`, `getDefaultBaseBranch`, `getMergeBase`, `getChangedFilesBranch`, and base-aware diff/stat helpers. The working-vs-branch switch inside `aggregatePRViewData()` itself is not directly tested. |

**Testing notes**:
- **F003 (HIGH)** — route/action tests are missing even though the spec calls for TDD on API routes.
- **F004 (HIGH)** — aggregate invalidation lacks the integration tests that would have exposed the deleted-file case immediately.
- The phase-local evidence directly supports the reviewed `42/42` PR View test run. Broader execution-log claims (for example `107/107 total tests across Phases 1-4`) were not independently re-verified during this review.

### E.5) Doctrine Compliance

- **F007 (MEDIUM)** — `docs/c4/components/pr-view.md` introduces external `Auth` / `File Browser` nodes and `Rel(...)` arrows. The `docs/c4/**` authoring rules explicitly require L3 diagrams to show only internal component relationships within the domain boundary.
- Outside that diagram issue, the reviewed Phase 4 code generally follows the documented naming/file-location idioms (`kebab-case` files, central test layout, strict typed exports).

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` is absent, so live validation was skipped.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-03 | Header shows branch name, comparison mode, file count, insertion/deletion stats, and reviewed progress | `aggregatePRViewData()` returns `branch`, `mode`, and `stats`; helper coverage from branch/stat utility tests; no direct aggregator assertion | 60 |
| AC-04 | File list shows changed files with status badges, per-file +/- counts, and reviewed state | Utility coverage exists for status parsing, diff stats, and reviewed-state persistence; assembled `PRViewFile[]` output is not directly tested | 58 |
| AC-08 | Reviewed files auto-reset when content changes and surface a previously-reviewed state | Hash helper and invalidation code exist, but no modified/deleted reviewed-file integration test covers the entrypoint behavior | 42 |
| AC-12 | Reviewed state persists across page refreshes in `.chainglass/data/` | `pr-view-state.test.ts` exercises save/load/mark/unmark/clear on the JSONL file at the documented path | 88 |
| AC-14a | Working and Branch comparison modes are both supported | Branch primitives plus base-aware diff/stat helpers are tested with real repos; the final aggregator mode switch remains indirectly covered | 76 |

**Overall coverage confidence**: 65%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager log --oneline --decorate --grep='PR View' --grep='Phase 4' --grep='071' --all -30
git --no-pager status --short -- apps/web/src/features/071-pr-view apps/web/app/actions/pr-view-actions.ts apps/web/app/api/pr-view/route.ts docs/domains/pr-view docs/domains/registry.md docs/domains/domain-map.md docs/c4/components/pr-view.md docs/c4/README.md test/unit/web/features/071-pr-view
python - <<'PY'  # wrote /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-4-pr-view-data-layer/reviews/_computed.diff from git diff + git diff --no-index for the Phase 4 file manifest
pnpm exec vitest run test/unit/web/features/071-pr-view/
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 4: PR View Data Layer
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-4-pr-view-data-layer/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-4-pr-view-data-layer/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-4-pr-view-data-layer/reviews/review.phase-4-pr-view-data-layer.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/docs/c4/README.md | Modified | c4 | None |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Modified | domain-docs | Sync provider/consumer rows if `getWorkingChanges()` stays a contract |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md | Modified | domain-docs | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/pr-view-actions.ts | Created | pr-view | Add direct action coverage (F003) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/pr-view/route.ts | Created | pr-view | Add request-contract coverage (F003) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/index.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/types.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/content-hash.ts | Created | pr-view | Validate resolved paths against worktree (F001) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/pr-view-state.ts | Created | pr-view | Wire stale-entry pruning into real mutation paths (F006) |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/git-branch-service.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/per-file-diff-stats.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/get-all-diffs.ts | Created | pr-view | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts | Created | pr-view | Fix untracked payloads, deleted-file invalidation, and contract boundary (F002/F004/F005) |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md | Created | pr-view-docs | Update dependency/contracts prose if provider contract changes |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/components/pr-view.md | Created | c4 | Remove external nodes/arrows (F007) |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/content-hash.test.ts | Created | tests | Add negative-path coverage (F001) |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-state.test.ts | Created | tests | Extend coverage if pruning stays here |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/git-branch-service.test.ts | Created | tests | None |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/per-file-diff-stats.test.ts | Created | tests | None |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/get-all-diffs.test.ts | Created | tests | Optional: narrow execution-log claims or add rename/large-output cases |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/content-hash.ts | Enforce worktree-bound path resolution before hashing and add negative-path tests | Prevent authenticated callers from hashing files outside the selected worktree (F001) |
| 2 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts | Provide real diff/stat payloads for untracked files in working mode | Phase 4 currently returns incomplete data for `untracked` entries (F002) |
| 3 | /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/pr-view/route.ts and /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/pr-view-actions.ts | Add route/action request-contract tests | Phase 4's new web entrypoints are unverified against auth/validation/CRUD behavior (F003) |
| 4 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts | Fix deleted-file invalidation and add reviewed-file integration tests | AC-08 entrypoint behavior is both under-tested and currently wrong for deleted files (F004) |
| 5 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/pr-view-state.ts | Wire stale-entry pruning into real save/mark/unmark flows | The DYK-P4-05 pruning mitigation is not active today (F006) |
| 6 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts and /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Replace the internal `file-browser` import with a published contract (or document/extract it properly) | Business-to-business dependencies must flow via contracts, not internal files (F005) |
| 7 | /Users/jordanknight/substrate/071-pr-view/docs/c4/components/pr-view.md | Keep the L3 diagram internal-only | Align the new C4 artifact with project C4 authoring rules (F007) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Publish the `pr-view -> file-browser` dependency consistently (contract label + consumer/provider summary rows) |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md | Align dependency prose/contracts if the working-changes capability is promoted or extracted |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md | If `getWorkingChanges()` remains the provider surface, add it to Contracts/Concepts/public exports |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/components/pr-view.md | Remove external nodes/arrows from the L3 diagram |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Refresh the Domain Manifest so every Phase 4 artifact is declared |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 4: PR View Data Layer'
