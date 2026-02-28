/**
 * File Actions Service — readFile + saveFile
 *
 * Secure file read/write with size limits, binary detection,
 * symlink escape prevention, and mtime conflict detection.
 *
 * Phase 4: File Browser — Plan 041
 * Finding 02: Symlink escape via realpath
 * Finding 06: Atomic write (tmp+rename) for save
 * Finding 09: 5MB size limit, null-byte binary detection
 */

import * as path from 'node:path';
import { detectContentType, isBinaryExtension } from '@/lib/content-type-detection';
import { detectLanguage } from '@/lib/language-detection';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ==================== Read File ====================

export type ReadFileResult =
  | {
      ok: true;
      isBinary: false;
      content: string;
      mtime: string;
      size: number;
      language: string;
      highlightedHtml: string;
      markdownHtml?: string;
    }
  | {
      ok: true;
      isBinary: true;
      contentType: string;
      mtime: string;
      size: number;
    }
  | { ok: false; error: 'file-too-large' | 'not-found' | 'security' };

export interface ReadFileOptions {
  worktreePath: string;
  filePath: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
  /** Server-side syntax highlighter — returns HTML string */
  highlightFn?: (code: string, lang: string) => Promise<string>;
  /** Server-side markdown renderer — returns HTML string with mermaid + syntax */
  renderMarkdownFn?: (content: string) => Promise<string>;
}

export async function readFileAction(options: ReadFileOptions): Promise<ReadFileResult> {
  const { worktreePath, filePath, fileSystem, pathResolver, highlightFn, renderMarkdownFn } =
    options;

  // Security: validate path
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Check file exists
  if (!(await fileSystem.exists(absolutePath))) {
    return { ok: false, error: 'not-found' };
  }

  // Security: symlink escape check via realpath
  try {
    const realPath = await fileSystem.realpath(absolutePath);
    // Separator-safe containment: must be exact root or true descendant
    const normalizedRoot = worktreePath.endsWith('/') ? worktreePath : `${worktreePath}/`;
    if (realPath !== worktreePath && !realPath.startsWith(normalizedRoot)) {
      return { ok: false, error: 'security' };
    }
  } catch {
    return { ok: false, error: 'not-found' };
  }

  // Stat for metadata
  const stats = await fileSystem.stat(absolutePath);

  // Guard: reject directory paths (e.g., trailing slash in URL ?file=dir/)
  if (stats.isDirectory) {
    return { ok: false, error: 'not-found' as const };
  }

  // Binary detection: extension-first (avoids reading binary content as UTF-8)
  // Must be BEFORE size check — binary files bypass the 5MB text limit
  const filename = path.basename(filePath);
  if (isBinaryExtension(filename)) {
    const { mimeType } = detectContentType(filename);
    return {
      ok: true,
      isBinary: true,
      contentType: mimeType,
      mtime: stats.mtime,
      size: stats.size,
    };
  }

  // Size check (text files only — binary files served via raw route)
  if (stats.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'file-too-large' };
  }

  // Read content
  const content = await fileSystem.readFile(absolutePath);

  // Binary detection fallback: null-byte in first 8KB (for unknown extensions)
  const sample = content.slice(0, 8192);
  if (sample.includes('\x00')) {
    const { mimeType } = detectContentType(filename);
    return {
      ok: true,
      isBinary: true,
      contentType: mimeType,
      mtime: stats.mtime,
      size: stats.size,
    };
  }

  const language = detectLanguage(path.basename(filePath));

  // Server-side syntax highlighting (D1, D4: cached with file data)
  let highlightedHtml = '';
  if (highlightFn) {
    try {
      highlightedHtml = await highlightFn(content, language);
    } catch {
      // Fall back to empty — preview will show raw text
    }
  }

  // Server-side markdown rendering (D2: reuse MarkdownServer pipeline)
  let markdownHtml: string | undefined;
  if (renderMarkdownFn && language === 'markdown') {
    try {
      markdownHtml = await renderMarkdownFn(content);
    } catch {
      // Fall back to undefined — preview will show highlightedHtml
    }
  }

  return {
    ok: true,
    isBinary: false,
    content,
    mtime: stats.mtime,
    size: stats.size,
    language,
    highlightedHtml,
    markdownHtml,
  };
}

// ==================== Save File ====================

export type SaveFileResult =
  | { ok: true; newMtime: string }
  | { ok: false; error: 'conflict' | 'security'; serverMtime?: string };

export interface SaveFileOptions {
  worktreePath: string;
  filePath: string;
  content: string;
  expectedMtime?: string;
  force?: boolean;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export async function saveFileAction(options: SaveFileOptions): Promise<SaveFileResult> {
  const { worktreePath, filePath, content, expectedMtime, force, fileSystem, pathResolver } =
    options;

  // Security: validate path
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Mtime conflict check (unless force)
  if (expectedMtime && !force) {
    try {
      const stats = await fileSystem.stat(absolutePath);
      if (stats.mtime !== expectedMtime) {
        return { ok: false, error: 'conflict', serverMtime: stats.mtime };
      }
    } catch {
      // File doesn't exist yet — allow creation
    }
  }

  // Atomic write: write to tmp, then rename
  const tmpPath = `${absolutePath}.tmp`;
  await fileSystem.writeFile(tmpPath, content);
  await fileSystem.rename(tmpPath, absolutePath);

  // Return new mtime
  const newStats = await fileSystem.stat(absolutePath);
  return { ok: true, newMtime: newStats.mtime };
}
