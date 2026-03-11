/**
 * Docker lifecycle helpers — SDK building blocks for container operations.
 *
 * Wraps docker compose commands with structured error handling.
 * Commands use these helpers instead of duplicating shell logic.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { computePorts } from '../ports/allocator.js';

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

function getComposeEnv(): Record<string, string> {
  const ports = computePorts();
  return {
    ...process.env as Record<string, string>,
    HARNESS_APP_PORT: String(ports.app),
    HARNESS_TERMINAL_PORT: String(ports.terminal),
    HARNESS_CDP_PORT: String(ports.cdp),
    HARNESS_WORKTREE: ports.worktree,
  };
}

async function runCompose(...args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['compose', '-f', COMPOSE_FILE, ...args],
      { timeout: 300_000, env: getComposeEnv() },
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

export async function getContainerAge(): Promise<number | null> {
  const ports = computePorts();
  const containerName = `chainglass-${ports.worktree}`;
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['inspect', '--format', '{{.State.StartedAt}}', containerName],
      { timeout: 5000 },
    );
    const started = new Date(stdout.trim());
    if (Number.isNaN(started.getTime())) return null;
    return Math.round((Date.now() - started.getTime()) / 1000);
  } catch {
    return null;
  }
}

export async function getContainerLogs(lines = 10): Promise<string> {
  const result = await runCompose('logs', '--tail', String(lines), '--no-color');
  return result.stdout || result.stderr;
}
