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
  /** Subprocess timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
}

export interface CgExecResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Resolve the monorepo root (harness/ is one level down from root) */
export function resolveProjectRoot(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // harness/src/test-data/cg-runner.ts → ../../../ → project root
  return path.resolve(thisDir, '..', '..', '..');
}

/** Path to the local CLI bundle */
export function getCliPath(): string {
  return path.join(resolveProjectRoot(), 'apps', 'cli', 'dist', 'cli.cjs');
}

let buildFreshnessChecked = false;

/**
 * P6-DYK #1 + P1-DYK #5: Check if CLI build is stale.
 * Throws on missing or stale bundle to prevent running with old code.
 */
export function checkBuildFreshness(): void {
  if (buildFreshnessChecked) return;
  buildFreshnessChecked = true;

  const cliPath = getCliPath();
  const root = resolveProjectRoot();

  if (!fs.existsSync(cliPath)) {
    throw new Error('CLI not built: run `pnpm --filter @chainglass/cli build` first');
  }

  const bundleMtime = fs.statSync(cliPath).mtimeMs;

  // Check CLI source directory for any newer .ts file
  const cliSrcDir = path.join(root, 'apps', 'cli', 'src');
  if (fs.existsSync(cliSrcDir)) {
    const newerSource = findNewestMtime(cliSrcDir);
    if (newerSource > bundleMtime) {
      throw new Error(
        'CLI bundle is stale (CLI source newer than bundle). Run `pnpm --filter @chainglass/cli build`'
      );
    }
  }

  // Check positional-graph dist for staleness
  const pgDist = path.join(root, 'packages', 'positional-graph', 'dist');
  if (fs.existsSync(pgDist)) {
    const pgSrc = path.join(root, 'packages', 'positional-graph', 'src');
    if (fs.existsSync(pgSrc)) {
      const srcMtime = findNewestMtime(pgSrc);
      const distMtime = findNewestMtime(pgDist);
      if (srcMtime > distMtime) {
        throw new Error(
          'positional-graph package is stale (source newer than dist). Run `pnpm --filter @chainglass/positional-graph build`'
        );
      }
    }
  }
}

/** Find the newest mtime in a directory (recursive, .ts/.js/.cjs files only) */
function findNewestMtime(dir: string): number {
  let newest = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        newest = Math.max(newest, findNewestMtime(full));
      } else if (entry.isFile() && /\.(ts|js|cjs|mjs)$/.test(entry.name)) {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    }
  } catch { /* best-effort */ }
  return newest;
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
    return runInContainer(fullArgs, options.containerName ?? 'chainglass-wt', options.timeout);
  }
  return runLocal(fullArgs, options.timeout);
}

async function runLocal(args: string[], timeout?: number): Promise<CgExecResult> {
  const cliPath = getCliPath();
  const commandStr = `cg ${args.join(' ')}`;
  const timeoutMs = timeout ?? 600_000;

  return new Promise((resolve) => {
    execFile('node', [cliPath, ...args], { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        command: commandStr,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ? Number(error.code) : error ? 1 : 0,
      });
    });
  });
}

async function runInContainer(args: string[], containerName: string, timeout?: number): Promise<CgExecResult> {
  const commandStr = `cg ${args.join(' ')}`;
  const timeoutMs = timeout ?? 600_000;

  return new Promise((resolve) => {
    execFile(
      'docker',
      ['exec', containerName, 'node', '/app/apps/cli/dist/cli.cjs', ...args],
      { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs },
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
