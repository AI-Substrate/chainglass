/**
 * Shared test helper for creating WorkspaceContext instances.
 *
 * Per Plan 021 Phase 3: Consolidates duplicated createStubContext() functions
 * from contract test files into a single, parameterized helper.
 */

import type { WorkspaceContext } from '@chainglass/workflow';

/**
 * Creates a test WorkspaceContext with customizable worktreePath.
 * Use for tests that need workspace isolation verification.
 *
 * @param worktreePath - The workspace/worktree path to use for isolation
 * @returns A WorkspaceContext suitable for testing
 */
export function createTestWorkspaceContext(worktreePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}
