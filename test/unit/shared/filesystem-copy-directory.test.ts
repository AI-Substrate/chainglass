/**
 * Tests for IFileSystem.copyDirectory() method.
 *
 * Per Phase 4 T002a: TDD RED phase - Write failing tests first.
 * Per DYK-03: Add copyDirectory() to IFileSystem interface.
 *
 * Tests cover: recursive copy, preserves structure, handles nested dirs,
 * idempotent, handles empty dirs, exclude option.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeFileSystem, NodeFileSystemAdapter } from '@chainglass/shared';
import type { IFileSystem } from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests that run against both FakeFileSystem and NodeFileSystemAdapter.
 * Ensures behavioral parity between fake and real implementations.
 */
describe.each([
  ['FakeFileSystem', () => new FakeFileSystem()],
  ['NodeFileSystemAdapter', () => new NodeFileSystemAdapter()],
])('IFileSystem.copyDirectory() - %s', (name, createFs) => {
  let fs: IFileSystem;
  let tempDir: string;

  beforeEach(async () => {
    fs = createFs();

    if (name === 'NodeFileSystemAdapter') {
      // Create real temp directory for node adapter tests
      tempDir = await mkdtemp(join(tmpdir(), 'cg-test-'));
    } else {
      // Use virtual path for fake filesystem
      tempDir = '/test';
      (fs as FakeFileSystem).setDir(tempDir);
    }
  });

  afterEach(async () => {
    if (name === 'NodeFileSystemAdapter' && tempDir) {
      // Clean up real temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should copy files from source to destination', async () => {
    /*
    Test Doc:
    - Why: Core functionality - copy files between directories
    - Contract: copyDirectory(src, dest) copies all files from src to dest
    - Usage Notes: Both src and dest must be absolute paths
    - Quality Contribution: Ensures template copying works
    - Worked Example: copyDirectory("/a", "/b") → files from /a appear in /b
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'dest');

    // Setup source directory with a file
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(join(sourceDir, 'file.txt'), 'content');

    // Copy
    await fs.copyDirectory(sourceDir, destDir);

    // Verify
    expect(await fs.exists(join(destDir, 'file.txt'))).toBe(true);
    expect(await fs.readFile(join(destDir, 'file.txt'))).toBe('content');
  });

  it('should recursively copy nested directories', async () => {
    /*
    Test Doc:
    - Why: Template directories have nested structure (phases/gather/commands/)
    - Contract: copyDirectory copies entire directory tree, preserving structure
    - Usage Notes: Nested paths are maintained in destination
    - Quality Contribution: Ensures workflow template structure is preserved
    - Worked Example: /src/a/b/c.txt → /dest/a/b/c.txt
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'dest');

    // Setup nested structure
    await fs.mkdir(join(sourceDir, 'level1', 'level2'), { recursive: true });
    await fs.writeFile(join(sourceDir, 'level1', 'level2', 'deep.txt'), 'deep content');
    await fs.writeFile(join(sourceDir, 'level1', 'mid.txt'), 'mid content');
    await fs.writeFile(join(sourceDir, 'root.txt'), 'root content');

    // Copy
    await fs.copyDirectory(sourceDir, destDir);

    // Verify structure preserved
    expect(await fs.exists(join(destDir, 'root.txt'))).toBe(true);
    expect(await fs.exists(join(destDir, 'level1', 'mid.txt'))).toBe(true);
    expect(await fs.exists(join(destDir, 'level1', 'level2', 'deep.txt'))).toBe(true);
    expect(await fs.readFile(join(destDir, 'level1', 'level2', 'deep.txt'))).toBe('deep content');
  });

  it('should create destination directory if it does not exist', async () => {
    /*
    Test Doc:
    - Why: Destination may not exist; copyDirectory should create it
    - Contract: copyDirectory creates dest directory automatically
    - Usage Notes: No need to mkdir dest before calling copyDirectory
    - Quality Contribution: Simplifies caller code
    - Worked Example: copyDirectory("/src", "/nonexistent/dest") creates /nonexistent/dest
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'new', 'nested', 'dest');

    // Setup source
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(join(sourceDir, 'file.txt'), 'content');

    // Copy to non-existent nested destination
    await fs.copyDirectory(sourceDir, destDir);

    // Verify destination was created
    expect(await fs.exists(destDir)).toBe(true);
    expect(await fs.exists(join(destDir, 'file.txt'))).toBe(true);
  });

  it('should handle empty directories', async () => {
    /*
    Test Doc:
    - Why: Source may be empty or contain empty subdirectories
    - Contract: copyDirectory handles empty directories gracefully
    - Usage Notes: Empty directories may or may not be created (implementation detail)
    - Quality Contribution: Prevents errors on edge cases
    - Worked Example: copyDirectory("/empty", "/dest") succeeds
    */
    const sourceDir = join(tempDir, 'empty-source');
    const destDir = join(tempDir, 'dest');

    // Setup empty source
    await fs.mkdir(sourceDir, { recursive: true });

    // Copy empty directory - should not throw
    await fs.copyDirectory(sourceDir, destDir);

    // Destination should exist
    expect(await fs.exists(destDir)).toBe(true);
  });

  it('should overwrite existing files in destination', async () => {
    /*
    Test Doc:
    - Why: Re-copying should update destination files
    - Contract: copyDirectory overwrites existing files with same names
    - Usage Notes: Use with caution - existing content will be replaced
    - Quality Contribution: Ensures force flag behavior for init
    - Worked Example: dest/file.txt exists → copy overwrites it
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'dest');

    // Setup source
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(join(sourceDir, 'file.txt'), 'new content');

    // Setup existing destination
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(join(destDir, 'file.txt'), 'old content');

    // Copy (should overwrite)
    await fs.copyDirectory(sourceDir, destDir);

    // Verify overwritten
    expect(await fs.readFile(join(destDir, 'file.txt'))).toBe('new content');
  });

  it('should preserve existing files in destination not in source', async () => {
    /*
    Test Doc:
    - Why: copyDirectory is additive, shouldn't delete dest-only files
    - Contract: Files in dest that don't exist in source remain untouched
    - Usage Notes: This is not a sync/mirror operation
    - Quality Contribution: Prevents accidental data loss
    - Worked Example: dest has extra.txt not in source → extra.txt preserved
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'dest');

    // Setup source
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(join(sourceDir, 'from-source.txt'), 'source content');

    // Setup destination with extra file
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(join(destDir, 'existing.txt'), 'existing content');

    // Copy
    await fs.copyDirectory(sourceDir, destDir);

    // Verify both files exist
    expect(await fs.exists(join(destDir, 'from-source.txt'))).toBe(true);
    expect(await fs.exists(join(destDir, 'existing.txt'))).toBe(true);
    expect(await fs.readFile(join(destDir, 'existing.txt'))).toBe('existing content');
  });

  it('should throw ENOENT if source directory does not exist', async () => {
    /*
    Test Doc:
    - Why: Cannot copy from non-existent source
    - Contract: copyDirectory throws FileSystemError with code ENOENT
    - Usage Notes: Verify source exists before calling
    - Quality Contribution: Clear error message for debugging
    - Worked Example: copyDirectory("/nonexistent", "/dest") throws ENOENT
    */
    const sourceDir = join(tempDir, 'nonexistent');
    const destDir = join(tempDir, 'dest');

    await expect(fs.copyDirectory(sourceDir, destDir)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should support exclude option to skip directories', async () => {
    /*
    Test Doc:
    - Why: Some directories (.git, node_modules) should not be copied
    - Contract: copyDirectory with exclude option skips matching directories
    - Usage Notes: Exclude patterns are exact directory name matches
    - Quality Contribution: Prevents copying unnecessary files
    - Worked Example: copyDirectory(src, dest, { exclude: ['.git'] }) skips .git
    */
    const sourceDir = join(tempDir, 'source');
    const destDir = join(tempDir, 'dest');

    // Setup source with excludable directory
    await fs.mkdir(join(sourceDir, '.git'), { recursive: true });
    await fs.mkdir(join(sourceDir, 'keep'), { recursive: true });
    await fs.writeFile(join(sourceDir, '.git', 'config'), 'git config');
    await fs.writeFile(join(sourceDir, 'keep', 'file.txt'), 'keep this');
    await fs.writeFile(join(sourceDir, 'root.txt'), 'root');

    // Copy with exclude
    await fs.copyDirectory(sourceDir, destDir, { exclude: ['.git'] });

    // Verify .git was excluded
    expect(await fs.exists(join(destDir, '.git'))).toBe(false);
    // Verify other content was copied
    expect(await fs.exists(join(destDir, 'root.txt'))).toBe(true);
    expect(await fs.exists(join(destDir, 'keep', 'file.txt'))).toBe(true);
  });
});
