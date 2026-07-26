/**
 * The flow-file watcher — Plan 089 Phase 3 (T005).
 *
 * The first production caller of `PijPollerService.refreshFlows`, and therefore the thing that makes
 * `flow-delta` fire at all. Phase 1 built the reader and the broadcast; Phase 2 built the client that
 * applies them; nothing until now has ever pulled the trigger.
 *
 * ## Why flow files may be watched when `~/.pij` may not (C-04)
 *
 * The two stores could not be less alike. `~/.pij` descriptors are rewritten every daemon tick across
 * ~180 seats — watching them is the naive client-side design relocated server-side, which is exactly
 * what C-04 rules out, so the pij side is polled on OUR clock instead. Flow documents are the
 * opposite: they change only when a human or an agent runs a `harness flow` verb, which is a handful
 * of writes an hour at the busiest. Polling them would be waste; watching them is nearly free.
 *
 * That asymmetry is a fence, not a preference, so it is enforced here at runtime as well as
 * statically: {@link assertNotPijShaped} THROWS rather than logging, because a fence that degrades
 * quietly is a fence that has stopped.
 *
 * ## We watch; we never write (C-02)
 *
 * Nothing in this file opens a write handle, constructs a temp path, or names a flow verb. The
 * `harness flow` CLI is the sole writer of these documents and chainglass is a registered read-only
 * consumer — watching is the only interaction this feature has with them beyond reading.
 *
 * ## The burst, and why the debounce is the mechanism
 *
 * `FileWatcherEvent` has no `'rename'`. An atomic replace (write temp, rename over) surfaces through
 * the native adapter as an `'add'` **and** a `'change'` on the same path, because the adapter stats
 * the result of fs.watch's rename and reports what it finds. Two events for one edit is two full
 * scans of every plan folder unless something coalesces them, and {@link FlowWatcherDeps.debounceMs}
 * is that something. `FileWatcherOptions.atomic` is set explicitly to `false` for the same reason
 * stated where it is set: the production adapter does not implement it.
 */
import { basename, join, resolve, sep } from 'node:path';
import type { FileWatcherOptions, IFileWatcher, IFileWatcherFactory } from '@chainglass/workflow';

/** Where flight plans live, by the convention every `/builder` repo follows. */
export const PLANS_SUBDIR = join('docs', 'plans');

/**
 * The one document a change to which means "this plan's flow moved".
 *
 * Only this one. The rendered companion is derived and would double-fire; the plan's markdown and
 * task files change constantly and say nothing about the flow. Rescanning 86 plan folders because
 * somebody saved a tasks file would be a self-inflicted load with nothing to show for it — the cost
 * is that a folder crossing between `untracked` and `not-started` is only picked up by the next
 * snapshot, which is a distinction nobody watches a live view for.
 */
export const FLOW_DOCUMENT = 'the-flow.json';

/** How long to wait for a burst to finish before scanning. One edit should be one scan. */
export const FLOW_DEBOUNCE_MS = 500;

export interface FlowWatcherLogger {
  warn(...args: unknown[]): void;
}

export interface FlowWatcherDeps {
  /** Injected so tests drive the real contract with `FakeFileWatcherFactory`, never a hand-rolled one. */
  watcherFactory: IFileWatcherFactory;
  /** `PijPollerService.refreshFlows`, in production. Takes a plans ROOT and scans all of it. */
  refreshFlows: (plansRoot: string) => Promise<void> | void;
  /**
   * Every workspace path the container knows, resolved once at bootstrap. Worktree roots arrive later
   * through {@link FlowWatcherService.watchWorkspace}, because they are only knowable per request.
   */
  listWorkspacePaths: () => Promise<string[]>;
  /** `$PIJ_HOME` (or `~/.pij`). Injected rather than recomputed, so the rule is stated in one place. */
  pijHome: string;
  debounceMs?: number;
  logger?: FlowWatcherLogger;
}

export interface FlowWatcherService {
  /** Idempotent: a second call under HMR is a no-op, never a second watcher. */
  start(): Promise<void>;
  /**
   * Register a workspace discovered at request time — the `?worktree=` case. Watch-once: repeated
   * calls for the same workspace add nothing. A no-op before {@link start}, so a request can never
   * bring a watcher into existence out of band.
   *
   * @throws if the path is `~/.pij`-shaped (C-04).
   */
  watchWorkspace(workspacePath: string): void;
  /** The plans roots currently watched. */
  watchedRoots(): string[];
  /** Close the watcher and cancel any pending scan. Wired to SIGTERM/SIGINT beside the poller. */
  stop(): Promise<void>;
}

/**
 * The C-04 gate.
 *
 * Two checks, because they fail differently: an explicit `$PIJ_HOME` catches the configured store
 * wherever it lives, and a `.pij` path segment catches the conventional one on a host whose env says
 * something else. Segment-wise, never `startsWith` — `/Users/x/.pijsomething` is not the pij store,
 * and a prefix test that says it is would block a legitimate path while feeling rigorous.
 */
export function assertNotPijShaped(candidate: string, pijHome: string): void {
  const resolved = resolve(candidate);
  const home = resolve(pijHome);
  const inside = resolved === home || resolved.startsWith(home + sep);
  const hasSegment = resolved.split(sep).includes('.pij');
  if (inside || hasSegment) {
    throw new Error(
      `C-04: refusing to watch a pij-store path (${resolved}). The pij store is polled on our own clock, never watched.`
    );
  }
}

class FlowWatcher implements FlowWatcherService {
  private watcher: IFileWatcher | null = null;
  private readonly roots = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private started = false;
  private readonly debounceMs: number;
  private readonly logger: FlowWatcherLogger;

  constructor(private readonly deps: FlowWatcherDeps) {
    this.debounceMs = deps.debounceMs ?? FLOW_DEBOUNCE_MS;
    this.logger = deps.logger ?? console;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    let workspaces: string[];
    try {
      workspaces = await this.deps.listWorkspacePaths();
    } catch (error) {
      // Degrade to snapshot-only. The Flows tab still reads `/api/pij/flow` on every tab change, so
      // the view stays correct — it just stops being live, which is a smaller lie than a failed boot.
      this.started = false;
      this.logger.warn('[pij] flow watcher: workspace enumeration failed (non-fatal):', error);
      return;
    }

    try {
      const options: FileWatcherOptions = {
        // Explicit, and explicitly false. `NativeFileWatcherAdapter` reads this option nowhere — it
        // translates fs.watch renames into add/unlink itself — so `true` would be a claim about
        // coalescing that nothing implements. The debounce below is what actually coalesces.
        atomic: false,
        // The tree already exists when we attach, and re-scanning it at boot is the poller's job on
        // its first flow request, not an avalanche of synthetic 'add's here.
        ignoreInitial: true,
      };
      this.watcher = this.deps.watcherFactory.create(options);
    } catch (error) {
      this.started = false;
      this.logger.warn('[pij] flow watcher: could not be created (non-fatal):', error);
      return;
    }

    const onEvent = (pathOrError: string | Error): void => {
      if (typeof pathOrError !== 'string') return;
      this.onFlowFileEvent(pathOrError);
    };
    /*
     * Two events, and only two: they are the halves of one atomic replace, which is the only way the
     * `harness flow` CLI ever touches this document.
     *
     * A DELETION is deliberately not watched for. The CLI is the sole writer (C-02) and it never
     * deletes; a vanished flow document therefore comes from a human `rm`, a branch switch, or the
     * whole plan folder going — none of which is a flow moving, and all of which change plenty of
     * other things a live view was never tracking. Snapshot refetch is the deletion path here, exactly
     * as it already is for a vanished plan on the client side, so the two halves agree.
     *
     * There is a second reason, stated rather than hidden: subscribing to the delete event would put
     * a bare `'unlink'` string literal in a guarded file, and the C-02 fence reads that as the pij
     * verb of the same name (verified: it fails with this file named). The fence is deliberately
     * blunt and the remedy for a blunt check is to change the code, not the check — but the capability
     * would not have been worth an exclusion even if the fence had been silent.
     */
    this.watcher.on('add', onEvent);
    this.watcher.on('change', onEvent);
    this.watcher.on('error', (error) => {
      this.logger.warn('[pij] flow watcher error (non-fatal):', error);
    });

    for (const workspacePath of workspaces) {
      try {
        this.watchWorkspace(workspacePath);
      } catch (error) {
        // Enumeration is not a trusted source. One refused entry must not cost the others their watch.
        this.logger.warn('[pij] flow watcher: skipping a workspace:', error);
      }
    }
  }

  watchWorkspace(workspacePath: string): void {
    assertNotPijShaped(workspacePath, this.deps.pijHome);
    if (!this.watcher) return;
    const plansRoot = resolve(join(workspacePath, PLANS_SUBDIR));
    if (this.roots.has(plansRoot)) return;
    this.roots.add(plansRoot);
    this.watcher.add(plansRoot);
  }

  watchedRoots(): string[] {
    return [...this.roots];
  }

  async stop(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.roots.clear();
    const watcher = this.watcher;
    this.watcher = null;
    this.started = false;
    if (watcher) await watcher.close();
  }

  /** Which watched root an event path belongs to, or `null` if it belongs to none of them. */
  private rootFor(path: string): string | null {
    const resolved = resolve(path);
    for (const root of this.roots) {
      if (resolved.startsWith(root + sep)) return root;
    }
    return null;
  }

  private onFlowFileEvent(path: string): void {
    if (basename(path) !== FLOW_DOCUMENT) return;
    const root = this.rootFor(path);
    if (!root) return;
    this.schedule(root);
  }

  /** One pending scan per root: the burst collapses, and two repos stay two scans. */
  private schedule(plansRoot: string): void {
    const existing = this.timers.get(plansRoot);
    if (existing) clearTimeout(existing);
    this.timers.set(
      plansRoot,
      setTimeout(() => {
        this.timers.delete(plansRoot);
        void (async () => {
          try {
            await this.deps.refreshFlows(plansRoot);
          } catch (error) {
            // A failed scan is one missed update, not a dead watcher: the timer is already cleared,
            // so the next edit schedules a fresh one.
            this.logger.warn('[pij] flow watcher: refreshFlows failed (non-fatal):', error);
          }
        })();
      }, this.debounceMs)
    );
  }
}

export function createFlowWatcher(deps: FlowWatcherDeps): FlowWatcherService {
  return new FlowWatcher(deps);
}
