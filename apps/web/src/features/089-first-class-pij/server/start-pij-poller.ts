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
import { sseManager } from '../../../lib/sse-manager';
import { createFlowReader } from './flow-reader';
import { type PijPollerService, createPijPoller } from './pij-poller.service';
import { createPijRecords } from './pij-records';
import { createFileSpineCursor } from './spine-cursor';

const globalForPijPoller = globalThis as typeof globalThis & {
  __pijPoller?: PijPollerService;
  __pijPollerStarted?: boolean;
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

/**
 * Get the process-wide poller, constructing it on first use.
 *
 * Construction does **not** start the loops — that is `startPijPoller()`'s job. A route that arrives
 * before the bootstrap has run therefore gets a real poller reporting `running: false`, which is
 * precisely AC-08's "poller not running" state rather than a crash or a fabricated empty fleet.
 */
export function getPijPoller(): PijPollerService {
  if (!globalForPijPoller.__pijPoller) {
    globalForPijPoller.__pijPoller = createPijPoller({
      // The spine is the ONE pij path ruled stable for external readers — bound by file.
      cursor: createFileSpineCursor({ spineDir: join(pijHome(), 'spine') }),
      // Records go through the CLI: their paths are explicitly NOT stable (tier migration renames).
      records: createPijRecords({ defaultCwd: process.cwd() }),
      flows: createFlowReader(),
      // The single egress to the browser. We consume `broadcast`; we never modify the manager.
      broadcast: (channelId, eventType, data) => sseManager.broadcast(channelId, eventType, data),
    });
  }
  return globalForPijPoller.__pijPoller;
}

/**
 * Start the poller once per process. Safe to call repeatedly (HMR, a second import); the second call
 * does nothing.
 *
 * Never throws: a missing pij store, an absent `pij` binary or an unreadable spine must degrade to an
 * honest `poller-status`, not to a failed server boot.
 */
export async function startPijPoller(): Promise<PijPollerService> {
  const poller = getPijPoller();
  if (globalForPijPoller.__pijPollerStarted) return poller;
  globalForPijPoller.__pijPollerStarted = true;

  try {
    await poller.start();
  } catch (error) {
    // Reset the flag so a later attempt can retry rather than being locked out by one bad boot.
    globalForPijPoller.__pijPollerStarted = false;
    console.warn('[pij] poller failed to start (non-fatal):', error);
  }
  return poller;
}

/** Stop the poller and release the singleton. Wired to SIGTERM/SIGINT by `instrumentation.ts`. */
export function stopPijPoller(): void {
  globalForPijPoller.__pijPoller?.stop();
  globalForPijPoller.__pijPollerStarted = false;
}

/** Test seam: forget the singleton so a fresh one is built. Never called in production code. */
export function resetPijPollerForTests(): void {
  globalForPijPoller.__pijPoller?.stop();
  globalForPijPoller.__pijPoller = undefined;
  globalForPijPoller.__pijPollerStarted = false;
}

/** True when the bootstrap has already run in this process. */
export function isPijPollerStarted(): boolean {
  return globalForPijPoller.__pijPollerStarted === true;
}
