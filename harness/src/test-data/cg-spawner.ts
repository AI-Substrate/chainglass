/**
 * spawnCg() — streaming subprocess runner for the harness.
 *
 * Plan 076 Phase 3 T002b.
 *
 * Unlike runCg() which uses execFile (buffered output), spawnCg() uses
 * child_process.spawn() for real-time line-by-line stdout/stderr processing.
 * This enables "God mode" views — agents can see execution progress as it
 * happens instead of waiting for the process to finish.
 *
 * P3-DYK #2: execFile buffers all output. spawn() streams it.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import {
  checkBuildFreshness,
  getCliPath,
  type CgExecOptions,
  type CgExecResult,
} from './cg-runner.js';

export interface SpawnCgHandle {
  /** The spawned child process */
  child: ChildProcess;
  /** Line-by-line async iterable over stdout */
  stdoutLines: readline.Interface;
  /** Line-by-line async iterable over stderr */
  stderrLines: readline.Interface;
  /** Resolves when the process exits with the full result */
  result: Promise<SpawnCgResult>;
}

export interface SpawnCgResult extends CgExecResult {
  /** True if the process was killed by the timeout timer */
  timedOut: boolean;
}

/**
 * Spawn a `cg` CLI command with streaming stdout/stderr.
 *
 * Same pre-flight checks as runCg() (build freshness). Same auto-flags
 * (--workspace-path, --json). But returns readline interfaces for real-time
 * line processing instead of buffered strings.
 *
 * P3-DYK #1: timeoutMs is milliseconds. CLI --timeout flag is seconds.
 * Caller is responsible for unit conversion.
 */
export function spawnCg(
  args: string[],
  options: CgExecOptions,
  timeoutMs?: number,
): SpawnCgHandle {
  checkBuildFreshness();

  const fullArgs = [...args];
  if (options.workspacePath && !fullArgs.includes('--workspace-path')) {
    fullArgs.push('--workspace-path', options.workspacePath);
  }
  if (!fullArgs.includes('--json')) {
    fullArgs.push('--json');
  }

  const isContainer = options.target === 'container' && options.containerName;
  const cliPath = getCliPath();

  let spawnCmd: string;
  let spawnArgs: string[];
  if (isContainer) {
    spawnCmd = 'docker';
    spawnArgs = ['exec', options.containerName!, 'node', '/app/apps/cli/dist/cli.cjs', ...fullArgs];
  } else {
    spawnCmd = 'node';
    spawnArgs = [cliPath, ...fullArgs];
  }

  const commandStr = `cg ${fullArgs.join(' ')}`;
  console.error(`▸ [spawn] ${commandStr}`);

  const child = spawn(spawnCmd, spawnArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const stdoutLines = readline.createInterface({ input: child.stdout! });
  const stderrLines = readline.createInterface({ input: child.stderr! });

  // Track whether we killed via timeout
  let didTimeout = false;

  let killTimer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs) {
    killTimer = setTimeout(() => {
      didTimeout = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    killTimer.unref();
  }

  const result = new Promise<SpawnCgResult>((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString());
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({
        command: commandStr,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        exitCode: code ?? 1,
        timedOut: didTimeout,
      });
    });

    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({
        command: commandStr,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join('') + `\nSpawn error: ${err.message}`,
        exitCode: 1,
        timedOut: false,
      });
    });
  });

  return { child, stdoutLines, stderrLines, result };
}

// ── Container Convenience Wrapper (Plan 076 P4 ST003) ──────────

const DEFAULT_CONTAINER_WORKSPACE = '/app/scratch/harness-test-workspace';

/**
 * Spawn a cg CLI command inside the harness container (streaming).
 * Non-blocking — returns immediately with readline interfaces for real-time output.
 * Use for long-running commands (wf run --server --json-events).
 * DYK #3: Use this for fire-and-forget, runCgInContainer() for wait-for-result.
 * DYK #5: Defaults to test workspace, accepts optional override.
 */
export function spawnCgInContainer(
  args: string[],
  timeoutMs?: number,
  workspacePath?: string,
): SpawnCgHandle {
  const { computePorts } = require('../ports/allocator.js');
  const ports = computePorts();
  const containerName = `chainglass-${ports.worktree}`;

  return spawnCg(
    args,
    {
      target: 'container',
      containerName,
      workspacePath: workspacePath ?? DEFAULT_CONTAINER_WORKSPACE,
    },
    timeoutMs,
  );
}
