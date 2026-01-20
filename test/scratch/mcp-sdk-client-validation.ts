/**
 * MCP SDK Client Validation Script
 *
 * Purpose: Validate that we can use the @modelcontextprotocol/sdk Client
 * instead of manual JSON-RPC boilerplate for testing our MCP server.
 *
 * This script demonstrates:
 * 1. Using StdioClientTransport to spawn and connect to our CLI
 * 2. Automatic initialization handling by Client.connect()
 * 3. Type-safe listTools() and callTool() methods
 * 4. Proper cleanup with transport.close()
 *
 * Run: pnpm exec tsx test/scratch/mcp-sdk-client-validation.ts
 */

import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(projectRoot, 'apps/cli/dist/cli.cjs');

async function main() {
  console.log('=== MCP SDK Client Validation ===\n');
  console.log(`CLI Path: ${cliPath}\n`);

  // Create transport - spawns the MCP server process
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', '--stdio'],
    stderr: 'pipe', // Capture stderr for debugging
  });

  // Capture stderr for debugging
  transport.stderr?.on('data', (chunk: Buffer) => {
    console.log(`[stderr] ${chunk.toString().trim()}`);
  });

  // Create client
  const client = new Client({ name: 'validation-test', version: '1.0.0' }, { capabilities: {} });

  try {
    console.log('1. Connecting to MCP server...');
    // connect() automatically:
    // - Calls transport.start() to spawn process
    // - Sends initialize request
    // - Sends initialized notification
    await client.connect(transport);
    console.log('   Connected!\n');

    // Get server info
    const serverVersion = client.getServerVersion();
    console.log(`2. Server Info: ${serverVersion?.name} v${serverVersion?.version}\n`);

    // List tools (uses typed method instead of manual JSON-RPC)
    console.log('3. Listing tools...');
    const toolsResult = await client.listTools();
    console.log(`   Found ${toolsResult.tools.length} tool(s):`);
    for (const tool of toolsResult.tools) {
      console.log(`   - ${tool.name}: ${tool.description?.slice(0, 60)}...`);
    }
    console.log();

    // Call check_health tool (uses typed method instead of manual JSON-RPC)
    console.log('4. Calling check_health tool...');
    const result = await client.callTool({ name: 'check_health', arguments: {} });
    console.log('   Result:');
    for (const content of result.content) {
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        console.log(`   - status: ${parsed.status}`);
        console.log(`   - summary: ${parsed.summary}`);
        console.log(`   - checked_at: ${parsed.checked_at}`);
      }
    }
    console.log();

    console.log('=== Validation PASSED ===');
    console.log('The MCP SDK Client works correctly with our server.\n');
    console.log('Benefits over manual JSON-RPC:');
    console.log('- No manual initialize/initialized handshake');
    console.log('- Type-safe listTools(), callTool() methods');
    console.log('- Automatic protocol version negotiation');
    console.log('- Built-in error handling with McpError');
    console.log('- Proper process lifecycle management');
  } catch (error) {
    console.error('\n=== Validation FAILED ===');
    console.error('Error:', error);
    process.exitCode = 1;
  } finally {
    // Clean shutdown
    console.log('\n5. Closing connection...');
    await client.close();
    console.log('   Done.');
  }
}

main();
