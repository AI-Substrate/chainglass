/**
 * runCg() — execute `cg` CLI commands from the harness.
 *
 * Plan 074 Phase 6 T003.
 *
 * - Routes to local `node apps/cli/dist/cli.cjs` or Docker container
 * - Prints every command to stderr with ▸ prefix for agent visibility
 * - Returns stdout/stderr/exitCode
 * - P6-DYK #1: Checks CLI build freshness on first call
 * - P6-DYK #4: NO monorepo imports — harness is fully self-contained
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CgExecOptions {
  /** Where to run: local process or inside Docker container */
  target: 'local' | 'container';
  /** Workspace path to pass as --workspace-path */
  workspacePath?: string;
  /** Container name (required for target=container) */
  containerName?: string;
}

export interface CgExecResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Resolve the monorepo root (harness/ is one level down from root) */
function resolveProjectRoot(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // harness/src/test-data/cg-runner.ts → ../../../ → project root
  return path.resolve(thisDir, '..', '..', '..');
}

/** Path to the local CLI bundle */
function getCliPath(): string {
  return path.join(resolveProjectRoot(), 'apps', 'cli', 'dist', 'cli.cjs');
}

let buildFreshnessChecked = false;

/**
 * P6-DYK #1: Check if CLI build is stale (source newer than bundle).
 * Warns once per process, doesn't block.
 */
function checkBuildFreshness(): void {
  if (buildFreshnessChecked) return;
  buildFreshnessChecked = true;

  try {
    const cliPath = getCliPath();
    const sourcePath = path.join(resolveProjectRoot(), 'apps', 'cli', 'src', 'commands', 'unit.command.ts');
    if (!fs.existsSync(cliPath)) {
      console.error('⚠ CLI not built: run `pnpm --filter @chainglass/cli build` first');
      return;
    }
    const bundleMtime = fs.statSync(cliPath).mtimeMs;
    const sourceMtime = fs.statSync(sourcePath).mtimeMs;
    if (sourceMtime > bundleMtime) {
      console.error('⚠ CLI bundle may be stale (source newer). Run `pnpm --filter @chainglass/cli build`');
    }
  } catch {
    // Ignore — freshness check is best-effort
  }
}

/**
 * Execute a `cg` CLI command.
 *
 * @param args - CLI arguments (e.g., ['unit', 'create', 'test-agent', '--type', 'agent'])
 * @param options - Execution options (target, workspace path)
 * @returns Command result with stdout, stderr, exitCode
 */
export async function runCg(args: string[], options: CgExecOptions): Promise<CgExecResult> {
  checkBuildFreshness();

  // Build full args with --workspace-path and --json
  const fullArgs = [...args];
  if (options.workspacePath && !fullArgs.includes('--workspace-path')) {
    fullArgs.push('--workspace-path', options.workspacePath);
  }
  if (!fullArgs.includes('--json')) {
    fullArgs.push('--json');
  }

  const commandStr = `cg ${fullArgs.join(' ')}`;
  console.error(`▸ ${commandStr}`);

  if (options.target === 'container') {
    return runInContainer(fullArgs, options.containerName ?? 'chainglass-wt');
  }
  return runLocal(fullArgs);
}

async function runLocal(args: string[]): Promise<CgExecResult> {
  const cliPath = getCliPath();
  const commandStr = `cg ${args.join(' ')}`;

  return new Promise((resolve) => {
    execFile('node', [cliPath, ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        command: commandStr,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ? Number(error.code) : error ? 1 : 0,
      });
    });
  });
}

async function runInContainer(args: string[], containerName: string): Promise<CgExecResult> {
  const commandStr = `cg ${args.join(' ')}`;

  return new Promise((resolve) => {
    execFile(
      'docker',
      ['exec', containerName, 'node', '/app/apps/cli/dist/cli.cjs', ...args],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          command: commandStr,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? Number(error.code) : error ? 1 : 0,
        });
      }
    );
  });
}
