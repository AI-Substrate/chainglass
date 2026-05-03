/**
 * @vitest-environment node
 *
 * Plan 084 Phase 5 T001 — RED tests for `requireLocalAuth(req)`.
 *
 * Constitution P3 (TDD) + P4 (Fakes Over Mocks). Real fs in temp cwd, real
 * crypto, real `NextRequest`. No `vi.mock` anywhere.
 *
 * The 11 cases are:
 *   (a)  non-localhost rejected → reason: 'not-localhost'
 *   (b)  localhost + valid cookie → ok via 'cookie'
 *   (c)  localhost + valid X-Local-Token → ok via 'local-token'
 *   (d)  localhost, no cookie & no token → reason: 'no-credential'
 *   (e)  localhost, malformed cookie → reason: 'bad-credential'
 *   (f)  localhost, wrong X-Local-Token (right length) → reason: 'bad-credential'
 *   (f2) localhost, X-Local-Token wrong LENGTH → reason: 'bad-credential' (no RangeError) — Completeness fix #1
 *   (f3) localhost, X-Local-Token sent but server.json lacks localToken → reason: 'bad-credential' — Completeness fix #4
 *   (g)  localhost, both present and one bad → cookie tried first
 *   (h)  bootstrap-code.json unreadable → reason: 'bootstrap-unavailable' + console.warn (no code in log) — Completeness fix #2 + AC-22
 *   (i)  cookie wins when both valid → returns via: 'cookie'
 */
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
  _resetWorkspaceRootCacheForTests,
  activeSigningSecret,
} from '@chainglass/shared/auth-bootstrap-code';
import { writeServerInfo } from '@chainglass/shared/event-popper';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mkTempCwd } from '../../shared/auth-bootstrap-code/test-fixtures';
import { _resetForTests as _resetBootstrapCache } from '../../../../apps/web/src/lib/bootstrap-code';
import { requireLocalAuth } from '../../../../apps/web/src/lib/local-auth';

const URL = 'http://localhost:3000/api/event-popper/list';

interface ReqOptions {
  remote?: boolean;
  cookieValue?: string;
  localToken?: string;
}

function makeReq(opts: ReqOptions = {}): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.remote === true) {
    // Non-loopback IP via X-Forwarded-For; isLocalhostRequest rejects.
    headers['x-forwarded-for'] = '203.0.113.4';
    headers.host = '203.0.113.4:3000';
  } else {
    headers['x-forwarded-for'] = '127.0.0.1';
    headers.host = 'localhost:3000';
  }
  if (opts.cookieValue !== undefined) {
    headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${opts.cookieValue}`;
  }
  if (opts.localToken !== undefined) {
    headers['x-local-token'] = opts.localToken;
  }
  return new NextRequest(URL, { method: 'POST', headers });
}

describe('requireLocalAuth (Phase 5 T001 RED)', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let activeCode: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('local-auth-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    _resetWorkspaceRootCacheForTests();
    activeCode = ensureBootstrapCode(cwd).data.code;
    // Default: write a server.json with a known localToken — individual tests
    // override or delete this where they need a different shape.
    writeServerInfo(cwd, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      localToken: 'tok-shared-secret-1234567890abcdef',
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    _resetWorkspaceRootCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  // (a) non-localhost rejected
  it("(a) non-localhost rejected → 'not-localhost'", async () => {
    const result = await requireLocalAuth(makeReq({ remote: true }));
    expect(result).toEqual({ ok: false, reason: 'not-localhost' });
  });

  // (b) localhost + valid cookie → cookie path
  it("(b) localhost + valid cookie → ok via 'cookie'", async () => {
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const result = await requireLocalAuth(makeReq({ cookieValue: cookie }));
    expect(result).toEqual({ ok: true, via: 'cookie' });
  });

  // (c) localhost + valid X-Local-Token → token path
  it("(c) localhost + valid X-Local-Token → ok via 'local-token'", async () => {
    const result = await requireLocalAuth(
      makeReq({ localToken: 'tok-shared-secret-1234567890abcdef' }),
    );
    expect(result).toEqual({ ok: true, via: 'local-token' });
  });

  // (d) localhost, no credential
  it("(d) localhost, no cookie & no token → 'no-credential'", async () => {
    const result = await requireLocalAuth(makeReq({}));
    expect(result).toEqual({ ok: false, reason: 'no-credential' });
  });

  // (e) localhost, malformed cookie
  it("(e) localhost, malformed cookie → 'bad-credential'", async () => {
    const result = await requireLocalAuth(
      makeReq({ cookieValue: 'totally-not-a-real-hmac' }),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-credential' });
  });

  // (f) localhost, wrong X-Local-Token (right length, wrong bytes)
  it("(f) localhost, wrong X-Local-Token (right length) → 'bad-credential'", async () => {
    // Build wrong value of same length as the valid one ('tok-shared-secret-1234567890abcdef' = 35 chars)
    const wrong = 'X'.repeat('tok-shared-secret-1234567890abcdef'.length);
    const result = await requireLocalAuth(makeReq({ localToken: wrong }));
    expect(result).toEqual({ ok: false, reason: 'bad-credential' });
  });

  // (f2) localhost, wrong-LENGTH X-Local-Token → must NOT throw RangeError
  it("(f2) localhost, X-Local-Token of wrong length → 'bad-credential' (no RangeError)", async () => {
    const result = await requireLocalAuth(makeReq({ localToken: 'X' })); // 1-byte attacker probe
    expect(result).toEqual({ ok: false, reason: 'bad-credential' });
  });

  // (f3) localhost, X-Local-Token sent but server.json has no localToken (legacy pre-Plan-067)
  it("(f3) localhost, X-Local-Token sent but server.json lacks localToken → 'bad-credential'", async () => {
    // Overwrite server.json with no localToken field (legacy shape)
    writeServerInfo(cwd, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      // no localToken
    });
    const result = await requireLocalAuth(
      makeReq({ localToken: 'whatever-the-cli-might-send' }),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-credential' });
  });

  // (g) localhost, both present and cookie bad — cookie tried FIRST and fails fast (no token fallback)
  it('(g) localhost, both present and cookie bad → bad-credential (cookie tried first)', async () => {
    const result = await requireLocalAuth(
      makeReq({
        cookieValue: 'totally-not-a-real-hmac',
        localToken: 'tok-shared-secret-1234567890abcdef',
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-credential' });
  });

  // (h) bootstrap-code.json unreadable → bootstrap-unavailable + warn (no code value in log)
  it("(h) bootstrap-code.json unreadable → 'bootstrap-unavailable' (warn fires, no code in log)", async () => {
    // Delete the bootstrap-code.json file AND make .chainglass/ unwritable so
    // ensureBootstrapCode (used by getBootstrapCodeAndKey) cannot regenerate.
    rmSync(join(cwd, '.chainglass'), { recursive: true, force: true });
    // Replace .chainglass with a regular FILE (not a dir) so any mkdir attempt
    // throws EEXIST — guarantees the throw branch executes.
    writeFileSync(join(cwd, '.chainglass'), 'sentinel');
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();

    const result = await requireLocalAuth(makeReq({}));
    expect(result).toEqual({ ok: false, reason: 'bootstrap-unavailable' });
    expect(warnSpy).toHaveBeenCalled();
    // AC-22: warn message must NOT contain the bootstrap code value
    const allWarnArgs = warnSpy.mock.calls.flat().join(' ');
    expect(allWarnArgs).not.toContain(activeCode);
  });

  // (i) cookie wins when both valid
  it("(i) localhost, both cookie AND token valid → returns via 'cookie' (cookie wins)", async () => {
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const result = await requireLocalAuth(
      makeReq({
        cookieValue: cookie,
        localToken: 'tok-shared-secret-1234567890abcdef',
      }),
    );
    expect(result).toEqual({ ok: true, via: 'cookie' });
  });
});
