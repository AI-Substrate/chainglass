/**
 * Walk up from `startDir` to find the workspace root.
 *
 * Plan 084 FX003. Closes the cwd-divergence gotcha where `pnpm dev` runs
 * Next at `cwd=apps/web/` and the active `.chainglass/bootstrap-code.json`
 * lands under `apps/web/`, not the workspace root the popup mentions.
 *
 * Marker priority (first match wins):
 *   1. `pnpm-workspace.yaml`        — pnpm monorepo root (most authoritative)
 *   2. `package.json` with non-empty `workspaces` field — npm/yarn workspaces
 *   3. `.git/`                      — git repository root (fallback)
 *
 * Falls back to the normalized `startDir` if no marker is found before the
 * filesystem root. Errors during fs traversal (parse failures, EACCES on
 * stat, malformed JSON) are treated as "no marker at this level" and the
 * walk continues — the helper never throws on filesystem inspection
 * failures, so it can be called from boot-critical code paths
 * (`apps/web/instrumentation.ts`).
 *
 * Cache: per-process `Map<string, string>` keyed by `path.resolve(startDir)`
 * so that callers passing `'apps/web'` vs `'/abs/.../apps/web'` vs
 * `'/abs/.../apps/web/'` share a single cache entry. Use
 * `_resetWorkspaceRootCacheForTests()` to invalidate between test cases or
 * to manually re-resolve after fs changes.
 *
 * Implementation Requirements (from validate-v2 pass):
 *   R1: cache key normalized via `path.resolve(startDir)`
 *   R2: try/catch around fs reads + JSON.parse — continue walking on error
 *   R3: `workspaces` truthy = non-empty array OR object with non-empty `packages`
 *   R4: cross-platform termination via `path.parse(start).root`
 *
 * Windows note: terminates correctly via `path.parse().root` but is not
 * exercised in CI (project is macOS/Linux-first). Helper does not call
 * `realpathSync` — symlink-routed callers may hold separate cache entries
 * for the symlink path vs realpath. Avoid symlinking the workspace if that
 * matters; or call `realpathSync(startDir)` on the caller side first.
 *
 * @module @chainglass/shared/auth-bootstrap-code/workspace-root
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

const cache = new Map<string, string>();

/**
 * Walk up from `startDir` looking for a workspace-root marker.
 *
 * Returns the first ancestor directory containing `pnpm-workspace.yaml`,
 * `package.json` with a non-empty `workspaces` field, or `.git/`. Falls
 * back to the normalized `startDir` if no marker is reached before the
 * filesystem root.
 *
 * Result is cached per-process keyed by the normalized `startDir`.
 */
export function findWorkspaceRoot(startDir: string): string {
  const normalizedStart = resolve(startDir);
  const cached = cache.get(normalizedStart);
  if (cached !== undefined) return cached;

  const fsRoot = parse(normalizedStart).root;
  let current = normalizedStart;
  while (true) {
    if (hasWorkspaceMarker(current)) {
      cache.set(normalizedStart, current);
      return current;
    }
    if (current === fsRoot) break;
    const parent = dirname(current);
    if (parent === current) break; // safety net for any edge cases
    current = parent;
  }

  cache.set(normalizedStart, normalizedStart);
  return normalizedStart;
}

/**
 * Test-only — clears the cache between cases. Production code MUST NOT
 * import this.
 *
 * @internal
 */
export function _resetWorkspaceRootCacheForTests(): void {
  cache.clear();
}

function hasWorkspaceMarker(dir: string): boolean {
  if (safeExists(join(dir, 'pnpm-workspace.yaml'))) return true;
  const pkgPath = join(dir, 'package.json');
  if (safeExists(pkgPath)) {
    let raw: string | null = null;
    try {
      raw = readFileSync(pkgPath, 'utf-8');
    } catch {
      raw = null;
    }
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (hasWorkspacesField(parsed)) return true;
      } catch {
        // Malformed JSON — skip this level and continue walking.
      }
    }
  }
  if (safeExists(join(dir, '.git'))) return true;
  return false;
}

function safeExists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function hasWorkspacesField(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const ws = (parsed as Record<string, unknown>).workspaces;
  if (Array.isArray(ws)) return ws.length > 0;
  if (typeof ws === 'object' && ws !== null) {
    const packages = (ws as Record<string, unknown>).packages;
    if (Array.isArray(packages)) return packages.length > 0;
  }
  return false;
}
