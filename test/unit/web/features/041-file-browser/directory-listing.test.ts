/**
 * Directory Listing Service Tests
 *
 * Purpose: Verify lazy per-directory file listing from git ls-files with readDir fallback.
 * Quality Contribution: Prevents path traversal attacks, ensures .gitignore respect.
 * Acceptance Criteria: AC-21, AC-44
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-03: Lazy per-directory (not full tree)
 * Finding 05: git ls-files pattern with array args
 */

import {
  type FileEntry,
  listDirectory,
} from '@/features/041-file-browser/services/directory-listing';
import { FakeFileSystem, FileSystemError } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

describe('listDirectory', () => {
  describe('non-git workspace (readDir fallback)', () => {
    it('lists files and directories in the given path', async () => {
      const fs = new FakeFileSystem();
      fs.setFile('/workspace/README.md', '# Hello');
      fs.setFile('/workspace/src/index.ts', 'export {}');
      fs.setFile('/workspace/src/utils.ts', 'export {}');

      const result = await listDirectory({
        worktreePath: '/workspace',
        dirPath: '',
        isGit: false,
        fileSystem: fs,
      });

      expect(result.entries).toHaveLength(2);
      const names = result.entries.map((e) => e.name);
      expect(names).toContain('README.md');
      expect(names).toContain('src');
    });

    it('returns entries for subdirectory only', async () => {
      const fs = new FakeFileSystem();
      fs.setFile('/workspace/src/index.ts', 'export {}');
      fs.setFile('/workspace/src/utils.ts', 'export {}');
      fs.setFile('/workspace/README.md', '# Hi');

      const result = await listDirectory({
        worktreePath: '/workspace',
        dirPath: 'src',
        isGit: false,
        fileSystem: fs,
      });

      const names = result.entries.map((e) => e.name);
      expect(names).toContain('index.ts');
      expect(names).toContain('utils.ts');
      expect(names).not.toContain('README.md');
    });

    it('returns empty array for empty directory', async () => {
      const fs = new FakeFileSystem();
      fs.setDir('/workspace/empty');

      const result = await listDirectory({
        worktreePath: '/workspace',
        dirPath: 'empty',
        isGit: false,
        fileSystem: fs,
      });

      expect(result.entries).toEqual([]);
    });

    it('marks entries as file or directory', async () => {
      const fs = new FakeFileSystem();
      fs.setFile('/workspace/file.txt', 'content');
      fs.setFile('/workspace/dir/child.txt', 'content');

      const result = await listDirectory({
        worktreePath: '/workspace',
        dirPath: '',
        isGit: false,
        fileSystem: fs,
      });

      const file = result.entries.find((e) => e.name === 'file.txt');
      const dir = result.entries.find((e) => e.name === 'dir');
      expect(file?.type).toBe('file');
      expect(dir?.type).toBe('directory');
    });
  });

  describe('path security', () => {
    it('rejects ../  traversal attempts', async () => {
      const fs = new FakeFileSystem();
      fs.setFile('/workspace/file.txt', 'content');

      await expect(
        listDirectory({
          worktreePath: '/workspace',
          dirPath: '../etc',
          isGit: false,
          fileSystem: fs,
        })
      ).rejects.toThrow(/security|traversal/i);
    });
  });
});
