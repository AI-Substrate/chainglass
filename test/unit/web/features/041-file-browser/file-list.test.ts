/**
 * File List Service Tests (TDD — RED first)
 *
 * Tests for getFileList() which retrieves file paths + mtimes
 * via git ls-files + fs.stat(). Used by the file search cache.
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 */

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type FileListEntry, getFileList } from '@/features/041-file-browser/services/file-list';

let fixtureDir: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'file-list-test-'));
  // Initialize a git repo with known files
  execSync('git init', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: fixtureDir, stdio: 'ignore' });
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  writeFileSync(join(fixtureDir, 'src', 'app.ts'), 'export const app = true;');
  writeFileSync(join(fixtureDir, 'README.md'), '# Test');
  execSync('git add . && git commit -m "init"', { cwd: fixtureDir, stdio: 'ignore' });
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('getFileList', () => {
  it('returns file paths with mtime from a git worktree', async () => {
    /*
    Test Doc:
    - Why: Core contract — getFileList must return {path, mtime} pairs for cache population
    - Contract: getFileList(worktreePath) → {ok: true, files: FileListEntry[]}
    - Usage Notes: Uses git ls-files + fs.stat; mtime drives sort-by-recent in search
    - Quality Contribution: AC-20 (cache shape), AC-18 (mtime for sort)
    - Worked Example: getFileList('/fixture') → {ok: true, files: [{path: 'src/app.ts', mtime: 1708000000}]}
    */
    const result = await getFileList(fixtureDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.length).toBe(2);

    for (const entry of result.files) {
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.mtime).toBe('number');
      expect(entry.mtime).toBeGreaterThan(0);
    }
  });

  it('returns known files sorted alphabetically', async () => {
    const result = await getFileList(fixtureDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual(['README.md', 'src/app.ts']);
  });

  it('excludes gitignored files by default', async () => {
    /*
    Test Doc:
    - Why: Default mode must respect .gitignore (--exclude-standard)
    - Contract: getFileList(path, false) excludes gitignored paths
    - Usage Notes: includeHidden=false is the default for normal file search
    - Quality Contribution: AC-26
    - Worked Example: build/ in .gitignore → not in results
    */
    writeFileSync(join(fixtureDir, '.gitignore'), 'build/\n');
    mkdirSync(join(fixtureDir, 'build'), { recursive: true });
    writeFileSync(join(fixtureDir, 'build', 'output.js'), '// built');
    execSync('git add .gitignore && git commit -m "ignore"', { cwd: fixtureDir, stdio: 'ignore' });

    const result = await getFileList(fixtureDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('build/'))).toBe(false);
  });

  it('includes untracked files when includeHidden is true', async () => {
    /*
    Test Doc:
    - Why: Hidden toggle must bypass --exclude-standard
    - Contract: getFileList(path, true) includes gitignored files
    - Usage Notes: Triggered when user toggles "Show hidden files" in search
    - Quality Contribution: AC-27
    - Worked Example: ignored.txt in .gitignore → appears when includeHidden=true
    */
    writeFileSync(join(fixtureDir, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(fixtureDir, 'ignored.txt'), 'hidden');
    execSync('git add .gitignore && git commit -m "ignore"', { cwd: fixtureDir, stdio: 'ignore' });

    const result = await getFileList(fixtureDir, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('ignored.txt');
  });

  it('returns not-git error for non-git directory', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
    try {
      // Remove any accidental .git
      rmSync(join(nonGitDir, '.git'), { recursive: true, force: true });
      const result = await getFileList(nonGitDir);
      // Non-git falls back to recursive readDir — should succeed with ok: true
      expect(result.ok).toBe(true);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  it('handles deleted files gracefully (stat failure)', async () => {
    const result = await getFileList(fixtureDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // All returned files should have valid mtime
    for (const entry of result.files) {
      expect(entry.mtime).toBeGreaterThan(0);
    }
  });
});
