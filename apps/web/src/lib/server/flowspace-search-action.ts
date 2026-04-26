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

import {
  flowspaceMcpSearch,
  getFlowspaceStatus,
  prewarmFlowspace,
  shutdownFlowspace,
} from './flowspace-mcp-client';

const execAsync = promisify(exec);

const LOG_PREFIX = '[flowspace-mcp]';
function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

let fs2AvailableCache: boolean | null = null;
let fs2ResolvedPath: string | null = null;

/**
 * Check if fs2 CLI is installed and the codebase graph exists.
 * Result drives the existing dropdown branches (install-link / run-fs2-scan).
 */
export async function checkFlowspaceAvailability(
  cwd: string
): Promise<{ availability: CodeSearchAvailability; graphMtime?: number }> {
  if (fs2AvailableCache === null) {
    try {
      const { stdout } = await execAsync('command -v fs2', { timeout: 3000 });
      fs2ResolvedPath = stdout.trim();
      fs2AvailableCache = true;
      log('fs2 found at:', fs2ResolvedPath);
    } catch (err) {
      fs2AvailableCache = false;
      log('fs2 not found:', (err as Error).message);
    }
  }

  if (!fs2AvailableCache) {
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
  if (/ENOENT/i.test(message)) {
    fs2AvailableCache = null;
    return 'FlowSpace (fs2) is not installed';
  }
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

    // Filter stale results — graph may reference deleted files.
    const results: FlowSpaceSearchResult[] = [];
    for (const r of env.results) {
      try {
        await access(join(cwd, r.filePath));
        results.push(r);
      } catch {
        // skip deleted files
      }
    }

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
