# Fix Tasks: Phase 4: PR View Data Layer

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Validate hashed paths against the selected worktree
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/content-hash.ts, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/content-hash.test.ts
- **Issue**: `computeContentHash()` accepts caller-controlled absolute paths and traversal segments, so PR View can hash files outside the selected worktree.
- **Fix**: Resolve `filePath` through `PathResolverAdapter.resolvePath(worktreePath, filePath)` (or equivalent trusted-root validation), reject `PathSecurityError`, and add negative tests for traversal / absolute-path inputs.
- **Patch hint**:
  ```diff
  - import * as path from 'node:path';
  + import { PathResolverAdapter, PathSecurityError } from '@chainglass/shared';
  + const pathResolver = new PathResolverAdapter();

  - const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(worktreePath, filePath);
  + const absolutePath = pathResolver.resolvePath(worktreePath, filePath);

  - } catch {
  + } catch (error) {
  +   if (error instanceof PathSecurityError) return '';
      return '';
    }
  ```

### FT-002: Return real payloads for untracked files in working mode
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/get-all-diffs.test.ts
- **Issue**: Working mode lists `untracked` files, but `git diff HEAD` / `git diff HEAD --numstat` omit them, so the aggregate payload sends `diff: null` and `0/0` stats.
- **Fix**: Detect `status === 'untracked'` entries and synthesize a new-file diff plus line counts (or fetch them through a dedicated helper) before building `PRViewFile[]`. Add a real-repo test with an unstaged untracked file.
- **Patch hint**:
  ```diff
    const stats = statsMap.get(filePath) ?? { insertions: 0, deletions: 0 };
    const diff = diffsMap.get(filePath) ?? null;
  + if (status === 'untracked' && diff === null) {
  +   const content = await readFileWithinWorktree(worktreePath, filePath);
  +   diffsMap.set(filePath, buildNewFileDiff(filePath, content));
  +   statsMap.set(filePath, countInsertedLines(content));
  + }
  ```

### FT-003: Add request-contract tests for PR View route/actions
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/pr-view/route.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/pr-view-actions.ts
- **Issue**: The phase ships new API and server-action entrypoints, but there is no direct test evidence for auth, validation, or successful GET/POST/DELETE behavior.
- **Fix**: Add tests that cover: 401 responses, invalid worktree, invalid mode/action, successful working-mode GET, successful branch-mode GET, POST mark/unmark, and DELETE clear. Keep the tests scoped to temp worktrees and real helper behavior.
- **Patch hint**:
  ```diff
  + // test/unit/web/features/071-pr-view/pr-view-route.test.ts
  + it('returns 400 for invalid mode', async () => {
  +   const response = await GET(makeRequest('?worktree=/tmp/repo&mode=bogus'));
  +   expect(response.status).toBe(400);
  + });
  +
  + it('marks and clears reviewed state through the route surface', async () => {
  +   // arrange temp repo + auth stub, then assert POST/DELETE responses
  + });
  ```

### FT-004: Fix aggregate invalidation and prove it with integration tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-state.test.ts
- **Issue**: `aggregatePRViewData()` ignores empty current hashes, so a reviewed file that was later deleted stays reviewed. The same modified/deleted invalidation path has no end-to-end test coverage.
- **Fix**: Treat a missing current hash as a content change when `reviewedContentHash` exists, and add integration tests for: (1) reviewed file modified after review, and (2) reviewed file deleted after review.
- **Patch hint**:
  ```diff
  - if (currentHash && reviewedState.reviewedContentHash && currentHash !== reviewedState.reviewedContentHash) {
  + if (
  +   reviewedState.reviewedContentHash &&
  +   (!currentHash || currentHash !== reviewedState.reviewedContentHash)
  + ) {
        previouslyReviewed = true;
        reviewed = false;
      }
  ```

## Medium / Low Fixes

### FT-005: Activate stale-entry pruning in live mutation paths
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/pr-view-state.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts
- **Issue**: `saveReviewedState(..., activeFiles)` can prune stale entries, but no shipped caller provides `activeFiles`, so old branch entries accumulate forever.
- **Fix**: Pass the current active changed-file set into mark/unmark rewrites, or prune stale entries during aggregation/load before hashing reviewed files.
- **Patch hint**:
  ```diff
  - export function markFileReviewed(worktreePath: string, filePath: string, contentHash: string): void {
  + export function markFileReviewed(
  +   worktreePath: string,
  +   filePath: string,
  +   contentHash: string,
  +   activeFiles?: Set<string>
  + ): void {
  ...
  -   saveReviewedState(worktreePath, states);
  +   saveReviewedState(worktreePath, states, activeFiles);
    }
  ```

### FT-006: Replace the internal `file-browser` import with a published contract
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts, /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md, /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
- **Issue**: `pr-view` currently imports `file-browser` internals (`041-file-browser/services/working-changes`) instead of consuming a published cross-domain contract.
- **Fix**: Either publish `getWorkingChanges()` as a documented `file-browser` contract (barrel export + domain docs + map updates) or extract the capability into an appropriate shared/infrastructure contract.
- **Patch hint**:
  ```diff
  - import { getWorkingChanges } from '@/features/041-file-browser/services/working-changes';
  + import { getWorkingChanges } from '@/features/041-file-browser';
  ```

### FT-007: Keep the PR View L3 diagram internal-only
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/c4/components/pr-view.md
- **Issue**: The L3 diagram redraws external `Auth` / `File Browser` nodes and arrows, which violates the C4 authoring rules for `docs/c4/**`.
- **Fix**: Remove external nodes/arrows from the Mermaid block and keep those dependencies in prose / L2 docs only.
- **Patch hint**:
  ```diff
  -     Container_Ext(auth, "Auth", "requireAuth()")
  -     Container_Ext(fileBrowser, "File Browser", "getWorkingChanges()")
  -
  -     Rel(aggregator, fileBrowser, "Working mode<br/>file listing")
  -     Rel(apiRoute, auth, "Auth guard")
  -     Rel(actions, auth, "Auth guard")
  +     %% External dependencies stay in prose / L2; keep L3 internal-only.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
