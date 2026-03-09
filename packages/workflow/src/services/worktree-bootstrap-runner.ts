/**
 * Worktree bootstrap runner — executes the optional post-create hook.
 *
 * Per Plan 069 Phase 2, Workshop 001:
 * - Hook location: <mainRepoPath>/.chainglass/new-worktree.sh
 * - Always sourced from the main worktree, never the new one
 * - Executed via bash, cwd = newWorktreePath
 * - Structured environment variables passed
 * - 60s timeout, captures last 200 lines of output
 * - Failure is informational — never rolls back the created worktree
 */

import path from 'node:path';
import type { IFileSystem, IProcessManager } from '@chainglass/shared';
import type { BootstrapStatus } from '../interfaces/workspace-service.interface.js';

const HOOK_RELATIVE_PATH = '.chainglass/new-worktree.sh';
const TIMEOUT_MS = 300_000;
const MAX_LOG_LINES = 200;

/**
 * Environment variables passed to the bootstrap hook.
 */
export interface BootstrapEnv {
  mainRepoPath: string;
  workspaceSlug: string;
  requestedName: string;
  normalizedSlug: string;
  ordinal: number;
  branchName: string;
  worktreePath: string;
}

/**
 * Runs the optional post-create bootstrap hook.
 *
 * Per Workshop 001:
 * - Checks if hook exists at <mainRepoPath>/.chainglass/new-worktree.sh
 * - Validates the resolved path stays within .chainglass/
 * - Executes via bash with structured env vars
 * - Returns BootstrapStatus with outcome and optional log tail
 */
export class WorktreeBootstrapRunner {
  constructor(
    private readonly processManager: IProcessManager,
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * Check whether the bootstrap hook exists at the expected location.
   * Used by preview to inform the UI whether a hook will run.
   */
  async hasHook(mainRepoPath: string): Promise<boolean> {
    const hookPath = `${mainRepoPath}/${HOOK_RELATIVE_PATH}`;
    try {
      return await this.fileSystem.exists(hookPath);
    } catch {
      return false;
    }
  }

  async run(env: BootstrapEnv): Promise<BootstrapStatus> {
    const hookPath = `${env.mainRepoPath}/${HOOK_RELATIVE_PATH}`;

    // Check if hook exists
    const exists = await this.fileSystem.exists(hookPath);
    if (!exists) {
      return { outcome: 'skipped' };
    }

    // Validate the hook path stays within .chainglass/
    const chaingleassDir = `${env.mainRepoPath}/.chainglass`;
    try {
      const realHookPath = await this.fileSystem.realpath(hookPath);
      const realChaingleassDir = await this.fileSystem.realpath(chaingleassDir);
      const relative = path.relative(realChaingleassDir, realHookPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return {
          outcome: 'failed',
          logTail: `Security: hook path '${realHookPath}' escapes .chainglass/ directory`,
        };
      }
    } catch {
      return {
        outcome: 'failed',
        logTail: `Could not resolve hook path: ${hookPath}`,
      };
    }

    // Build environment variables — extend process.env so PATH, HOME, etc. are available
    const processEnv: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] != null)
      ),
      CHAINGLASS_MAIN_REPO_PATH: env.mainRepoPath,
      CHAINGLASS_MAIN_BRANCH: 'main',
      CHAINGLASS_WORKSPACE_SLUG: env.workspaceSlug,
      CHAINGLASS_REQUESTED_NAME: env.requestedName,
      CHAINGLASS_NORMALIZED_SLUG: env.normalizedSlug,
      CHAINGLASS_NEW_WORKTREE_ORDINAL: String(env.ordinal),
      CHAINGLASS_NEW_BRANCH_NAME: env.branchName,
      CHAINGLASS_NEW_WORKTREE_NAME: env.branchName,
      CHAINGLASS_NEW_WORKTREE_PATH: env.worktreePath,
      CHAINGLASS_TRIGGER: 'chainglass-web',
    };

    // Execute the hook
    const outputLines: string[] = [];

    try {
      const handle = await this.processManager.spawn({
        command: 'bash',
        args: [hookPath],
        cwd: env.worktreePath,
        env: processEnv,
        onStdoutLine: (line: string) => {
          outputLines.push(line);
          if (outputLines.length > MAX_LOG_LINES) {
            outputLines.shift();
          }
        },
      });

      // Race: wait for exit vs timeout
      const exitPromise = handle.waitForExit();
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), TIMEOUT_MS)
      );

      const raceResult = await Promise.race([exitPromise, timeoutPromise]);

      if (raceResult === 'timeout') {
        // Kill the process
        try {
          await this.processManager.terminate(handle.pid);
        } catch {
          // Best effort termination
        }
        return {
          outcome: 'failed',
          logTail: [...outputLines, `[Timed out after ${TIMEOUT_MS / 1000}s]`].join('\n'),
        };
      }

      // Normal exit
      if (raceResult.exitCode === 0) {
        return { outcome: 'succeeded' };
      }

      return {
        outcome: 'failed',
        logTail: outputLines.join('\n') || `Hook exited with code ${raceResult.exitCode}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: 'failed',
        logTail: `Hook execution error: ${message}`,
      };
    }
  }
}
