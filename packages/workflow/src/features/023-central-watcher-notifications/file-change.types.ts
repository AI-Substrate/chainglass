/**
 * Plan 045: Live File Events
 *
 * Shared types for file change watcher adapters.
 * Both FileChangeWatcherAdapter (real) and FakeFileChangeWatcherAdapter (fake)
 * import from here — no direct imports between adapter and fake.
 */

/**
 * A single file change item within a batch.
 * Minimal payload per ADR-0007 — clients fetch full state via REST.
 */
export interface FileChangeBatchItem {
  /** Relative path from worktree root (e.g., 'src/app.tsx') */
  path: string;
  /** Type of filesystem event */
  eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  /** Absolute path to worktree root */
  worktreePath: string;
  /** When the change was detected (Date.now()) */
  timestamp: number;
}

/** Callback type for batch subscribers */
export type FilesChangedCallback = (changes: FileChangeBatchItem[]) => void;
