/**
 * Diff Aggregator — assembles PRViewData from multiple git sources
 *
 * Orchestrates parallel fetches of changed files, diffs, stats, and
 * reviewed state into a single PRViewData object for the overlay.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChangedFile } from '@/features/041-file-browser/services/working-changes';
import { getWorkingChanges } from '@/features/041-file-browser/services/working-changes';
import type {
  BranchChangedFile,
  ComparisonMode,
  DiffFileStatus,
  PRViewData,
  PRViewFile,
} from '../types';
import { computeContentHash } from './content-hash';
import { getAllDiffs } from './get-all-diffs';
import {
  getChangedFilesBranch,
  getCurrentBranch,
  getDefaultBaseBranch,
  getMergeBase,
} from './git-branch-service';
import { getPerFileDiffStats } from './per-file-diff-stats';
import { loadReviewedState } from './pr-view-state';

/** Map working-changes status to our DiffFileStatus */
function mapWorkingStatus(status: ChangedFile['status']): DiffFileStatus {
  return status;
}

/** Build a synthetic new-file diff for untracked files not in git diff output */
function buildNewFileDiff(filePath: string, content: string): string {
  const lines = content.split('\n');
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
  ];
  const body = lines.map((l) => `+${l}`);
  return [...header, ...body].join('\n');
}

/** Read file content safely within worktree (for untracked file synthesis) */
function readFileContent(worktreePath: string, filePath: string): string {
  try {
    return fs.readFileSync(path.join(worktreePath, filePath), 'utf-8');
  } catch {
    return '';
  }
}

/** Count lines in content (for untracked file stats) */
function countLines(content: string): { insertions: number; deletions: number } {
  if (!content) return { insertions: 0, deletions: 0 };
  return { insertions: content.split('\n').length, deletions: 0 };
}

/**
 * Aggregate all PR View data for a worktree in the given comparison mode.
 *
 * Parallel strategy:
 * 1. Fetch changed files + branch info + stats + reviewed state + all diffs concurrently
 * 2. Merge results into PRViewFile[] with hash-based invalidation
 *
 * @param worktreePath - Absolute worktree path
 * @param mode - 'working' (vs HEAD) or 'branch' (vs main merge-base)
 */
export async function aggregatePRViewData(
  worktreePath: string,
  mode: ComparisonMode
): Promise<PRViewData> {
  const branch = await getCurrentBranch(worktreePath);

  // Determine base ref for branch mode
  let baseRef: string | undefined;
  if (mode === 'branch') {
    const baseBranch = await getDefaultBaseBranch(worktreePath);
    const mergeBase = await getMergeBase(worktreePath, baseBranch);
    baseRef = mergeBase ?? undefined;
  }

  // Parallel fetch: files + stats + diffs + reviewed state
  const [fileList, statsMap, diffsMap, reviewedStates] = await Promise.all([
    mode === 'working'
      ? getWorkingChanges(worktreePath).then((r) => (r.ok ? r.files : []))
      : baseRef
        ? getChangedFilesBranch(worktreePath, baseRef)
        : Promise.resolve([]),
    getPerFileDiffStats(worktreePath, baseRef),
    getAllDiffs(worktreePath, baseRef),
    Promise.resolve(loadReviewedState(worktreePath)),
  ]);

  // Build reviewed state lookup
  const reviewedMap = new Map(reviewedStates.map((s) => [s.filePath, s]));

  // Compute content hashes for reviewed files to check invalidation
  const reviewedPaths = reviewedStates.filter((s) => s.reviewed).map((s) => s.filePath);

  const hashEntries = await Promise.all(
    reviewedPaths.map(async (fp) => {
      const hash = await computeContentHash(worktreePath, fp);
      return [fp, hash] as const;
    })
  );
  const currentHashes = new Map(hashEntries);

  // Assemble PRViewFile[]
  const files: PRViewFile[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;
  let reviewedCount = 0;

  const fileEntries: Array<{ filePath: string; status: DiffFileStatus }> =
    mode === 'working'
      ? (fileList as ChangedFile[]).map((f) => ({
          filePath: f.path,
          status: mapWorkingStatus(f.status),
        }))
      : (fileList as BranchChangedFile[]).map((f) => ({
          filePath: f.path,
          status: f.status,
        }));

  for (const { filePath, status } of fileEntries) {
    let stats = statsMap.get(filePath) ?? { insertions: 0, deletions: 0 };
    let diff = diffsMap.get(filePath) ?? null;

    // Synthesize diff and stats for untracked files (git diff HEAD omits them)
    if (status === 'untracked' && diff === null) {
      const content = readFileContent(worktreePath, filePath);
      diff = buildNewFileDiff(filePath, content);
      stats = countLines(content);
    }

    const reviewedState = reviewedMap.get(filePath);

    // Content hash invalidation: if reviewed but hash changed or file deleted, auto-reset
    let reviewed = reviewedState?.reviewed ?? false;
    let previouslyReviewed = false;

    if (reviewed && reviewedState) {
      const currentHash = currentHashes.get(filePath) ?? '';
      if (
        reviewedState.reviewedContentHash &&
        (!currentHash || currentHash !== reviewedState.reviewedContentHash)
      ) {
        previouslyReviewed = true;
        reviewed = false;
      }
    }

    if (reviewed) reviewedCount++;

    const parsed = path.parse(filePath);
    files.push({
      path: filePath,
      dir: parsed.dir ? `${parsed.dir}/` : '',
      name: parsed.base,
      status,
      insertions: stats.insertions,
      deletions: stats.deletions,
      diff,
      reviewed,
      reviewedAt: reviewed ? reviewedState?.reviewedAt : undefined,
      previouslyReviewed: previouslyReviewed || undefined,
      contentHash: currentHashes.get(filePath),
    });

    totalInsertions += stats.insertions;
    totalDeletions += stats.deletions;
  }

  // Sort files alphabetically by path
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    branch,
    mode,
    stats: {
      totalInsertions,
      totalDeletions,
      fileCount: files.length,
      reviewedCount,
    },
  };
}
