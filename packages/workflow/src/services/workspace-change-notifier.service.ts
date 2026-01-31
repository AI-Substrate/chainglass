/**
 * Workspace Change Notifier Service implementation.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Phase 4: Real-time Updates - Detect CLI modifications to workgraph files
 *
 * This service watches all registered workspaces for state.json changes and
 * emits GraphChangedEvent events. It integrates with the web layer to broadcast
 * SSE notifications when CLI commands modify workgraph state.
 *
 * Architecture:
 * - Uses chokidar (via IFileWatcher) for filesystem watching
 * - Watches workspace registry for dynamic workspace add/remove
 * - Discovers worktrees via IGitWorktreeResolver
 * - Emits events for state.json changes only
 *
 * Configuration:
 * - atomic: true — handles temp→rename pattern from atomicWriteFile()
 * - awaitWriteFinish — waits for file to stabilize before emitting
 */

import type { IFileSystem } from '@chainglass/shared';
import type { IFileWatcher, IFileWatcherFactory } from '../interfaces/file-watcher.interface.js';
import type { IGitWorktreeResolver } from '../interfaces/git-worktree-resolver.interface.js';
import type {
  GraphChangedCallback,
  GraphChangedEvent,
  IWorkspaceChangeNotifierService,
} from '../interfaces/workspace-change-notifier.interface.js';
import type { IWorkspaceRegistryAdapter } from '../interfaces/workspace-registry-adapter.interface.js';

/**
 * Metadata for a watched path - maps back to workspace info.
 */
interface WatchedPathMeta {
  workspaceSlug: string;
  worktreePath: string;
}

/**
 * WorkspaceChangeNotifierService implementation.
 *
 * Watches all registered workspaces for state.json changes.
 * Emits GraphChangedEvent when CLI or external processes modify workgraph state.
 */
export class WorkspaceChangeNotifierService implements IWorkspaceChangeNotifierService {
  /** Watcher for the workspace registry file */
  private registryWatcher: IFileWatcher | null = null;

  /** Watcher for all workgraph directories */
  private workgraphWatcher: IFileWatcher | null = null;

  /** Registered change callbacks */
  private callbacks = new Set<GraphChangedCallback>();

  /** Map of watched paths to workspace metadata */
  private watchedPaths = new Map<string, WatchedPathMeta>();

  /** Whether the service is currently watching */
  private _isWatching = false;

  constructor(
    private readonly workspaceRegistry: IWorkspaceRegistryAdapter,
    private readonly worktreeResolver: IGitWorktreeResolver,
    private readonly filesystem: IFileSystem,
    private readonly fileWatcherFactory: IFileWatcherFactory,
    private readonly registryPath: string = '~/.config/chainglass/workspaces.json'
  ) {}

  async start(): Promise<void> {
    if (this._isWatching) {
      throw new Error('WorkspaceChangeNotifierService is already watching');
    }

    // 1. Watch the registry file
    const expandedRegistryPath = this.expandPath(this.registryPath);
    this.registryWatcher = this.fileWatcherFactory.create({
      ignoreInitial: true,
      persistent: true,
    });
    this.registryWatcher.add(expandedRegistryPath);
    this.registryWatcher.on('change', () => {
      // Fire and forget - rescan handles errors internally
      this.rescan().catch((err) => {
        console.error('Error during registry rescan:', err);
      });
    });

    // 2. Create workgraph watcher with debounce config
    this.workgraphWatcher = this.fileWatcherFactory.create({
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      ignoreInitial: true,
      persistent: true,
    });

    // 3. Set up change handler
    this.workgraphWatcher.on('change', (path) => {
      if (typeof path === 'string') {
        this.handleFileChange(path);
      }
    });

    // 4. Set up error handler
    this.workgraphWatcher.on('error', (error) => {
      console.error('Workgraph watcher error:', error);
    });

    // 5. Scan all workspaces and start watching
    await this.scanAndWatch();

    this._isWatching = true;
  }

  async stop(): Promise<void> {
    if (this.registryWatcher) {
      await this.registryWatcher.close();
      this.registryWatcher = null;
    }
    if (this.workgraphWatcher) {
      await this.workgraphWatcher.close();
      this.workgraphWatcher = null;
    }
    this.callbacks.clear();
    this.watchedPaths.clear();
    this._isWatching = false;
  }

  onGraphChanged(callback: GraphChangedCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  isWatching(): boolean {
    return this._isWatching;
  }

  async rescan(): Promise<void> {
    if (!this.workgraphWatcher) {
      return;
    }

    const newPaths = await this.collectWatchPaths();

    // Diff and update
    const currentPathSet = new Set(this.watchedPaths.keys());
    const newPathSet = new Set(newPaths.keys());

    // Add new paths
    for (const [path, meta] of newPaths) {
      if (!currentPathSet.has(path)) {
        this.workgraphWatcher.add(path);
        this.watchedPaths.set(path, meta);
      }
    }

    // Remove old paths
    for (const path of currentPathSet) {
      if (!newPathSet.has(path)) {
        this.workgraphWatcher.unwatch(path);
        this.watchedPaths.delete(path);
      }
    }
  }

  /**
   * Initial scan of all workspaces to set up watchers.
   */
  private async scanAndWatch(): Promise<void> {
    const paths = await this.collectWatchPaths();

    if (paths.size === 0) {
      return; // No workspaces to watch
    }

    this.watchedPaths = paths;

    // Add all paths to watcher
    if (this.workgraphWatcher) {
      this.workgraphWatcher.add([...paths.keys()]);
    }
  }

  /**
   * Collect all work-graphs directories to watch.
   */
  private async collectWatchPaths(): Promise<Map<string, WatchedPathMeta>> {
    const paths = new Map<string, WatchedPathMeta>();

    try {
      const workspaces = await this.workspaceRegistry.list();

      for (const ws of workspaces) {
        try {
          // Detect worktrees for this workspace
          const worktrees = await this.worktreeResolver.detectWorktrees(ws.path);

          // If no worktrees detected, use workspace path directly
          const pathsToCheck = worktrees.length > 0 ? worktrees.map((wt) => wt.path) : [ws.path];

          for (const wtPath of pathsToCheck) {
            const watchPath = `${wtPath}/.chainglass/data/work-graphs`;

            // Only add if directory exists
            if (await this.filesystem.exists(watchPath)) {
              paths.set(watchPath, {
                workspaceSlug: ws.slug,
                worktreePath: wtPath,
              });
            }
          }
        } catch (err) {
          // Skip this workspace on error, continue with others
          console.error(`Error processing workspace ${ws.slug}:`, err);
        }
      }
    } catch (err) {
      console.error('Error listing workspaces:', err);
    }

    return paths;
  }

  /**
   * Handle a file change event.
   */
  private handleFileChange(filePath: string): void {
    // Only care about state.json files
    if (!filePath.endsWith('/state.json')) {
      return;
    }

    // Extract graphSlug: .../work-graphs/{graphSlug}/state.json
    const match = filePath.match(/work-graphs\/([^/]+)\/state\.json$/);
    if (!match) {
      return;
    }
    const graphSlug = match[1];

    // Find which watched path this belongs to
    let workspaceSlug = '';
    let worktreePath = '';

    for (const [watchPath, meta] of this.watchedPaths) {
      if (filePath.startsWith(watchPath)) {
        workspaceSlug = meta.workspaceSlug;
        worktreePath = meta.worktreePath;
        break;
      }
    }

    // Build event
    const event: GraphChangedEvent = {
      graphSlug,
      workspaceSlug,
      worktreePath,
      filePath,
      timestamp: new Date(),
    };

    // Emit to all callbacks
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in GraphChangedEvent callback:', err);
      }
    }
  }

  /**
   * Expand ~ to home directory in path.
   */
  private expandPath(path: string): string {
    if (path.startsWith('~')) {
      return path.replace('~', process.env.HOME || '');
    }
    return path;
  }
}
