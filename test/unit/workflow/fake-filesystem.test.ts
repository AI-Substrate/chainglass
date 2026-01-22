import { describe, it, expect, beforeEach } from 'vitest';
import { FakeFileSystem, FileSystemError } from '@chainglass/shared';

/**
 * Tests for FakeFileSystem.
 *
 * These tests verify that FakeFileSystem correctly implements the IFileSystem
 * interface using in-memory storage. Contract tests (T007) will verify that
 * both FakeFileSystem and NodeFileSystemAdapter behave identically.
 */
describe('FakeFileSystem', () => {
  let fs: FakeFileSystem;

  beforeEach(() => {
    fs = new FakeFileSystem();
  });

  describe('test helpers', () => {
    it('setFile should create file with content', async () => {
      fs.setFile('/test.txt', 'content');
      const result = await fs.readFile('/test.txt');
      expect(result).toBe('content');
    });

    it('getFile should return file content', () => {
      fs.setFile('/test.txt', 'content');
      expect(fs.getFile('/test.txt')).toBe('content');
    });

    it('setDir should create directory', async () => {
      fs.setDir('/mydir');
      const exists = await fs.exists('/mydir');
      expect(exists).toBe(true);
    });

    it('simulateError should cause operation to throw', async () => {
      fs.simulateError('/test.txt', new Error('Simulated error'));
      await expect(fs.readFile('/test.txt')).rejects.toThrow('Simulated error');
    });

    it('reset should clear all state', async () => {
      fs.setFile('/test.txt', 'content');
      fs.reset();
      const exists = await fs.exists('/test.txt');
      expect(exists).toBe(false);
    });
  });

  describe('exists()', () => {
    it('should return true for existing file', async () => {
      fs.setFile('/existing.txt', 'content');
      const result = await fs.exists('/existing.txt');
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const result = await fs.exists('/missing.txt');
      expect(result).toBe(false);
    });

    it('should return true for existing directory', async () => {
      fs.setDir('/subdir');
      const result = await fs.exists('/subdir');
      expect(result).toBe(true);
    });

    it('should return true for implicit directory', async () => {
      // Creating a file implicitly creates its parent directories
      fs.setFile('/a/b/c.txt', 'content');
      const result = await fs.exists('/a/b');
      expect(result).toBe(true);
    });
  });

  describe('readFile()', () => {
    it('should return file contents as string', async () => {
      fs.setFile('/sample.txt', 'Hello, World!\nLine 2');
      const result = await fs.readFile('/sample.txt');
      expect(result).toBe('Hello, World!\nLine 2');
    });

    it('should throw FileSystemError for non-existent file', async () => {
      await expect(fs.readFile('/missing.txt')).rejects.toThrow(FileSystemError);
      try {
        await fs.readFile('/missing.txt');
      } catch (err) {
        expect(err).toBeInstanceOf(FileSystemError);
        expect((err as FileSystemError).code).toBe('ENOENT');
        expect((err as FileSystemError).path).toBe('/missing.txt');
      }
    });

    it('should handle empty files', async () => {
      fs.setFile('/empty.txt', '');
      const result = await fs.readFile('/empty.txt');
      expect(result).toBe('');
    });

    it('should preserve unicode content', async () => {
      const content = '日本語テスト 🎉 émojis';
      fs.setFile('/unicode.txt', content);
      const result = await fs.readFile('/unicode.txt');
      expect(result).toBe(content);
    });
  });

  describe('writeFile()', () => {
    it('should create new file with content', async () => {
      fs.setDir('/');
      await fs.writeFile('/new.txt', 'New content');
      const result = await fs.readFile('/new.txt');
      expect(result).toBe('New content');
    });

    it('should overwrite existing file', async () => {
      fs.setFile('/existing.txt', 'old content');
      await fs.writeFile('/existing.txt', 'new content');
      const result = await fs.readFile('/existing.txt');
      expect(result).toBe('new content');
    });

    it('should throw when parent directory does not exist', async () => {
      await expect(fs.writeFile('/missing/dir/file.txt', 'content')).rejects.toThrow(FileSystemError);
    });

    it('should succeed when parent directory exists', async () => {
      fs.setDir('/parent');
      await fs.writeFile('/parent/file.txt', 'content');
      const result = await fs.readFile('/parent/file.txt');
      expect(result).toBe('content');
    });
  });

  describe('mkdir()', () => {
    it('should create directory', async () => {
      fs.setDir('/');
      await fs.mkdir('/new-dir');
      const stat = await fs.stat('/new-dir');
      expect(stat.isDirectory).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      await fs.mkdir('/a/b/c', { recursive: true });
      const stat = await fs.stat('/a/b/c');
      expect(stat.isDirectory).toBe(true);
    });

    it('should succeed if directory already exists with recursive option', async () => {
      fs.setDir('/existing-dir');
      await fs.mkdir('/existing-dir', { recursive: true });
      const stat = await fs.stat('/existing-dir');
      expect(stat.isDirectory).toBe(true);
    });
  });

  describe('copyFile()', () => {
    it('should copy file contents', async () => {
      fs.setFile('/source.txt', 'Copy me!');
      fs.setDir('/');
      await fs.copyFile('/source.txt', '/dest.txt');
      const result = await fs.readFile('/dest.txt');
      expect(result).toBe('Copy me!');
    });

    it('should throw for non-existent source', async () => {
      await expect(fs.copyFile('/missing.txt', '/dest.txt')).rejects.toThrow(FileSystemError);
    });

    it('should overwrite existing destination', async () => {
      fs.setFile('/source.txt', 'new content');
      fs.setFile('/dest.txt', 'old content');
      await fs.copyFile('/source.txt', '/dest.txt');
      const result = await fs.readFile('/dest.txt');
      expect(result).toBe('new content');
    });
  });

  describe('readDir()', () => {
    it('should return directory contents', async () => {
      fs.setFile('/dir/file1.txt', 'a');
      fs.setFile('/dir/file2.txt', 'b');
      fs.setDir('/dir/subdir');
      const result = await fs.readDir('/dir');
      expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'subdir'].sort());
    });

    it('should return empty array for empty directory', async () => {
      fs.setDir('/empty');
      const result = await fs.readDir('/empty');
      expect(result).toEqual([]);
    });

    it('should throw for non-existent directory', async () => {
      await expect(fs.readDir('/missing')).rejects.toThrow(FileSystemError);
    });

    it('should find implicit subdirectories', async () => {
      fs.setFile('/parent/child/file.txt', 'content');
      const result = await fs.readDir('/parent');
      expect(result).toContain('child');
    });
  });

  describe('stat()', () => {
    it('should return isFile true for files', async () => {
      fs.setFile('/file.txt', 'content');
      const result = await fs.stat('/file.txt');
      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
    });

    it('should return isDirectory true for directories', async () => {
      fs.setDir('/dir');
      const result = await fs.stat('/dir');
      expect(result.isFile).toBe(false);
      expect(result.isDirectory).toBe(true);
    });

    it('should throw for non-existent path', async () => {
      await expect(fs.stat('/missing')).rejects.toThrow(FileSystemError);
    });

    it('should return file size', async () => {
      fs.setFile('/sized.txt', '12345');
      const result = await fs.stat('/sized.txt');
      expect(result.size).toBe(5);
    });

    it('should return mtime as ISO string', async () => {
      fs.setFile('/timed.txt', 'content');
      const result = await fs.stat('/timed.txt');
      expect(result.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('unlink()', () => {
    it('should delete a file', async () => {
      fs.setFile('/to-delete.txt', 'content');
      await fs.unlink('/to-delete.txt');
      const exists = await fs.exists('/to-delete.txt');
      expect(exists).toBe(false);
    });

    it('should throw for non-existent file', async () => {
      await expect(fs.unlink('/missing.txt')).rejects.toThrow(FileSystemError);
    });

    it('should throw for directory', async () => {
      fs.setDir('/dir');
      await expect(fs.unlink('/dir')).rejects.toThrow(FileSystemError);
    });
  });

  describe('rmdir()', () => {
    it('should delete an empty directory', async () => {
      fs.setDir('/to-delete');
      await fs.rmdir('/to-delete');
      const exists = await fs.exists('/to-delete');
      expect(exists).toBe(false);
    });

    it('should delete directory recursively', async () => {
      fs.setFile('/to-delete/file.txt', 'content');
      await fs.rmdir('/to-delete', { recursive: true });
      const exists = await fs.exists('/to-delete');
      expect(exists).toBe(false);
    });

    it('should throw for non-existent directory', async () => {
      await expect(fs.rmdir('/missing')).rejects.toThrow(FileSystemError);
    });

    it('should throw for non-empty directory without recursive', async () => {
      fs.setFile('/dir/file.txt', 'content');
      await expect(fs.rmdir('/dir')).rejects.toThrow(FileSystemError);
    });
  });
});
