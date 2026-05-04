/**
 * File Excerpt Service — server-side text excerpt for the Recent Changes Feed.
 *
 * Returns a server-truncated excerpt (markdown or code) OR the full file
 * contents in `mode: 'full'` for the `copyFileContents` feed action (T025).
 *
 * Security gating (per validation Risk M1 — explicit):
 *   - Path-traversal blocked via `IPathResolver.resolvePath` → throws
 *     `PathSecurityError`, returned as `{ ok: false, error: 'security' }`.
 *   - Content-type gate: only `markdown` and `code` allowed. `binary`,
 *     `image`, `video`, `audio`, `pdf`, `html`, and unknown extensions
 *     rejected as `{ ok: false, error: 'forbidden' }`.
 *   - Secrets-pattern allow-list: dot-env, *.secret*, credentials,
 *     *.key/.pem, id_rsa, anything under .git/ — rejected even when
 *     extension would otherwise pass. See SECRETS_PATTERNS below.
 *   - Size limits: 256KB hard cap on `full` mode; excerpt mode reads the
 *     full file but truncates client-visible output via `truncateMarkdown`
 *     (markdown) or first-N-lines (code).
 *
 * Plan recent-changes-feed T020. Backed by `apps/web/app/actions/file-actions.ts`
 * `fetchFileExcerpt` server action wrapper.
 */

import { detectContentType, isBinaryExtension } from '@/lib/content-type-detection';
import { detectLanguage } from '@/lib/language-detection';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';
import { truncateMarkdown } from '../lib/truncate-markdown';
import { detectFeedItemKind } from '../lib/feed-item-kind';

export type FileExcerptMode = 'excerpt' | 'full';

export interface FileExcerptOptions {
  worktreePath: string;
  filePath: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
  mode?: FileExcerptMode;
  /** Excerpt mode markdown line cap (default 8 — feed setting `mdExcerptLines`). */
  mdLines?: number;
  /** Excerpt mode markdown char cap (default 600). */
  mdChars?: number;
  /** Excerpt mode code line cap (default 12). */
  codeLines?: number;
}

export type FileExcerptResult =
  | { ok: true; kind: 'markdown'; content: string; mode: FileExcerptMode }
  | { ok: true; kind: 'code'; content: string; lang: string; mode: FileExcerptMode }
  | {
      ok: false;
      error: 'security' | 'not-found' | 'forbidden' | 'too-large';
    };

const MAX_FULL_BYTES = 256 * 1024; // 256KB hard cap on `mode: 'full'`.

/** File-name patterns that must NEVER be returned regardless of extension/mime. */
const SECRETS_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)credentials(\..+)?$/i,
  /\.secret(\..+)?$/i,
  /\.key$/i,
  /\.pem$/i,
  /id_rsa(\.pub)?$/,
  /(^|\/)\.git\//,
];

/** True when the relative path matches a secrets-style pattern. */
export function isSecretsPath(relativePath: string): boolean {
  return SECRETS_PATTERNS.some((re) => re.test(relativePath));
}

export async function getFileExcerpt(
  options: FileExcerptOptions
): Promise<FileExcerptResult> {
  const {
    worktreePath,
    filePath,
    fileSystem,
    pathResolver,
    mode = 'excerpt',
    mdLines = 8,
    mdChars = 600,
    codeLines = 12,
  } = options;

  // Step 1 — secrets-pattern reject (BEFORE path resolution; catches
  // attempts that would have escaped resolution as well).
  if (isSecretsPath(filePath)) {
    return { ok: false, error: 'forbidden' };
  }

  // Step 2 — path-traversal guard via resolver.
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (err) {
    if (err instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw err;
  }

  // Step 3 — existence + directory guard.
  if (!(await fileSystem.exists(absolutePath))) {
    return { ok: false, error: 'not-found' };
  }
  const stats = await fileSystem.stat(absolutePath);
  if (stats.isDirectory) {
    return { ok: false, error: 'not-found' };
  }

  // Step 4 — content-type gate. Only markdown + code are allowed.
  const segs = filePath.split('/');
  const filename = segs[segs.length - 1] ?? filePath;
  const kind = detectFeedItemKind(filename);
  if (kind !== 'markdown' && kind !== 'code') {
    return { ok: false, error: 'forbidden' };
  }
  // Belt-and-braces: even if our kind detector said 'code' for an unknown
  // ext, double-check via the content-type detector that we're not handing
  // back a binary the kind table missed.
  if (isBinaryExtension(filename)) {
    return { ok: false, error: 'forbidden' };
  }
  const ct = detectContentType(filename);
  if (
    ct.category === 'image' ||
    ct.category === 'video' ||
    ct.category === 'audio' ||
    ct.category === 'pdf'
  ) {
    return { ok: false, error: 'forbidden' };
  }

  // Step 5 — size guard for full mode.
  if (mode === 'full' && stats.size > MAX_FULL_BYTES) {
    return { ok: false, error: 'too-large' };
  }

  // Step 6 — read.
  const raw = await fileSystem.readFile(absolutePath);

  // Step 7 — null-byte sniff (catches binary content with text-y extension).
  const sample = raw.slice(0, 8192);
  if (sample.includes('\x00')) {
    return { ok: false, error: 'forbidden' };
  }

  if (kind === 'markdown') {
    const content =
      mode === 'full' ? raw : truncateMarkdown(raw, { maxLines: mdLines, maxChars: mdChars });
    return { ok: true, kind: 'markdown', content, mode };
  }

  // Code: first-N-lines truncation in excerpt mode; full content in full mode.
  const lang = detectLanguage(filename);
  const content =
    mode === 'full' ? raw : raw.split('\n').slice(0, codeLines).join('\n');
  return { ok: true, kind: 'code', content, lang, mode };
}
