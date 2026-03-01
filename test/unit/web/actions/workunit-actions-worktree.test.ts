/*
Test Doc:
- Why: Prevent regressions where work-unit CRUD resolves to the wrong workspace path (Plan 062).
- Contract: resolveWorktreeContext returns null for missing/invalid paths and returns a valid WorkspaceContext for known worktrees.
- Usage Notes: Call helper with WorkspaceInfo fixture containing both main + feature worktrees.
- Quality Contribution: Catches silent fallback and wrong-path resolution bugs.
- Worked Example: resolveWorktreeContext(info, '/workspace/feature-branch/') => context.worktreePath === '/workspace/feature-branch'.
*/

import type { WorkspaceInfo, Worktree } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

// ─── Test Fixtures ──────────────────────────────────────────────

const MAIN_PATH = '/workspace/main';
const WORKTREE_PATH = '/workspace/feature-branch';
const WORKSPACE_SLUG = 'test-workspace';

function createTestWorktrees(): Worktree[] {
  return [
    {
      path: MAIN_PATH,
      branch: 'main',
      head: 'abc123',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
    {
      path: WORKTREE_PATH,
      branch: 'feature-branch',
      head: 'def456',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
  ];
}

function createTestWorkspaceInfo(): WorkspaceInfo {
  return {
    slug: WORKSPACE_SLUG,
    name: 'Test Workspace',
    path: MAIN_PATH,
    createdAt: '2026-01-01T00:00:00Z',
    hasGit: true,
    worktrees: createTestWorktrees(),
  };
}

import { resolveWorktreeContext } from '../../../../apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context';

describe('resolveWorktreeContext (Plan 062)', () => {
  const info = createTestWorkspaceInfo();

  it('returns context with correct worktreePath for valid worktree', () => {
    const result = resolveWorktreeContext(info, WORKTREE_PATH);
    expect(result).not.toBeNull();
    expect(result?.worktreePath).toBe(WORKTREE_PATH);
    expect(result?.worktreeBranch).toBe('feature-branch');
    expect(result?.isMainWorktree).toBe(false);
  });

  it('returns null when worktreePath is undefined (no silent fallback)', () => {
    const result = resolveWorktreeContext(info, undefined);
    expect(result).toBeNull();
  });

  it('returns null when worktreePath is not in worktrees list', () => {
    const result = resolveWorktreeContext(info, '/bogus/path');
    expect(result).toBeNull();
  });

  it('handles trailing-slash normalization', () => {
    const result = resolveWorktreeContext(info, `${WORKTREE_PATH}/`);
    expect(result).not.toBeNull();
    expect(result?.worktreePath).toBe(WORKTREE_PATH);
  });

  it('returns context for main worktree path', () => {
    const result = resolveWorktreeContext(info, MAIN_PATH);
    expect(result).not.toBeNull();
    expect(result?.worktreePath).toBe(MAIN_PATH);
    expect(result?.isMainWorktree).toBe(true);
  });

  it('returns workspace path in context even when using non-main worktree', () => {
    const result = resolveWorktreeContext(info, WORKTREE_PATH);
    expect(result).not.toBeNull();
    expect(result?.workspacePath).toBe(MAIN_PATH);
    expect(result?.worktreePath).toBe(WORKTREE_PATH);
  });
});
