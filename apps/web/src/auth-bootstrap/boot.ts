/**
 * Plan 084 Phase 2 — pure helpers wired into `apps/web/instrumentation.ts`.
 *
 * - `checkBootstrapMisconfiguration` decides whether the boot can proceed.
 *   Pure (env in → result out); no side effects. The action (logging, exit)
 *   lives in instrumentation.ts so this helper is fully testable.
 * - `writeBootstrapCodeOnBoot` wraps Phase 1's `ensureBootstrapCode` with a
 *   single log line per outcome. NEVER logs the code value.
 *
 * Validation contract (post `/validate-v2`):
 *   - Whitespace-only `AUTH_SECRET` is treated as unset.
 *   - The case-sensitive literal `'true'` (only) disables GitHub OAuth on
 *     either of `DISABLE_AUTH` / `DISABLE_GITHUB_OAUTH`.
 *   - Phase 5 owns the `DISABLE_AUTH → DISABLE_GITHUB_OAUTH` rename and
 *     the deprecation warning. Phase 2 reads both names defensively.
 *   - AUTH_SECRET strength validation (placeholder detection) is OUT OF
 *     SCOPE — operator responsibility per spec.
 *
 * Log line contract (Phase 7 docs and AC-22 audits depend on this):
 *   - `[bootstrap-code] generated new code at <abs-path>`
 *   - `[bootstrap-code] active code at <abs-path>`
 *   - `[bootstrap-code] FATAL: <reason>` (emitted from instrumentation.ts, not here)
 */
import {
  type EnsureResult,
  ensureBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';

export type MisconfigurationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Returns `{ ok: true }` when boot can proceed safely, otherwise
 * `{ ok: false, reason }` with an operator-actionable explanation.
 *
 * Boot is misconfigured when GitHub OAuth is on (neither disable flag is the
 * literal string `'true'`) AND `AUTH_SECRET` is unset, empty, or whitespace-
 * only. In that combination NextAuth would silently degrade and the terminal
 * sidecar would fall back to the HKDF key derived from the bootstrap-code
 * file — surprising behaviour for an operator who set up GitHub OAuth on
 * purpose. Failing fast is the spec contract (AC-20).
 *
 * Either of `DISABLE_AUTH` or `DISABLE_GITHUB_OAUTH` set to literal `'true'`
 * (case-sensitive; values like `'1'`, `'TRUE'`, `'false'` are NOT treated as
 * "disabled") puts boot on the supported "GitHub OAuth off" path, where
 * `AUTH_SECRET` is optional. Phase 5 owns formalizing the rename and the
 * deprecation warning.
 */
export function checkBootstrapMisconfiguration(
  env: NodeJS.ProcessEnv,
): MisconfigurationResult {
  const githubOauthOn =
    env.DISABLE_AUTH !== 'true' && env.DISABLE_GITHUB_OAUTH !== 'true';
  const authSecretSet = (env.AUTH_SECRET ?? '').trim().length > 0;

  if (githubOauthOn && !authSecretSet) {
    return {
      ok: false,
      reason:
        'GitHub OAuth is enabled but AUTH_SECRET is unset (or empty/whitespace-only). ' +
        'Set AUTH_SECRET in .env.local, or set DISABLE_GITHUB_OAUTH=true to disable GitHub OAuth.',
    };
  }
  return { ok: true };
}

/**
 * Idempotently ensures the bootstrap-code file exists under `cwd/.chainglass/`,
 * logs one line, and returns Phase 1's `EnsureResult`. The log line never
 * contains the code value.
 */
export async function writeBootstrapCodeOnBoot(
  cwd: string,
  log: (message: string) => void = console.log,
): Promise<EnsureResult> {
  const result = ensureBootstrapCode(cwd);
  const verb = result.generated ? 'generated new code' : 'active code';
  log(`[bootstrap-code] ${verb} at ${result.path}`);
  return result;
}
