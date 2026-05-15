/**
 * activeSigningSecret — unified HMAC/JWT signing-key derivation.
 *
 * Plan 084 Phase 1 T005. Closes the terminal-WS silent-bypass hole:
 * even when `AUTH_SECRET` is unset, the WS sidecar gets a deterministic
 * key derived from `bootstrap-code.json` via HKDF. Phase 3.1 wraps this
 * synchronous function in an async `getBootstrapCodeAndKey()` for
 * web-side per-request use.
 */
import { hkdfSync } from 'node:crypto';

import { ensureBootstrapCode } from './persistence.js';

const HKDF_SALT = Buffer.from('chainglass.signing.salt.v1');
const HKDF_INFO = Buffer.from('chainglass.signing.info.v1');
const HKDF_KEY_LENGTH = 32;

/** Module-level cache, keyed by `cwd`. Survives within a process; cleared by `_resetSigningSecretCacheForTests()` or process restart. */
const cache = new Map<string, Buffer>();

/**
 * Resolve the active signing secret for the given `cwd`.
 *
 * - If `process.env.AUTH_SECRET` is set and non-empty, returns
 *   `Buffer.from(AUTH_SECRET, 'utf-8')` (no HKDF derivation).
 * - Otherwise, reads `<cwd>/.chainglass/bootstrap-code.json` (generating
 *   it if missing) and HKDF-SHA256-derives a 32-byte key from the code.
 *
 * The result is cached at module level keyed by `cwd`. Process-lifetime
 * cache; only invalidated by `_resetSigningSecretCacheForTests()` or
 * process restart.
 *
 * @param cwd Must resolve to the project root containing
 *   `.chainglass/bootstrap-code.json`. If calling from a child process
 *   (e.g., the terminal-WS sidecar), inherit `cwd` from or explicitly set
 *   it to match the main Next.js process — divergent `cwd` values produce
 *   divergent signing keys silently, breaking JWT validation across
 *   processes.
 * @returns 32-byte `Buffer` (HKDF path) or `Buffer.from(AUTH_SECRET, 'utf-8')`
 *   (env path). Same `cwd` returns identical instance on repeated calls.
 */
export function activeSigningSecret(cwd: string): Buffer {
  const cached = cache.get(cwd);
  if (cached) return cached;

  const env = process.env.AUTH_SECRET;
  let key: Buffer;
  if (env !== undefined && env.length > 0) {
    key = Buffer.from(env, 'utf-8');
  } else {
    const { data } = ensureBootstrapCode(cwd);
    const codeBuf = Buffer.from(data.code, 'utf-8');
    const derived = hkdfSync('sha256', codeBuf, HKDF_SALT, HKDF_INFO, HKDF_KEY_LENGTH);
    // hkdfSync returns ArrayBuffer in Node; wrap as Buffer for ergonomics.
    key = Buffer.from(derived);
  }
  cache.set(cwd, key);
  return key;
}

/**
 * Test-only — clears the cwd-keyed signing-key cache between test cases.
 * Production code MUST NOT import this.
 *
 * @internal
 */
export function _resetSigningSecretCacheForTests(): void {
  cache.clear();
}
