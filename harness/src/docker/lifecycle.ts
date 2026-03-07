/**
 * Docker lifecycle helpers — SDK building blocks for container operations.
 *
 * Wraps docker compose commands with structured error handling.
 * Commands use these helpers instead of duplicating shell logic.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '../../docker-compose.yml',
);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCompose(...args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['compose', '-f', COMPOSE_FILE, ...args],
      { timeout: 300_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}

export async function dockerBuild(): Promise<ExecResult> {
  return runCompose('build');
}

export async function dockerUp(): Promise<ExecResult> {
  return runCompose('up', '-d');
}

export async function dockerDown(): Promise<ExecResult> {
  return runCompose('down');
}

export async function dockerPs(): Promise<ExecResult> {
  return runCompose('ps', '--format', 'json');
}

export async function isContainerRunning(): Promise<boolean> {
  const result = await dockerPs();
  if (result.exitCode !== 0) return false;
  try {
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
