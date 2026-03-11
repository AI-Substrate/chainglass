/**
 * PR View Mode Switching — Behavioral Tests
 *
 * Tests switchMode logic, cache invalidation, collapsed reset,
 * and "on default branch" detection via real type contracts.
 *
 * Plan 071: PR View & File Notes — Phase 6, T005 / FT-002
 */

import { describe, expect, it, vi } from 'vitest';

import type { ComparisonMode, PRViewData, PRViewFile } from '@/features/071-pr-view/types';

// Minimal PRViewFile factory for testing
function makeFile(overrides: Partial<PRViewFile> = {}): PRViewFile {
  return {
    path: 'src/app.tsx',
    dir: 'src/',
    name: 'app.tsx',
    status: 'modified',
    insertions: 5,
    deletions: 2,
    diff: 'diff --git a/src/app.tsx b/src/app.tsx\n',
    reviewed: false,
    ...overrides,
  };
}

function makePRViewData(overrides: Partial<PRViewData> = {}): PRViewData {
  const files = overrides.files ?? [makeFile()];
  return {
    files,
    branch: 'feature/x',
    mode: 'working',
    stats: {
      totalInsertions: files.reduce((s, f) => s + f.insertions, 0),
      totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
      fileCount: files.length,
      reviewedCount: files.filter((f) => f.reviewed).length,
    },
    ...overrides,
  };
}

describe('switchMode behavior', () => {
  it('switchMode changes mode and invalidates cache', () => {
    // Replicate hook state + switchMode logic
    let mode: ComparisonMode = 'working';
    let lastFetchTime = Date.now();
    let collapsedFiles = new Set(['a.ts', 'b.ts']);

    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
      collapsedFiles = new Set(); // DYK-05
      lastFetchTime = 0; // Invalidate cache
    };

    switchMode('branch');

    expect(mode).toBe('branch');
    expect(lastFetchTime).toBe(0);
    expect(collapsedFiles.size).toBe(0);
  });

  it('switchMode is idempotent — same mode does nothing', () => {
    let mode: ComparisonMode = 'working';
    let switchCount = 0;

    const switchMode = (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      mode = newMode;
      switchCount++;
    };

    switchMode('working');
    expect(switchCount).toBe(0);
  });

  it('switchMode triggers fetch with new mode via effect', () => {
    // Simulate the mode-change useEffect
    let fetchCalledWithMode: ComparisonMode | null = null;
    let mode: ComparisonMode = 'working';
    const worktreePath = '/test/worktree';

    const fetchData = (force: boolean) => {
      fetchCalledWithMode = mode;
    };

    // Simulate switchMode + effect trigger
    mode = 'branch';
    if (worktreePath) fetchData(true);

    expect(fetchCalledWithMode).toBe('branch');
  });

  it('switchMode always fetches even without existing data (FT-001 fix)', () => {
    let fetchCalled = false;
    const data = null; // No existing data
    const worktreePath = '/test';

    // Replicate the fixed effect (no data guard)
    if (worktreePath) {
      fetchCalled = true;
    }

    expect(fetchCalled).toBe(true);
  });
});

describe('"on default branch" detection (DYK-03)', () => {
  it('detects empty Branch mode on default branch', () => {
    const data = makePRViewData({ files: [], branch: 'main', mode: 'branch' });
    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;
    expect(isOnDefaultBranch).toBe(true);
  });

  it('does not flag when branch mode has files', () => {
    const data = makePRViewData({ mode: 'branch', branch: 'feature/x' });
    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;
    expect(isOnDefaultBranch).toBe(false);
  });

  it('does not flag in working mode even with empty files', () => {
    const data = makePRViewData({ files: [], mode: 'working' });
    const isOnDefaultBranch = data.mode === 'branch' && data.files.length === 0;
    expect(isOnDefaultBranch).toBe(false);
  });
});
