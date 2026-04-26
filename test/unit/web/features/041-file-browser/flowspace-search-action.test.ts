/**
 * flowspaceSearch action tests
 *
 * FX002-2 (AC-FX02-2): order-preservation when the stale-file filter drops
 * mid-list entries.
 * FX002-4a (AC-FX02-4a): search-time ENOENT must NOT invalidate the
 * availability cache.
 *
 * Uses the InMemoryTransport seam established in FX001 — same doctrine as
 * `flowspace-mcp-client.test.ts`.
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __clearFlowspacePool,
  prewarmFlowspace,
  setFlowspaceTransportFactory,
  shutdownAllFlowspace,
} from '../../../../../apps/web/src/lib/server/flowspace-mcp-client';
import {
  checkFlowspaceAvailability,
  flowspaceSearch,
} from '../../../../../apps/web/src/lib/server/flowspace-search-action';

interface ServerHandle {
  server: Server;
  searchHandler: (req: { params: { name: string; arguments?: unknown } }) => Promise<unknown>;
}

async function makeServerWithEnvelope(
  envelope: unknown
): Promise<{ handle: ServerHandle; clientTransport: InMemoryTransport }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new Server(
    { name: 'fake-fs2', version: '0.0.1' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search',
        description: 'Search the code graph',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));
  const handle: ServerHandle = {
    server,
    searchHandler: async () => ({
      content: [{ type: 'text', text: JSON.stringify(envelope) }],
    }),
  };
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === 'search') return handle.searchHandler(req);
    return { content: [{ type: 'text', text: '{}' }], isError: true };
  });
  await server.connect(serverTransport);
  return { handle, clientTransport };
}

function makeEnvelopeWithNRefs(n: number, prefix: string): unknown {
  return {
    meta: { folders: {} },
    results: Array.from({ length: n }, (_, i) => ({
      node_id: `callable:${prefix}-${i}.ts:fn${i}`,
      start_line: 1,
      end_line: 1,
      smart_content: null,
      snippet: '',
      score: 0.9 - i * 0.05,
      match_field: 'content',
    })),
  };
}

describe('flowspaceSearch — parallel stale-file filter (FX002-2, AC-FX02-2)', () => {
  let cwd: string;
  let serverHandle: ServerHandle | undefined;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'fx002-stale-'));
    // Create files for indices 0, 2, 4 — leave 1 and 3 missing.
    for (const i of [0, 2, 4]) {
      await writeFile(join(cwd, `path-${i}.ts`), '');
    }
    // Provide a fake .fs2/graph.pickle so checkFlowspaceAvailability returns 'available'.
    await mkdir(join(cwd, '.fs2'), { recursive: true });
    await writeFile(join(cwd, '.fs2', 'graph.pickle'), '');

    const setup = await makeServerWithEnvelope(makeEnvelopeWithNRefs(5, 'path'));
    serverHandle = setup.handle;
    setFlowspaceTransportFactory(() => setup.clientTransport);
    await prewarmFlowspace(cwd);
  });

  afterEach(async () => {
    setFlowspaceTransportFactory(undefined);
    await serverHandle?.server.close().catch(() => {});
    serverHandle = undefined;
    await shutdownAllFlowspace();
    __clearFlowspacePool();
  });

  it('preserves order and filters out deleted files', async () => {
    const result = await flowspaceSearch('query', 'semantic', cwd);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');

    // Original envelope had 5 entries indexed 0..4. Only 0, 2, 4 exist on disk.
    // Order must be preserved (Promise.allSettled returns settled values in input order).
    expect(result.results.map((r) => r.name)).toEqual(['fn0', 'fn2', 'fn4']);
  });
});

describe('flowspace-mcp-client — spawn-time ENOENT invalidates availability cache (FX002-4b, AC-FX02-4b)', () => {
  // Read the cache directly via the globalThis pin (set by flowspace-search-action.ts).
  type AvailCache = { available: boolean | null; resolvedPath: string | null };
  const getCache = (): AvailCache => {
    const c = (globalThis as { __FLOWSPACE_AVAIL_CACHE__?: AvailCache }).__FLOWSPACE_AVAIL_CACHE__;
    if (!c) throw new Error('availability cache not initialised');
    return c;
  };

  beforeEach(async () => {
    // Pre-populate the cache to a known truthy state via the public API.
    await checkFlowspaceAvailability('/fake/cwd-baseline');
    // We don't strictly assert it's `true` — fs2 might not be on PATH in CI.
    // The key invariant: `null` post-test means invalidation fired.
    const c = getCache();
    if (c.available === null) {
      // CI runner without fs2 — manually pre-set so we can detect the flip.
      c.available = true;
      c.resolvedPath = '/fake/path/fs2';
    }
  });

  afterEach(async () => {
    setFlowspaceTransportFactory(undefined);
    await shutdownAllFlowspace();
    __clearFlowspacePool();
  });

  it('spawn-time ENOENT triggers cache invalidation', async () => {
    // Build a minimal Transport that throws ENOENT during start (= what
    // StdioClientTransport does when `fs2` isn't on PATH).
    setFlowspaceTransportFactory(
      () =>
        ({
          start: async () => {
            throw new Error('ENOENT: no such file or directory, spawn fs2');
          },
          close: async () => {},
          send: async () => {},
          onclose: undefined,
          onerror: undefined,
          onmessage: undefined,
        }) as unknown as Parameters<typeof setFlowspaceTransportFactory>[0] extends
          | undefined
          | ((cwd: string) => infer T)
          ? T
          : never
    );

    await prewarmFlowspace('/fake/cwd-enoent');

    // The dynamic import + async invalidation needs a microtask flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const cache = getCache();
    expect(cache.available).toBeNull();
    expect(cache.resolvedPath).toBeNull();
  });
});

describe('flowspaceSearch — search-time ENOENT does not poison availability cache (FX002-4a, AC-FX02-4a)', () => {
  let cwd: string;
  let serverHandle: ServerHandle | undefined;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'fx002-enoent-'));
    await mkdir(join(cwd, '.fs2'), { recursive: true });
    await writeFile(join(cwd, '.fs2', 'graph.pickle'), '');

    const setup = await makeServerWithEnvelope({});
    serverHandle = setup.handle;
    setFlowspaceTransportFactory(() => setup.clientTransport);
    await prewarmFlowspace(cwd);
  });

  afterEach(async () => {
    setFlowspaceTransportFactory(undefined);
    await serverHandle?.server.close().catch(() => {});
    serverHandle = undefined;
    await shutdownAllFlowspace();
    __clearFlowspacePool();
  });

  it('search-time ENOENT in MCP error response does NOT flip availability to not-installed', async () => {
    // Override the search handler to return an error response containing "ENOENT".
    if (serverHandle) {
      serverHandle.searchHandler = async () => ({
        content: [{ type: 'text', text: 'MCP error: ENOENT no such file or directory, open …' }],
        isError: true,
      });
    }

    const before = await checkFlowspaceAvailability(cwd);
    expect(before.availability).toBe('available');

    const result = await flowspaceSearch('foo', 'semantic', cwd);
    expect(result.kind).toBe('error');

    // Critical assertion: the cache must not be invalidated by the search-time
    // error message containing "ENOENT". Subsequent availability check should
    // still report 'available'.
    const after = await checkFlowspaceAvailability(cwd);
    expect(after.availability).toBe('available');
  });
});
