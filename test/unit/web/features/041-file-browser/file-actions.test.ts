/**
 * File Actions Tests (readFile + saveFile)
 *
 * Purpose: Verify secure file read/write with size limits, binary detection,
 *          symlink escape prevention, and mtime conflict detection.
 * Quality Contribution: Security-critical — prevents path traversal and symlink attacks.
 * Acceptance Criteria: AC-28, AC-30, AC-45, AC-46
 *
 * Phase 4: File Browser — Plan 041
 * Finding 02: Symlink escape via realpath
 * Finding 06: Save conflict via mtime + atomic write
 * Finding 09: Large file / binary detection
 */

import { readFileAction, saveFileAction } from '@/features/041-file-browser/services/file-actions';
import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

describe('readFileAction', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
  });

  it('returns content, mtime, and size for a valid file', async () => {
    fs.setFile('/workspace/src/index.ts', 'export const x = 1;');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'src/index.ts',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe('export const x = 1;');
      expect(result.size).toBeGreaterThan(0);
      expect(result.language).toBe('typescript');
    }
  });

  it('returns file-too-large error for files over 5MB', async () => {
    const bigContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
    fs.setFile('/workspace/big.txt', bigContent);

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'big.txt',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('file-too-large');
    }
  });

  it('returns binary-file error for files with null bytes', async () => {
    fs.setFile('/workspace/image.bin', 'header\x00binary\x00data');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'image.bin',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('binary-file');
    }
  });

  it('returns not-found error for missing files', async () => {
    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'missing.txt',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not-found');
    }
  });

  it('rejects path traversal attempts', async () => {
    pathResolver.blockPath('/workspace/../etc/passwd');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: '../etc/passwd',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });

  it('rejects symlink escape via realpath check', async () => {
    fs.setFile('/workspace/link', 'content');
    // Symlink resolves outside workspace
    fs.setSymlink('/workspace/link', '/etc/passwd');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'link',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });
});

describe('saveFileAction', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
  });

  it('saves content and returns new mtime', async () => {
    fs.setFile('/workspace/file.txt', 'old content');

    const result = await saveFileAction({
      worktreePath: '/workspace',
      filePath: 'file.txt',
      content: 'new content',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newMtime).toBeDefined();
    }

    // Verify content was written
    const saved = await fs.readFile('/workspace/file.txt');
    expect(saved).toBe('new content');
  });

  it('returns conflict error when mtime has changed', async () => {
    fs.setFile('/workspace/file.txt', 'content');
    const stats = await fs.stat('/workspace/file.txt');

    // Simulate another process writing (different mtime)
    const result = await saveFileAction({
      worktreePath: '/workspace',
      filePath: 'file.txt',
      content: 'new content',
      expectedMtime: '1970-01-01T00:00:00.000Z', // Old mtime
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('conflict');
    }
  });

  it('force=true overrides mtime conflict', async () => {
    fs.setFile('/workspace/file.txt', 'content');

    const result = await saveFileAction({
      worktreePath: '/workspace',
      filePath: 'file.txt',
      content: 'forced content',
      expectedMtime: '1970-01-01T00:00:00.000Z',
      force: true,
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
    const saved = await fs.readFile('/workspace/file.txt');
    expect(saved).toBe('forced content');
  });

  it('rejects path traversal attempts', async () => {
    pathResolver.blockPath('/workspace/../etc/shadow');

    const result = await saveFileAction({
      worktreePath: '/workspace',
      filePath: '../etc/shadow',
      content: 'evil',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });
});
