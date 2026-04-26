/**
 * FlowSpace MCP Client — long-lived `fs2 mcp` child process per worktree.
 *
 * Plan 084: replaces the per-keystroke `execFile('fs2 search …')` path so the
 * 397 MB FlowSpace graph loads once per worktree per session instead of every
 * search. Subsequent searches reuse the warm process for sub-100 ms results.
 *
 * Process pool keyed by worktree path. State is pinned to `globalThis` so it
 * survives Next.js dev-mode HMR — same idiom as
 * `apps/web/src/features/074-workflow-execution/get-manager.ts` +
 * `apps/web/instrumentation.ts`.
 *
 * Lifecycle:
 *   - Lazy spawn on first `flowspaceMcpSearch` (or explicit `prewarmFlowspace`).
 *   - Mtime-based recycle: if `.fs2/graph.pickle` mtime advances past the value
 *     captured at spawn, the next search closes the process and the one after
 *     spawns fresh.
 *   - Idle reaper: a single setInterval scans the pool every 60 s and kills
 *     processes idle for `FLOWSPACE_IDLE_MS` (default 10 min) with no in-flight
 *     calls.
 *   - Crash recovery: `transport.onclose` removes the dead handle from the pool;
 *     the next call respawns.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { CodeSearchMode } from '@/features/_platform/panel-layout/types';

import {
  type MappedEnvelope,
  type RawFlowspaceEnvelope,
  mapEnvelope,
} from './flowspace-result-mapper';

const LOG_PREFIX = '[flowspace-mcp]';
function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const REAPER_INTERVAL_MS = 60 * 1000;
const DEFAULT_LIMIT = 20;
const SEARCH_CEILING_MS = 30_000;

function idleMs(): number {
  const env = process.env.FLOWSPACE_IDLE_MS;
  if (!env) return DEFAULT_IDLE_MS;
  const n = Number.parseInt(env, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MS;
}

interface FlowspaceProcess {
  cwd: string;
  client: Client;
  transport: Transport;
  state: 'spawning' | 'ready' | 'error';
  ready: Promise<void>;
  error?: string;
  lastUsedAt: number;
  inflight: number;
  graphMtimeAtSpawn: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __FLOWSPACE_MCP_POOL__: Map<string, FlowspaceProcess> | undefined;
  // eslint-disable-next-line no-var
  var __FLOWSPACE_MCP_REAPER__: ReturnType<typeof setInterval> | undefined;
  // eslint-disable-next-line no-var
  var __FLOWSPACE_MCP_TRANSPORT_FACTORY__: ((cwd: string) => Transport) | undefined;
  // eslint-disable-next-line no-var
  var __FLOWSPACE_MCP_READ_GRAPH_MTIME__: ((cwd: string) => Promise<number>) | undefined;
}

if (!globalThis.__FLOWSPACE_MCP_POOL__) {
  globalThis.__FLOWSPACE_MCP_POOL__ = new Map();
}
const pool: Map<string, FlowspaceProcess> = globalThis.__FLOWSPACE_MCP_POOL__;

/**
 * Test seam: replace the transport factory in tests with one that pairs to an
 * in-memory MCP server. Default is `StdioClientTransport` spawning `fs2 mcp`.
 */
export function setFlowspaceTransportFactory(
  factory: ((cwd: string) => Transport) | undefined
): void {
  globalThis.__FLOWSPACE_MCP_TRANSPORT_FACTORY__ = factory;
}

function defaultStdioTransport(cwd: string): Transport {
  return new StdioClientTransport({
    command: 'fs2',
    args: ['mcp'],
    cwd,
    stderr: 'pipe',
  });
}

async function readGraphMtime(cwd: string): Promise<number> {
  // FX001-5 test seam: tests inject a stub via setReadGraphMtimeForTests so
  // they can simulate `fs2 scan` rebuilds without touching the filesystem.
  const override = globalThis.__FLOWSPACE_MCP_READ_GRAPH_MTIME__;
  if (override) return override(cwd);
  try {
    const s = await stat(join(cwd, '.fs2', 'graph.pickle'));
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * FX001-5 test seam: replace the graph-mtime reader with a stub. Pass
 * `undefined` to restore the default (real fs.stat) behaviour.
 */
export function setReadGraphMtimeForTests(
  fn: ((cwd: string) => Promise<number>) | undefined
): void {
  globalThis.__FLOWSPACE_MCP_READ_GRAPH_MTIME__ = fn;
}

export type FlowspaceStatus =
  | { state: 'idle' }
  | { state: 'spawning' }
  | { state: 'ready' }
  | { state: 'error'; error: string };

export function getFlowspaceStatus(cwd: string): FlowspaceStatus {
  const p = pool.get(cwd);
  if (!p) return { state: 'idle' };
  if (p.state === 'ready') return { state: 'ready' };
  if (p.state === 'spawning') return { state: 'spawning' };
  return { state: 'error', error: p.error ?? 'unknown' };
}

ensureReaperStarted();

/**
 * Run one reaper sweep. Closes any pooled process that has been idle past
 * `FLOWSPACE_IDLE_MS` (or the env override) and has zero in-flight calls.
 *
 * Exported for tests (FX001-5) so they don't have to wait the 60 s interval.
 */
export function runIdleReaperOnce(): void {
  const cutoff = Date.now() - idleMs();
  for (const [cwd, proc] of pool) {
    if (proc.inflight === 0 && proc.lastUsedAt < cutoff) {
      log('idle reap', { cwd, idleMs: Date.now() - proc.lastUsedAt });
      void proc.client.close().catch(() => {});
    }
  }
}

function ensureReaperStarted(): void {
  if (globalThis.__FLOWSPACE_MCP_REAPER__) return;
  globalThis.__FLOWSPACE_MCP_REAPER__ = setInterval(runIdleReaperOnce, REAPER_INTERVAL_MS);
  // Don't keep the Node process alive for the reaper alone.
  if (typeof globalThis.__FLOWSPACE_MCP_REAPER__ === 'object') {
    (globalThis.__FLOWSPACE_MCP_REAPER__ as ReturnType<typeof setInterval>).unref?.();
  }
}

async function getOrSpawn(cwd: string): Promise<FlowspaceProcess> {
  const existing = pool.get(cwd);
  if (existing && existing.state !== 'error') {
    await existing.ready;
    return existing;
  }
  if (existing && existing.state === 'error') {
    pool.delete(cwd);
  }

  // CRITICAL: no awaits between `pool.get` above and `pool.set` below — the
  // synchronous prefix is what dedupes concurrent first-callers (AC-14).
  // Anything async (graph mtime read, client.connect) must live inside the
  // self-invoking async function attached to `proc.ready`.
  const factory = globalThis.__FLOWSPACE_MCP_TRANSPORT_FACTORY__ ?? defaultStdioTransport;
  const transport = factory(cwd);
  const client = new Client({ name: 'chainglass-web', version: '0.1.0' }, { capabilities: {} });

  // Hoist via a let so the ready closure can mutate the same object the pool holds.
  // biome-ignore lint/style/useConst: assigned via object literal that references itself
  let proc: FlowspaceProcess;
  const started = Date.now();

  proc = {
    cwd,
    client,
    transport,
    state: 'spawning',
    ready: (async () => {
      // Use local bindings before touching `proc` — the outer object literal
      // is still evaluating when this IIFE first runs.
      try {
        const mtime = await readGraphMtime(cwd);
        await client.connect(transport);
        proc.graphMtimeAtSpawn = mtime;
        proc.state = 'ready';
        log('spawn ready', { cwd, ms: Date.now() - started });
      } catch (err) {
        proc.state = 'error';
        proc.error = (err as Error).message;
        log('spawn error', { cwd, error: proc.error });
        throw err;
      }
    })(),
    lastUsedAt: Date.now(),
    inflight: 0,
    graphMtimeAtSpawn: 0,
  };

  // Insert BEFORE awaiting `ready` so concurrent first-callers find the same
  // promise and dedupe to a single spawn (AC-14).
  pool.set(cwd, proc);

  // Crash detection: drop dead handles from the pool. Both onclose and onerror
  // (FX001-1): some transport errors don't cleanly trigger onclose, so the pool
  // would hold a dead handle indefinitely without the onerror path.
  transport.onclose = () => {
    if (pool.get(cwd) === proc) {
      log('process exited', { cwd });
      pool.delete(cwd);
    }
  };
  transport.onerror = (err: Error) => {
    log('transport error', { cwd, error: err.message });
    if (pool.get(cwd) === proc) {
      proc.state = 'error';
      proc.error = err.message;
      pool.delete(cwd);
    }
  };

  await proc.ready;
  return proc;
}

/**
 * FX001-1: explicit pool eviction. The previous version awaited
 * `client.close()` and trusted `transport.onclose` to remove the pool entry —
 * but `onclose` fires asynchronously, leaving a window where `pool.get(cwd)`
 * returned a dying handle. Now we delete synchronously after deciding to
 * recycle, so the next `getOrSpawn` always sees a clean slate.
 */
async function maybeRecycle(proc: FlowspaceProcess): Promise<boolean> {
  const current = await readGraphMtime(proc.cwd);
  if (current > proc.graphMtimeAtSpawn) {
    log('graph mtime advanced — recycling', {
      cwd: proc.cwd,
      old: proc.graphMtimeAtSpawn,
      new: current,
    });
    if (pool.get(proc.cwd) === proc) {
      pool.delete(proc.cwd);
    }
    await proc.client.close().catch(() => {});
    return true;
  }
  return false;
}

export async function prewarmFlowspace(cwd: string): Promise<void> {
  try {
    await getOrSpawn(cwd);
  } catch (err) {
    log('prewarm failed', { cwd, error: (err as Error).message });
  }
}

export async function shutdownFlowspace(cwd: string): Promise<void> {
  const proc = pool.get(cwd);
  if (!proc) return;
  log('shutdown requested', { cwd });
  await proc.client.close().catch(() => {});
  pool.delete(cwd);
}

export async function shutdownAllFlowspace(): Promise<void> {
  const procs = [...pool.values()];
  pool.clear();
  await Promise.all(procs.map((p) => p.client.close().catch(() => {})));
}

interface McpToolCallResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

function parseSearchResponse(raw: unknown): MappedEnvelope {
  const result = raw as McpToolCallResult;
  if (result.isError) {
    const text = result.content?.find((c) => c.type === 'text')?.text;
    throw new Error(text ?? 'FlowSpace search returned an error');
  }
  const text = result.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('FlowSpace returned empty response');
  let parsed: RawFlowspaceEnvelope;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`FlowSpace returned non-JSON response: ${text.slice(0, 200)}`);
  }
  return mapEnvelope(parsed);
}

export interface FlowspaceMcpSearchOptions {
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Search via the long-lived `fs2 mcp` child for `cwd`. Spawns the child on the
 * first call (cold path); reuses it on subsequent calls (warm path).
 *
 * FX001-1: after `getOrSpawn` resolves we increment `inflight` synchronously
 * (no await between resolution and bump) — this closes the idle-reaper race.
 * If the mtime check decides to recycle, we drop the slot, dispose the proc,
 * and retry once with a fresh handle.
 *
 * Throws on transport errors, MCP-level errors, or timeout.
 */
export async function flowspaceMcpSearch(
  cwd: string,
  query: string,
  mode: CodeSearchMode,
  opts: FlowspaceMcpSearchOptions = {}
): Promise<MappedEnvelope> {
  const fs2Mode = mode === 'semantic' ? 'semantic' : 'auto';
  const ceilingSignal = AbortSignal.timeout(SEARCH_CEILING_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, ceilingSignal]) : ceilingSignal;

  // Retry loop bounded at 2 attempts: one for the warm-path mtime recycle case,
  // one for actually running the search after respawn.
  for (let attempt = 0; attempt < 2; attempt++) {
    const proc = await getOrSpawn(cwd);
    // Synchronous claim — no awaits between getOrSpawn returning and this line.
    proc.inflight += 1;
    proc.lastUsedAt = Date.now();

    try {
      const recycled = await maybeRecycle(proc);
      if (recycled) {
        // proc is being torn down; release our slot and try again.
        continue;
      }

      const startMs = Date.now();
      const raw = await proc.client.callTool(
        {
          name: 'search',
          arguments: {
            pattern: query,
            mode: fs2Mode,
            limit: opts.limit ?? DEFAULT_LIMIT,
          },
        },
        undefined,
        { signal }
      );
      const env = parseSearchResponse(raw);
      log('search ok', {
        cwd,
        query,
        mode: fs2Mode,
        results: env.results.length,
        ms: Date.now() - startMs,
      });
      return env;
    } finally {
      proc.inflight -= 1;
      proc.lastUsedAt = Date.now();
    }
  }

  // Should be unreachable in practice — the second attempt always either
  // returns or throws.
  throw new Error('FlowSpace search failed after recycle retry');
}

/**
 * Test-only: clear the pool. Does not close existing processes — callers should
 * close them via shutdownAllFlowspace() first.
 */
export function __clearFlowspacePool(): void {
  pool.clear();
}
