/**
 * Get All Diffs — Unit Tests
 *
 * Why: Validates single-command diff fetch + file-header splitting.
 * Contract: splitDiffByFile correctly splits combined diff output by file.
 * Usage Notes: Parser tests use raw strings; integration tests use real git repos.
 * Quality Contribution: O(1) git commands instead of O(N) — core performance optimization.
 * Worked Example: Combined diff with 3 files → Map with 3 entries keyed by path.
 *
 * Plan 071: PR View & File Notes — Phase 4 (DYK-P4-03: heavily tested)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getAllDiffs, splitDiffByFile } from '@/features/071-pr-view/lib/get-all-diffs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('splitDiffByFile', () => {
  /**
   * Why: Core splitting logic — multi-file diff.
   * Contract: Each file gets its own entry in the Map.
   */
  it('splits multi-file diff into per-file chunks', () => {
    const rawDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      'index abc..def 100644',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,3 +1,4 @@',
      ' line 1',
      '+new line',
      ' line 2',
      'diff --git a/src/utils.ts b/src/utils.ts',
      'index 111..222 100644',
      '--- a/src/utils.ts',
      '+++ b/src/utils.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.size).toBe(2);
    expect(result.has('src/app.ts')).toBe(true);
    expect(result.has('src/utils.ts')).toBe(true);
    expect(result.get('src/app.ts')).toContain('+new line');
    expect(result.get('src/utils.ts')).toContain('-old');
  });

  /**
   * Why: Single file diff is the simplest case.
   * Contract: Returns Map with one entry.
   */
  it('handles single file diff', () => {
    const rawDiff = [
      'diff --git a/file.txt b/file.txt',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1 +1 @@',
      '-hello',
      '+world',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.size).toBe(1);
    expect(result.has('file.txt')).toBe(true);
  });

  /**
   * Why: Empty diff = no changes.
   * Contract: Returns empty Map.
   */
  it('returns empty map for empty diff', () => {
    expect(splitDiffByFile('').size).toBe(0);
    expect(splitDiffByFile('\n\n').size).toBe(0);
  });

  /**
   * Why: New files have /dev/null as a/ source.
   * Contract: Still extracts path from b/ side.
   */
  it('handles new file (a/dev/null)', () => {
    const rawDiff = [
      'diff --git a/new-file.ts b/new-file.ts',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/new-file.ts',
      '@@ -0,0 +1,3 @@',
      '+line 1',
      '+line 2',
      '+line 3',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.size).toBe(1);
    expect(result.has('new-file.ts')).toBe(true);
  });

  /**
   * Why: Deleted files have /dev/null as b/ destination.
   * Contract: File path from b/ side (which is the original path for deletes).
   */
  it('handles deleted file', () => {
    const rawDiff = [
      'diff --git a/old-file.ts b/old-file.ts',
      'deleted file mode 100644',
      'index abc1234..0000000',
      '--- a/old-file.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-line 1',
      '-line 2',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.size).toBe(1);
    expect(result.has('old-file.ts')).toBe(true);
  });

  /**
   * Why: Binary files have special "Binary files differ" message.
   * Contract: Still captured as an entry (UI can show "binary file" message).
   */
  it('handles binary file diff', () => {
    const rawDiff = [
      'diff --git a/image.png b/image.png',
      'index abc..def 100644',
      'Binary files a/image.png and b/image.png differ',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.size).toBe(1);
    expect(result.has('image.png')).toBe(true);
    expect(result.get('image.png')).toContain('Binary files');
  });

  /**
   * Why: Paths with spaces are valid.
   * Contract: Full path preserved including spaces.
   */
  it('handles file paths with spaces', () => {
    const rawDiff = [
      'diff --git a/my folder/file name.ts b/my folder/file name.ts',
      '--- a/my folder/file name.ts',
      '+++ b/my folder/file name.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = splitDiffByFile(rawDiff);
    expect(result.has('my folder/file name.ts')).toBe(true);
  });
});

describe('getAllDiffs (integration)', () => {
  let tmpDir: string;

  function git(cmd: string) {
    execSync(`git ${cmd}`, { cwd: tmpDir, stdio: 'ignore' });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'all-diffs-'));
    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'line 1\n');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'line 1\n');
    git('add .');
    git('commit -m "init"');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Why: End-to-end with real multi-file changes.
   * Contract: Returns Map with entry for each changed file.
   */
  it('returns diffs for multiple changed files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'line 1 modified\n');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'line 1 modified\n');

    const diffs = await getAllDiffs(tmpDir);
    expect(diffs.size).toBe(2);
    expect(diffs.has('a.ts')).toBe(true);
    expect(diffs.has('b.ts')).toBe(true);
    expect(diffs.get('a.ts')).toContain('modified');
  });

  /**
   * Why: No changes = empty map.
   * Contract: Returns empty Map when working tree matches HEAD.
   */
  it('returns empty map when no changes', async () => {
    const diffs = await getAllDiffs(tmpDir);
    expect(diffs.size).toBe(0);
  });

  /**
   * Why: Branch mode needs base ref parameter.
   * Contract: Returns diffs between base and HEAD.
   */
  it('returns branch diffs when base provided', async () => {
    const baseSha = execSync('git rev-parse HEAD', { cwd: tmpDir }).toString().trim();
    git('checkout -b feature');
    fs.writeFileSync(path.join(tmpDir, 'c.ts'), 'new file\n');
    git('add .');
    git('commit -m "feature"');

    const diffs = await getAllDiffs(tmpDir, baseSha);
    expect(diffs.size).toBe(1);
    expect(diffs.has('c.ts')).toBe(true);
  });

  /**
   * Why: New untracked files should still appear in diffs.
   * Contract: Added files included in diff output.
   */
  it('includes newly added files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'brand new\n');
    git('add new.ts');

    const diffs = await getAllDiffs(tmpDir);
    expect(diffs.has('new.ts')).toBe(true);
  });
});
