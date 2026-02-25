import type { IFileSystem } from '@chainglass/shared';
import { FileSystemError } from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IFileSystem implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeFileSystem and NodeFileSystemAdapter pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { fileSystemContractTests } from '@test/contracts/filesystem.contract';
 *
 * fileSystemContractTests('FakeFileSystem', () => ({
 *   fs: new FakeFileSystem(),
 *   setup: async (fs) => { fs.setFile('/test.txt', 'content'); },
 *   cleanup: async () => {},
 * }));
 * ```
 */

export interface FileSystemTestContext {
  /** The filesystem implementation to test */
  fs: IFileSystem;
  /** Setup function called before each test - creates temp directory or sets up fake */
  setup: () => Promise<string>; // Returns base directory path
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Helper to create a file (for setting up test preconditions) */
  createFile: (path: string, content: string) => Promise<void>;
  /** Helper to create a directory (for setting up test preconditions) */
  createDir: (path: string) => Promise<void>;
}

export function fileSystemContractTests(name: string, createContext: () => FileSystemTestContext) {
  describe(`${name} implements IFileSystem contract`, () => {
    let ctx: FileSystemTestContext;
    let baseDir: string;

    beforeEach(async () => {
      ctx = createContext();
      baseDir = await ctx.setup();
    });

    afterEach(async () => {
      await ctx.cleanup();
    });

    describe('exists()', () => {
      it('should return true for existing file', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical behavior for file existence checks
        - Contract: exists() returns true for files, false for non-existent paths
        - Usage Notes: Run against both fake and real implementations
        - Quality Contribution: Ensures fake matches real for basic file checks
        - Worked Example: Create file → exists() → true
        */
        const filePath = `${baseDir}/existing.txt`;
        await ctx.createFile(filePath, 'content');

        const result = await ctx.fs.exists(filePath);
        expect(result).toBe(true);
      });

      it('should return false for non-existent file', async () => {
        const filePath = `${baseDir}/missing.txt`;
        const result = await ctx.fs.exists(filePath);
        expect(result).toBe(false);
      });

      it('should return true for existing directory', async () => {
        const dirPath = `${baseDir}/subdir`;
        await ctx.createDir(dirPath);

        const result = await ctx.fs.exists(dirPath);
        expect(result).toBe(true);
      });
    });

    describe('readFile()', () => {
      it('should return file contents as string', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical content reading behavior
        - Contract: readFile() returns file content as UTF-8 string
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake returns same content as real
        - Worked Example: Create file with 'hello' → readFile() → 'hello'
        */
        const filePath = `${baseDir}/sample.txt`;
        const content = 'Hello, World!\nLine 2';
        await ctx.createFile(filePath, content);

        const result = await ctx.fs.readFile(filePath);
        expect(result).toBe(content);
      });

      it('should throw FileSystemError with ENOENT for non-existent file', async () => {
        const filePath = `${baseDir}/missing.txt`;

        try {
          await ctx.fs.readFile(filePath);
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(FileSystemError);
          expect((err as FileSystemError).code).toBe('ENOENT');
        }
      });

      it('should handle empty files', async () => {
        const filePath = `${baseDir}/empty.txt`;
        await ctx.createFile(filePath, '');

        const result = await ctx.fs.readFile(filePath);
        expect(result).toBe('');
      });
    });

    describe('writeFile()', () => {
      it('should create new file with content', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical write behavior
        - Contract: writeFile() creates file that can be read back
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake write matches real write
        - Worked Example: writeFile('content') → readFile() → 'content'
        */
        const filePath = `${baseDir}/new.txt`;
        const content = 'New content';

        await ctx.fs.writeFile(filePath, content);
        const result = await ctx.fs.readFile(filePath);
        expect(result).toBe(content);
      });

      it('should overwrite existing file', async () => {
        const filePath = `${baseDir}/existing.txt`;
        await ctx.createFile(filePath, 'old content');

        await ctx.fs.writeFile(filePath, 'new content');
        const result = await ctx.fs.readFile(filePath);
        expect(result).toBe('new content');
      });
    });

    describe('writeFile() with Buffer', () => {
      it('should write Buffer content and report correct size', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical binary write behavior (DYK-01)
        - Contract: writeFile(Buffer) creates file with correct byte size in stat()
        - Usage Notes: Run against both implementations to verify fake/real parity
        - Quality Contribution: Ensures binary uploads work identically in tests and production
        - Worked Example: writeFile(Buffer[4 bytes]) → stat() → size: 4
        */
        const filePath = `${baseDir}/binary.bin`;
        const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        await ctx.fs.writeFile(filePath, buffer);
        const stat = await ctx.fs.stat(filePath);
        expect(stat.size).toBe(4);
        expect(stat.isFile).toBe(true);
      });

      it('should return string from readFile after Buffer write', async () => {
        /*
        Test Doc:
        - Why: readFile always returns string — even for binary content (DYK-01)
        - Contract: readFile() returns utf-8 decoded string, never throws on binary
        - Usage Notes: Real adapter does fs.readFile(path, 'utf-8') which returns garbled string
        - Quality Contribution: Prevents fake/real divergence in binary file handling
        - Worked Example: writeFile(Buffer) → readFile() → returns string (not throw)
        */
        const filePath = `${baseDir}/binary2.bin`;
        const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

        await ctx.fs.writeFile(filePath, buffer);
        const content = await ctx.fs.readFile(filePath);
        expect(typeof content).toBe('string');
      });
    });

    describe('mkdir()', () => {
      it('should create directory', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical directory creation behavior
        - Contract: mkdir() creates directory that exists() returns true for
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake mkdir matches real mkdir
        - Worked Example: mkdir('/dir') → exists('/dir') → true
        */
        const dirPath = `${baseDir}/new-dir`;

        await ctx.fs.mkdir(dirPath);
        const exists = await ctx.fs.exists(dirPath);
        expect(exists).toBe(true);

        const stat = await ctx.fs.stat(dirPath);
        expect(stat.isDirectory).toBe(true);
      });

      it('should create nested directories with recursive option', async () => {
        const dirPath = `${baseDir}/a/b/c`;

        await ctx.fs.mkdir(dirPath, { recursive: true });
        const exists = await ctx.fs.exists(dirPath);
        expect(exists).toBe(true);
      });

      it('should succeed if directory already exists with recursive option', async () => {
        const dirPath = `${baseDir}/existing-dir`;
        await ctx.createDir(dirPath);

        // Should not throw
        await ctx.fs.mkdir(dirPath, { recursive: true });
        const exists = await ctx.fs.exists(dirPath);
        expect(exists).toBe(true);
      });
    });

    describe('copyFile()', () => {
      it('should copy file contents', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical copy behavior
        - Contract: copyFile() copies content identically
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake copy matches real copy
        - Worked Example: copyFile(src, dest) → readFile(dest) matches src
        */
        const srcPath = `${baseDir}/source.txt`;
        const destPath = `${baseDir}/dest.txt`;
        const content = 'Copy me!';
        await ctx.createFile(srcPath, content);

        await ctx.fs.copyFile(srcPath, destPath);
        const result = await ctx.fs.readFile(destPath);
        expect(result).toBe(content);
      });

      it('should throw FileSystemError for non-existent source', async () => {
        const srcPath = `${baseDir}/missing.txt`;
        const destPath = `${baseDir}/dest.txt`;

        try {
          await ctx.fs.copyFile(srcPath, destPath);
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(FileSystemError);
        }
      });
    });

    describe('readDir()', () => {
      it('should return directory contents', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical directory listing behavior
        - Contract: readDir() returns same entries for same content
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake readDir matches real readDir
        - Worked Example: Create 2 files → readDir() → ['file1', 'file2']
        */
        await ctx.createFile(`${baseDir}/file1.txt`, 'a');
        await ctx.createFile(`${baseDir}/file2.txt`, 'b');
        await ctx.createDir(`${baseDir}/subdir`);

        const result = await ctx.fs.readDir(baseDir);
        expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'subdir'].sort());
      });

      it('should return empty array for empty directory', async () => {
        const emptyDir = `${baseDir}/empty`;
        await ctx.createDir(emptyDir);

        const result = await ctx.fs.readDir(emptyDir);
        expect(result).toEqual([]);
      });
    });

    describe('stat()', () => {
      it('should return isFile true for files', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical stat behavior
        - Contract: stat() returns same metadata structure
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake stat matches real stat
        - Worked Example: stat(file) → {isFile: true, isDirectory: false}
        */
        const filePath = `${baseDir}/file.txt`;
        await ctx.createFile(filePath, 'content');

        const result = await ctx.fs.stat(filePath);
        expect(result.isFile).toBe(true);
        expect(result.isDirectory).toBe(false);
      });

      it('should return isDirectory true for directories', async () => {
        const dirPath = `${baseDir}/dir`;
        await ctx.createDir(dirPath);

        const result = await ctx.fs.stat(dirPath);
        expect(result.isFile).toBe(false);
        expect(result.isDirectory).toBe(true);
      });

      it('should throw FileSystemError for non-existent path', async () => {
        const missingPath = `${baseDir}/missing`;

        try {
          await ctx.fs.stat(missingPath);
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(FileSystemError);
          expect((err as FileSystemError).code).toBe('ENOENT');
        }
      });
    });

    describe('unlink()', () => {
      it('should delete a file', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical delete behavior
        - Contract: unlink() removes file so exists() returns false
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake unlink matches real unlink
        - Worked Example: unlink(file) → exists(file) → false
        */
        const filePath = `${baseDir}/to-delete.txt`;
        await ctx.createFile(filePath, 'content');

        await ctx.fs.unlink(filePath);
        const exists = await ctx.fs.exists(filePath);
        expect(exists).toBe(false);
      });

      it('should throw FileSystemError for non-existent file', async () => {
        const filePath = `${baseDir}/missing.txt`;

        try {
          await ctx.fs.unlink(filePath);
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(FileSystemError);
        }
      });
    });

    describe('rmdir()', () => {
      it('should delete an empty directory', async () => {
        /*
        Test Doc:
        - Why: Contract requires identical rmdir behavior
        - Contract: rmdir() removes directory so exists() returns false
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake rmdir matches real rmdir
        - Worked Example: rmdir(dir) → exists(dir) → false
        */
        const dirPath = `${baseDir}/to-delete`;
        await ctx.createDir(dirPath);

        await ctx.fs.rmdir(dirPath);
        const exists = await ctx.fs.exists(dirPath);
        expect(exists).toBe(false);
      });

      it('should delete directory recursively', async () => {
        const dirPath = `${baseDir}/to-delete`;
        await ctx.createDir(dirPath);
        await ctx.createFile(`${dirPath}/file.txt`, 'content');

        await ctx.fs.rmdir(dirPath, { recursive: true });
        const exists = await ctx.fs.exists(dirPath);
        expect(exists).toBe(false);
      });
    });
  });
}
