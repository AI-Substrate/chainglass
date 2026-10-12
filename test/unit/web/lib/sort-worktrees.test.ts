/**
 * Unit tests for sort-worktrees utility.
 *
 * Verifies: numeric-prefix descending, non-numeric last, starred first,
 * and the main worktree pinned first under any sort, starring or filter.
 */

import {
  compareWorktreeBranches,
  filterWorktrees,
  sortWorktrees,
  sortWorktreesBy,
} from '@/lib/sort-worktrees';
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
    const sorted = sortWorktrees(worktrees, starred, undefined);
    expect(sorted.map((w) => w.branch)).toEqual([
      '041-file-browser',
      '066-wf-real-agents',
      '064-tmux',
      'main',
    ]);
  });

  it('sorts all descending when nothing starred', () => {
    const sorted = sortWorktrees(worktrees, new Set(), undefined);
    expect(sorted.map((w) => w.branch)).toEqual([
      '066-wf-real-agents',
      '064-tmux',
      '041-file-browser',
      'main',
    ]);
  });

  it('does not mutate the input array', () => {
    const copy = [...worktrees];
    sortWorktrees(worktrees, new Set(), undefined);
    expect(worktrees).toEqual(copy);
  });
});

describe('main worktree stays first', () => {
  // The main worktree is the workspace path itself, on a branch that would
  // otherwise sort last by name and has the oldest timestamps.
  const mainPath = '/ws/repo';
  const worktrees = [
    { path: '/ws/repo-041', branch: '041-file-browser', createdAt: 300, updatedAt: 300 },
    { path: mainPath, branch: 'zz-trunk', createdAt: 100, updatedAt: 100 },
    { path: '/ws/repo-066', branch: '066-wf-real-agents', createdAt: 200, updatedAt: 500 },
    { path: '/ws/repo-064', branch: '064-tmux', createdAt: null, updatedAt: null },
  ];

  it('is first under every sort field and direction', () => {
    for (const key of ['name', 'created', 'updated'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const sorted = sortWorktreesBy(worktrees, new Set(), key, dir, mainPath);
        expect(sorted[0].path, `${key} ${dir}`).toBe(mainPath);
      }
    }
  });

  it('is first ahead of starred worktrees, which keep their place below it', () => {
    const starred = new Set(['/ws/repo-064', '/ws/repo-041']);
    const sorted = sortWorktreesBy(worktrees, starred, 'updated', 'desc', mainPath);
    expect(sorted.map((w) => w.path)).toEqual([
      mainPath,
      '/ws/repo-041',
      '/ws/repo-064',
      '/ws/repo-066',
    ]);
    expect(sortWorktrees(worktrees, starred, mainPath).map((w) => w.path)).toEqual([
      mainPath,
      '/ws/repo-064',
      '/ws/repo-041',
      '/ws/repo-066',
    ]);
  });

  it('is first whether or not main itself is starred', () => {
    const sorted = sortWorktrees(worktrees, new Set([mainPath, '/ws/repo-066']), mainPath);
    expect(sorted.map((w) => w.path)).toEqual([
      mainPath,
      '/ws/repo-066',
      '/ws/repo-064',
      '/ws/repo-041',
    ]);
  });

  it('survives a filter that does not match it, and stays first after sorting', () => {
    const filtered = filterWorktrees(worktrees, 'tmux', mainPath);
    expect(filtered.map((w) => w.path).sort()).toEqual([mainPath, '/ws/repo-064'].sort());
    const sorted = sortWorktreesBy(filtered, new Set(['/ws/repo-064']), 'name', 'asc', mainPath);
    expect(sorted.map((w) => w.path)).toEqual([mainPath, '/ws/repo-064']);
  });

  it('filters normally when there is no main path', () => {
    expect(filterWorktrees(worktrees, 'tmux', undefined).map((w) => w.path)).toEqual([
      '/ws/repo-064',
    ]);
    expect(filterWorktrees(worktrees, '  ', undefined)).toBe(worktrees);
  });

  it('pins nothing when no worktree is at the main path', () => {
    const sorted = sortWorktreesBy(worktrees, new Set(), 'name', 'asc', '/elsewhere');
    expect(sorted[0].path).toBe('/ws/repo-041');
  });
});
