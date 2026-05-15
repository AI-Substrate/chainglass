'use server';

/**
 * FlowSpace Search Server Action
 *
 * Plan 084: delegates semantic-mode searches to the long-lived `fs2 mcp` child
 * process pool (`flowspace-mcp-client.ts`). Returns a discriminated union so
 * the client hook can render a "Loading FlowSpace, please wait…" message
 * during the cold-start window without blocking the request.
 *
 * Availability detection (`fs2` on PATH, `.fs2/graph.pickle` exists) is
 * preserved from the original Plan 051 implementation — the dropdown still
 * uses it for the install-link / no-graph branches.
 */

import { exec } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type {
  CodeSearchAvailability,
  CodeSearchMode,
  FlowSpaceSearchResult,
} from '@/features/_platform/panel-layout/types';

import { log } from './flowspace-log';
import {
  flowspaceMcpSearch,
  getFlowspaceStatus,
  prewarmFlowspace,
  shutdownFlowspace,
} from './flowspace-mcp-client';

const execAsync = promisify(exec);

// FX002-4b: pin to globalThis so the cache survives Next.js HMR. Same idiom
// as flowspace-mcp-client.ts's __FLOWSPACE_MCP_POOL__ — production runs single
// process; dev mode reloads modules but globalThis is preserved.
declare global {
  // eslint-disable-next-line no-var
  var __FLOWSPACE_AVAIL_CACHE__:
    | { available: boolean | null; resolvedPath: string | null }
    | undefined;
}
if (!globalThis.__FLOWSPACE_AVAIL_CACHE__) {
  globalThis.__FLOWSPACE_AVAIL_CACHE__ = { available: null, resolvedPath: null };
}
const availCache = globalThis.__FLOWSPACE_AVAIL_CACHE__;

/**
 * Check if fs2 CLI is installed and the codebase graph exists.
 * Result drives the existing dropdown branches (install-link / run-fs2-scan).
 */
export async function checkFlowspaceAvailability(
  cwd: string
): Promise<{ availability: CodeSearchAvailability; graphMtime?: number }> {
  if (availCache.available === null) {
    try {
      const { stdout } = await execAsync('command -v fs2', { timeout: 3000 });
      availCache.resolvedPath = stdout.trim();
      availCache.available = true;
      log('fs2 found at:', availCache.resolvedPath);
    } catch (err) {
      availCache.available = false;
      log('fs2 not found:', (err as Error).message);
    }
  }

  if (!availCache.available) {
    return { availability: 'not-installed' };
  }

  const graphPath = join(cwd, '.fs2', 'graph.pickle');
  try {
    const stats = await stat(graphPath);
    return { availability: 'available', graphMtime: stats.mtimeMs };
  } catch {
    return { availability: 'no-graph' };
  }
}

export type FlowspaceSearchResponse =
  | { kind: 'spawning' }
  | { kind: 'ok'; results: FlowSpaceSearchResult[]; folders: Record<string, number> }
  | { kind: 'error'; error: string };

function mapMcpError(message: string): string {
  if (/SEMANTIC search requires|embedding adapter/i.test(message)) {
    return 'Semantic search requires embeddings. Run: fs2 scan --embed';
  }
  if (/No nodes have embeddings/i.test(message)) {
    return 'No embeddings found. Run: fs2 scan --embed';
  }
  if (/Graph not found|No graph found/i.test(message)) {
    return 'No graph found. Run: fs2 scan';
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return 'Search timed out. Try a simpler query.';
  }
  // FX002-4a: do NOT match ENOENT here. A search-time error message that
  // happens to contain "ENOENT" (e.g., the indexed graph references a deleted
  // file and fs2 surfaces that as an error) must not poison the availability
  // cache. Spawn-time ENOENT — the binary truly missing from PATH — is now
  // detected in flowspace-mcp-client's spawn error path, where it correctly
  // invalidates the cache.
  return message.split('\n').find((l) => l.trim()) ?? 'Search failed';
}

/**
 * Search the codebase via the long-lived `fs2 mcp` child for `cwd`.
 *
 * Returns:
 *  - `{ kind: 'spawning' }` while the child is being spawned + the graph is
 *    loading. Caller should re-call after a short delay.
 *  - `{ kind: 'ok', results, folders }` on success.
 *  - `{ kind: 'error', error }` on availability or MCP errors.
 */
export async function flowspaceSearch(
  query: string,
  mode: CodeSearchMode,
  cwd: string
): Promise<FlowspaceSearchResponse> {
  if (!query.trim()) {
    return { kind: 'ok', results: [], folders: {} };
  }

  const status = getFlowspaceStatus(cwd);
  if (status.state === 'idle') {
    // FX001-4: keep this short-circuit so the dropdown sees the cold-start
    // "Loading FlowSpace, please wait…" message immediately, before the
    // spawn-and-search round-trip blocks for ~5–15 s.
    void prewarmFlowspace(cwd);
    return { kind: 'spawning' };
  }
  if (status.state === 'error') {
    // FX001-2: make spawn errors self-recoverable. The previous version
    // returned the cached error indefinitely, leaving the user with no path
    // forward except `> Restart FlowSpace`. Now we kick a fresh spawn (which
    // clears the dead pool entry inside getOrSpawn) and return spawning so
    // the hook keeps polling until ready or until a new error.
    log('previous spawn errored — retrying', { cwd, prevError: status.error });
    void prewarmFlowspace(cwd);
    return { kind: 'spawning' };
  }
  // FX001-4: status === 'spawning' falls through to flowspaceMcpSearch, whose
  // internal `getOrSpawn` already awaits the existing `proc.ready` promise.
  // No new spawn is started; we just block on the in-flight one and return ok
  // directly, collapsing the prior 1 s polling round-trip on cold starts.

  try {
    const env = await flowspaceMcpSearch(cwd, query, mode);

    // FX002-2: parallelise stale-file filtering. Previously this was a
    // sequential `for await access(...)` loop — response time scaled with
    // the sum of N stat() calls. With Promise.allSettled we only wait for
    // the slowest. Order is preserved: allSettled returns results in input
    // order, and the filter+map below keeps the score-sorted ordering.
    const settled = await Promise.allSettled(
      env.results.map((r) => access(join(cwd, r.filePath)).then(() => r))
    );
    const results: FlowSpaceSearchResult[] = settled
      .filter((s): s is PromiseFulfilledResult<FlowSpaceSearchResult> => s.status === 'fulfilled')
      .map((s) => s.value);

    return { kind: 'ok', results, folders: env.folders };
  } catch (err) {
    const message = (err as Error).message ?? 'Search failed';
    log('search error', { cwd, query, mode, message });
    return { kind: 'error', error: mapMcpError(message) };
  }
}

/**
 * Server action exposed to the SDK command "Restart FlowSpace".
 * Tears down the long-lived child for `cwd`; the next search respawns.
 */
export async function restartFlowspaceAction(cwd: string): Promise<{ ok: true }> {
  log('restart requested', { cwd });
  await shutdownFlowspace(cwd);
  return { ok: true };
}

/**
 * FX002-4a: invalidate the availability cache. Called from the MCP client's
 * spawn-error path when an ENOENT is detected — this is the legitimate
 * "fs2 binary really is missing from PATH" signal. Search-time ENOENTs do
 * NOT call this (mapMcpError no longer matches them).
 *
 * `async` only because this file has `'use server'` at the top — Next.js
 * Server Action exports must be async. The body itself is purely synchronous.
 */
export async function invalidateFs2AvailabilityCache(): Promise<void> {
  availCache.available = null;
  availCache.resolvedPath = null;
  log('availability cache invalidated');
}
