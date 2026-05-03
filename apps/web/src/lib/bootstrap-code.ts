/**
 * Plan 084 Phase 3 — web-side accessor for the bootstrap-code primitives.
 *
 * Renamed from the plan's `bootstrap.ts` because that path is already taken by
 * `apps/web/src/lib/bootstrap.ts` (DI/config bootstrap — see lines 1–3 of that
 * file). Phase 7 docs reflect the actual landed name.
 *
 * Wraps `ensureBootstrapCode` + `activeSigningSecret` from
 * `@chainglass/shared/auth-bootstrap-code` behind a single per-process cache so
 * proxy.ts, RootLayout `<BootstrapGate>`, and the verify route share one
 * source of truth and pay the file-IO cost exactly once per process.
 *
 * @module apps/web/src/lib/bootstrap-code
 */
import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  activeSigningSecret,
  ensureBootstrapCode,
  findWorkspaceRoot,
} from '@chainglass/shared/auth-bootstrap-code';

export interface BootstrapCodeAndKey {
  /** The active 14-char `XXXX-XXXX-XXXX` Crockford code. */
  readonly code: string;
  /**
   * Signing key from `activeSigningSecret`:
   *   - When `AUTH_SECRET` is set: raw `Buffer.from(AUTH_SECRET, 'utf-8')`
   *     (length matches input string — typically 32+ bytes; HMAC-SHA256
   *     accepts arbitrary key lengths, so this is fine).
   *   - When `AUTH_SECRET` is unset: 32-byte HKDF-SHA256(code).
   *
   * Phase 4 (terminal-WS) MUST NOT assume a fixed key length.
   */
  readonly key: Buffer;
}

let cached: BootstrapCodeAndKey | null = null;

/**
 * Returns the active bootstrap code + signing key.
 *
 * **Cwd contract**: Resolves the workspace root from `process.cwd()` via
 * `findWorkspaceRoot()` (walks up looking for `pnpm-workspace.yaml`,
 * `package.json` with a non-empty `workspaces` field, or `.git/`). The
 * resolved cwd is passed to both `ensureBootstrapCode` and
 * `activeSigningSecret`, so the same `.chainglass/bootstrap-code.json` file
 * is read regardless of which subdirectory `pnpm dev` / `next dev` was
 * launched from.
 *
 * **✅ Resolved by FX003 (2026-05-03)** — was a known gotcha during Plan 084
 * Phase 6 development: `pnpm dev` via turbo runs Next at `cwd=apps/web/`,
 * so the previous `process.cwd()` swap landed the active file at
 * `apps/web/.chainglass/bootstrap-code.json` instead of the workspace-root
 * file the popup tells operators to read. The walk-up helper unifies both
 * write-side (boot block) and read-side (this accessor) on a single
 * canonical location. See:
 *   - `docs/plans/084-random-enhancements-3/fixes/FX003-bootstrap-code-workspace-root-walkup.md`
 *   - `docs/how/auth/bootstrap-code-troubleshooting.md`
 *
 * **Cross-process key convergence (Phase 4)**: When the terminal-WS sidecar
 * lands, it MUST also call `findWorkspaceRoot(process.cwd())` before
 * `activeSigningSecret(cwd)` so both processes resolve the same workspace
 * root and derive identical HKDF keys.
 *
 * **Cache lifecycle**: Cache is process-scoped — survives within a single Node
 * process across many requests. Process restart (e.g., `pnpm dev` HMR full
 * restart, container redeploy) discards the cache. ESM HMR module reload
 * during dev re-evaluates this module and so resets the cache automatically —
 * no manual reset needed at dev time. To rotate the bootstrap code, write the
 * new file and restart the process; in-process rotation requires
 * `_resetForTests()`.
 */
export async function getBootstrapCodeAndKey(): Promise<BootstrapCodeAndKey> {
  if (cached !== null) return cached;
  const cwd = findWorkspaceRoot(process.cwd());
  let ensured;
  try {
    ensured = ensureBootstrapCode(cwd);
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[bootstrap-code] failed to read or generate ${BOOTSTRAP_CODE_FILE_PATH_REL} at cwd=${cwd}: ${original}`,
    );
  }
  const key = activeSigningSecret(cwd);
  cached = Object.freeze({ code: ensured.data.code, key });
  return cached;
}

/**
 * Reset the module-level cache. **Test-only.**
 * @internal
 */
export function _resetForTests(): void {
  cached = null;
}
