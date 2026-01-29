/**
 * CLI Runner utility for E2E WorkGraph harness.
 *
 * Executes `cg` CLI commands and returns typed JSON results.
 */

import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliResult, GraphStatusData } from './types.js';

// Resolve paths relative to project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../../../../apps/cli/dist/cli.cjs');
const PROJECT_ROOT = resolve(__dirname, '../../../../..');
const UNITS_DIR = resolve(PROJECT_ROOT, '.chainglass/data/units');

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
        // Parse JSON output - CLI may output multiple NDJSON lines (logs + result)
        // The actual result is the last valid JSON line with 'success' or 'error' field
        const lines = stdout.trim().split('\n');
        let resultLine = '';

        // Find the result line (has 'success' or 'error' field)
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line && (line.includes('"success"') || line.includes('"error"'))) {
            resultLine = line;
            break;
          }
        }

        if (!resultLine) {
          // Fallback: try last line
          resultLine = lines[lines.length - 1];
        }

        const parsed = JSON.parse(resultLine);
        // Unwrap the data field if present (CLI wrapper structure)
        data = parsed.data ? { ...parsed.data, errors: [] } : parsed;

        // If error response, extract errors
        if (parsed.error) {
          data = { ...data, errors: parsed.error.details || [parsed.error] } as T;
        }
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

/**
 * Load a prompt template from a unit's commands directory.
 *
 * @param unitSlug - The unit slug (e.g., 'sample-coder')
 * @param templateName - Template file name (default: 'main.md')
 * @returns Template content
 */
export async function loadPromptTemplate(
  unitSlug: string,
  templateName = 'main.md'
): Promise<string> {
  const templatePath = resolve(UNITS_DIR, unitSlug, 'commands', templateName);
  return fs.readFile(templatePath, 'utf-8');
}

/**
 * Substitute template variables in a prompt.
 *
 * @param template - Template content with $GRAPH and $NODE placeholders
 * @param graph - Graph slug
 * @param nodeId - Node ID
 * @returns Substituted prompt
 */
export function substitutePromptVars(template: string, graph: string, nodeId: string): string {
  return template.replace(/\$GRAPH/g, graph).replace(/\$NODE/g, nodeId);
}

/**
 * Invoke an agent asynchronously.
 *
 * The agent runs in the background executing the prompt. It will call CLI commands
 * like `cg wg node get-input-data`, `cg wg node ask`, etc. as instructed by the prompt.
 *
 * @param prompt - The prompt to send to the agent
 * @param options - Agent options
 * @returns Child process handle (for optional monitoring)
 */
export function invokeAgent(
  prompt: string,
  options: {
    agentType?: 'claude-code' | 'copilot';
    sessionId?: string;
    stream?: boolean;
    cwd?: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onExit?: (code: number | null) => void;
  } = {}
): ChildProcess {
  const {
    agentType = 'claude-code',
    sessionId,
    stream = true, // Default to streaming for visibility
    cwd = process.cwd(),
    onStdout,
    onStderr,
    onExit,
  } = options;

  const args = [CLI_PATH, 'agent', 'run', '-t', agentType, '-p', prompt, '-c', cwd];
  if (sessionId) {
    args.push('-s', sessionId);
  }
  if (stream) {
    args.push('--stream');
  }

  const proc = spawn('node', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (onStdout) {
    proc.stdout?.on('data', (data) => onStdout(data.toString()));
  }

  if (onStderr) {
    proc.stderr?.on('data', (data) => onStderr(data.toString()));
  }

  if (onExit) {
    proc.on('close', onExit);
  }

  return proc;
}

/**
 * Poll for node completion with automatic question answering.
 *
 * Per spec: 500ms polling interval, 5-minute timeout.
 *
 * @param graph - Graph slug
 * @param nodeId - Node ID to poll
 * @param options - Polling options including auto-answer callback
 * @returns Final node status
 */
export async function pollForNodeCompleteWithQuestions(
  graph: string,
  nodeId: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    verbose?: boolean;
    onWaitingQuestion?: (questionId: string) => Promise<void>;
  } = {}
): Promise<string> {
  const { timeoutMs = 300000, intervalMs = 500, verbose = true, onWaitingQuestion } = options;

  const start = Date.now();
  let lastLog = start;
  const handledQuestions = new Set<string>();

  while (Date.now() - start < timeoutMs) {
    const result = await runCli<GraphStatusData>(['wg', 'status', graph]);

    if (!result.success) {
      throw new Error(`Failed to get graph status: ${JSON.stringify(result.data.errors)}`);
    }

    const node = result.data.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} not found in graph ${graph}`);
    }

    // Check for completion
    if (node.status === 'complete') {
      return node.status;
    }

    // Check for failure
    if (node.status === 'failed') {
      throw new Error(`Node ${nodeId} failed`);
    }

    // Handle waiting-question status
    if (node.status === 'waiting-question' && node.questionId && onWaitingQuestion) {
      if (!handledQuestions.has(node.questionId)) {
        handledQuestions.add(node.questionId);
        if (verbose) {
          console.log(`  ? Agent asked question: ${node.questionId}`);
        }
        await onWaitingQuestion(node.questionId);
      }
    }

    // Log elapsed time every 30 seconds
    const now = Date.now();
    if (verbose && now - lastLog >= 30000) {
      const elapsed = Math.round((now - start) / 1000);
      console.log(`  [${elapsed}s] Waiting for ${nodeId} to complete (current: ${node.status})`);
      lastLog = now;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timeout waiting for ${nodeId} to complete after ${timeoutMs}ms`);
}
