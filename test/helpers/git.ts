import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Run `git` for a test fixture, asynchronously and without a shell.
 *
 * Use this instead of `execSync(\`git ...\`)`. Under load each spawn can take seconds, and
 * synchronous spawns keep the vitest worker's event loop from turning. A file of synchronous
 * git fixtures then held the loop for over 60 s, and vitest's own worker RPC (`onTaskUpdate`)
 * timed out even though every test passed. No shell also means one process per call, not two.
 *
 * Returns trimmed stdout. Rejects on a non-zero exit, as `execSync` threw.
 */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

/** `git init` on `branch` with a test identity, so fixtures can commit. */
export async function initRepo(cwd: string, branch = 'main'): Promise<void> {
  await git(cwd, 'init', '-q', '-b', branch);
  await git(cwd, 'config', 'user.email', 'test@test.com');
  await git(cwd, 'config', 'user.name', 'Test');
}
