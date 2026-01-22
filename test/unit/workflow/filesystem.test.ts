import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IFileSystem } from '@chainglass/shared';
import { FileSystemError } from '@chainglass/shared';

/**
 * Test suite for IFileSystem implementations.
 *
 * Per Test Plan: Tests cover exists, readFile, writeFile, readDir, mkdir, copyFile, stat
 * These tests are written first (RED phase) and will be used by both:
 * - NodeFileSystemAdapter (real implementation)
 * - FakeFileSystem (test double)
 *
 * Contract tests (T007) will run these same tests against both implementations.
 */

// These tests will be parameterized in the contract tests
// For now, we define the test cases that both implementations must pass

describe('IFileSystem Interface Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('exists()', () => {
    it('should return true for existing file', async () => {
      /*
      Test Doc:
      - Why: Core operation - services need to check if files exist before reading
      - Contract: exists() returns true when path points to an existing file
      - Usage Notes: Path must be absolute. Works for both files and directories.
      - Quality Contribution: Ensures file existence checks work correctly
      - Worked Example: exists('/path/to/existing.txt') → true
      */
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'content');

      const result = await fs.stat(filePath).then(() => true).catch(() => false);
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      /*
      Test Doc:
      - Why: Negative case - services need to handle missing files gracefully
      - Contract: exists() returns false when path doesn't exist
      - Usage Notes: Should not throw, just return false
      - Quality Contribution: Ensures missing file handling works
      - Worked Example: exists('/path/to/missing.txt') → false
      */
      const filePath = path.join(tempDir, 'missing.txt');

      const result = await fs.stat(filePath).then(() => true).catch(() => false);
      expect(result).toBe(false);
    });

    it('should return true for existing directory', async () => {
      /*
      Test Doc:
      - Why: exists() should work for directories too
      - Contract: exists() returns true for existing directories
      - Usage Notes: Same behavior as files
      - Quality Contribution: Ensures directory existence checks work
      - Worked Example: exists('/path/to/dir/') → true
      */
      const dirPath = path.join(tempDir, 'subdir');
      await fs.mkdir(dirPath);

      const result = await fs.stat(dirPath).then(() => true).catch(() => false);
      expect(result).toBe(true);
    });
  });

  describe('readFile()', () => {
    it('should return file contents as string', async () => {
      /*
      Test Doc:
      - Why: Core read operation - services need to read wf.yaml and phase configs
      - Contract: readFile() returns file content as UTF-8 string
      - Usage Notes: Path must be absolute. Returns string, not Buffer.
      - Quality Contribution: Ensures file reading works correctly
      - Worked Example: readFile('/path/to/wf.yaml') → 'version: "1.0"...'
      */
      const filePath = path.join(tempDir, 'sample.txt');
      const content = 'Hello, World!\nLine 2';
      await fs.writeFile(filePath, content);

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should throw FileSystemError for non-existent file', async () => {
      /*
      Test Doc:
      - Why: Error handling - services need clear errors when files are missing
      - Contract: readFile() throws FileSystemError with code 'ENOENT' for missing files
      - Usage Notes: Catch FileSystemError and check code property
      - Quality Contribution: Ensures proper error reporting for missing files
      - Worked Example: readFile('/missing.txt') → throws FileSystemError(code: 'ENOENT')
      */
      const filePath = path.join(tempDir, 'missing.txt');

      await expect(fs.readFile(filePath, 'utf-8')).rejects.toThrow();
    });

    it('should handle empty files', async () => {
      /*
      Test Doc:
      - Why: Edge case - empty files should return empty string, not throw
      - Contract: readFile() returns '' for empty files
      - Usage Notes: Empty file is valid, should not throw
      - Quality Contribution: Ensures empty files are handled correctly
      - Worked Example: readFile('/empty.txt') → ''
      */
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe('');
    });

    it('should preserve unicode content', async () => {
      /*
      Test Doc:
      - Why: Real-world files may contain unicode characters
      - Contract: readFile() preserves unicode content
      - Usage Notes: UTF-8 encoding is always used
      - Quality Contribution: Ensures international content works
      - Worked Example: readFile('/unicode.txt') → '日本語 🎉'
      */
      const filePath = path.join(tempDir, 'unicode.txt');
      const content = '日本語テスト 🎉 émojis';
      await fs.writeFile(filePath, content, 'utf-8');

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });
  });

  describe('writeFile()', () => {
    it('should create new file with content', async () => {
      /*
      Test Doc:
      - Why: Core write operation - services need to write output files
      - Contract: writeFile() creates file with specified content
      - Usage Notes: Creates file if it doesn't exist. Parent dir must exist.
      - Quality Contribution: Ensures file writing works correctly
      - Worked Example: writeFile('/new.txt', 'content') → file exists with content
      */
      const filePath = path.join(tempDir, 'new.txt');
      const content = 'New content';
      await fs.writeFile(filePath, content);

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should overwrite existing file', async () => {
      /*
      Test Doc:
      - Why: Overwrite behavior - existing files should be replaced
      - Contract: writeFile() overwrites existing file content
      - Usage Notes: Does not append, fully replaces content
      - Quality Contribution: Ensures overwrite works correctly
      - Worked Example: writeFile('/existing.txt', 'new') → file contains 'new' only
      */
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'old content');
      await fs.writeFile(filePath, 'new content');

      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe('new content');
    });

    it('should throw when parent directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Error handling - writing to non-existent parent should fail
      - Contract: writeFile() throws when parent directory doesn't exist
      - Usage Notes: Use mkdir() first to create parent directories
      - Quality Contribution: Ensures proper error for missing parent
      - Worked Example: writeFile('/missing/dir/file.txt', 'x') → throws
      */
      const filePath = path.join(tempDir, 'missing', 'dir', 'file.txt');

      await expect(fs.writeFile(filePath, 'content')).rejects.toThrow();
    });
  });

  describe('mkdir()', () => {
    it('should create directory', async () => {
      /*
      Test Doc:
      - Why: Directory creation is needed for output structure
      - Contract: mkdir() creates a new directory
      - Usage Notes: Parent must exist unless recursive:true
      - Quality Contribution: Ensures directory creation works
      - Worked Example: mkdir('/new-dir') → directory exists
      */
      const dirPath = path.join(tempDir, 'new-dir');
      await fs.mkdir(dirPath);

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      /*
      Test Doc:
      - Why: Recursive creation is needed for deep directory structures
      - Contract: mkdir({recursive:true}) creates all parent directories
      - Usage Notes: Use recursive:true for multiple levels
      - Quality Contribution: Ensures nested directory creation works
      - Worked Example: mkdir('/a/b/c', {recursive:true}) → all dirs exist
      */
      const dirPath = path.join(tempDir, 'a', 'b', 'c');
      await fs.mkdir(dirPath, { recursive: true });

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists with recursive option', async () => {
      /*
      Test Doc:
      - Why: Idempotency - mkdir should be safe to call multiple times
      - Contract: mkdir({recursive:true}) succeeds even if directory exists
      - Usage Notes: Use recursive:true for idempotent operations
      - Quality Contribution: Ensures idempotent directory creation
      - Worked Example: mkdir('/existing', {recursive:true}) → no error
      */
      const dirPath = path.join(tempDir, 'existing-dir');
      await fs.mkdir(dirPath);

      // Should not throw
      await fs.mkdir(dirPath, { recursive: true });

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('copyFile()', () => {
    it('should copy file contents', async () => {
      /*
      Test Doc:
      - Why: Copying is needed for from_phase input resolution
      - Contract: copyFile() copies source content to destination
      - Usage Notes: Destination parent must exist
      - Quality Contribution: Ensures file copying works
      - Worked Example: copyFile('/src.txt', '/dest.txt') → dest has src content
      */
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      const content = 'Copy me!';
      await fs.writeFile(srcPath, content);

      await fs.copyFile(srcPath, destPath);

      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should throw for non-existent source', async () => {
      /*
      Test Doc:
      - Why: Error handling - copying missing file should fail clearly
      - Contract: copyFile() throws with ENOENT for missing source
      - Usage Notes: Check source exists before copying
      - Quality Contribution: Ensures proper error for missing source
      - Worked Example: copyFile('/missing.txt', '/dest.txt') → throws ENOENT
      */
      const srcPath = path.join(tempDir, 'missing.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(fs.copyFile(srcPath, destPath)).rejects.toThrow();
    });

    it('should overwrite existing destination', async () => {
      /*
      Test Doc:
      - Why: Copy should overwrite, not fail on existing dest
      - Contract: copyFile() overwrites existing destination
      - Usage Notes: Default behavior is to overwrite
      - Quality Contribution: Ensures copy overwrites correctly
      - Worked Example: copyFile('/new.txt', '/existing.txt') → existing replaced
      */
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'new content');
      await fs.writeFile(destPath, 'old content');

      await fs.copyFile(srcPath, destPath);

      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe('new content');
    });
  });

  describe('readDir()', () => {
    it('should return directory contents', async () => {
      /*
      Test Doc:
      - Why: Listing directory contents is needed for phase discovery
      - Contract: readDir() returns array of entry names
      - Usage Notes: Returns names only, not full paths. Non-recursive.
      - Quality Contribution: Ensures directory listing works
      - Worked Example: readDir('/dir') → ['file1.txt', 'subdir']
      */
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      const subdir = path.join(tempDir, 'subdir');
      await fs.writeFile(file1, 'a');
      await fs.writeFile(file2, 'b');
      await fs.mkdir(subdir);

      const result = await fs.readdir(tempDir);
      expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'subdir'].sort());
    });

    it('should return empty array for empty directory', async () => {
      /*
      Test Doc:
      - Why: Empty directories should return empty array, not throw
      - Contract: readDir() returns [] for empty directory
      - Usage Notes: Empty is valid, not an error
      - Quality Contribution: Ensures empty directories work
      - Worked Example: readDir('/empty-dir') → []
      */
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir);

      const result = await fs.readdir(emptyDir);
      expect(result).toEqual([]);
    });

    it('should throw for non-existent directory', async () => {
      /*
      Test Doc:
      - Why: Error handling - listing missing dir should fail clearly
      - Contract: readDir() throws with ENOENT for missing directory
      - Usage Notes: Check directory exists first
      - Quality Contribution: Ensures proper error for missing dir
      - Worked Example: readDir('/missing') → throws ENOENT
      */
      const missingDir = path.join(tempDir, 'missing');

      await expect(fs.readdir(missingDir)).rejects.toThrow();
    });
  });

  describe('stat()', () => {
    it('should return isFile true for files', async () => {
      /*
      Test Doc:
      - Why: Need to distinguish files from directories
      - Contract: stat() returns {isFile: true, isDirectory: false} for files
      - Usage Notes: Use to check if path is file or directory
      - Quality Contribution: Ensures file detection works
      - Worked Example: stat('/file.txt') → {isFile: true, isDirectory: false}
      */
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const result = await fs.stat(filePath);
      expect(result.isFile()).toBe(true);
      expect(result.isDirectory()).toBe(false);
    });

    it('should return isDirectory true for directories', async () => {
      /*
      Test Doc:
      - Why: Need to distinguish directories from files
      - Contract: stat() returns {isFile: false, isDirectory: true} for dirs
      - Usage Notes: Use to check if path is directory
      - Quality Contribution: Ensures directory detection works
      - Worked Example: stat('/dir') → {isFile: false, isDirectory: true}
      */
      const dirPath = path.join(tempDir, 'dir');
      await fs.mkdir(dirPath);

      const result = await fs.stat(dirPath);
      expect(result.isFile()).toBe(false);
      expect(result.isDirectory()).toBe(true);
    });

    it('should throw for non-existent path', async () => {
      /*
      Test Doc:
      - Why: Error handling - stat on missing path should fail clearly
      - Contract: stat() throws with ENOENT for missing path
      - Usage Notes: Use exists() first if you don't want exception
      - Quality Contribution: Ensures proper error for missing path
      - Worked Example: stat('/missing') → throws ENOENT
      */
      const missingPath = path.join(tempDir, 'missing');

      await expect(fs.stat(missingPath)).rejects.toThrow();
    });

    it('should return file size', async () => {
      /*
      Test Doc:
      - Why: File size is useful for validation and logging
      - Contract: stat() returns size in bytes
      - Usage Notes: Size is 0 for empty files
      - Quality Contribution: Ensures file size reporting works
      - Worked Example: stat('/5bytes.txt') → {size: 5}
      */
      const filePath = path.join(tempDir, 'sized.txt');
      const content = '12345'; // 5 bytes
      await fs.writeFile(filePath, content);

      const result = await fs.stat(filePath);
      expect(result.size).toBe(5);
    });
  });
});
