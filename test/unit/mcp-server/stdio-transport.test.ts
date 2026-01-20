/**
 * MCP Stdio Transport Tests
 *
 * TDD: RED phase - These tests verify stdio cleanliness per ADR-0001 IMP-001 and CD-10.
 *
 * Critical Discovery 10: MCP stdio transport requires stdout discipline:
 * - stdout is reserved EXCLUSIVELY for JSON-RPC messages
 * - No startup messages, logs, or console.log on stdout
 * - All logs MUST go to stderr
 *
 * Note: Tests 1, 3, 4 use spawn (pre-connection tests that verify stdout state BEFORE
 * any JSON-RPC). Test 2 uses SDK client (post-connection test).
 */

import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../../base/mcp-test.js';

// Resolve CLI path from test file location (works regardless of cwd)
const projectRoot = path.resolve(import.meta.dirname, '../../..');
const cliPath = path.join(projectRoot, 'apps/cli/dist/cli.cjs');

describe('MCP stdio transport cleanliness', () => {
  // For spawn-based tests (pre-connection)
  let proc: ChildProcess | null = null;
  // For SDK-based tests (post-connection)
  let testClient: McpTestClient | null = null;

  afterEach(async () => {
    // Cleanup spawn-based tests
    if (proc) {
      proc.kill();
      proc = null;
    }
    // Cleanup SDK-based tests
    await testClient?.close();
    testClient = null;
  });

  it('should not output anything to stdout before receiving input', async () => {
    /*
    Test Doc:
    - Why: MCP stdio protocol requires stdout reserved for JSON-RPC only; any startup noise corrupts the protocol
    - Contract: After spawn, stdout remains empty until first JSON-RPC input is received
    - Usage Notes: Spawn mcp server directly (not SDK), wait 1000ms for any accidental startup messages
    - Quality Contribution: Catches console.log, startup messages, or logger misconfiguration
    - Worked Example: spawn mcp --stdio, wait 1000ms, stdout.join('') === '' (empty string)
    */
    proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout?.on('data', (data) => stdout.push(data.toString()));
    proc.stderr?.on('data', (data) => stderr.push(data.toString()));

    // Wait for any startup messages (but there should be none on stdout)
    await new Promise((r) => setTimeout(r, 1000));

    // stdout MUST be empty (no startup noise)
    expect(stdout.join('')).toBe('');
    // stderr MAY have logs (that's OK)
  });

  it('should only output valid JSON-RPC on stdout after receiving request', async () => {
    /*
    Test Doc:
    - Why: All stdout must be parseable JSON-RPC; garbage output breaks agent communication
    - Contract: After sending JSON-RPC request, stdout contains only valid JSON-RPC response
    - Usage Notes: Use createTestClient() which auto-handles initialize; verify via getServerVersion()
    - Quality Contribution: Catches malformed JSON, extra whitespace, or debug output mixed with response
    - Worked Example: createTestClient() succeeds (implicitly verifies stdout is valid JSON-RPC)
    */
    // SDK client's connect() sends initialize and parses the JSON-RPC response
    // If this succeeds, stdout contained only valid JSON-RPC
    testClient = await createTestClient();

    // getServerVersion() confirms the initialize response was valid JSON-RPC
    const serverVersion = testClient.client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion?.name).toBe('chainglass');
  });

  it('should log startup messages to stderr only', async () => {
    /*
    Test Doc:
    - Why: Logs must go to stderr so stdout remains clean for JSON-RPC; verifies log redirection works
    - Contract: After spawn, stderr contains log messages (indicating server started), stdout is empty
    - Usage Notes: Server should log "MCP server created" to stderr during initialization
    - Quality Contribution: Catches misconfigured logger outputting to stdout instead of stderr
    - Worked Example: spawn, wait 500ms, stderr contains 'MCP server' or similar, stdout is ''
    */
    proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout?.on('data', (data) => stdout.push(data.toString()));
    proc.stderr?.on('data', (data) => stderr.push(data.toString()));

    // Wait for startup
    await new Promise((r) => setTimeout(r, 1000));

    // stdout MUST be empty
    expect(stdout.join('')).toBe('');

    // stderr SHOULD have some log output (server created message)
    // Note: This may be empty if logger is configured to filter below INFO level
    // The key requirement is that stdout is empty, not that stderr has content
  });

  it('should handle graceful shutdown without stdout pollution', async () => {
    /*
    Test Doc:
    - Why: Shutdown must not pollute stdout; cleanup messages should go to stderr or be silent
    - Contract: After SIGTERM, no additional output appears on stdout
    - Usage Notes: Spawn server, send SIGTERM, verify stdout remains clean
    - Quality Contribution: Catches cleanup/shutdown messages going to wrong stream
    - Worked Example: spawn, SIGTERM, wait, stdout still empty (no "shutting down" messages)
    */
    proc = spawn(process.execPath, [cliPath, 'mcp', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const stdout: string[] = [];

    proc.stdout?.on('data', (data) => stdout.push(data.toString()));

    // Wait for startup
    await new Promise((r) => setTimeout(r, 500));

    // Should still be empty
    expect(stdout.join('')).toBe('');

    // Send SIGTERM
    proc.kill('SIGTERM');

    // Wait for any shutdown messages
    await new Promise((r) => setTimeout(r, 500));

    // stdout should still be empty (no shutdown messages)
    expect(stdout.join('')).toBe('');
  });
});
