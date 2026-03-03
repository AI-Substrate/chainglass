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
    this.registryWatcher.on('error', (pathOrError) => {
      this.logError(
        'Registry watcher error',
        pathOrError instanceof Error ? pathOrError : new Error(String(pathOrError))
      );
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

    // Filter to workspaces whose paths still exist on disk
    const liveWorkspaces = [];
    for (const ws of workspaces) {
      const exists = await this.fs.exists(ws.path).catch(() => false);
      if (!exists) {
        this.logger?.debug(`Skipping stale workspace ${ws.slug}: ${ws.path}`);
        continue;
      }
      liveWorkspaces.push(ws);
    }

    // Discover worktrees for all workspaces in parallel
    const worktreeResults = await Promise.all(
      liveWorkspaces.map(async (workspace) => {
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
    const dataPaths = [`${worktreePath}/.chainglass/data`, `${worktreePath}/.chainglass/units`];

    // Filter to paths that exist
    const existingPaths: string[] = [];
    for (const p of dataPaths) {
      try {
        if (await this.fs.exists(p)) existingPaths.push(p);
      } catch (err) {
        this.logError(
          `Failed to check path ${p}`,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    if (existingPaths.length === 0) return;

    try {
      const watcher = this.fileWatcherFactory.create({
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      });

      for (const p of existingPaths) {
        watcher.add(p);
      }

      // Wire event handlers for file events
      const eventTypes: FileWatcherEvent[] = ['change', 'add', 'unlink'];
      for (const eventType of eventTypes) {
        watcher.on(eventType, (pathOrError) => {
          if (typeof pathOrError === 'string') {
            this.dispatchEvent(pathOrError, eventType, worktreePath, workspaceSlug);
          }
        });
      }

      // Log watcher errors (e.g., inotify limit, permission denied)
      watcher.on('error', (pathOrError) => {
        this.logError(
          `Data watcher error for ${worktreePath}`,
          pathOrError instanceof Error ? pathOrError : new Error(String(pathOrError))
        );
      });

      this.dataWatchers.set(worktreePath, watcher);
      this.watcherMetadata.set(worktreePath, { worktreePath, workspaceSlug });
      this.logDebug('Watcher created', { worktreePath, workspaceSlug });
    } catch (err) {
      this.logError(`Failed to create watcher for ${worktreePath}`, err);
    }
  }

  private async createSourceWatchers(): Promise<void> {
    // FX001: Discover worktrees independently — source watchers must not gate
    // on .chainglass/data/ existence. All registered worktrees get source watchers.
    const workspaces = await this.registry.list().catch((err) => {
      this.logError('Failed to list workspaces for source watchers', err);
      return [];
    });

    for (const workspace of workspaces) {
      const pathExists = await this.fs.exists(workspace.path).catch(() => false);
      if (!pathExists) {
        this.logger?.debug(`Skipping stale workspace ${workspace.slug}: ${workspace.path}`);
        continue;
      }

      const worktrees = await this.worktreeResolver.detectWorktrees(workspace.path).catch((err) => {
        this.logError(`Failed to detect worktrees for ${workspace.slug} (source watchers)`, err);
        return [];
      });

      for (const wt of worktrees) {
        if (this.sourceWatchers.has(wt.path)) continue;

        try {
          const watcher = this.fileWatcherFactory.create({
            ignoreInitial: true,
            atomic: true,
            awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
            ignored: SOURCE_WATCHER_IGNORED,
          });

          watcher.add(wt.path);

          const eventTypes: FileWatcherEvent[] = ['change', 'add', 'unlink', 'addDir', 'unlinkDir'];
          for (const eventType of eventTypes) {
            watcher.on(eventType, (pathOrError) => {
              if (typeof pathOrError === 'string') {
                this.dispatchEvent(pathOrError, eventType, wt.path, workspace.slug);
              }
            });
          }

          // Log source watcher errors
          watcher.on('error', (pathOrError) => {
            this.logError(
              `Source watcher error for ${wt.path}`,
              pathOrError instanceof Error ? pathOrError : new Error(String(pathOrError))
            );
          });

          this.sourceWatchers.set(wt.path, watcher);
          this.logDebug('Source watcher created', { worktreePath: wt.path });
        } catch (err) {
          this.logError(`Failed to create source watcher for ${wt.path}`, err);
        }
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

    // Discover current worktrees with data dirs (for data watchers)
    const currentDataWorktrees = new Map<string, string>(); // worktreePath → workspaceSlug
    // Discover ALL worktrees (for source watchers — no data dir gate)
    const currentAllWorktrees = new Map<string, string>();

    const worktreeResults = await Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const worktrees = await this.worktreeResolver.detectWorktrees(workspace.path);
          const dataEntries: Array<{ path: string; slug: string }> = [];
          const allEntries: Array<{ path: string; slug: string }> = [];
          for (const wt of worktrees) {
            allEntries.push({ path: wt.path, slug: workspace.slug });
            const dataPath = `${wt.path}/.chainglass/data`;
            const unitsPath = `${wt.path}/.chainglass/units`;
            try {
              const dataExists = await this.fs.exists(dataPath);
              const unitsExist = await this.fs.exists(unitsPath);
              if (dataExists || unitsExist) {
                dataEntries.push({ path: wt.path, slug: workspace.slug });
              }
            } catch {
              // Skip worktrees where we can't check data dir
            }
          }
          return { dataEntries, allEntries };
        } catch (err) {
          this.logError(`Failed to detect worktrees for ${workspace.slug} during rescan`, err);
          return { dataEntries: [], allEntries: [] };
        }
      })
    );

    for (const result of worktreeResults) {
      for (const entry of result.dataEntries) {
        currentDataWorktrees.set(entry.path, entry.slug);
      }
      for (const entry of result.allEntries) {
        currentAllWorktrees.set(entry.path, entry.slug);
      }
    }

    // Close data watchers for removed worktrees
    const removals: Promise<void>[] = [];
    for (const [wtPath, watcher] of this.dataWatchers) {
      if (!currentDataWorktrees.has(wtPath)) {
        removals.push(watcher.close());
        this.dataWatchers.delete(wtPath);
        this.watcherMetadata.delete(wtPath);
      }
    }
    // Close source watchers for removed worktrees (uses allWorktrees, not just data)
    for (const [wtPath, watcher] of this.sourceWatchers) {
      if (!currentAllWorktrees.has(wtPath)) {
        removals.push(watcher.close());
        this.sourceWatchers.delete(wtPath);
      }
    }
    await Promise.all(removals);

    // Create data watchers for new worktrees in parallel
    const additions = [...currentDataWorktrees.entries()]
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
