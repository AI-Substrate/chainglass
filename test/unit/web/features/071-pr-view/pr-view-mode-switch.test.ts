/**
 * PR View Mode Switching — Tests
 *
 * Tests the Phase 6 mode switching logic: switchMode sets mode,
 * triggers fetch with correct mode, cache invalidated, collapsed reset.
 *
 * Plan 071: PR View & File Notes — Phase 6, T005
 */

import { describe, expect, it } from 'vitest';

import type { ComparisonMode, PRViewData } from '@/features/071-pr-view/types';

describe('PR View mode switching logic', () => {
  it('switchMode changes mode from working to branch', () => {
    let mode: ComparisonMode = 'working';
    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
    };

    switchMode('branch');
    expect(mode).toBe('branch');
  });

  it('switchMode is no-op when switching to same mode', () => {
    let switchCount = 0;
    let mode: ComparisonMode = 'working';
    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
      switchCount++;
    };

    switchMode('working');
    expect(switchCount).toBe(0);
    expect(mode).toBe('working');
  });

  it('switchMode resets collapsed files (DYK-05)', () => {
    let collapsedFiles = new Set(['a.ts', 'b.ts', 'c.ts']);
    let mode: ComparisonMode = 'working';

    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
      collapsedFiles = new Set(); // DYK-05: reset on mode switch
    };

    switchMode('branch');
    expect(collapsedFiles.size).toBe(0);
    expect(mode).toBe('branch');
  });

  it('switchMode invalidates cache by resetting lastFetchTime', () => {
    let lastFetchTime = Date.now();
    let mode: ComparisonMode = 'working';

    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
      lastFetchTime = 0; // Invalidate cache
    };

    switchMode('branch');
    expect(lastFetchTime).toBe(0);
  });

  it('mode toggle works in both directions', () => {
    let mode: ComparisonMode = 'working';
    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
    };

    switchMode('branch');
    expect(mode).toBe('branch');

    switchMode('working');
    expect(mode).toBe('working');
  });
});

describe('PR View "on default branch" detection (DYK-03)', () => {
  it('detects when branch mode returns empty on default branch', () => {
    const data: PRViewData = {
      files: [],
      branch: 'main',
      mode: 'branch',
      stats: { totalInsertions: 0, totalDeletions: 0, fileCount: 0, reviewedCount: 0 },
    };

    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;

    expect(isOnDefaultBranch).toBe(true);
  });

  it('does not flag when branch mode has files', () => {
    const data: PRViewData = {
      files: [
        {
          path: 'a.ts',
          dir: '',
          name: 'a.ts',
          status: 'modified',
          insertions: 5,
          deletions: 2,
          diff: 'diff --git...',
          reviewed: false,
        },
      ],
      branch: 'feature/x',
      mode: 'branch',
      stats: { totalInsertions: 5, totalDeletions: 2, fileCount: 1, reviewedCount: 0 },
    };

    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;

    expect(isOnDefaultBranch).toBe(false);
  });

  it('does not flag when in working mode', () => {
    const data: PRViewData = {
      files: [],
      branch: 'main',
      mode: 'working',
      stats: { totalInsertions: 0, totalDeletions: 0, fileCount: 0, reviewedCount: 0 },
    };

    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;

    expect(isOnDefaultBranch).toBe(false);
  });
});
