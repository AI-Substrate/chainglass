/**
 * Per-File Diff Stats — Unit Tests
 *
 * Why: Validates git diff --numstat parsing for per-file insertion/deletion counts.
 * Contract: parseNumstat correctly maps output to Map<path, {insertions, deletions}>.
 * Usage Notes: Parser tests use raw strings; integration test uses real git repo.
 * Quality Contribution: Ensures accurate stats display in PR View header and file list.
 * Worked Example: "10\t5\tsrc/app.ts" → Map { "src/app.ts" → { insertions: 10, deletions: 5 } }
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getPerFileDiffStats, parseNumstat } from '@/features/071-pr-view/lib/per-file-diff-stats';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('parseNumstat', () => {
  /**
   * Why: Core parsing — standard numstat line.
   * Contract: Maps "10\t5\tfile" to { insertions: 10, deletions: 5 }.
   */
  it('parses standard numstat output', () => {
    const output = '10\t5\tsrc/app.ts\n3\t1\tsrc/utils.ts\n';
    const stats = parseNumstat(output);
    expect(stats.size).toBe(2);
    expect(stats.get('src/app.ts')).toEqual({ insertions: 10, deletions: 5 });
    expect(stats.get('src/utils.ts')).toEqual({ insertions: 3, deletions: 1 });
  });

  /**
   * Why: Binary files report - - instead of numbers.
   * Contract: Binary files map to { insertions: 0, deletions: 0 }.
   */
  it('handles binary files (dash-dash)', () => {
    const output = '-\t-\timage.png\n5\t2\tsrc/app.ts\n';
    const stats = parseNumstat(output);
    expect(stats.get('image.png')).toEqual({ insertions: 0, deletions: 0 });
    expect(stats.get('src/app.ts')).toEqual({ insertions: 5, deletions: 2 });
  });

  /**
   * Why: Renames use {old => new} or "old => new" syntax.
   * Contract: Keyed by new path after rename.
   */
  it('handles renames with brace syntax', () => {
    const output = '2\t1\tsrc/{old.ts => new.ts}\n';
    const stats = parseNumstat(output);
    expect(stats.has('src/new.ts')).toBe(true);
    expect(stats.get('src/new.ts')).toEqual({ insertions: 2, deletions: 1 });
  });

  it('handles renames with arrow syntax', () => {
    const output = '2\t1\told.ts => new.ts\n';
    const stats = parseNumstat(output);
    expect(stats.has('new.ts')).toBe(true);
  });

  /**
   * Why: Empty diff is valid.
   * Contract: Returns empty Map.
   */
  it('returns empty map for empty output', () => {
    expect(parseNumstat('').size).toBe(0);
  });

  /**
   * Why: Files with only additions or only deletions.
   * Contract: Zero on the side with no changes.
   */
  it('handles zero insertions or deletions', () => {
    const output = '0\t10\tdeleted-content.ts\n15\t0\tnew-content.ts\n';
    const stats = parseNumstat(output);
    expect(stats.get('deleted-content.ts')).toEqual({ insertions: 0, deletions: 10 });
    expect(stats.get('new-content.ts')).toEqual({ insertions: 15, deletions: 0 });
  });
});

describe('getPerFileDiffStats (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-stats-'));
    execSync('git init -b main', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'line 1\nline 2\nline 3\n');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Why: End-to-end with real git repo.
   * Contract: Returns stats for modified files.
   */
  it('returns stats for modified files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'line 1\nline 2 modified\nline 3\nnew line\n');
    const stats = await getPerFileDiffStats(tmpDir);
    expect(stats.has('file.ts')).toBe(true);
    const fileStats = stats.get('file.ts');
    expect(fileStats?.insertions).toBeGreaterThan(0);
  });

  /**
   * Why: No changes should return empty map.
   * Contract: Empty map when working tree matches HEAD.
   */
  it('returns empty map when no changes', async () => {
    const stats = await getPerFileDiffStats(tmpDir);
    expect(stats.size).toBe(0);
  });
});
