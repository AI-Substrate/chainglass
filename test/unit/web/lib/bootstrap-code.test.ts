/**
 * Plan 084 Phase 3 — T001 unit tests for the web-side accessor
 * `getBootstrapCodeAndKey()` in apps/web/src/lib/bootstrap-code.ts.
 *
 * Constitution P3 (TDD) + P4 (no vi.mock — real fs + real env in temp cwd).
 */
import { rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
} from '@chainglass/shared/auth-bootstrap-code';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mkTempCwd } from '../../shared/auth-bootstrap-code/test-fixtures';

import {
  _resetForTests,
  getBootstrapCodeAndKey,
} from '../../../../apps/web/src/lib/bootstrap-code';

describe('getBootstrapCodeAndKey', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    // Default each test to HKDF path; tests that exercise the env-derived
    // branch set AUTH_SECRET explicitly.
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('bootstrap-code-web-');
    process.chdir(cwd);
    _resetForTests();
    _resetSigningSecretCacheForTests();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    _resetForTests();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('(a) returns the active code + a 32-byte key', async () => {
    const ensured = ensureBootstrapCode(cwd);
    const result = await getBootstrapCodeAndKey();
    expect(result.code).toBe(ensured.data.code);
    expect(Buffer.isBuffer(result.key)).toBe(true);
    expect(result.key.length).toBe(32);
  });

  it('(b) returns same identity on repeated calls (cache hit)', async () => {
    ensureBootstrapCode(cwd);
    const a = await getBootstrapCodeAndKey();
    const b = await getBootstrapCodeAndKey();
    expect(a).toBe(b); // same object identity
    expect(a.code).toBe(b.code);
    expect(a.key).toBe(b.key); // same Buffer instance
  });

  it('(c) _resetForTests() invalidates the cache', async () => {
    ensureBootstrapCode(cwd);
    const before = await getBootstrapCodeAndKey();
    _resetForTests();
    const after = await getBootstrapCodeAndKey();
    // Identity must differ — cache rebuilt
    expect(after).not.toBe(before);
    // Code value identical (same file on disk)
    expect(after.code).toBe(before.code);
  });

  it('(d) throws a clear error referencing the cwd when file IO fails', async () => {
    // Create the bootstrap file then remove WRITE permission on the directory
    // so ensureBootstrapCode cannot regenerate. Then delete the file — the
    // ensure step inside getBootstrapCodeAndKey() must surface a clear error.
    ensureBootstrapCode(cwd);
    const filePath = join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
    unlinkSync(filePath);
    // Make the .chainglass dir read-only so atomic rename fails on regenerate
    const { chmodSync } = await import('node:fs');
    chmodSync(join(cwd, '.chainglass'), 0o555);

    let caught: unknown;
    try {
      _resetForTests();
      await getBootstrapCodeAndKey();
    } catch (e) {
      caught = e;
    }

    // Restore for cleanup
    chmodSync(join(cwd, '.chainglass'), 0o755);

    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toMatch(/\[bootstrap-code\]/);
    expect(msg).toContain(cwd);
  });

  it('(e) AUTH_SECRET set yields env-derived key (raw secret bytes)', async () => {
    const secret = 'a'.repeat(64);
    process.env.AUTH_SECRET = secret;
    ensureBootstrapCode(cwd);
    _resetForTests();
    _resetSigningSecretCacheForTests();
    const a = await getBootstrapCodeAndKey();
    const b = await getBootstrapCodeAndKey();
    expect(a.key.equals(b.key)).toBe(true);
    // AUTH_SECRET branch returns Buffer.from(AUTH_SECRET, 'utf-8') — bytes match input length
    expect(a.key.toString('utf-8')).toBe(secret);
  });
});
