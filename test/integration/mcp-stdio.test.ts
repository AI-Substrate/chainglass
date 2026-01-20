/**
 * MCP Command Integration Tests
 *
 * Tests the CLI `cg mcp` command end-to-end, verifying:
 * - Command help output
 * - MCP server startup via --stdio flag
 * - JSON-RPC communication
 *
 * Per ADR-0001: These are integration tests (Level 2 of 3-level strategy)
 */

import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../base/mcp-test.js';

// Resolve CLI path from test file location (works regardless of cwd)
const projectRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(projectRoot, 'apps/cli/dist/cli.cjs');

describe('cg mcp command integration', () => {
  let proc: ChildProcess | null = null;

  afterEach(() => {
    if (proc) {
      proc.kill();
      proc = null;
    }
  });

  describe('help and options', () => {
    it('should show help for mcp command', async () => {
      /*
      Test Doc:
      - Why: CLI must be self-documenting; users need to discover --stdio flag
      - Contract: `cg mcp --help` outputs help text containing 'stdio' option
      - Usage Notes: Run CLI with --help flag, capture stdout
      - Quality Contribution: Catches missing command registration or broken help
      - Worked Example: `cg mcp --help` stdout contains '--stdio'
      */
      proc = spawn(process.execPath, [cliPath, 'mcp', '--help'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      const stdout = await new Promise<string>((resolve, reject) => {
        let data = '';
        proc?.stdout?.on('data', (chunk) => {
          data += chunk.toString();
        });
        proc?.on('close', () => resolve(data));
        proc?.on('error', reject);
        setTimeout(() => resolve(data), 3000);
      });

      expect(stdout).toContain('--stdio');
      expect(stdout).toContain('MCP server');
    });

    it('should exit with error when no transport specified', async () => {
      /*
      Test Doc:
      - Why: Running `cg mcp` without flags should provide clear guidance
      - Contract: `cg mcp` (no flags) exits with error and message about --stdio
      - Usage Notes: Currently HTTP transport not implemented, so bare command errors
      - Quality Contribution: Catches confusing behavior when transport not specified
      - Worked Example: `cg mcp` exits with code 1, stderr mentions --stdio
      */
      proc = spawn(process.execPath, [cliPath, 'mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      const result = await new Promise<{ stderr: string; exitCode: number }>((resolve) => {
        let stderr = '';
        proc?.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        proc?.on('exit', (code) => {
          resolve({ stderr, exitCode: code ?? 1 });
        });
        // Fallback timeout - if process doesn't exit, fail
        setTimeout(() => {
          resolve({ stderr, exitCode: -1 });
        }, 2000);
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--stdio');
    });
  });

  describe('stdio transport', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should respond to MCP initialize request', async () => {
      /*
      Test Doc:
      - Why: MCP server must handle initialize for AI agent handshake; broken init blocks all MCP usage
      - Contract: Valid JSON-RPC initialize request returns response with protocolVersion, serverInfo
      - Usage Notes: Use createTestClient() which auto-handles initialize; verify via getServerVersion()
      - Quality Contribution: Catches MCP protocol non-compliance, broken initialization
      - Worked Example: createTestClient() -> client.getServerVersion()?.name === 'chainglass'
      */
      testClient = await createTestClient();

      // getServerVersion() returns the info from the initialize response
      const serverVersion = testClient.client.getServerVersion();

      expect(serverVersion).toBeDefined();
      expect(serverVersion?.name).toBe('chainglass');
    });

    it('should respond to initialized notification', async () => {
      /*
      Test Doc:
      - Why: After initialize, client sends initialized notification; server must handle it
      - Contract: Sending initialized notification after initialize completes without error
      - Usage Notes: createTestClient() handles init + initialized; if it completes, notification worked
      - Quality Contribution: Catches server crashing on notification or protocol errors
      - Worked Example: createTestClient() succeeds -> initialized notification was handled
      */
      // createTestClient() automatically sends initialize AND initialized notification
      // If this completes without error, the server handled both correctly
      testClient = await createTestClient();

      // If we get here, the server handled both initialize and initialized
      // We can verify the connection is still alive by making a call
      const serverVersion = testClient.client.getServerVersion();
      expect(serverVersion).toBeDefined();
    });

    it('should list tools including check_health', async () => {
      /*
      Test Doc:
      - Why: AI agents need to discover available tools; check_health must be listed
      - Contract: tools/list request returns array containing check_health tool
      - Usage Notes: Use createTestClient() then client.listTools() to get tool list
      - Quality Contribution: Catches missing tool registration or broken tool listing
      - Worked Example: client.listTools() -> tools array contains {name:'check_health'}
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();

      expect(toolsResult.tools).toBeDefined();

      const checkHealthTool = toolsResult.tools.find((t) => t.name === 'check_health');
      expect(checkHealthTool).toBeDefined();
      expect(checkHealthTool?.description).toContain('health status');
    });
  });
});
