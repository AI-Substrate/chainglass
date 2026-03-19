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
  result: Promise<CgExecResult>;
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

  const cliPath = getCliPath();
  const commandStr = `cg ${fullArgs.join(' ')}`;
  console.error(`▸ [spawn] ${commandStr}`);

  const child = spawn('node', [cliPath, ...fullArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const stdoutLines = readline.createInterface({ input: child.stdout! });
  const stderrLines = readline.createInterface({ input: child.stderr! });

  // Subprocess kill timer
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs) {
    killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    killTimer.unref();
  }

  const result = new Promise<CgExecResult>((resolve) => {
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
      });
    });

    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({
        command: commandStr,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join('') + `\nSpawn error: ${err.message}`,
        exitCode: 1,
      });
    });
  });

  return { child, stdoutLines, stderrLines, result };
}
