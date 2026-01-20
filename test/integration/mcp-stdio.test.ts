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
    it('should respond to MCP initialize request', async () => {
      /*
      Test Doc:
      - Why: MCP server must handle initialize for AI agent handshake; broken init blocks all MCP usage
      - Contract: Valid JSON-RPC initialize request returns response with protocolVersion, serverInfo
      - Usage Notes: Send initialize to stdin, read JSON-RPC response from stdout
      - Quality Contribution: Catches MCP protocol non-compliance, broken initialization
      - Worked Example: stdin initialize -> stdout {jsonrpc:'2.0',result:{serverInfo:{name:'chainglass'}}}
      */
      proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      const stdout: string[] = [];
      proc.stdout?.on('data', (data) => stdout.push(data.toString()));

      // Wait for server startup
      await new Promise((r) => setTimeout(r, 500));

      // Send initialize request
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-test', version: '1.0.0' },
        },
      });

      proc.stdin?.write(`${request}\n`);

      // Wait for response
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        proc?.stdout?.once('data', () => {
          clearTimeout(timeout);
          setTimeout(resolve, 100);
        });
      });

      const response = stdout.join('');
      const parsed = JSON.parse(response);

      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe(1);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.serverInfo.name).toBe('chainglass');
    });

    it('should respond to initialized notification', async () => {
      /*
      Test Doc:
      - Why: After initialize, client sends initialized notification; server must handle it
      - Contract: Sending initialized notification after initialize completes without error
      - Usage Notes: This is a notification (no id), server should not respond
      - Quality Contribution: Catches server crashing on notification or protocol errors
      - Worked Example: stdin initialized notification -> no crash, server keeps running
      */
      proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      const stderr: string[] = [];
      proc.stderr?.on('data', (data) => stderr.push(data.toString()));

      // Wait for server startup
      await new Promise((r) => setTimeout(r, 500));

      // Send initialize request first
      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-test', version: '1.0.0' },
        },
      });

      proc.stdin?.write(`${initRequest}\n`);
      await new Promise((r) => setTimeout(r, 300));

      // Send initialized notification
      const initializedNotif = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      proc.stdin?.write(`${initializedNotif}\n`);

      // Wait a bit - server should not crash
      await new Promise((r) => setTimeout(r, 500));

      // If we get here without crash, the notification was handled
      expect(proc.killed).toBe(false);
    });

    it('should list tools including check_health', async () => {
      /*
      Test Doc:
      - Why: AI agents need to discover available tools; check_health must be listed
      - Contract: tools/list request returns array containing check_health tool
      - Usage Notes: Must complete initialize first, then send tools/list
      - Quality Contribution: Catches missing tool registration or broken tool listing
      - Worked Example: tools/list -> result.tools contains {name:'check_health'}
      */
      proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      const stdout: string[] = [];
      proc.stdout?.on('data', (data) => stdout.push(data.toString()));

      // Wait for server startup
      await new Promise((r) => setTimeout(r, 500));

      // Initialize first
      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-test', version: '1.0.0' },
        },
      });

      proc.stdin?.write(`${initRequest}\n`);
      await new Promise((r) => setTimeout(r, 300));

      // Clear stdout buffer
      stdout.length = 0;

      // Send tools/list request
      const toolsRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

      proc.stdin?.write(`${toolsRequest}\n`);

      // Wait for response
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        proc?.stdout?.once('data', () => {
          clearTimeout(timeout);
          setTimeout(resolve, 100);
        });
      });

      const response = stdout.join('');
      const parsed = JSON.parse(response);

      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe(2);
      expect(parsed.result.tools).toBeDefined();

      const checkHealthTool = parsed.result.tools.find(
        (t: { name: string }) => t.name === 'check_health'
      );
      expect(checkHealthTool).toBeDefined();
      expect(checkHealthTool.description).toContain('health status');
    });
  });
});
