import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NodeFileSystemAdapter, FileSystemError } from '@chainglass/shared';

/**
 * Tests for NodeFileSystemAdapter.
 *
 * These tests verify that NodeFileSystemAdapter correctly implements
 * the IFileSystem interface using real filesystem operations.
 *
 * Contract tests (T007) will verify that FakeFileSystem behaves identically.
 */
describe('NodeFileSystemAdapter', () => {
  let adapter: NodeFileSystemAdapter;
  let tempDir: string;

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-fs-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('exists()', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'content');

      const result = await adapter.exists(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.txt');

      const result = await adapter.exists(filePath);
      expect(result).toBe(false);
    });

    it('should return true for existing directory', async () => {
      const dirPath = path.join(tempDir, 'subdir');
      await fs.mkdir(dirPath);

      const result = await adapter.exists(dirPath);
      expect(result).toBe(true);
    });
  });

  describe('readFile()', () => {
    it('should return file contents as string', async () => {
      const filePath = path.join(tempDir, 'sample.txt');
      const content = 'Hello, World!\nLine 2';
      await fs.writeFile(filePath, content);

      const result = await adapter.readFile(filePath);
      expect(result).toBe(content);
    });

    it('should throw FileSystemError for non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.txt');

      await expect(adapter.readFile(filePath)).rejects.toThrow(FileSystemError);
      try {
        await adapter.readFile(filePath);
      } catch (err) {
        expect(err).toBeInstanceOf(FileSystemError);
        expect((err as FileSystemError).code).toBe('ENOENT');
        expect((err as FileSystemError).path).toBe(filePath);
      }
    });

    it('should handle empty files', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const result = await adapter.readFile(filePath);
      expect(result).toBe('');
    });

    it('should preserve unicode content', async () => {
      const filePath = path.join(tempDir, 'unicode.txt');
      const content = '日本語テスト 🎉 émojis';
      await fs.writeFile(filePath, content, 'utf-8');

      const result = await adapter.readFile(filePath);
      expect(result).toBe(content);
    });
  });

  describe('writeFile()', () => {
    it('should create new file with content', async () => {
      const filePath = path.join(tempDir, 'new.txt');
      const content = 'New content';

      await adapter.writeFile(filePath, content);

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should overwrite existing file', async () => {
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'old content');

      await adapter.writeFile(filePath, 'new content');

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe('new content');
    });

    it('should throw when parent directory does not exist', async () => {
      const filePath = path.join(tempDir, 'missing', 'dir', 'file.txt');

      await expect(adapter.writeFile(filePath, 'content')).rejects.toThrow(FileSystemError);
    });
  });

  describe('mkdir()', () => {
    it('should create directory', async () => {
      const dirPath = path.join(tempDir, 'new-dir');

      await adapter.mkdir(dirPath);

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      const dirPath = path.join(tempDir, 'a', 'b', 'c');

      await adapter.mkdir(dirPath, { recursive: true });

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists with recursive option', async () => {
      const dirPath = path.join(tempDir, 'existing-dir');
      await fs.mkdir(dirPath);

      // Should not throw
      await adapter.mkdir(dirPath, { recursive: true });

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('copyFile()', () => {
    it('should copy file contents', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      const content = 'Copy me!';
      await fs.writeFile(srcPath, content);

      await adapter.copyFile(srcPath, destPath);

      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should throw for non-existent source', async () => {
      const srcPath = path.join(tempDir, 'missing.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(adapter.copyFile(srcPath, destPath)).rejects.toThrow(FileSystemError);
    });

    it('should overwrite existing destination', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'new content');
      await fs.writeFile(destPath, 'old content');

      await adapter.copyFile(srcPath, destPath);

      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe('new content');
    });
  });

  describe('readDir()', () => {
    it('should return directory contents', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      const subdir = path.join(tempDir, 'subdir');
      await fs.writeFile(file1, 'a');
      await fs.writeFile(file2, 'b');
      await fs.mkdir(subdir);

      const result = await adapter.readDir(tempDir);
      expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'subdir'].sort());
    });

    it('should return empty array for empty directory', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir);

      const result = await adapter.readDir(emptyDir);
      expect(result).toEqual([]);
    });

    it('should throw for non-existent directory', async () => {
      const missingDir = path.join(tempDir, 'missing');

      await expect(adapter.readDir(missingDir)).rejects.toThrow(FileSystemError);
    });
  });

  describe('stat()', () => {
    it('should return isFile true for files', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const result = await adapter.stat(filePath);
      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
    });

    it('should return isDirectory true for directories', async () => {
      const dirPath = path.join(tempDir, 'dir');
      await fs.mkdir(dirPath);

      const result = await adapter.stat(dirPath);
      expect(result.isFile).toBe(false);
      expect(result.isDirectory).toBe(true);
    });

    it('should throw for non-existent path', async () => {
      const missingPath = path.join(tempDir, 'missing');

      await expect(adapter.stat(missingPath)).rejects.toThrow(FileSystemError);
    });

    it('should return file size', async () => {
      const filePath = path.join(tempDir, 'sized.txt');
      const content = '12345'; // 5 bytes
      await fs.writeFile(filePath, content);

      const result = await adapter.stat(filePath);
      expect(result.size).toBe(5);
    });

    it('should return mtime as ISO string', async () => {
      const filePath = path.join(tempDir, 'timed.txt');
      await fs.writeFile(filePath, 'content');

      const result = await adapter.stat(filePath);
      expect(result.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('unlink()', () => {
    it('should delete a file', async () => {
      const filePath = path.join(tempDir, 'to-delete.txt');
      await fs.writeFile(filePath, 'content');

      await adapter.unlink(filePath);

      const exists = await adapter.exists(filePath);
      expect(exists).toBe(false);
    });

    it('should throw for non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.txt');

      await expect(adapter.unlink(filePath)).rejects.toThrow(FileSystemError);
    });
  });

  describe('rmdir()', () => {
    it('should delete an empty directory', async () => {
      const dirPath = path.join(tempDir, 'to-delete');
      await fs.mkdir(dirPath);

      await adapter.rmdir(dirPath);

      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(false);
    });

    it('should delete directory recursively', async () => {
      const dirPath = path.join(tempDir, 'to-delete');
      const filePath = path.join(dirPath, 'file.txt');
      await fs.mkdir(dirPath);
      await fs.writeFile(filePath, 'content');

      await adapter.rmdir(dirPath, { recursive: true });

      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(false);
    });

    it('should throw for non-existent directory', async () => {
      const dirPath = path.join(tempDir, 'missing');

      await expect(adapter.rmdir(dirPath)).rejects.toThrow(FileSystemError);
    });
  });
});
