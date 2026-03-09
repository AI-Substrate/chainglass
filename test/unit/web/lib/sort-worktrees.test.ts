/**
 * Unit tests for sort-worktrees utility.
 *
 * Verifies: numeric-prefix descending, non-numeric last, starred first.
 */

import { compareWorktreeBranches, sortWorktrees } from '@/lib/sort-worktrees';
import { describe, expect, it } from 'vitest';

describe('compareWorktreeBranches', () => {
  it('sorts numeric-prefixed branches descending', () => {
    const branches = ['041-file-browser', '066-wf-real-agents', '002-agents', '064-tmux'];
    const sorted = branches.sort(compareWorktreeBranches);
    expect(sorted).toEqual(['066-wf-real-agents', '064-tmux', '041-file-browser', '002-agents']);
  });

  it('puts non-numeric branches after numeric ones', () => {
    const branches = ['main', '066-wf-real-agents', '041-file-browser'];
    const sorted = branches.sort(compareWorktreeBranches);
    expect(sorted).toEqual(['066-wf-real-agents', '041-file-browser', 'main']);
  });

  it('sorts non-numeric branches alphabetically', () => {
    const branches = ['main', 'develop', 'feature-x'];
    const sorted = branches.sort(compareWorktreeBranches);
    expect(sorted).toEqual(['develop', 'feature-x', 'main']);
  });

  it('handles empty strings', () => {
    expect(compareWorktreeBranches('', '')).toBe(0);
    expect(compareWorktreeBranches('main', '')).toBeGreaterThan(0);
  });
});

describe('sortWorktrees', () => {
  const worktrees = [
    { path: '/ws/main', branch: 'main' },
    { path: '/ws/066', branch: '066-wf-real-agents' },
    { path: '/ws/041', branch: '041-file-browser' },
    { path: '/ws/064', branch: '064-tmux' },
  ];

  it('sorts starred first, then numeric descending', () => {
    const starred = new Set(['/ws/041']);
    const sorted = sortWorktrees(worktrees, starred);
    expect(sorted.map((w) => w.branch)).toEqual([
      '041-file-browser',
      '066-wf-real-agents',
      '064-tmux',
      'main',
    ]);
  });

  it('sorts all descending when nothing starred', () => {
    const sorted = sortWorktrees(worktrees, new Set());
    expect(sorted.map((w) => w.branch)).toEqual([
      '066-wf-real-agents',
      '064-tmux',
      '041-file-browser',
      'main',
    ]);
  });

  it('does not mutate the input array', () => {
    const copy = [...worktrees];
    sortWorktrees(worktrees, new Set());
    expect(worktrees).toEqual(copy);
  });
});
