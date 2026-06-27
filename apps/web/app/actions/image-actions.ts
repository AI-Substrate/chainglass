'use server';

/**
 * Image Editor Server Actions — saveEditedImage
 *
 * Public boundary for persisting edited image bytes. Resolves DI, validates the
 * trusted worktree root from the slug (never trusts client worktreePath alone),
 * rejects non-raster types defensively (AC-16), decodes the base64 payload to a
 * Buffer, and delegates to the pure `saveImageService` (Buffer + atomic write).
 *
 * Naming is owned server-side: 'edited-copy' derives `<base>-edited.<ext>`
 * (idempotent, GIF→PNG); 'overwrite' writes back to the original.
 *
 * Plan 086: In-browser Image Editor — T005
 * Finding 08; ADR-0004 (DI via getContainer), ADR-0008 (slug→worktree).
 */

import { requireAuth } from '@/features/063-login/lib/require-auth';
import { SHARED_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import {
  deriveEditedFilename,
  isRasterImageFilename,
} from '../../src/features/041-file-browser/services/image-filename';
import {
  type SaveImageResult,
  saveImageService,
} from '../../src/features/041-file-browser/services/save-image';
import { getContainer } from '../../src/lib/bootstrap-singleton';

export type SaveEditedImageResult = SaveImageResult | { ok: false; error: 'unsupported-type' };

/**
 * Persist edited image bytes.
 *
 * @param slug Workspace slug (resolves the trusted root).
 * @param worktreePath Client-supplied worktree path (verified against the slug).
 * @param filePath Workspace-relative path of the ORIGINAL image being edited.
 * @param payloadBase64 Base64-encoded image bytes from canvas.toBlob().
 * @param mode 'overwrite' (write original) | 'edited-copy' (write -edited sibling).
 * @param expectedMtime Baseline mtime for the overwrite conflict guard (ISO string).
 */
export async function saveEditedImage(
  slug: string,
  worktreePath: string,
  filePath: string,
  payloadBase64: string,
  mode: 'overwrite' | 'edited-copy',
  expectedMtime?: string
): Promise<SaveEditedImageResult> {
  await requireAuth();

  // Runtime guard: `mode` is only a compile-time union, but this is a public
  // server-action boundary. An invalid value must not fall through as an
  // unconditional overwrite (which would bypass the AC-3 mtime guard).
  if (mode !== 'overwrite' && mode !== 'edited-copy') {
    return { ok: false, error: 'unsupported-type' };
  }

  // Defense in depth: only raster images are editable/savable (AC-16).
  // For edited-copy the derived target is always raster (GIF→PNG), but the
  // source gate is the authoritative check.
  if (!isRasterImageFilename(filePath)) {
    return { ok: false, error: 'unsupported-type' };
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  // Resolve the trusted root from the slug — do not trust the client path alone.
  const info = await workspaceService.getInfo(slug);
  if (!info) {
    return { ok: false, error: 'security' };
  }
  // Fail CLOSED: a write must target a worktree we can verify against the slug.
  // Never silently fall back to the main root for an unknown/tampered path
  // (that could mutate the wrong checkout). The main root itself is valid.
  const knownWorktree = info.worktrees.find((w) => w.path === worktreePath)?.path;
  const trustedRoot = knownWorktree ?? (worktreePath === info.path ? info.path : null);
  if (!trustedRoot) {
    return { ok: false, error: 'security' };
  }

  // Server owns the destination naming.
  const targetPath = mode === 'edited-copy' ? deriveEditedFilename(filePath) : filePath;

  const content = Buffer.from(payloadBase64, 'base64');

  return saveImageService({
    worktreePath: trustedRoot,
    filePath: targetPath,
    content,
    mode,
    expectedMtime,
    fileSystem,
    pathResolver,
  });
}
