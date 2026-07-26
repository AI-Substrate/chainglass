/**
 * Workspace containment, browser-safe — Plan 089 Phase 2 (T002).
 *
 * ## Why this exists at all
 *
 * `fleet-delta` is broadcast **globally** on the one shared `pij` mux channel: the same bytes fan out
 * to every tab, and tabs sit in different workspaces, so the broadcast cannot be pre-scoped. Filtering
 * on the client is therefore a designed consequence of the single-channel ruling, not a workaround —
 * and it means the containment rule the server applies to snapshots must exist a second time, in the
 * browser, where `node:path` does not.
 *
 * ## Why it is not `startsWith`
 *
 * `/repo-2` is not inside `/repo`, but a prefix test says it is — and sibling-with-shared-prefix is
 * the NORMAL layout here, because that is how worktrees are named. A prefix test would show another
 * repo's seats as this repo's: plausible, wrong, and silent. The comparison is segment-aware.
 *
 * ## Its one obligation
 *
 * This must agree with `server/join.ts`'s `isFolderInWorkspace` on every input, forever. Two
 * implementations of one rule can drift, so the agreement is not asserted by inspection: the suite
 * runs both over the same hazard table and fails the moment they disagree
 * (`test/unit/web/pij/folder-containment.test.ts`).
 *
 * POSIX separators only — the pij store records absolute POSIX `folder` paths, and the server side
 * resolves against the same.
 */

/**
 * Lexically normalise an absolute POSIX path: collapse repeated separators, drop `.`, resolve `..`,
 * and strip the trailing separator. Purely textual, exactly like `node:path`'s `resolve` on an input
 * that is already absolute — no filesystem, no symlink resolution, no case folding.
 */
export function normalizeFolderPath(path: string): string {
  const absolute = path.startsWith('/');
  const resolved: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // At the root, `..` is the root — the same place `path.resolve('/', '..')` lands.
      if (resolved.length > 0 && resolved.at(-1) !== '..') resolved.pop();
      else if (!absolute) resolved.push('..');
      continue;
    }
    resolved.push(segment);
  }

  const joined = resolved.join('/');
  return absolute ? `/${joined}` : joined;
}

/**
 * Is `folder` the workspace itself, or inside it?
 *
 * Mirrors `isFolderInWorkspace` (`server/join.ts`): an empty side is never a match — an absent folder
 * must not silently belong to whatever workspace happens to be open.
 */
export function isFolderInWorkspacePath(folder: string, workspacePath: string): boolean {
  if (!folder || !workspacePath) return false;
  const normalizedFolder = normalizeFolderPath(folder);
  const normalizedWorkspace = normalizeFolderPath(workspacePath);
  if (normalizedFolder === normalizedWorkspace) return true;
  const prefix = normalizedWorkspace.endsWith('/')
    ? normalizedWorkspace
    : `${normalizedWorkspace}/`;
  return normalizedFolder.startsWith(prefix);
}
