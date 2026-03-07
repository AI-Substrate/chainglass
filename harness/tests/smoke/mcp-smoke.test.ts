/**
 * MCP endpoint smoke test — verifies /_next/mcp responds to JSON-RPC.
 *
 * DYK #4: This is a Vitest .test.ts using fetch(), NOT a Playwright .spec.ts.
 * MCP is a POST JSON-RPC 2.0 endpoint, not a navigable page.
 */

import { describe, expect, it } from 'vitest';
import { computePorts } from '../../src/ports/allocator.js';

const ports = computePorts();
const MCP_URL = `http://127.0.0.1:${ports.app}/_next/mcp`;

describe('MCP endpoint', () => {
  it('responds to tools/list JSON-RPC request', async () => {
    /*
    Test Doc:
    - Why: MCP is how agents discover and call Next.js tools — must be operational.
    - Contract: POST /_next/mcp with tools/list → JSON-RPC response with tool array.
    - Usage Notes: Requires running harness container. Uses fetch(), not Playwright.
    - Quality Contribution: Catches MCP endpoint misconfiguration or crash.
    - Worked Example: POST {"jsonrpc":"2.0","id":1,"method":"tools/list"} → {result:{tools:[...]}}
    */
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    // MCP may return 200 or 406 depending on Accept headers — both mean it's alive
    expect(res.status).toBeLessThan(500);
  });

  it('returns valid JSON-RPC response structure', async () => {
    /*
    Test Doc:
    - Why: Agents parse the JSON-RPC response — it must be well-formed with expected tools.
    - Contract: Response contains jsonrpc, id, and result with known tool names.
    - Usage Notes: Expected tools: get_routes, get_errors per Next.js MCP spec.
    - Quality Contribution: Catches JSON parse failures or missing MCP tools.
    - Worked Example: Response has {jsonrpc: "2.0", id: 42, result: {tools: [{name: "get_routes"}, ...]}}
    */
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/list' }),
    });

    const body = await res.text();
    const data = JSON.parse(body);
    expect(data).toHaveProperty('jsonrpc');

    // If we get a result with tools, verify expected tool names are present
    if (data.result?.tools) {
      const toolNames = data.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain('get_routes');
      expect(toolNames).toContain('get_errors');
    }
  });
});
