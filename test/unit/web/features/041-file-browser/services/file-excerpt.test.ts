/**
 * Plan recent-changes-feed T020 — `getFileExcerpt` security + content gating.
 *
 * Uses real `node:fs` via `NodeFileSystemAdapter` and the real
 * `PathResolverAdapter` against a temp dir — Constitution P4 honored
 * (no `vi.mock`, no own-domain internal mocks).
 *
 * Required test cases (per plan task row):
 *   - `.env` rejected
 *   - `secrets.json` rejected
 *   - valid markdown returns excerpt
 *   - valid TS file returns code + lang
 *   - path-traversal `../../etc/passwd` rejected
 *
 * Plus: full mode size cap, secrets sub-patterns, content-type rejections.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFileSystemAdapter } from '@chainglass/shared/adapters/node-filesystem.adapter';
import { PathResolverAdapter } from '@chainglass/shared/adapters/path-resolver.adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getFileExcerpt,
  isSecretsPath,
} from '../../../../../../apps/web/src/features/041-file-browser/services/file-excerpt';

describe('isSecretsPath', () => {
  it.each([
    // Reject
    ['.env', true],
    ['.env.local', true],
    ['.env.production', true],
    ['apps/web/.env', true],
    ['credentials.json', true],
    ['secret-keys/credentials', true],
    ['app.secret', true],
    ['config.secret.json', true],
    ['key.pem', true],
    ['certs/server.key', true],
    ['~/.ssh/id_rsa', true],
    ['~/.ssh/id_rsa.pub', true],
    ['.git/HEAD', true],
    ['repo/.git/config', true],
    // Pass through
    ['src/env-utils.ts', false],
    ['src/secrets.test.md', false], // .md extension is markdown; suspicious name still allowed because not .secret*
    ['docs/credentials-overview.md', false], // not 'credentials' as base name
    ['regular.ts', false],
    ['notes.md', false],
  ])('isSecretsPath(%s) === %s', (path, expected) => {
    expect(isSecretsPath(path)).toBe(expected);
  });
});

describe('getFileExcerpt — real fs + real path resolver', () => {
  let tmp: string;
  const fileSystem = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'file-excerpt-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns markdown excerpt with truncation applied', async () => {
    const md = `# Heading\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n`;
    writeFileSync(join(tmp, 'doc.md'), md);
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'doc.md',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('markdown');
    expect(result.mode).toBe('excerpt');
    expect(result.content).toContain('Heading');
    expect(result.content).toContain('First paragraph');
  });

  it('returns code excerpt with detected language', async () => {
    const ts = Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`).join('\n');
    writeFileSync(join(tmp, 'sample.ts'), ts);
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'sample.ts',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('code');
    if (result.kind !== 'code') return;
    expect(result.lang).toBeTruthy();
    // Excerpt mode caps at codeLines (default 12); should not include line 25.
    expect(result.content).toContain('const x0');
    expect(result.content).not.toContain('const x25');
  });

  it('returns full file in mode: full', async () => {
    const ts = `export const a = 1;\nexport const b = 2;\nexport const c = 3;\n`;
    writeFileSync(join(tmp, 'full.ts'), ts);
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'full.ts',
      fileSystem,
      pathResolver,
      mode: 'full',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('full');
    expect(result.content).toBe(ts);
  });

  it('rejects .env files even when they exist', async () => {
    writeFileSync(join(tmp, '.env'), 'API_KEY=secret-value');
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: '.env',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('forbidden');
  });

  it('rejects credentials-pattern files', async () => {
    mkdirSync(join(tmp, 'config'), { recursive: true });
    writeFileSync(join(tmp, 'config', 'credentials'), 'top-secret');
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'config/credentials',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('forbidden');
  });

  it('rejects path-traversal attempts (../../etc/passwd)', async () => {
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: '../../etc/passwd',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('security');
  });

  it('rejects binary content types (image)', async () => {
    writeFileSync(join(tmp, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'photo.png',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('forbidden');
  });

  it('rejects video and audio content types', async () => {
    writeFileSync(join(tmp, 'clip.mp4'), 'fake');
    writeFileSync(join(tmp, 'voice.mp3'), 'fake');
    const r1 = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'clip.mp4',
      fileSystem,
      pathResolver,
    });
    const r2 = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'voice.mp3',
      fileSystem,
      pathResolver,
    });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('rejects null-byte-containing files even when extension says text', async () => {
    writeFileSync(join(tmp, 'looks-like-text.ts'), 'console.log("hi")\x00binary-bytes');
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'looks-like-text.ts',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('forbidden');
  });

  it('returns not-found for paths that do not exist', async () => {
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'no-such-file.ts',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-found');
  });

  it('rejects directory paths', async () => {
    mkdirSync(join(tmp, 'subdir'), { recursive: true });
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'subdir',
      fileSystem,
      pathResolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-found');
  });

  it('rejects files exceeding 256KB in mode: full', async () => {
    const big = 'x'.repeat(257 * 1024); // > 256KB
    writeFileSync(join(tmp, 'big.ts'), big);
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'big.ts',
      fileSystem,
      pathResolver,
      mode: 'full',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('too-large');
  });

  it('does NOT reject 256KB-exceeding files in excerpt mode (excerpt is bounded by truncate caps anyway)', async () => {
    // 300KB markdown, excerpt mode should still succeed with truncated output.
    const big = '# Heading\n\n' + 'long line\n'.repeat(40_000);
    writeFileSync(join(tmp, 'big.md'), big);
    const result = await getFileExcerpt({
      worktreePath: tmp,
      filePath: 'big.md',
      fileSystem,
      pathResolver,
      mode: 'excerpt',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('markdown');
    // Truncated output is short.
    expect(result.content.length).toBeLessThan(2000);
  });
});
