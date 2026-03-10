/**
 * PR View State — Unit Tests
 *
 * Why: Validates JSONL persistence for reviewed-file tracking.
 * Contract: loadReviewedState reads, saveReviewedState writes atomically, markFileReviewed updates.
 * Usage Notes: Tests use tmpdir fixtures cleaned up after each test.
 * Quality Contribution: Ensures reviewed state survives page refreshes.
 * Worked Example: markFileReviewed → loadReviewedState → verify entry.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  clearReviewedState,
  loadReviewedState,
  markFileReviewed,
  saveReviewedState,
  unmarkFileReviewed,
} from '@/features/071-pr-view/lib/pr-view-state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-view-state-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadReviewedState', () => {
  /**
   * Why: First load before any reviews.
   * Contract: Returns empty array when no state file exists.
   */
  it('returns empty array when file does not exist', () => {
    const states = loadReviewedState(tmpDir);
    expect(states).toEqual([]);
  });

  /**
   * Why: Must parse persisted state correctly.
   * Contract: Returns PRViewFileState[] from JSONL.
   */
  it('loads persisted state entries', () => {
    const stateDir = path.join(tmpDir, '.chainglass', 'data');
    fs.mkdirSync(stateDir, { recursive: true });
    const content = [
      JSON.stringify({
        filePath: 'src/a.ts',
        reviewed: true,
        reviewedAt: '2026-01-01T00:00:00Z',
        reviewedContentHash: 'abc123',
      }),
      JSON.stringify({
        filePath: 'src/b.ts',
        reviewed: false,
        reviewedAt: '',
        reviewedContentHash: '',
      }),
    ].join('\n');
    fs.writeFileSync(path.join(stateDir, 'pr-view-state.jsonl'), `${content}\n`);

    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(2);
    expect(states[0].filePath).toBe('src/a.ts');
    expect(states[0].reviewed).toBe(true);
    expect(states[1].filePath).toBe('src/b.ts');
  });

  /**
   * Why: Malformed lines shouldn't crash loading.
   * Contract: Skips bad lines, returns valid ones.
   */
  it('skips malformed lines', () => {
    const stateDir = path.join(tmpDir, '.chainglass', 'data');
    fs.mkdirSync(stateDir, { recursive: true });
    const content = [
      'not json',
      JSON.stringify({
        filePath: 'src/a.ts',
        reviewed: true,
        reviewedAt: '2026-01-01',
        reviewedContentHash: 'abc',
      }),
      '{}',
    ].join('\n');
    fs.writeFileSync(path.join(stateDir, 'pr-view-state.jsonl'), `${content}\n`);

    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('src/a.ts');
  });
});

describe('saveReviewedState', () => {
  /**
   * Why: Core persistence operation.
   * Contract: Saves entries as JSONL, loadable after.
   */
  it('saves and reloads state', () => {
    saveReviewedState(tmpDir, [
      {
        filePath: 'src/a.ts',
        reviewed: true,
        reviewedAt: '2026-01-01',
        reviewedContentHash: 'abc',
      },
    ]);
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('src/a.ts');
  });

  /**
   * Why: DYK-P4-05 — stale entries from old branches must be pruned.
   * Contract: When activeFiles provided, only matching entries are saved.
   */
  it('prunes entries not in activeFiles set', () => {
    saveReviewedState(
      tmpDir,
      [
        {
          filePath: 'src/a.ts',
          reviewed: true,
          reviewedAt: '2026-01-01',
          reviewedContentHash: 'a',
        },
        {
          filePath: 'src/old.ts',
          reviewed: true,
          reviewedAt: '2026-01-01',
          reviewedContentHash: 'old',
        },
      ],
      new Set(['src/a.ts', 'src/b.ts'])
    );

    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('src/a.ts');
  });
});

describe('markFileReviewed', () => {
  /**
   * Why: Core reviewed-file workflow.
   * Contract: Creates entry with hash; loadable after.
   */
  it('creates reviewed entry with content hash', () => {
    markFileReviewed(tmpDir, 'src/app.ts', 'deadbeef');
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('src/app.ts');
    expect(states[0].reviewed).toBe(true);
    expect(states[0].reviewedContentHash).toBe('deadbeef');
    expect(states[0].reviewedAt).toBeDefined();
  });

  /**
   * Why: Marking same file twice should update, not duplicate.
   * Contract: Updates existing entry for same filePath.
   */
  it('updates existing entry for same file', () => {
    markFileReviewed(tmpDir, 'src/app.ts', 'hash1');
    markFileReviewed(tmpDir, 'src/app.ts', 'hash2');
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].reviewedContentHash).toBe('hash2');
  });
});

describe('unmarkFileReviewed', () => {
  /**
   * Why: User toggles reviewed status off.
   * Contract: Removes the entry for the file.
   */
  it('removes the reviewed entry', () => {
    markFileReviewed(tmpDir, 'src/app.ts', 'hash');
    unmarkFileReviewed(tmpDir, 'src/app.ts');
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(0);
  });
});

describe('clearReviewedState', () => {
  /**
   * Why: User clears all reviewed state.
   * Contract: Empties the file entirely.
   */
  it('clears all entries', () => {
    markFileReviewed(tmpDir, 'src/a.ts', 'a');
    markFileReviewed(tmpDir, 'src/b.ts', 'b');
    clearReviewedState(tmpDir);
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(0);
  });
});
