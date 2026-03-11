/**
 * PR View Domain — Types
 *
 * Types for the PR View overlay: file status tracking, reviewed state
 * persistence, comparison modes, and aggregated diff data.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

/** Comparison mode — what the PR View compares against */
export type ComparisonMode = 'working' | 'branch';

/** Git file change status */
export type DiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';

/** Per-file insertion/deletion stats */
export interface DiffFileStats {
  insertions: number;
  deletions: number;
}

/**
 * PRViewFile — in-memory UI model for a single changed file.
 * Assembled by the diff aggregator from multiple git data sources.
 */
export interface PRViewFile {
  /** Relative file path from worktree root */
  path: string;
  /** Directory portion (e.g., "src/features/") */
  dir: string;
  /** Filename portion (e.g., "app.tsx") */
  name: string;
  /** Git change status */
  status: DiffFileStatus;
  /** Lines added */
  insertions: number;
  /** Lines deleted */
  deletions: number;
  /** Raw git diff text for this file (null if load failed) */
  diff: string | null;
  /** Error message if diff failed to load */
  diffError?: string;
  /** Whether user has marked this file as reviewed */
  reviewed: boolean;
  /** ISO-8601 timestamp when marked reviewed */
  reviewedAt?: string;
  /** True if file was reviewed but content changed since — auto-reset by hash check */
  previouslyReviewed?: boolean;
  /** Git content hash at time of review (for invalidation) */
  contentHash?: string;
  /** Whether this file has notes (from file-notes domain) */
  hasNotes?: boolean;
}

/**
 * PRViewFileState — persisted JSONL model for reviewed-file tracking.
 * Stored in .chainglass/data/pr-view-state.jsonl
 */
export interface PRViewFileState {
  /** Relative file path (unique key) */
  filePath: string;
  /** Whether marked as reviewed */
  reviewed: boolean;
  /** ISO-8601 timestamp when marked reviewed */
  reviewedAt: string;
  /** Git hash-object output at time of review — for change detection */
  reviewedContentHash: string;
}

/**
 * Aggregated PR View data — returned by diff-aggregator.
 * Everything Phase 5's overlay needs to render.
 */
export interface PRViewData {
  /** All changed files with diffs, stats, and reviewed state */
  files: PRViewFile[];
  /** Current branch name */
  branch: string;
  /** Active comparison mode */
  mode: ComparisonMode;
  /** Aggregate stats for the header */
  stats: {
    totalInsertions: number;
    totalDeletions: number;
    fileCount: number;
    reviewedCount: number;
  };
}

/** Result type for PR View operations */
export type PRViewResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Branch-mode changed file entry from git diff --name-status */
export interface BranchChangedFile {
  path: string;
  status: DiffFileStatus;
}

/** JSONL storage constants */
export const PR_VIEW_STATE_FILE = 'pr-view-state.jsonl';
export const PR_VIEW_STATE_DIR = '.chainglass/data';
