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
      expect(result.highlightedHtml).toBe('');
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

  it('returns binary metadata for files with null bytes', async () => {
    fs.setFile('/workspace/image.bin', 'header\x00binary\x00data');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'image.bin',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isBinary).toBe(true);
      if (result.isBinary) {
        expect(result.contentType).toBe('application/octet-stream');
      }
    }
  });

  it('returns binary metadata for known binary extensions without reading content', async () => {
    fs.setFile('/workspace/photo.png', 'PNG fake data');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'photo.png',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isBinary).toBe(true);
      if (result.isBinary) {
        expect(result.contentType).toBe('image/png');
      }
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

  it('allows symlinks that resolve outside workspace (local dev tool)', async () => {
    fs.setFile('/workspace/link', 'symlinked content');
    // Symlink resolves outside workspace — allowed since this is a local dev tool
    fs.setSymlink('/workspace/link', '/etc/passwd');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'link',
      fileSystem: fs,
      pathResolver,
    });

    expect(result.ok).toBe(true);
  });

  it('calls highlightFn and includes highlightedHtml in result', async () => {
    fs.setFile('/workspace/src/app.ts', 'const y = 2;');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'src/app.ts',
      fileSystem: fs,
      pathResolver,
      highlightFn: async (code, lang) => `<pre class="shiki">${code}</pre>`,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.highlightedHtml).toBe('<pre class="shiki">const y = 2;</pre>');
    }
  });

  it('calls renderMarkdownFn for markdown files', async () => {
    fs.setFile('/workspace/docs/readme.md', '# Hello');

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'docs/readme.md',
      fileSystem: fs,
      pathResolver,
      renderMarkdownFn: async (content) => '<h1>Hello</h1>',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdownHtml).toBe('<h1>Hello</h1>');
      expect(result.language).toBe('markdown');
    }
  });

  it('does not call renderMarkdownFn for non-markdown files', async () => {
    fs.setFile('/workspace/src/app.ts', 'const x = 1;');
    let called = false;

    const result = await readFileAction({
      worktreePath: '/workspace',
      filePath: 'src/app.ts',
      fileSystem: fs,
      pathResolver,
      renderMarkdownFn: async () => {
        called = true;
        return '<p>should not be called</p>';
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdownHtml).toBeUndefined();
    }
    expect(called).toBe(false);
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
