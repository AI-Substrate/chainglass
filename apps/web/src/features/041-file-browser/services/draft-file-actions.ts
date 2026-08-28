/**
 * draftFileService — the autosave draft store.
 *
 * Autosave writes a DRAFT, never the target. The target is written only by an explicit
 * save (or by the navigate-away save, which is an explicit act by another name) through
 * the existing `saveFileAction`. This service owns the draft side of that split: where a
 * draft lives, how it is written, read, deleted and swept.
 *
 * WHERE DRAFTS LIVE, AND WHY IT IS NOT NEGOTIABLE (plan 087 Q1, resolved from code):
 *
 *   `<worktree>/.chainglass/drafts/<worktree-relative path>.json`
 *
 * The central watcher subscribes its DATA watchers to exactly two roots per worktree —
 * `.chainglass/data` and `.chainglass/units` — with no ignore list
 * (`central-watcher.service.ts:246`, and `:390-391` on rescan). Its SOURCE watcher adds
 * the worktree root but ignores any path with a `.chainglass` segment
 * (`source-watcher.constants.ts:30`), dropped before emit
 * (`native-file-watcher.adapter.ts:95`). So `.chainglass/drafts/` is watched by NOTHING,
 * and an autosave cannot produce a tree refresh (AC-2) — by construction, not by
 * downstream filtering.
 *
 * Do not "tidy" these under `.chainglass/data/drafts/`. That subtree IS watched, and
 * `WorkUnitCatalogWatcherAdapter`'s unanchored `/units\/([^/]+)\/(unit\.yaml|templates\/.+)$/`
 * (`workunit-catalog-watcher.adapter.ts:23`) matches a mirrored draft path such as
 * `.../drafts/x/units/y/templates/z.md.json`, firing a spurious catalog event per
 * keystroke-pause.
 *
 * ATOMICITY: tmp→rename, with the tmp INSIDE the drafts tree. `saveFileAction` writes its
 * tmp beside the target (`file-actions.ts:256`) where `.tmp` is not in the source
 * watcher's ignore list; the draft store must not copy that.
 *
 * Plan 087: Auto-save Editing — AC-1, AC-2, AC-3, AC-5, AC-7, AC-8, AC-11
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';

/** Directory under the worktree that holds drafts. Outside every watched root. */
const DRAFTS_DIR = '.chainglass/drafts';

/**
 * A single autosave draft for one edited file, stored as JSON at
 * `<worktree>/.chainglass/drafts/<relativeFilePath>.json`.
 */
export interface AutosaveDraft {
  schemaVersion: 1;
  /** Worktree-relative path of the target file (verification + reverse lookup). */
  filePath: string;
  /**
   * Full editor content. For rich mode this is the ASSEMBLED markdown
   * (frontmatter + body) — identical to what an explicit save would write.
   */
  content: string;
  /**
   * ISO mtime of the TARGET file when the editing session loaded it. Used to warn that
   * the disk moved under the draft; advisory only, never a write guard.
   */
  editorMtime: string;
  /** ISO timestamp of this autosave write (staleness + sweep). */
  savedAt: string;
}

interface DraftPathOptions {
  worktreePath: string;
  filePath: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export interface SaveDraftOptions extends DraftPathOptions {
  content: string;
  editorMtime: string;
}

export type SaveDraftResult = { ok: true } | { ok: false; error: 'security' | 'write-failed' };

export type ReadDraftResult =
  | { ok: true; draft: AutosaveDraft | null }
  | { ok: false; error: 'security' };

export type DeleteDraftResult = { ok: true } | { ok: false; error: 'security' };

export interface SweepDraftsOptions {
  worktreePath: string;
  /** Drafts whose `savedAt` is older than this are deleted. */
  olderThanMs: number;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export type SweepDraftsResult = { ok: true; deleted: number };

/**
 * Absolute path of the draft mirroring `relFilePath`.
 *
 * Pure and exported because this single expression is what keeps drafts out of every
 * watched subtree — it is tested as a contract, not as an implementation detail.
 */
export function draftPathFor(worktreeRoot: string, relFilePath: string): string {
  return `${worktreeRoot}/${DRAFTS_DIR}/${relFilePath}.json`;
}

/**
 * Validate the TARGET path, then derive the draft path from the *resolved* result.
 *
 * One check, and it is enough:
 *  - `resolvePath(worktreePath, filePath)` rejects absolute paths and anything that
 *    escapes the worktree, before any I/O.
 *  - The relative path is then re-derived from that *resolved* absolute path — never
 *    from the raw `filePath` argument — against the same `normalize`d base the resolver
 *    checked against. `resolvePath` guarantees the result sits under that base, so the
 *    derived `rel` cannot begin with `..` and the join below cannot leave the drafts
 *    root.
 *
 * An earlier draft of this function ran a second `resolvePath` against the drafts root.
 * It was removed on evidence: mutating it away left the whole suite green, because no
 * input can reach it — `rel` is already proven clean. A guard that cannot fail is not a
 * guard, and keeping one invites the next reader to trust it.
 *
 * Returns `null` on a security failure; callers translate that to `error: 'security'`.
 */
function resolveDraftPath(
  worktreePath: string,
  filePath: string,
  pathResolver: IPathResolver
): string | null {
  try {
    const absoluteTarget = pathResolver.resolvePath(worktreePath, filePath);
    const rel = pathResolver.relative(pathResolver.normalize(worktreePath), absoluteTarget);
    if (rel.length === 0) return null;
    return draftPathFor(pathResolver.normalize(worktreePath), rel);
  } catch (e) {
    if (e instanceof PathSecurityError) return null;
    throw e;
  }
}

/**
 * Write (or overwrite) the draft for one file, atomically.
 *
 * Never touches the target: the target's mtime must not move on autosave (AC-1).
 */
export async function saveDraftFile(options: SaveDraftOptions): Promise<SaveDraftResult> {
  const { worktreePath, filePath, content, editorMtime, fileSystem, pathResolver } = options;

  const draftPath = resolveDraftPath(worktreePath, filePath, pathResolver);
  if (draftPath === null) return { ok: false, error: 'security' };

  const draft: AutosaveDraft = {
    schemaVersion: 1,
    filePath,
    content,
    editorMtime,
    savedAt: new Date().toISOString(),
  };

  const tmpPath = `${draftPath}.tmp`;
  try {
    await fileSystem.mkdir(pathResolver.dirname(draftPath), { recursive: true });
    await fileSystem.writeFile(tmpPath, JSON.stringify(draft));
    await fileSystem.rename(tmpPath, draftPath);
  } catch {
    return { ok: false, error: 'write-failed' };
  }

  return { ok: true };
}

/**
 * Read the draft for one file, if any.
 *
 * "No draft" is the common case and is `{ ok: true, draft: null }`, not an error — every
 * file load calls this. A corrupt draft is treated as no draft AND removed: a draft that
 * cannot be parsed would otherwise wedge every future load of that file, and it can never
 * age out of the sweep because its `savedAt` is unreadable.
 */
export async function readDraftFile(options: DraftPathOptions): Promise<ReadDraftResult> {
  const { worktreePath, filePath, fileSystem, pathResolver } = options;

  const draftPath = resolveDraftPath(worktreePath, filePath, pathResolver);
  if (draftPath === null) return { ok: false, error: 'security' };

  if (!(await fileSystem.exists(draftPath))) return { ok: true, draft: null };

  let raw: string;
  try {
    raw = await fileSystem.readFile(draftPath);
  } catch {
    return { ok: true, draft: null };
  }

  try {
    return { ok: true, draft: JSON.parse(raw) as AutosaveDraft };
  } catch {
    await fileSystem.unlink(draftPath).catch(() => undefined);
    return { ok: true, draft: null };
  }
}

/**
 * Delete the draft for one file.
 *
 * A missing draft is success: every explicit save calls this, and most saves have no
 * draft to clear.
 */
export async function deleteDraftFile(options: DraftPathOptions): Promise<DeleteDraftResult> {
  const { worktreePath, filePath, fileSystem, pathResolver } = options;

  const draftPath = resolveDraftPath(worktreePath, filePath, pathResolver);
  if (draftPath === null) return { ok: false, error: 'security' };

  await fileSystem.unlink(draftPath).catch(() => undefined);
  return { ok: true };
}

/**
 * Delete drafts older than the retention window (AC-11, 30 days at the callsite).
 *
 * A draft whose `savedAt` cannot be read is deleted rather than kept: it can never age
 * out otherwise, so keeping it means keeping it forever.
 */
export async function sweepDrafts(options: SweepDraftsOptions): Promise<SweepDraftsResult> {
  const { worktreePath, olderThanMs, fileSystem, pathResolver } = options;

  const draftsRoot = pathResolver.join(worktreePath, DRAFTS_DIR);
  if (!(await fileSystem.exists(draftsRoot))) return { ok: true, deleted: 0 };

  const cutoff = Date.now() - olderThanMs;
  let deleted = 0;

  const walk = async (dir: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await fileSystem.readDir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = pathResolver.join(dir, entry);
      let isDirectory = false;
      try {
        isDirectory = (await fileSystem.stat(full)).isDirectory;
      } catch {
        continue;
      }

      if (isDirectory) {
        await walk(full);
        continue;
      }

      if (!entry.endsWith('.json')) continue;

      let expired = true;
      try {
        const draft = JSON.parse(await fileSystem.readFile(full)) as AutosaveDraft;
        const savedAt = Date.parse(draft.savedAt);
        expired = Number.isNaN(savedAt) || savedAt < cutoff;
      } catch {
        // Unreadable or unparseable — it can never age out, so it goes now.
        expired = true;
      }

      if (expired) {
        await fileSystem.unlink(full).catch(() => undefined);
        deleted += 1;
      }
    }
  };

  await walk(draftsRoot);
  return { ok: true, deleted };
}
