/**
 * Draft server actions — the autosave draft store's public surface.
 *
 * Autosave writes here and ONLY here; the target file is written by `saveFile`
 * (app/actions/file-actions.ts) on an explicit save. See
 * `src/features/041-file-browser/services/draft-file-actions.ts` for why drafts live at
 * `<worktree>/.chainglass/drafts/` and why that location is load-bearing (plan 087 Q1).
 *
 * SECURITY POSTURE (AC-8), and it is deliberately stricter than the neighbouring
 * file-browser actions:
 *
 *   1. `requireAuth()` — who is calling.
 *   2. `resolveValidatedWorktreePath(slug, worktreePath)` — WHERE they may point. The
 *      client supplies `worktreePath`, so without this the sandbox root is
 *      attacker-chosen and `resolvePath` merely proves `filePath` sits inside whatever
 *      root was sent.
 *   3. `resolvePath(worktreePath, filePath)` inside the service — before any I/O.
 *
 * `saveFile` / `readFile` currently perform (1) and (3) but NOT (2) — they accept a
 * `slug` and never read it. That is a live gap in shipped code, filed as its own record
 * at `docs/plans/041-file-browser/fixes/FX003-worktree-path-not-validated.md`, and it is
 * deliberately not fixed here: it belongs to the file-browser fix ledger, not to the
 * autosave plan. New actions meet the bar from day one.
 *
 * Plan 087: Auto-save Editing — AC-1, AC-3, AC-8, AC-11
 */

'use server';

import { requireAuth } from '@/features/063-login/lib/require-auth';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import {
  type DeleteDraftResult,
  type ReadDraftResult,
  type SaveDraftResult,
  deleteDraftFile,
  readDraftFile,
  saveDraftFile,
  sweepDrafts,
} from '../../src/features/041-file-browser/services/draft-file-actions';
import { getContainer } from '../../src/lib/bootstrap-singleton';
// FX003-2 will promote this helper out of the workflow-execution route folder; until then
// this imports the single existing definition rather than making a second copy.
import { resolveValidatedWorktreePath } from '../api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree';

export type { AutosaveDraft } from '../../src/features/041-file-browser/services/draft-file-actions';

/** Retention window for the session-start sweep (AC-11). */
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function resolveDeps(): { fileSystem: IFileSystem; pathResolver: IPathResolver } {
  const container = getContainer();
  return {
    fileSystem: container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
    pathResolver: container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
  };
}

/**
 * Persist the in-progress editor buffer to this file's draft. Never touches the target.
 */
export async function saveDraft(
  slug: string,
  worktreePath: string,
  filePath: string,
  content: string,
  editorMtime: string
): Promise<SaveDraftResult> {
  await requireAuth();

  const validated = await resolveValidatedWorktreePath(slug, worktreePath);
  if (validated === null) return { ok: false, error: 'security' };

  return saveDraftFile({
    worktreePath: validated,
    filePath,
    content,
    editorMtime,
    ...resolveDeps(),
  });
}

/**
 * Read this file's draft, if one survived a previous session.
 *
 * `{ ok: true, draft: null }` is the overwhelmingly common answer and is not an error.
 */
export async function readDraft(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<ReadDraftResult> {
  await requireAuth();

  const validated = await resolveValidatedWorktreePath(slug, worktreePath);
  if (validated === null) return { ok: false, error: 'security' };

  return readDraftFile({ worktreePath: validated, filePath, ...resolveDeps() });
}

/**
 * Drop this file's draft. Called on explicit-save success and on Discard — never on a
 * save conflict, where the user's autosaved work must survive the conflict dialog.
 */
export async function deleteDraft(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<DeleteDraftResult> {
  await requireAuth();

  const validated = await resolveValidatedWorktreePath(slug, worktreePath);
  if (validated === null) return { ok: false, error: 'security' };

  return deleteDraftFile({ worktreePath: validated, filePath, ...resolveDeps() });
}

/**
 * Delete drafts older than the 30-day retention window (AC-11).
 *
 * Called once per worktree at session start. Returns the count for logging; callers
 * treat failure as uninteresting — a sweep that does not run costs disk, not data.
 */
export async function sweepStaleDrafts(
  slug: string,
  worktreePath: string
): Promise<{ ok: true; deleted: number } | { ok: false; error: 'security' }> {
  await requireAuth();

  const validated = await resolveValidatedWorktreePath(slug, worktreePath);
  if (validated === null) return { ok: false, error: 'security' };

  return sweepDrafts({
    worktreePath: validated,
    olderThanMs: DRAFT_RETENTION_MS,
    ...resolveDeps(),
  });
}
