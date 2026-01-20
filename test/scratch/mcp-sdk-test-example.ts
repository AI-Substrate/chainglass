/**
 * MCP SDK Client Test Example
 *
 * This demonstrates how our MCP tests SHOULD be written using the SDK client
 * instead of manual JSON-RPC boilerplate.
 *
 * Compare this to the current test patterns in:
 * - test/unit/mcp-server/stdio-transport.test.ts
 * - test/unit/mcp-server/check-health.test.ts
 * - test/integration/mcp-stdio.test.ts
 *
 * Run: pnpm exec tsx test/scratch/mcp-sdk-test-example.ts
 */

import assert from 'node:assert';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(projectRoot, 'apps/cli/dist/cli.cjs');

// ============================================================================
// Helper: Create a connected MCP client
// ============================================================================

interface McpTestClient {
  client: Client;
  transport: StdioClientTransport;
  stderr: string[];
  close: () => Promise<void>;
}

async function createTestClient(): Promise<McpTestClient> {
  const stderr: string[] = [];

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', '--stdio'],
    stderr: 'pipe',
  });

  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString());
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  await client.connect(transport);

  return {
    client,
    transport,
    stderr,
    close: async () => {
      await client.close();
    },
  };
}

// ============================================================================
// Test: Server Info (was ~30 lines, now ~5 lines)
// ============================================================================

async function testServerInfo() {
  console.log('Test: Server responds with correct info');

  const { client, close } = await createTestClient();

  try {
    const serverInfo = client.getServerVersion();
    assert.strictEqual(serverInfo?.name, 'chainglass');
    console.log('  PASS: Server name is chainglass');
  } finally {
    await close();
  }
}

// ============================================================================
// Test: List Tools (was ~50 lines with manual JSON-RPC, now ~10 lines)
// ============================================================================

async function testListTools() {
  console.log('Test: tools/list returns check_health tool');

  const { client, close } = await createTestClient();

  try {
    const result = await client.listTools();

    assert(result.tools.length > 0, 'Should have at least one tool');

    const checkHealth = result.tools.find((t) => t.name === 'check_health');
    assert(checkHealth, 'Should have check_health tool');
    assert(checkHealth.description?.includes('health'), 'Description should mention health');

    console.log('  PASS: check_health tool found with correct description');
  } finally {
    await close();
  }
}

// ============================================================================
// Test: Call Tool (was ~60 lines with manual JSON-RPC, now ~15 lines)
// ============================================================================

async function testCallTool() {
  console.log('Test: check_health returns semantic response');

  const { client, close } = await createTestClient();

  try {
    const result = await client.callTool({
      name: 'check_health',
      arguments: {},
    });

    assert(result.content.length > 0, 'Should have content');
    assert.strictEqual(result.content[0].type, 'text');

    const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);

    // ADR-0001 Decision #5: Semantic response with summary
    assert(response.status, 'Response should have status');
    assert(response.summary, 'Response should have summary');
    assert(response.components, 'Response should have components');
    assert(response.checked_at, 'Response should have checked_at');

    console.log('  PASS: Response has all required semantic fields');
  } finally {
    await close();
  }
}

// ============================================================================
// Test: Tool Annotations (was ~70 lines, now ~20 lines)
// ============================================================================

async function testToolAnnotations() {
  console.log('Test: check_health has complete annotations');

  const { client, close } = await createTestClient();

  try {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === 'check_health');
    assert(tool, 'Should have check_health tool');

    // ADR-0001 Decision #7: Complete annotations
    assert(tool.annotations, 'Tool should have annotations');
    assert.strictEqual(tool.annotations.readOnlyHint, true);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.strictEqual(tool.annotations.idempotentHint, true);
    assert.strictEqual(tool.annotations.openWorldHint, false);

    console.log('  PASS: All annotation hints are correctly set');
  } finally {
    await close();
  }
}

// ============================================================================
// Test: Stdio Cleanliness
// Note: The SDK handles stdio cleanliness automatically. If stdout had garbage,
// the JSON-RPC parsing would fail during connect(). A successful connect()
// implicitly validates that stdout is clean.
// ============================================================================

async function testStdioCleanliness() {
  console.log('Test: stdout is clean (implicit via successful connect)');

  const stderr: string[] = [];

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', '--stdio'],
    stderr: 'pipe',
  });

  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString());
  });

  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  // If we got here, stdout was clean (no JSON parse errors during handshake)
  const serverInfo = client.getServerVersion();
  assert.strictEqual(serverInfo?.name, 'chainglass');

  // Wait a moment for any delayed stderr output
  await new Promise((r) => setTimeout(r, 100));

  // stderr should have logs (allowed and expected)
  assert(stderr.length > 0, 'Stderr should have startup logs');

  await client.close();
  console.log('  PASS: Connection succeeded, logs went to stderr');
}

// ============================================================================
// Run all tests
// ============================================================================

async function main() {
  console.log('=== MCP SDK Test Examples ===\n');

  try {
    await testServerInfo();
    await testListTools();
    await testCallTool();
    await testToolAnnotations();
    await testStdioCleanliness();

    console.log('\n=== All tests passed ===');
    console.log(
      '\nThis demonstrates ~70% boilerplate reduction compared to manual JSON-RPC tests.'
    );
    console.log('See research dossier for full migration strategy.');
  } catch (error) {
    console.error('\n=== Test failed ===');
    console.error(error);
    process.exitCode = 1;
  }
}

main();
