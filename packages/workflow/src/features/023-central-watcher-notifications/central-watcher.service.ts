/**
 * Central watcher service — domain-agnostic filesystem watching.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 2
 * Per AC1: Watches <worktree>/.chainglass/data/ per worktree
 * Per AC12: Zero domain-specific imports
 * Per CF-07: One IFileWatcher per worktree
 * Per CF-08: stop() preserves registered adapters
 *
 * Watches all worktree data directories and forwards raw filesystem events
 * to registered adapters. Domain knowledge lives entirely in adapters.
 */

import type { IFileSystem, ILogger } from '@chainglass/shared';
import type {
  FileWatcherEvent,
  IFileWatcher,
  IFileWatcherFactory,
} from '../../interfaces/file-watcher.interface.js';
import type { IGitWorktreeResolver } from '../../interfaces/git-worktree-resolver.interface.js';
import type { IWorkspaceRegistryAdapter } from '../../interfaces/workspace-registry-adapter.interface.js';
import type { ICentralWatcherService } from './central-watcher.interface.js';
import { SOURCE_WATCHER_IGNORED } from './source-watcher.constants.js';
import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

/** Metadata for a data watcher — maps watcher to its worktree/workspace context */
interface WatcherMetadata {
  worktreePath: string;
  workspaceSlug: string;
}

/**
 * Domain-agnostic watcher service that watches all worktree data directories
 * and dispatches raw filesystem events to registered adapters.
 */
export class CentralWatcherService implements ICentralWatcherService {
  private readonly registry: IWorkspaceRegistryAdapter;
  private readonly worktreeResolver: IGitWorktreeResolver;
  private readonly fs: IFileSystem;
  private readonly fileWatcherFactory: IFileWatcherFactory;
  private readonly registryPath: string;
  private readonly logger?: ILogger;

  /** Registered adapters — preserved across stop() per CF-08 */
  private readonly adapters = new Set<IWatcherAdapter>();

  /** Data watchers keyed by worktree path */
  private readonly dataWatchers = new Map<string, IFileWatcher>();

  /** Source file watchers keyed by worktree path */
  private readonly sourceWatchers = new Map<string, IFileWatcher>();

  /** Metadata for each data watcher — maps worktree path to context */
  private readonly watcherMetadata = new Map<string, WatcherMetadata>();

  /** Registry file watcher */
  private registryWatcher: IFileWatcher | null = null;

  /** Whether the service is currently watching */
  private watching = false;

  /** Guard to serialize rescan operations */
  private isRescanning = false;

  /** Whether another rescan was requested while one is in progress */
  private rescanQueued = false;

  constructor(
    registry: IWorkspaceRegistryAdapter,
    worktreeResolver: IGitWorktreeResolver,
    fs: IFileSystem,
    fileWatcherFactory: IFileWatcherFactory,
    registryPath: string,
    logger?: ILogger
  ) {
    this.registry = registry;
    this.worktreeResolver = worktreeResolver;
    this.fs = fs;
    this.fileWatcherFactory = fileWatcherFactory;
    this.registryPath = registryPath;
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.watching) {
      throw new Error('Already watching');
    }

    // Discover all worktrees and create data watchers
    await this.createDataWatchers();

    // Create source watchers (failure must not block data watchers)
    try {
      await this.createSourceWatchers();
    } catch (err) {
      this.logError('Source watcher creation failed (data watchers still active)', err);
    }

    this.logInfo('Started', {
      dataWatcherCount: this.dataWatchers.size,
      sourceWatcherCount: this.sourceWatchers.size,
    });

    // Create registry watcher
    this.registryWatcher = this.fileWatcherFactory.create({
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
    this.registryWatcher.add(this.registryPath);
    this.registryWatcher.on('change', () => {
      this.rescan().catch((err) => {
        this.logError('Rescan triggered by registry watcher failed', err);
      });
    });

    this.watching = true;
  }

  async stop(): Promise<void> {
    if (!this.watching) {
      return;
    }

    this.logInfo('Stopping', {
      dataWatcherCount: this.dataWatchers.size,
      sourceWatcherCount: this.sourceWatchers.size,
    });

    this.watching = false;
    this.rescanQueued = false;

    // Close all data watchers
    for (const [, watcher] of this.dataWatchers) {
      await watcher.close();
    }
    this.dataWatchers.clear();
    this.watcherMetadata.clear();

    // Close all source watchers
    for (const [, watcher] of this.sourceWatchers) {
      await watcher.close();
    }
    this.sourceWatchers.clear();

    // Close registry watcher
    if (this.registryWatcher) {
      await this.registryWatcher.close();
      this.registryWatcher = null;
    }

    // Per CF-08: do NOT clear adapters
  }

  isWatching(): boolean {
    return this.watching;
  }

  async rescan(): Promise<void> {
    if (!this.watching) {
      return;
    }

    if (this.isRescanning) {
      this.rescanQueued = true;
      return;
    }

    this.isRescanning = true;
    try {
      await this.performRescan();
      // Drain queued rescans in a loop (no recursion)
      while (this.rescanQueued && this.watching) {
        this.rescanQueued = false;
        await this.performRescan();
      }
    } finally {
      this.isRescanning = false;
      this.rescanQueued = false;
    }
  }

  registerAdapter(adapter: IWatcherAdapter): void {
    this.adapters.add(adapter);
  }

  // ═══════════════════════════════════════════════════════════════
  // Private implementation
  // ═══════════════════════════════════════════════════════════════

  private async createDataWatchers(): Promise<void> {
    const workspaces = await this.registry.list().catch((err) => {
      this.logError('Failed to list workspaces during start', err);
      return [];
    });

    // Discover worktrees for all workspaces in parallel
    const worktreeResults = await Promise.all(
      workspaces.map(async (workspace) => {
        const worktrees = await this.worktreeResolver
          .detectWorktrees(workspace.path)
          .catch((err) => {
            this.logError(`Failed to detect worktrees for ${workspace.slug}`, err);
            return [];
          });
        return worktrees.map((wt) => ({ path: wt.path, slug: workspace.slug }));
      })
    );

    // Create watchers in parallel
    await Promise.all(
      worktreeResults.flat().map((entry) => this.createWatcherForWorktree(entry.path, entry.slug))
    );
  }

  private async createWatcherForWorktree(
    worktreePath: string,
    workspaceSlug: string
  ): Promise<void> {
    const dataPath = `${worktreePath}/.chainglass/data`;

    try {
      const exists = await this.fs.exists(dataPath);
      if (!exists) {
        return;
      }

      const watcher = this.fileWatcherFactory.create({
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      });

      watcher.add(dataPath);

      // Wire event handlers for file events
      const eventTypes: FileWatcherEvent[] = ['change', 'add', 'unlink'];
      for (const eventType of eventTypes) {
        watcher.on(eventType, (pathOrError) => {
          if (typeof pathOrError === 'string') {
            this.dispatchEvent(pathOrError, eventType, worktreePath, workspaceSlug);
          }
        });
      }

      this.dataWatchers.set(worktreePath, watcher);
      this.watcherMetadata.set(worktreePath, { worktreePath, workspaceSlug });
      this.logDebug('Watcher created', { worktreePath, workspaceSlug });
    } catch (err) {
      this.logError(`Failed to create watcher for ${worktreePath}`, err);
    }
  }

  private async createSourceWatchers(): Promise<void> {
    // Note: iterates watcherMetadata populated by createDataWatchers(), so source
    // watchers are only created for worktrees that have .chainglass/data/
    for (const [worktreePath, metadata] of this.watcherMetadata) {
      if (this.sourceWatchers.has(worktreePath)) continue;

      try {
        const watcher = this.fileWatcherFactory.create({
          ignoreInitial: true,
          atomic: true,
          awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
          ignored: SOURCE_WATCHER_IGNORED,
        });

        watcher.add(worktreePath);

        const eventTypes: FileWatcherEvent[] = ['change', 'add', 'unlink', 'addDir', 'unlinkDir'];
        for (const eventType of eventTypes) {
          watcher.on(eventType, (pathOrError) => {
            if (typeof pathOrError === 'string') {
              this.dispatchEvent(pathOrError, eventType, worktreePath, metadata.workspaceSlug);
            }
          });
        }

        this.sourceWatchers.set(worktreePath, watcher);
        this.logDebug('Source watcher created', { worktreePath });
      } catch (err) {
        this.logError(`Failed to create source watcher for ${worktreePath}`, err);
      }
    }
  }

  private dispatchEvent(
    path: string,
    eventType: FileWatcherEvent,
    worktreePath: string,
    workspaceSlug: string
  ): void {
    const event: WatcherEvent = { path, eventType, worktreePath, workspaceSlug };

    for (const adapter of this.adapters) {
      try {
        adapter.handleEvent(event);
      } catch (err) {
        this.logError(`Adapter '${adapter.name}' threw during handleEvent`, err);
      }
    }
  }

  private async performRescan(): Promise<void> {
    const workspaces = await this.registry.list().catch((err) => {
      this.logError('Failed to list workspaces during rescan', err);
      return null;
    });
    if (!workspaces) return;

    // Discover current worktrees in parallel
    const currentWorktrees = new Map<string, string>(); // worktreePath → workspaceSlug

    const worktreeResults = await Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const worktrees = await this.worktreeResolver.detectWorktrees(workspace.path);
          const entries: Array<{ path: string; slug: string }> = [];
          for (const wt of worktrees) {
            const dataPath = `${wt.path}/.chainglass/data`;
            try {
              const exists = await this.fs.exists(dataPath);
              if (exists) {
                entries.push({ path: wt.path, slug: workspace.slug });
              }
            } catch {
              // Skip worktrees where we can't check data dir
            }
          }
          return entries;
        } catch (err) {
          this.logError(`Failed to detect worktrees for ${workspace.slug} during rescan`, err);
          return [];
        }
      })
    );

    for (const entry of worktreeResults.flat()) {
      currentWorktrees.set(entry.path, entry.slug);
    }

    // Close watchers for removed worktrees
    const removals: Promise<void>[] = [];
    for (const [wtPath, watcher] of this.dataWatchers) {
      if (!currentWorktrees.has(wtPath)) {
        removals.push(watcher.close());
        this.dataWatchers.delete(wtPath);
        this.watcherMetadata.delete(wtPath);
      }
    }
    // Close source watchers for removed worktrees
    for (const [wtPath, watcher] of this.sourceWatchers) {
      if (!currentWorktrees.has(wtPath)) {
        removals.push(watcher.close());
        this.sourceWatchers.delete(wtPath);
      }
    }
    await Promise.all(removals);

    // Create watchers for new worktrees in parallel
    const additions = [...currentWorktrees.entries()]
      .filter(([wtPath]) => !this.dataWatchers.has(wtPath))
      .map(([wtPath, slug]) => this.createWatcherForWorktree(wtPath, slug));
    await Promise.all(additions);

    // Create source watchers for new worktrees (failure doesn't block)
    try {
      await this.createSourceWatchers();
    } catch (err) {
      this.logError('Source watcher creation failed during rescan', err);
    }
  }

  private logInfo(message: string, data?: Record<string, unknown>): void {
    this.logger?.info(`[CentralWatcherService] ${message}`, data);
  }

  private logDebug(message: string, data?: Record<string, unknown>): void {
    this.logger?.debug(`[CentralWatcherService] ${message}`, data);
  }

  private logError(message: string, err: unknown): void {
    if (this.logger) {
      this.logger.error(message, err instanceof Error ? err : new Error(String(err)));
    } else {
      console.error(`[CentralWatcherService] ${message}`, err);
    }
  }
}
