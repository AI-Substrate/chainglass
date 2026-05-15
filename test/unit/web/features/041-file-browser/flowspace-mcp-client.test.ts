/**
 * FlowSpace MCP Client Pool Tests
 *
 * Plan 084: covers the per-worktree process-pool invariants without spawning
 * a real `fs2 mcp` child. We pair InMemoryTransports + a fake MCP Server that
 * implements a `search` tool returning a canned envelope.
 *
 * Per repo doctrine: no vi.fn() mocks. Real SDK objects, in-memory transport.
 *
 * NOT covered here (covered by the env-gated integration test):
 *  - Real fs2 mcp envelope shape
 *  - Real graph mtime recycling
 *  - Real subprocess crash behaviour
 */

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __clearFlowspacePool,
  flowspaceMcpSearch,
  getFlowspaceStatus,
  runIdleReaperOnce,
  setFlowspaceTransportFactory,
  setReadGraphMtimeForTests,
  shutdownAllFlowspace,
} from '../../../../../apps/web/src/lib/server/flowspace-mcp-client';

const SAMPLE_ENVELOPE = {
  meta: {
    total: 1,
    folders: { 'apps/': 1 },
  },
  results: [
    {
      node_id: 'callable:apps/web/src/x.ts:foo',
      start_line: 1,
      end_line: 5,
      smart_content: 'A function called foo with a moderately long summary',
      snippet: 'function foo()',
      score: 0.9,
      match_field: 'content',
    },
  ],
};

interface FakeServerHandle {
  server: Server;
  serverTransport: InMemoryTransport;
  clientTransport: InMemoryTransport;
  searchCalls: number;
}

async function makeFakeFlowspaceServer(): Promise<FakeServerHandle> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new Server(
    { name: 'fake-fs2-mcp', version: '0.0.1' },
    { capabilities: { tools: {} } }
  );

  const handle: FakeServerHandle = {
    server,
    serverTransport,
    clientTransport,
    searchCalls: 0,
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search',
        description: 'Search the code graph',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            mode: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'search') {
      handle.searchCalls += 1;
      return {
        content: [{ type: 'text', text: JSON.stringify(SAMPLE_ENVELOPE) }],
      };
    }
    return { content: [{ type: 'text', text: '{}' }], isError: true };
  });

  await server.connect(serverTransport);
  return handle;
}

describe('flowspace-mcp-client — pool semantics', () => {
  let handles: FakeServerHandle[] = [];
  let factoryCalls = 0;
  // FX001-5: tests that need a respawn (mtime recycle, crash recovery) push
  // a new handle into `handles` before triggering the second call. The
  // factory pulls the latest unconsumed handle.
  let nextHandleIdx = 0;

  beforeEach(() => {
    factoryCalls = 0;
    handles = [];
    nextHandleIdx = 0;
    setFlowspaceTransportFactory(() => {
      const h = handles[nextHandleIdx];
      if (!h) {
        throw new Error(
          `test must push a handle into handles[] before factory call ${nextHandleIdx + 1}`
        );
      }
      nextHandleIdx += 1;
      factoryCalls += 1;
      return h.clientTransport;
    });
  });

  afterEach(async () => {
    setFlowspaceTransportFactory(undefined);
    setReadGraphMtimeForTests(undefined);
    for (const h of handles) {
      await h.server.close().catch(() => {});
    }
    handles = [];
    await shutdownAllFlowspace();
    __clearFlowspacePool();
  });

  // Convenience for tests that only need one handle.
  async function pushHandle(): Promise<FakeServerHandle> {
    const h = await makeFakeFlowspaceServer();
    handles.push(h);
    return h;
  }

  it('spawns once and returns mapped results on a single call', async () => {
    const handle = await pushHandle();

    const out = await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');

    expect(out.results).toHaveLength(1);
    expect(out.results[0].name).toBe('foo');
    expect(out.results[0].filePath).toBe('apps/web/src/x.ts');
    expect(out.folders).toEqual({ 'apps/': 1 });
    expect(factoryCalls).toBe(1);
    expect(handle.searchCalls).toBe(1);
  });

  it('reuses the warm process across multiple sequential calls (one factory call total)', async () => {
    const handle = await pushHandle();

    await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');
    await flowspaceMcpSearch('/fake/cwd', 'bar', 'semantic');
    await flowspaceMcpSearch('/fake/cwd', 'baz', 'semantic');

    expect(factoryCalls).toBe(1);
    expect(handle.searchCalls).toBe(3);
  });

  it('dedupes concurrent first-callers to a single spawn (AC-14)', async () => {
    const handle = await pushHandle();

    const [a, b, c] = await Promise.all([
      flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic'),
      flowspaceMcpSearch('/fake/cwd', 'bar', 'semantic'),
      flowspaceMcpSearch('/fake/cwd', 'baz', 'semantic'),
    ]);

    expect(a.results).toHaveLength(1);
    expect(b.results).toHaveLength(1);
    expect(c.results).toHaveLength(1);
    expect(factoryCalls).toBe(1);
    expect(handle.searchCalls).toBe(3);
  });

  it('reports idle status before any spawn and ready after one', async () => {
    const handle = await pushHandle();

    expect(getFlowspaceStatus('/fake/cwd').state).toBe('idle');

    await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');

    expect(getFlowspaceStatus('/fake/cwd').state).toBe('ready');
  });

  // FX001-5: mtime recycle — when graph.pickle's mtime advances past the
  // value captured at spawn, the next search closes the current process and
  // respawns. Visible as factoryCalls === 2 across two calls.
  it('recycles the process when graph.pickle mtime advances (AC-FX-6)', async () => {
    await pushHandle();
    await pushHandle(); // ready for the respawn after recycle

    let mtime = 1000;
    setReadGraphMtimeForTests(async () => mtime);

    await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');
    expect(factoryCalls).toBe(1);

    // Simulate `fs2 scan` rebuilding the graph.
    mtime = 2000;

    await flowspaceMcpSearch('/fake/cwd', 'bar', 'semantic');
    expect(factoryCalls).toBe(2);
  });

  // FX001-5: crash recovery — calling transport.onclose() simulates the child
  // process dying. Pool entry is removed; the next search respawns.
  it('respawns after transport.onclose fires (AC-FX-6)', async () => {
    const first = await pushHandle();
    await pushHandle();

    await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');
    expect(factoryCalls).toBe(1);
    expect(getFlowspaceStatus('/fake/cwd').state).toBe('ready');

    // Simulate the child dying — onclose is what the SDK fires when stdio closes.
    first.clientTransport.onclose?.();

    expect(getFlowspaceStatus('/fake/cwd').state).toBe('idle');

    await flowspaceMcpSearch('/fake/cwd', 'bar', 'semantic');
    expect(factoryCalls).toBe(2);
  });

  // FX001-5: idle reaper closes processes that have been idle past
  // FLOWSPACE_IDLE_MS (or the env override) with zero in-flight calls.
  it('idle reaper closes idle processes (AC-FX-6)', async () => {
    process.env.FLOWSPACE_IDLE_MS = '50';
    try {
      await pushHandle();
      await flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic');
      expect(getFlowspaceStatus('/fake/cwd').state).toBe('ready');

      // Backdate lastUsedAt past the idle threshold. The pool exposes its
      // entries via the publicly-readable status, so we reach in via a known
      // global reference rather than mocking time. This mirrors what real
      // calendar time would do after FLOWSPACE_IDLE_MS elapses.
      const pool = (globalThis as { __FLOWSPACE_MCP_POOL__?: Map<string, { lastUsedAt: number }> })
        .__FLOWSPACE_MCP_POOL__;
      const entry = pool?.get('/fake/cwd');
      expect(entry).toBeDefined();
      if (entry) entry.lastUsedAt = Date.now() - 1000;

      runIdleReaperOnce();

      // The reaper calls client.close() which fires onclose asynchronously;
      // give it a tick to flush.
      await new Promise((r) => setImmediate(r));

      expect(getFlowspaceStatus('/fake/cwd').state).toBe('idle');
    } finally {
      // biome-ignore lint/performance/noDelete: env var teardown
      delete process.env.FLOWSPACE_IDLE_MS;
    }
  });

  // FX001-5: protective regression test — if a future change moves pool.set
  // after any await in getOrSpawn, this test will catch it. Three concurrent
  // first-callers must spawn exactly one process, and the dedup must hold
  // even when the connect step is artificially slow.
  it('dedup invariant holds with slow client.connect (FX001-5 regression guard)', async () => {
    // Wrap the InMemoryTransport so its start() (called by client.connect)
    // takes ~30ms. This makes the timing window between pool.get and pool.set
    // observable: if pool.set were after the connect await, all three callers
    // would call factory before any pool.set ran.
    const handle = await pushHandle();
    const realStart = handle.clientTransport.start.bind(handle.clientTransport);
    handle.clientTransport.start = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return realStart();
    };

    const [a, b, c] = await Promise.all([
      flowspaceMcpSearch('/fake/cwd', 'foo', 'semantic'),
      flowspaceMcpSearch('/fake/cwd', 'bar', 'semantic'),
      flowspaceMcpSearch('/fake/cwd', 'baz', 'semantic'),
    ]);

    expect(a.results).toHaveLength(1);
    expect(b.results).toHaveLength(1);
    expect(c.results).toHaveLength(1);
    expect(factoryCalls).toBe(1);
  });
});
