/**
 * CLI Runner utility for E2E WorkGraph harness.
 *
 * Executes `cg` CLI commands and returns typed JSON results.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliResult, GraphStatusData } from './types.js';

// Resolve CLI path relative to project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../../../../apps/cli/dist/cli.cjs');

/**
 * Execute a cg CLI command and return typed result.
 *
 * @param args - Command arguments (e.g., ['wg', 'node', 'can-run', 'graph', 'node'])
 * @param options - Execution options
 * @returns Typed CLI result
 */
export async function runCli<T>(
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<CliResult<T>> {
  const { cwd = process.cwd(), timeout = 30000 } = options;

  // Always add --json flag for machine-readable output
  const fullArgs = [...args, '--json'];

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...fullArgs], {
      cwd,
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const exitCode = code ?? 1;
      let data: T;

      try {
        // Parse JSON output - CLI returns {success, command, timestamp, data: {...}}
        const parsed = JSON.parse(stdout.trim());
        // Unwrap the data field if present (CLI wrapper structure)
        data = parsed.data ? { ...parsed.data, errors: [] } : parsed;
      } catch {
        // If JSON parsing fails, create minimal result
        data = {
          errors: [{ code: 'CLI_ERROR', message: stderr || stdout || 'Unknown error' }],
        } as T;
      }

      resolve({
        success: exitCode === 0,
        data,
        rawOutput: stdout,
        exitCode,
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to execute cg command: ${err.message}`));
    });
  });
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for a node to reach a target status.
 *
 * Per didyouknow insight #2: Logs elapsed time every 30s and streams agent events.
 *
 * @param graph - Graph slug
 * @param nodeId - Node ID to poll
 * @param targetStatus - Status to wait for
 * @param options - Polling options
 * @returns Final node status
 */
export async function pollForStatus(
  graph: string,
  nodeId: string,
  targetStatus: string | string[],
  options: { timeoutMs?: number; intervalMs?: number; verbose?: boolean } = {}
): Promise<string> {
  const { timeoutMs = 300000, intervalMs = 500, verbose = true } = options;
  const targetStatuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];

  const start = Date.now();
  let lastLog = start;

  while (Date.now() - start < timeoutMs) {
    const result = await runCli<GraphStatusData>(['wg', 'status', graph]);

    if (!result.success) {
      throw new Error(`Failed to get graph status: ${JSON.stringify(result.data.errors)}`);
    }

    const node = result.data.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} not found in graph ${graph}`);
    }

    if (targetStatuses.includes(node.status)) {
      return node.status;
    }

    if (node.status === 'failed') {
      throw new Error(`Node ${nodeId} failed`);
    }

    // Log elapsed time every 30 seconds
    const now = Date.now();
    if (verbose && now - lastLog >= 30000) {
      const elapsed = Math.round((now - start) / 1000);
      console.log(
        `  [${elapsed}s] Waiting for ${nodeId} to reach ${targetStatuses.join('|')} (current: ${node.status})`
      );
      lastLog = now;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timeout waiting for ${nodeId} to reach ${targetStatuses.join('|')} after ${timeoutMs}ms`
  );
}

/**
 * Get the latest question ID from a node's status.
 *
 * The question ID is stored in the node's status when it's in waiting-question state.
 *
 * @param graph - Graph slug
 * @param nodeId - Node ID
 * @returns Question ID
 */
export async function getLatestQuestionId(graph: string, nodeId: string): Promise<string> {
  const result = await runCli<GraphStatusData>(['wg', 'status', graph]);

  if (!result.success) {
    throw new Error(`Failed to get graph status: ${JSON.stringify(result.data.errors)}`);
  }

  const node = result.data.nodes.find((n) => n.id === nodeId);

  if (!node) {
    throw new Error(`Node ${nodeId} not found in graph ${graph}`);
  }

  if (!node.questionId) {
    throw new Error(`Node ${nodeId} has no pending question`);
  }

  return node.questionId;
}

/**
 * Assert a condition is true, throwing an error if not.
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Log a step with formatting.
 */
export function logStep(step: string, message: string): void {
  console.log(`\n${step}: ${message}`);
}

/**
 * Log success.
 */
export function logSuccess(message: string): void {
  console.log(`  \u2713 ${message}`);
}

/**
 * Log error.
 */
export function logError(message: string): void {
  console.error(`  \u2717 ${message}`);
}
