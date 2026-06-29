/**
 * saveImageService — Buffer-safe, atomic image save.
 *
 * Modelled on `uploadFileService` (atomic tmp→rename, IPathResolver security)
 * and the mtime-conflict logic in `saveFileAction`. CRITICAL: image bytes are
 * written as a Buffer — never via the string-only `saveFileAction`, which
 * corrupts binary content (findings 01/02).
 *
 * Two modes:
 *  - 'overwrite'   — write back to the original path. If `expectedMtime` is
 *                    supplied, halt with `conflict` when the on-disk mtime has
 *                    drifted (someone edited the file since load). Omitting
 *                    `expectedMtime` is the explicit "overwrite anyway" path.
 *  - 'edited-copy' — write the caller-derived `<base>-edited.<ext>` sibling
 *                    unconditionally (Save as new always replaces — AC-4).
 *
 * Plan 086: In-browser Image Editor — T004
 * AC-3, AC-4, AC-8, AC-9, AC-13
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { FileSystemError, PathSecurityError } from '@chainglass/shared';

export interface SaveImageOptions {
  worktreePath: string;
  /** Workspace-relative destination path (already `-edited`-derived for edited-copy). */
  filePath: string;
  content: Buffer;
  mode: 'overwrite' | 'edited-copy';
  /** Only consulted in 'overwrite' mode. ISO-8601 string (FileStat.mtime). */
  expectedMtime?: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export type SaveImageResult =
  | { ok: true; savedPath: string; newMtime: string }
  | { ok: false; error: 'conflict' | 'security' | 'write-failed'; serverMtime?: string };

export async function saveImageService(options: SaveImageOptions): Promise<SaveImageResult> {
  const { worktreePath, filePath, content, mode, expectedMtime, fileSystem, pathResolver } =
    options;

  // Security: validate + resolve the destination path before any I/O.
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Mtime conflict guard — overwrite mode only, and only when a baseline was
  // captured. Save-as-new (edited-copy) always replaces unconditionally.
  if (mode === 'overwrite' && expectedMtime) {
    try {
      const stats = await fileSystem.stat(absolutePath);
      if (stats.mtime !== expectedMtime) {
        return { ok: false, error: 'conflict', serverMtime: stats.mtime };
      }
    } catch (e) {
      // ONLY a missing file is safe to ignore (first write / creation). Any
      // other stat error (permission, transient I/O) must not silently bypass
      // the conflict guard — surface it as a typed failure (AC-13).
      if (!(e instanceof FileSystemError && e.code === 'ENOENT')) {
        return { ok: false, error: 'write-failed' };
      }
    }
  }

  // Atomic write: tmp → rename. Any failure is reported as write-failed so the
  // UI can retain strokes and offer retry (AC-13).
  const tmpPath = `${absolutePath}.tmp`;
  try {
    await fileSystem.writeFile(tmpPath, content);
    await fileSystem.rename(tmpPath, absolutePath);
  } catch {
    return { ok: false, error: 'write-failed' };
  }

  // The bytes are written; read back the new mtime. If even that fails we
  // still succeeded — return an empty baseline rather than throwing out of the
  // typed result (AC-13).
  try {
    const newStats = await fileSystem.stat(absolutePath);
    return { ok: true, savedPath: filePath, newMtime: newStats.mtime };
  } catch {
    return { ok: true, savedPath: filePath, newMtime: '' };
  }
}
