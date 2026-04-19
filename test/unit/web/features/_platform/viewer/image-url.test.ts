/**
 * resolveImageUrl Tests
 *
 * Covers the shared image URL resolver extracted from markdown-preview.tsx
 * into `_platform/viewer/lib/image-url.ts`. Rich mode and Preview mode
 * MUST produce identical image src values — these tests pin the contract.
 *
 * Constitution §7: no mocks, no spies — real string inputs only.
 */

import { describe, expect, it } from 'vitest';
import { resolveImageUrl } from '../../../../../../apps/web/src/features/_platform/viewer/lib/image-url';

const BASE_URL = '/api/workspaces/ws/files/raw?worktree=main';

describe('resolveImageUrl', () => {
  it('returns the rewritten raw-file URL for a sibling relative path', () => {
    /*
    Test Doc:
    - Why: The most common case — `![alt](./foo.png)` in a markdown file must route through the raw-file API
    - Contract: relative `./foo.png` in a file at `docs/a/b.md` resolves to `${base}&file=docs/a/foo.png`
    - Usage Notes: rawFileBaseUrl is expected to already include a trailing query param; resolver appends `&file=…`
    - Quality Contribution: Catches regressions in the directory-walk logic
    */
    const result = resolveImageUrl({
      src: './foo.png',
      currentFilePath: 'docs/a/b.md',
      rawFileBaseUrl: BASE_URL,
    });

    expect(result).toBe(`${BASE_URL}&file=${encodeURIComponent('docs/a/foo.png')}`);
  });

  it('returns null for an absolute http URL', () => {
    /*
    Test Doc:
    - Why: External images must render as-is; the resolver must not rewrite them
    - Contract: http:// and https:// inputs return null so the caller keeps the original src
    */
    const result = resolveImageUrl({
      src: 'http://example.com/cat.png',
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('returns null for an absolute https URL', () => {
    const result = resolveImageUrl({
      src: 'https://example.com/cat.png',
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('returns null for a data: URL', () => {
    /*
    Test Doc:
    - Why: Inline base64 images are already self-contained and must not be rewritten
    - Contract: data:image/png;base64,… returns null
    */
    const result = resolveImageUrl({
      src: 'data:image/png;base64,AAAA',
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('returns null for a protocol-relative URL', () => {
    const result = resolveImageUrl({
      src: '//cdn.example.com/cat.png',
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('walks .. segments when resolving a parent-directory path', () => {
    /*
    Test Doc:
    - Why: `![alt](../assets/x.png)` in `docs/guides/a.md` must resolve to `docs/assets/x.png`
    - Contract: the path walker pops one segment per `..` token and ignores `.` tokens
    */
    const result = resolveImageUrl({
      src: '../assets/x.png',
      currentFilePath: 'docs/guides/a.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBe(`${BASE_URL}&file=${encodeURIComponent('docs/assets/x.png')}`);
  });

  it('walks multiple .. segments correctly', () => {
    const result = resolveImageUrl({
      src: '../../assets/x.png',
      currentFilePath: 'docs/guides/nested/a.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBe(`${BASE_URL}&file=${encodeURIComponent('docs/assets/x.png')}`);
  });

  it('returns null when rawFileBaseUrl is missing', () => {
    /*
    Test Doc:
    - Why: Without a raw-file endpoint to route through, the caller must keep the original src
    - Contract: undefined rawFileBaseUrl → null (resolver has no way to build a URL)
    */
    const result = resolveImageUrl({
      src: './foo.png',
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: undefined,
    });
    expect(result).toBeNull();
  });

  it('returns null when currentFilePath is missing', () => {
    const result = resolveImageUrl({
      src: './foo.png',
      currentFilePath: undefined,
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('returns null when src is missing', () => {
    /*
    Test Doc:
    - Why: Malformed markdown like `![alt]()` yields undefined src; resolver must not throw
    - Contract: undefined src → null (fault tolerance)
    */
    const result = resolveImageUrl({
      src: undefined,
      currentFilePath: 'docs/readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBeNull();
  });

  it('handles files at the repo root (no slash in currentFilePath)', () => {
    /*
    Test Doc:
    - Why: README.md at workspace root has no parent directory; resolver must treat currentDir as empty
    - Contract: root-level `readme.md` + `./foo.png` resolves to `foo.png`
    */
    const result = resolveImageUrl({
      src: './foo.png',
      currentFilePath: 'readme.md',
      rawFileBaseUrl: BASE_URL,
    });
    expect(result).toBe(`${BASE_URL}&file=${encodeURIComponent('foo.png')}`);
  });
});
