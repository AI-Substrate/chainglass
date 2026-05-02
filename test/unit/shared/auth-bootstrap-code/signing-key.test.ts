/**
 * activeSigningSecret — AUTH_SECRET-or-HKDF signing-key derivation
 *
 * Why: Plan 084 Phase 1 T005. The HMAC signing key for cookies AND the
 *      JWT signing key for terminal-WS both come from this single helper.
 *      AUTH_SECRET if set; HKDF from `bootstrap-code.json` otherwise.
 *      This is the substrate that closes the WS silent-bypass hole
 *      (key finding 01) when operators run without AUTH_SECRET.
 * Contract: synchronous; returns `Buffer`. Module-level cache keyed by `cwd`.
 *           `_resetSigningSecretCacheForTests()` clears it for test isolation.
 * Usage: Phase 3.1 wraps async; Phase 4 calls direct from terminal WS.
 * Quality contribution: per-test cache reset (validation fix C2);
 *                       deterministic CI; real `node:crypto.hkdfSync`.
 * Worked example:
 *   ```ts
 *   const key = activeSigningSecret(cwd);
 *   // Buffer (32 bytes) — same instance returned on repeat calls.
 *   ```
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  ensureBootstrapCode,
  writeBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';

import { mkBootstrapCodeFile, mkTempCwd } from './test-fixtures';

describe('activeSigningSecret', () => {
  let cwd: string;

  beforeEach(() => {
    // (validation fix C2) Reset cache + AUTH_SECRET on every test.
    _resetSigningSecretCacheForTests();
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    delete process.env.AUTH_SECRET;
    _resetSigningSecretCacheForTests();
  });

  describe('AUTH_SECRET path (env-driven)', () => {
    it('returns Buffer.from(AUTH_SECRET, "utf-8") when env is set + non-empty', () => {
      process.env.AUTH_SECRET = 'env-secret-value';
      ensureBootstrapCode(cwd); // file exists but is irrelevant when AUTH_SECRET set
      const key = activeSigningSecret(cwd);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.equals(Buffer.from('env-secret-value', 'utf-8'))).toBe(true);
    });

    it('treats empty-string AUTH_SECRET as unset and falls back to HKDF', () => {
      process.env.AUTH_SECRET = '';
      ensureBootstrapCode(cwd);
      const key = activeSigningSecret(cwd);
      // 32-byte HKDF output, not a 0-byte env value
      expect(key.length).toBe(32);
    });
  });

  describe('HKDF path (bootstrap-code-derived)', () => {
    it('returns a 32-byte Buffer when AUTH_SECRET is unset', () => {
      ensureBootstrapCode(cwd);
      const key = activeSigningSecret(cwd);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('is deterministic for the same code under the same cwd', () => {
      writeBootstrapCode(`${cwd}/.chainglass/bootstrap-code.json`, mkBootstrapCodeFile({
        code: 'STAB-LECO-DESS',
      }));
      const k1 = activeSigningSecret(cwd);
      _resetSigningSecretCacheForTests();
      const k2 = activeSigningSecret(cwd);
      expect(k1.equals(k2)).toBe(true);
    });

    it('produces a different key for a different code (rotation invariant)', () => {
      writeBootstrapCode(`${cwd}/.chainglass/bootstrap-code.json`, mkBootstrapCodeFile({
        code: 'AAAA-AAAA-AAAA',
      }));
      const k1 = activeSigningSecret(cwd);
      _resetSigningSecretCacheForTests();
      writeBootstrapCode(`${cwd}/.chainglass/bootstrap-code.json`, mkBootstrapCodeFile({
        code: 'BBBB-BBBB-BBBB',
      }));
      const k2 = activeSigningSecret(cwd);
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('cwd-keyed cache', () => {
    it('returns the same Buffer instance on repeat calls with same cwd', () => {
      ensureBootstrapCode(cwd);
      const k1 = activeSigningSecret(cwd);
      const k2 = activeSigningSecret(cwd);
      expect(k1).toBe(k2); // identity, not just equality
    });

    it('returns different Buffers for different cwd values', () => {
      const cwd2 = mkTempCwd();
      try {
        ensureBootstrapCode(cwd);
        ensureBootstrapCode(cwd2);
        const k1 = activeSigningSecret(cwd);
        const k2 = activeSigningSecret(cwd2);
        expect(k1.equals(k2)).toBe(false); // different bootstrap codes → different HKDF
      } finally {
        rmSync(cwd2, { recursive: true, force: true });
      }
    });

    it('_resetSigningSecretCacheForTests clears the cache (next call recomputes)', () => {
      ensureBootstrapCode(cwd);
      const k1 = activeSigningSecret(cwd);
      _resetSigningSecretCacheForTests();
      const k2 = activeSigningSecret(cwd);
      expect(k1).not.toBe(k2); // different instance after reset
      expect(k1.equals(k2)).toBe(true); // but same value (same code, same env)
    });
  });
});
