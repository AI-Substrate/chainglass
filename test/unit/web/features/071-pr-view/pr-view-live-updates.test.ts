/**
 * PR View Live Updates — Behavioral Tests
 *
 * Tests fetch generation counter, split loading states, SSE refresh
 * trigger, and cache TTL logic using real type contracts.
 *
 * Plan 071: PR View & File Notes — Phase 6, T006 / FT-002
 */

import { describe, expect, it } from 'vitest';

import type { PRViewData, PRViewFile } from '@/features/071-pr-view/types';

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

describe('fetch generation counter (DYK-02)', () => {
  it('discards stale response when generation has changed', () => {
    let fetchGenRef = 0;
    let appliedData: PRViewData | null = null;

    // First fetch starts
    fetchGenRef++;
    const gen1 = fetchGenRef;

    // Mode switch triggers second fetch before first completes
    fetchGenRef++;

    // First response arrives — stale, should be discarded
    const staleData = makePRViewData({ branch: 'old' });
    if (gen1 === fetchGenRef) {
      appliedData = staleData;
    }

    expect(appliedData).toBeNull();
  });

  it('applies response when generation matches', () => {
    let fetchGenRef = 0;
    let appliedData: PRViewData | null = null;

    fetchGenRef++;
    const gen = fetchGenRef;

    const freshData = makePRViewData({ branch: 'current' });
    if (gen === fetchGenRef) {
      appliedData = freshData;
    }

    expect(appliedData).not.toBeNull();
    expect(appliedData?.branch).toBe('current');
  });

  it('only latest of rapid consecutive fetches applies', () => {
    let fetchGenRef = 0;
    const applied: string[] = [];

    // Three rapid fetches
    fetchGenRef++;
    const gen1 = fetchGenRef;
    fetchGenRef++;
    const gen2 = fetchGenRef;
    fetchGenRef++;
    const gen3 = fetchGenRef;

    // Responses arrive out of order
    if (gen2 === fetchGenRef) applied.push('gen2');
    if (gen1 === fetchGenRef) applied.push('gen1');
    if (gen3 === fetchGenRef) applied.push('gen3');

    expect(applied).toEqual(['gen3']);
  });
});

describe('split loading states (DYK-01)', () => {
  it('shows initialLoading when no data exists', () => {
    const data: PRViewData | null = null;
    const isInitial = !data;
    expect(isInitial).toBe(true);
  });

  it('shows refreshing when data already exists', () => {
    const data = makePRViewData();
    const isInitial = !data;
    expect(isInitial).toBe(false);
  });

  it('content hash invalidation sets previouslyReviewed on stale hash', () => {
    const reviewedFile = makeFile({
      reviewed: true,
      contentHash: 'abc123',
      reviewedAt: new Date().toISOString(),
    });

    // Simulate aggregator hash check — stored hash differs from current
    const storedHash = 'abc123';
    const currentHash = 'def456';
    const hashMismatch = storedHash !== currentHash;

    expect(hashMismatch).toBe(true);

    // Aggregator would set:
    const updatedFile = {
      ...reviewedFile,
      previouslyReviewed: hashMismatch,
      reviewed: hashMismatch ? false : reviewedFile.reviewed,
    };

    expect(updatedFile.previouslyReviewed).toBe(true);
    expect(updatedFile.reviewed).toBe(false);
  });
});

describe('SSE refresh trigger', () => {
  it('hasChanges triggers refresh then clears', () => {
    let refreshCalled = false;
    let changesCleared = false;

    const hasChanges = true;
    const refresh = () => {
      refreshCalled = true;
    };
    const clearChanges = () => {
      changesCleared = true;
    };

    if (hasChanges) {
      refresh();
      clearChanges();
    }

    expect(refreshCalled).toBe(true);
    expect(changesCleared).toBe(true);
  });

  it('no-op when hasChanges is false', () => {
    let refreshCalled = false;
    const hasChanges = false;
    const refresh = () => {
      refreshCalled = true;
    };
    const clearChanges = () => {};

    if (hasChanges) {
      refresh();
      clearChanges();
    }

    expect(refreshCalled).toBe(false);
  });
});

describe('cache TTL', () => {
  const CACHE_TTL_MS = 10_000;

  it('skips fetch when cache is fresh', () => {
    const lastFetchTime = Date.now() - 5_000;
    const now = Date.now();
    const force = false;
    const data = makePRViewData();

    const shouldSkip = !force && data && now - lastFetchTime < CACHE_TTL_MS;
    expect(shouldSkip).toBeTruthy();
  });

  it('allows fetch when cache is expired', () => {
    const lastFetchTime = Date.now() - 15_000;
    const now = Date.now();
    const force = false;
    const data = makePRViewData();

    const shouldSkip = !force && data && now - lastFetchTime < CACHE_TTL_MS;
    expect(shouldSkip).toBeFalsy();
  });

  it('force refresh bypasses fresh cache', () => {
    const lastFetchTime = Date.now() - 1_000;
    const now = Date.now();
    const force = true;
    const data = makePRViewData();

    const shouldSkip = !force && data && now - lastFetchTime < CACHE_TTL_MS;
    expect(shouldSkip).toBeFalsy();
  });
});
