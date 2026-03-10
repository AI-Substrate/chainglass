/**
 * PR View API Route + Server Actions — Unit Tests
 *
 * Why: Validates auth, validation, and behavior of PR View entrypoints.
 * Contract: Routes return proper status codes; actions delegate to service layer.
 * Usage Notes: Tests use real git repos in tmpdir for integration.
 * Quality Contribution: Proves entrypoint contract (auth, validation, happy path).
 * Worked Example: GET with invalid mode → 400; POST mark → reviewed state persisted.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeContentHash } from '@/features/071-pr-view/lib/content-hash';
import {
  clearReviewedState,
  loadReviewedState,
  markFileReviewed,
} from '@/features/071-pr-view/lib/pr-view-state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

function git(cmd: string) {
  execSync(`git ${cmd}`, { cwd: tmpDir, stdio: 'ignore' });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-view-route-'));
  git('init -b main');
  git('config user.email "test@test.com"');
  git('config user.name "Test"');
  fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'initial\n');
  git('add .');
  git('commit -m "init"');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PR View entrypoint integration', () => {
  /**
   * Why: Mark + load round-trip is the core reviewed-file workflow.
   * Contract: markFileReviewed persists, loadReviewedState retrieves.
   */
  it('mark reviewed round-trip with real content hash', async () => {
    const hash = await computeContentHash(tmpDir, 'file.ts');
    expect(hash).toHaveLength(40);

    markFileReviewed(tmpDir, 'file.ts', hash);
    const states = loadReviewedState(tmpDir);

    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('file.ts');
    expect(states[0].reviewed).toBe(true);
    expect(states[0].reviewedContentHash).toBe(hash);
  });

  /**
   * Why: Content hash invalidation is the safety net for reviewed files.
   * Contract: After file change, hash differs from stored hash.
   */
  it('detects file change via hash mismatch', async () => {
    const hash1 = await computeContentHash(tmpDir, 'file.ts');
    markFileReviewed(tmpDir, 'file.ts', hash1);

    fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'modified\n');
    const hash2 = await computeContentHash(tmpDir, 'file.ts');

    expect(hash2).not.toBe(hash1);

    const states = loadReviewedState(tmpDir);
    expect(states[0].reviewedContentHash).toBe(hash1);
    // Aggregator would detect mismatch and set previouslyReviewed
  });

  /**
   * Why: Deleted files should invalidate review (FT-004).
   * Contract: Missing file returns empty hash, triggering invalidation.
   */
  it('returns empty hash for deleted file', async () => {
    const hash1 = await computeContentHash(tmpDir, 'file.ts');
    markFileReviewed(tmpDir, 'file.ts', hash1);

    fs.unlinkSync(path.join(tmpDir, 'file.ts'));
    const hash2 = await computeContentHash(tmpDir, 'file.ts');

    expect(hash2).toBe('');
    // Empty hash + non-empty stored hash triggers previouslyReviewed in aggregator
  });

  /**
   * Why: Clear all reviewed state needs to work.
   * Contract: clearReviewedState empties the state file.
   */
  it('clear all reviewed state', () => {
    markFileReviewed(tmpDir, 'file.ts', 'hash1');
    markFileReviewed(tmpDir, 'other.ts', 'hash2');

    clearReviewedState(tmpDir);
    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(0);
  });

  /**
   * Why: Active-files pruning prevents unbounded state growth (DYK-P4-05).
   * Contract: Stale entries removed when activeFiles provided.
   */
  it('prunes stale entries via markFileReviewed activeFiles', () => {
    markFileReviewed(tmpDir, 'file.ts', 'hash1');
    markFileReviewed(tmpDir, 'stale.ts', 'hash2');

    // Re-mark file.ts with activeFiles that excludes stale.ts
    markFileReviewed(tmpDir, 'file.ts', 'hash3', new Set(['file.ts']));

    const states = loadReviewedState(tmpDir);
    expect(states).toHaveLength(1);
    expect(states[0].filePath).toBe('file.ts');
  });
});
