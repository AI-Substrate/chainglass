/**
 * Workspace Change Notifier Service interface.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Phase 4: Real-time Updates - Detect CLI modifications to workgraph files
 *
 * This service watches all registered workspaces for state.json changes and
 * emits events that the web layer can use to trigger SSE broadcasts.
 *
 * Architecture:
 * - Lives in packages/workflow (shared, not web-specific)
 * - Watches workspace registry for add/remove
 * - Discovers worktrees via IGitWorktreeResolver
 * - Watches all <worktree>/.chainglass/data/work-graphs/ folders
 * - Emits GraphChangedEvent when state.json changes
 *
 * Implementations:
 * - WorkspaceChangeNotifierService: Real implementation using chokidar
 * - FakeWorkspaceChangeNotifierService: Configurable implementation for testing
 */

/**
 * Event emitted when a workgraph state file changes.
 *
 * Contains all information needed to identify which graph changed
 * and broadcast an SSE notification.
 */
export interface GraphChangedEvent {
  /**
   * Slug of the workgraph that changed.
   * Extracted from path: .../work-graphs/{graphSlug}/state.json
   */
  graphSlug: string;

  /**
   * Slug of the workspace containing this graph.
   * Resolved from the watched worktree path.
   */
  workspaceSlug: string;

  /**
   * Absolute path to the worktree where the change occurred.
   */
  worktreePath: string;

  /**
   * Absolute path to the changed state.json file.
   */
  filePath: string;

  /**
   * Timestamp when the change was detected.
   */
  timestamp: Date;
}

/**
 * Callback type for graph change notifications.
 */
export type GraphChangedCallback = (event: GraphChangedEvent) => void;

/**
 * Service interface for watching workspace changes.
 *
 * Usage:
 * ```typescript
 * const notifier = container.get<IWorkspaceChangeNotifierService>('workspaceChangeNotifier');
 *
 * // Register callback before starting
 * const unsubscribe = notifier.onGraphChanged((event) => {
 *   broadcastGraphUpdated(event.graphSlug);
 * });
 *
 * // Start watching all workspaces
 * await notifier.start();
 *
 * // Later: cleanup
 * unsubscribe();
 * await notifier.stop();
 * ```
 */
export interface IWorkspaceChangeNotifierService {
  /**
   * Start watching all registered workspaces.
   *
   * This method:
   * 1. Reads the workspace registry to get all workspaces
   * 2. Resolves worktrees for each workspace via git worktree list
   * 3. Watches <worktree>/.chainglass/data/work-graphs/ for each worktree
   * 4. Watches the registry file for workspace add/remove
   *
   * @throws Error if already started (call stop() first)
   */
  start(): Promise<void>;

  /**
   * Stop all file watchers and cleanup resources.
   *
   * After calling stop(), the service can be started again.
   * Clears all registered callbacks.
   */
  stop(): Promise<void>;

  /**
   * Register a callback for graph change events.
   *
   * Multiple callbacks can be registered. Each receives all events.
   * Callbacks are invoked synchronously when changes are detected.
   *
   * @param callback - Function to call when a graph changes
   * @returns Unsubscribe function that removes this callback
   */
  onGraphChanged(callback: GraphChangedCallback): () => void;

  /**
   * Check if the service is currently watching.
   *
   * @returns true if start() has been called and stop() has not
   */
  isWatching(): boolean;

  /**
   * Force a rescan of workspaces.
   *
   * Normally called automatically when the registry file changes.
   * Can be called manually if registry was modified externally.
   *
   * This method:
   * 1. Re-reads the workspace registry
   * 2. Compares current watch paths with new paths
   * 3. Adds watchers for new workspaces/worktrees
   * 4. Removes watchers for deleted workspaces/worktrees
   */
  rescan(): Promise<void>;
}
