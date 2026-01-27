/**
 * Shared test fixtures for workspace context.
 *
 * Per DYK-P4-05: Extract createDefaultContext() to shared test fixture.
 */

import type { WorkspaceContext } from '@chainglass/workflow';

/**
 * Create a default workspace context for testing.
 *
 * Use this in any test that needs a WorkspaceContext without
 * going through the full resolution process.
 *
 * @param overrides - Optional fields to override defaults
 * @returns WorkspaceContext with sensible defaults
 *
 * @example
 * ```typescript
 * const ctx = createDefaultContext();
 * const result = await sampleService.add(ctx, 'Test', 'Description');
 * ```
 */
export function createDefaultContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/home/test/workspace',
    worktreePath: '/home/test/workspace',
    worktreeBranch: 'main',
    isMainWorktree: true,
    hasGit: true,
    ...overrides,
  };
}

/**
 * Create a workspace context with a different worktree path.
 *
 * Use this to test sample isolation between worktrees.
 *
 * @param worktreePath - Path to the worktree
 * @param branch - Optional branch name (defaults to 'feature-branch')
 * @returns WorkspaceContext for a linked worktree
 */
export function createWorktreeContext(
  worktreePath: string,
  branch = 'feature-branch'
): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/home/test/workspace',
    worktreePath,
    worktreeBranch: branch,
    isMainWorktree: false,
    hasGit: true,
  };
}
