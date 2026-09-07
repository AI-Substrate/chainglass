/**
 * HMR-safe poller bootstrap — Plan 089 Phase 1 (T009).
 *
 * Copies the idiom `instrumentation.ts` already uses three times (Plans 067, 074, 088): a
 * `globalThis` flag so the singleton survives Next.js hot-module reload, a try/catch so a failure
 * here can never take down boot, and SIGTERM/SIGINT cleanup.
 *
 * AC-02 depends on this being a genuine singleton: N open tabs must produce exactly ONE poller and
 * ONE spine cursor server-side. Both the module-level global and `PijPollerService.start()` are
 * idempotent, so a double-invocation under HMR is a no-op rather than a second reader.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import {
  FileWatcherFactory,
  type IGitWorktreeResolver,
  type IWorkspaceService,
} from '@chainglass/workflow';
import { getContainer } from '../../../lib/bootstrap-singleton';
import { sseManager } from '../../../lib/sse-manager';
import { createFlowReader } from './flow-reader';
import { type FlowWatcherService, createFlowWatcher } from './flow-watcher';
import { type PijPollerService, createPijPoller } from './pij-poller.service';
import { createPijRecords } from './pij-records';
import { createCompositePijRecords } from './rs/composite-pij-records';
import { type RsClient, createRsClient } from './rs/rs-client';
import { type RsEventStream, createRsEventStream } from './rs/rs-event-stream';
import { createRsPijRecords } from './rs/rs-pij-records';
import { createFileSpineCursor } from './spine-cursor';

export type PijSource = 'legacy' | 'rs';

const DEFAULT_PIJ_RS_ADDR = '127.0.0.1:7461';
const DESCRIPTOR_EVENT_KINDS = new Set([
  'seat.put',
  'seat.tombstone',
  'role-set',
  'spawn.bound',
  'spawn.failed',
]);

const globalForPijPoller = globalThis as typeof globalThis & {
  __pijPoller?: PijPollerService;
  __pijPollerStarted?: boolean;
  __pijFlowWatcher?: FlowWatcherService;
  __pijRsEventStream?: RsEventStream;
  __pijSource?: PijSource;
};

/**
 * `$PIJ_HOME`, defaulting to `~/.pij` exactly as the platform contract specifies.
 *
 * The env is a parameter rather than a direct `process.env` read so a test can exercise both
 * branches without mutating global state — and it is typed as the one key we care about, so callers
 * are not forced to construct a whole `ProcessEnv`.
 */
export function pijHome(env: Record<string, string | undefined> = process.env): string {
  return env.PIJ_HOME ?? join(homedir(), '.pij');
}
export function pijSource(env: Record<string, string | undefined> = process.env): PijSource {
  return env.PIJ_SOURCE === 'legacy' ? 'legacy' : 'rs';
}

export function pijRsAddr(env: Record<string, string | undefined> = process.env): string {
  return env.PIJ_RS_ADDR ?? DEFAULT_PIJ_RS_ADDR;
}

export function pijRsStateDir(env: Record<string, string | undefined> = process.env): string {
  return env.PIJ_RS_STATE_DIR ?? join(homedir(), '.pij-rs');
}

/**
 * Whether the polling loops may run. Default OFF — see the kill switch in {@link startPijPoller}.
 *
 * Env-driven rather than a constant so the loops can be turned back on without a rebuild, and
 * parameterised rather than reading `process.env` directly so a test can exercise both branches
 * without mutating global state (the same shape `pijHome` uses above).
 */
export function pijPollerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PIJ_POLLER === 'on';
}

/**
 * Get the process-wide poller, constructing it on first use.
 *
 * Construction does **not** start the loops — that is `startPijPoller()`'s job. A route that arrives
 * before the bootstrap has run therefore gets a real poller reporting `running: false`, which is
 * precisely AC-08's "poller not running" state rather than a crash or a fabricated empty fleet.
 */
export function getPijPoller(
  env: Record<string, string | undefined> = process.env,
  deps: { rsClient?: RsClient; createEventStream?: typeof createRsEventStream } = {}
): PijPollerService {
  if (!globalForPijPoller.__pijPoller) {
    const source = pijSource(env);
    if (env.PIJ_SOURCE !== undefined && env.PIJ_SOURCE !== 'rs' && env.PIJ_SOURCE !== 'legacy') {
      console.warn(
        `[pij] unrecognised PIJ_SOURCE=${JSON.stringify(env.PIJ_SOURCE)}; defaulting to rs. Set PIJ_SOURCE=rs or PIJ_SOURCE=legacy.`
      );
    }
    const cliRecords = createPijRecords({ defaultCwd: process.cwd() });
    const client =
      source === 'rs'
        ? (deps.rsClient ??
          createRsClient({ addr: pijRsAddr(env), stateDir: pijRsStateDir(env), fetch }))
        : undefined;
    const records = client
      ? createCompositePijRecords({
          rs: createRsPijRecords({
            client,
            worktrees: {
              detectWorktrees: (cwd) =>
                getContainer()
                  .resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
                  .detectWorktrees(cwd),
            },
          }),
          cli: cliRecords,
        })
      : cliRecords;
    const poller = createPijPoller({
      // The legacy source reads its stable file spine. The rs source owns transitions over HTTP.
      cursor: createFileSpineCursor({ spineDir: join(pijHome(env), 'spine') }),
      records,
      flows: createFlowReader(),
      pollSpine: source === 'legacy',
      pollRecords: source === 'legacy',
      // The single egress to the browser. We consume `broadcast`; we never modify the manager.
      broadcast: (channelId, eventType, data) => sseManager.broadcast(channelId, eventType, data),
    });

    globalForPijPoller.__pijSource = source;
    globalForPijPoller.__pijPoller = poller;
    if (client) {
      globalForPijPoller.__pijRsEventStream = (deps.createEventStream ?? createRsEventStream)({
        client,
        onEvent: async (frame) => {
          poller.ingest(frame);
          if (DESCRIPTOR_EVENT_KINDS.has(frame.event.kind)) {
            await poller.refreshRecords();
            const error = poller.snapshot().status.lastError;
            if (error) throw new Error(error.message);
          }
        },
        onStatus: (status) => {
          if (status.state === 'connected') {
            console.info(`[pij-rs] event stream connected (${status.build})`);
          } else if (status.state === 'reconnecting') {
            console.warn(
              `[pij-rs] event stream reconnecting in ${status.delayMs}ms:`,
              status.error
            );
          } else if (status.state === 'ignored') {
            console.warn(`[pij-rs] ignored event frame type: ${status.frameType}`);
          }
        },
      });
    }
  }
  return globalForPijPoller.__pijPoller;
}

/**
 * The process-wide flow watcher, constructed on first use — Phase 3 (T005).
 *
 * Sibling of {@link getPijPoller} and deliberately shaped the same way, including the "construction
 * does not start it" property: a route that arrives before the bootstrap gets a real object that
 * watches nothing, rather than a crash or an accidental watcher created out of band by a page load.
 *
 * Its `refreshFlows` is bound to the singleton poller, which is what makes this the first production
 * caller of a method Phase 1 built and nobody has yet invoked.
 */
export function getPijFlowWatcher(): FlowWatcherService {
  if (!globalForPijPoller.__pijFlowWatcher) {
    globalForPijPoller.__pijFlowWatcher = createFlowWatcher({
      // The env-selecting factory, so the WSL/Windows-mount polling escape hatch applies here too.
      watcherFactory: new FileWatcherFactory(),
      refreshFlows: (plansRoot) => getPijPoller().refreshFlows(plansRoot),
      listWorkspacePaths: async () => {
        const service = getContainer().resolve<IWorkspaceService>(
          WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
        );
        const workspaces = await service.list();
        return workspaces.map((workspace) => workspace.toJSON().path).filter(Boolean);
      },
      // Stated once, here, and injected — so the C-04 rule has exactly one definition in the process.
      pijHome: pijHome(),
    });
  }
  return globalForPijPoller.__pijFlowWatcher;
}

/**
 * Register a workspace for flow watching, if the watcher is running. Called by the flow route.
 *
 * The bootstrap enumeration cannot see a `?worktree=` root — that path is only knowable when someone
 * asks for it — so the first flow request for an unwatched workspace is where its watch comes from.
 * Watch-once is the watcher's own property, so calling this on every request is free.
 *
 * It does NOT swallow the C-04 refusal: a request naming a pij-store path has asked for something the
 * fence forbids, and the route surfaces that rather than quietly ignoring it.
 */
export function notePijFlowWorkspace(workspacePath: string): void {
  globalForPijPoller.__pijFlowWatcher?.watchWorkspace(workspacePath);
}

/**
 * Start the poller once per process. Safe to call repeatedly (HMR, a second import); the second call
 * does nothing.
 *
 * Never throws: a missing pij store, an absent `pij` binary or an unreadable spine must degrade to an
 * honest `poller-status`, not to a failed server boot.
 */
export async function startPijPoller(
  env: Record<string, string | undefined> = process.env
): Promise<PijPollerService> {
  const poller = getPijPoller(env);
  const source = globalForPijPoller.__pijSource ?? pijSource(env);

  // KILL SWITCH — the legacy loops are OFF unless `PIJ_POLLER=on`.
  //
  // The slow loop shells out `pij list --json --badge`, which grew from ~0.7s at 181 rows
  // (measured when it was written, `pij-records.ts`) to 7.7s at ~1,200 rows. `PijRecords` caps
  // every call at `PIJ_DEFAULT_TIMEOUT_MS = 5_000`, so at that size EVERY call is killed before it
  // returns: the loop pays full CPU and receives nothing. Measured 2026-09-02 — two
  // `cli.ts list --json --badge` processes in flight continuously, ~95% of a core between them,
  // the top two consumers on the machine, parented to `next-server`.
  //
  // Off is not a loss of function: the data was not arriving anyway. It is the same dark rail,
  // minus the core.
  //
  // The switch is scoped to `source === 'legacy'` DELIBERATELY. PIJ_SOURCE=rs starts its HTTP
  // reader without needing PIJ_POLLER, because the thing this switch exists to stop — a process
  // spawned per tick against a deadline it cannot meet — is exactly what the rs reader does not do.
  // Gating rs behind the same flag would make the replacement inherit the disease's quarantine.
  if (source === 'legacy' && !pijPollerEnabled(env)) {
    console.warn(
      '[pij] poller disabled (set PIJ_POLLER=on to re-enable) — see start-pij-poller.ts'
    );
    return poller;
  }

  if (globalForPijPoller.__pijPollerStarted) return poller;
  globalForPijPoller.__pijPollerStarted = true;

  try {
    await poller.start();
    globalForPijPoller.__pijRsEventStream?.start();
  } catch (error) {
    // Reset the flag so a later attempt can retry rather than being locked out by one bad boot.
    globalForPijPoller.__pijPollerStarted = false;
    console.warn('[pij] poller failed to start (non-fatal):', error);
  }

  // The flow watcher starts beside the poller and degrades on its own terms: `start()` never throws,
  // and a failure leaves the page snapshot-only (still correct, no longer live) rather than unbooted.
  await getPijFlowWatcher().start();

  return poller;
}

/** Stop the poller and release the singleton. Wired to SIGTERM/SIGINT by `instrumentation.ts`. */
export function stopPijPoller(): void {
  globalForPijPoller.__pijRsEventStream?.stop();
  globalForPijPoller.__pijPoller?.stop();
  globalForPijPoller.__pijPollerStarted = false;
  // Fire-and-forget: shutdown must not wait on a watcher close, and a rejected close would otherwise
  // land as an unhandled rejection during SIGTERM.
  void globalForPijPoller.__pijFlowWatcher?.stop().catch(() => {});
  globalForPijPoller.__pijFlowWatcher = undefined;
}

/** Test seam: forget the singleton so a fresh one is built. Never called in production code. */
export function resetPijPollerForTests(): void {
  globalForPijPoller.__pijPoller?.stop();
  globalForPijPoller.__pijRsEventStream?.stop();
  globalForPijPoller.__pijPoller = undefined;
  globalForPijPoller.__pijPollerStarted = false;
  void globalForPijPoller.__pijFlowWatcher?.stop().catch(() => {});
  globalForPijPoller.__pijFlowWatcher = undefined;
  globalForPijPoller.__pijRsEventStream = undefined;
  globalForPijPoller.__pijSource = undefined;
}

/** True when the bootstrap has already run in this process. */
export function isPijPollerStarted(): boolean {
  return globalForPijPoller.__pijPollerStarted === true;
}
