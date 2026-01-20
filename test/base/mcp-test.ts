/**
 * MCP Test Helper for @chainglass/mcp-server tests.
 *
 * Provides a createTestClient() helper that uses the official MCP SDK Client
 * instead of manual JSON-RPC boilerplate. This eliminates ~180 lines of
 * repetitive spawn/stdin/stdout handling across test files.
 *
 * Usage:
 * ```typescript
 * import { createTestClient, type McpTestClient } from '@test/base/mcp-test';
 *
 * describe('MCP tests', () => {
 *   let testClient: McpTestClient | null = null;
 *
 *   afterEach(async () => {
 *     await testClient?.close();
 *     testClient = null;
 *   });
 *
 *   it('should call a tool', async () => {
 *     testClient = await createTestClient();
 *     const result = await testClient.client.callTool({
 *       name: 'check_health',
 *       arguments: {}
 *     });
 *     expect(result.content).toBeDefined();
 *   });
 * });
 * ```
 *
 * Benefits over manual JSON-RPC:
 * - No manual initialize/initialized handshake (connect() handles it)
 * - Type-safe listTools(), callTool() methods
 * - Automatic protocol version negotiation
 * - Built-in error handling with McpError
 * - Proper process lifecycle management via close()
 *
 * @see docs/plans/001-project-setup/tasks/phase-5-mcp-server-package/001-subtask-migrate-mcp-tests-to-sdk-client.md
 */

import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Resolve CLI path from test file location (works regardless of cwd)
const projectRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(projectRoot, 'apps/cli/dist/cli.cjs');

/**
 * Test client wrapper providing access to SDK Client, transport, and stderr output.
 */
export interface McpTestClient {
  /**
   * The MCP SDK Client instance.
   * Use for listTools(), callTool(), getServerVersion(), etc.
   */
  client: Client;

  /**
   * The underlying StdioClientTransport.
   * Useful for advanced scenarios or inspecting transport state.
   */
  transport: StdioClientTransport;

  /**
   * Captured stderr output from the MCP server process.
   * Useful for debugging or verifying log output goes to stderr.
   */
  stderr: string[];

  /**
   * Gracefully close the client connection and transport.
   * MUST be called in afterEach to prevent process leaks.
   */
  close: () => Promise<void>;
}

/**
 * Creates a test client connected to the MCP server via stdio transport.
 *
 * This helper:
 * 1. Spawns the CLI with `mcp --stdio`
 * 2. Creates an SDK Client with test credentials
 * 3. Connects (automatically handles initialize/initialized handshake)
 * 4. Captures stderr for debugging/verification
 * 5. Returns a close() function for cleanup
 *
 * @returns Promise resolving to McpTestClient with client, transport, stderr, and close()
 *
 * @example
 * ```typescript
 * const testClient = await createTestClient();
 * try {
 *   const tools = await testClient.client.listTools();
 *   expect(tools.tools.length).toBeGreaterThan(0);
 * } finally {
 *   await testClient.close();
 * }
 * ```
 */
export async function createTestClient(): Promise<McpTestClient> {
  const stderr: string[] = [];

  // Create transport - spawns the MCP server process
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', '--stdio'],
    stderr: 'pipe', // Capture stderr for debugging
  });

  // Capture stderr output
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString());
  });

  // Create client with test identity
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  // Connect - this automatically:
  // - Calls transport.start() to spawn process
  // - Sends initialize request
  // - Sends initialized notification
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

// Re-export test utilities for convenience
export { afterEach, beforeEach, describe, expect, it } from 'vitest';
