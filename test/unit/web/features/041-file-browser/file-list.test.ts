/**
 * File List Service Tests (TDD — RED first)
 *
 * Tests for getFileList() which retrieves file paths + mtimes
 * via git ls-files + fs.stat(). Used by the file search cache.
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 */

import { describe, expect, it } from 'vitest';

// Will be created next
import { type FileListEntry, getFileList } from '@/features/041-file-browser/services/file-list';

describe('getFileList', () => {
  it('returns file paths with mtime from a git worktree', async () => {
    // Use the actual test fixtures directory as a git worktree
    const result = await getFileList(process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.length).toBeGreaterThan(0);

    // Each entry should have path (string) and mtime (number)
    for (const entry of result.files) {
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.mtime).toBe('number');
      expect(entry.mtime).toBeGreaterThan(0);
    }
  });

  it('returns files with --exclude-standard by default (no hidden/ignored)', async () => {
    const result = await getFileList(process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should not contain node_modules or .git entries (those are gitignored)
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.git/'))).toBe(false);
  });

  it('includes hidden/ignored files when includeHidden is true', async () => {
    // With includeHidden, we get --others without --exclude-standard
    // This might include untracked files that are normally hidden
    const result = await getFileList(process.cwd(), true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // At minimum, same files as default
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('returns not-git error for non-git directory', async () => {
    const result = await getFileList('/tmp');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-git');
  });

  it('handles deleted files gracefully (stat failure)', async () => {
    // getFileList should skip files where fs.stat() fails
    // (race condition: file listed by git but deleted before stat)
    const result = await getFileList(process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // All returned files should have valid mtime
    for (const entry of result.files) {
      expect(entry.mtime).toBeGreaterThan(0);
    }
  });

  it('returns sorted file paths', async () => {
    const result = await getFileList(process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.files.map((f) => f.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});
