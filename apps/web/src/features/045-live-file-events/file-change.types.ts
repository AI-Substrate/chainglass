/**
 * Plan 045: Live File Events — Client-side types
 *
 * These types represent file change events as seen by browser components.
 * Derived from server-side FileChangeBatchItem but scoped to a single worktree
 * (FileChangeProvider filters by worktreePath before dispatching).
 *
 * Per DYK #2: Includes all 5 event types the server sends (add, change, unlink, addDir, unlinkDir).
 * Per DYK #3: SSEManager injects `type` at top level of the payload object.
 */

/** A single file change event dispatched to subscribers. */
export interface FileChange {
  /** Relative path from worktree root (e.g., 'src/components/Button.tsx') */
  path: string;
  /** Type of filesystem event */
  eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  /** When the change was detected (Unix ms) */
  timestamp: number;
}

/**
 * SSE message payload shape for file-changed events.
 * SSEManager merges `type` into the data object at the top level.
 */
export interface FileChangeSSEMessage {
  type: 'file-changed';
  changes: Array<{
    path: string;
    eventType: string;
    worktreePath: string;
    timestamp: number;
  }>;
}

/** Callback type for FileChangeHub subscribers */
export type FileChangeCallback = (changes: FileChange[]) => void;

/**
 * Interface for FileChangeHub implementations.
 * Both FileChangeHub (real) and FakeFileChangeHub (test) implement this.
 */
export interface IFileChangeHub {
  subscribe(pattern: string, callback: FileChangeCallback): () => void;
  dispatch(changes: FileChange[]): void;
  readonly subscriberCount: number;
}
