/**
 * Content Hash — Unit Tests
 *
 * Why: Validates git hash-object wrapper for reviewed-state invalidation.
 * Contract: computeContentHash returns SHA-1 hash for existing files, empty for missing.
 * Usage Notes: Tests use real git repos in tmpdir.
 * Quality Contribution: Ensures content hash detection is reliable.
 * Worked Example: create file → computeContentHash → verify non-empty; missing file → empty.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeContentHash } from '@/features/071-pr-view/lib/content-hash';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-hash-'));
  execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('computeContentHash', () => {
  /**
   * Why: Core operation — hash a real file.
   * Contract: Returns a 40-char hex SHA-1 hash.
   */
  it('returns hash for existing file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello world\n');
    const hash = await computeContentHash(tmpDir, 'test.txt');
    expect(hash).toHaveLength(40);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  /**
   * Why: Different content must produce different hashes.
   * Contract: Hash changes when file content changes.
   */
  it('returns different hash for different content', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'version 1\n');
    const hash1 = await computeContentHash(tmpDir, 'test.txt');

    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'version 2\n');
    const hash2 = await computeContentHash(tmpDir, 'test.txt');

    expect(hash1).not.toBe(hash2);
  });

  /**
   * Why: Missing files should not throw — graceful degradation.
   * Contract: Returns empty string for non-existent file.
   */
  it('returns empty string for missing file', async () => {
    const hash = await computeContentHash(tmpDir, 'nonexistent.txt');
    expect(hash).toBe('');
  });

  /**
   * Why: Same content must produce identical hash (deterministic).
   * Contract: Same input → same output.
   */
  it('returns same hash for same content', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'same content\n');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'same content\n');

    const hashA = await computeContentHash(tmpDir, 'a.txt');
    const hashB = await computeContentHash(tmpDir, 'b.txt');
    expect(hashA).toBe(hashB);
  });

  /**
   * Why: Path traversal must not hash files outside worktree.
   * Contract: Returns empty string for traversal paths.
   */
  it('returns empty string for path traversal attempt', async () => {
    const hash = await computeContentHash(tmpDir, '../../../etc/passwd');
    expect(hash).toBe('');
  });

  /**
   * Why: Absolute paths outside worktree must be rejected.
   * Contract: Returns empty string for absolute paths outside root.
   */
  it('returns empty string for absolute path outside worktree', async () => {
    const hash = await computeContentHash(tmpDir, '/etc/hosts');
    expect(hash).toBe('');
  });
});
