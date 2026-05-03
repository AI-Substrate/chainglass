/**
 * @vitest-environment node
 *
 * Plan 084 Phase 7 T010 — AC-22 automated log-discipline audit.
 *
 * **Goal**: prove that the actual generated bootstrap-code value never appears
 * in any captured `console.log` / `console.error` / `console.warn` argument
 * across the full boot + verify + WS-upgrade flow. AND prove the file path is
 * emitted at least once via the `[bootstrap-code]` log line so operators can
 * find the file from logs alone.
 *
 * **Constitution-P4-compliant approach** (per validate-v2 H2 fix):
 *   - We do NOT inject a deterministic seed into `generateBootstrapCode` —
 *     that would require either `vi.mock` (forbidden for own-domain internals
 *     by Constitution P4) or refactoring `generator.ts` to accept a seam (out
 *     of scope for Phase 7 docs/tests-only freeze).
 *   - Instead we let the test generate a real code via `ensureBootstrapCode`,
 *     capture `data.code` as the grep needle, and assert that needle never
 *     appears in any captured spy argument.
 *
 * **Scope** (per validator L1 — documented Phase 7 boundary):
 *   - In: `console.log`, `console.error`, `console.warn` calls during the audit window.
 *   - Out: HTTP response bodies (verified non-echoing in Phase 3 verify route;
 *     no automated assertion here).
 *   - Out: structured loggers, Sentry breadcrumbs, etc. (none in tree today;
 *     re-audit when added).
 *
 * **Audit window covers**:
 *   1. `writeBootstrapCodeOnBoot(cwd)` — Phase 2 boot path (emits the
 *      `[bootstrap-code] ...` log line).
 *   2. `getBootstrapCodeAndKey()` — Phase 3 cached accessor.
 *   3. `verifyPOST` — Phase 3 verify route (success, wrong-code, malformed).
 *   4. `requireLocalAuth` — Phase 5 composite gate (cookie, no-cred, bad-cred).
 *   5. `authorizeUpgrade` — Phase 4 WS upgrade pure function (allow + deny).
 *
 * **Real-fs, real-crypto, no `vi.mock` of own-domain internals.** Only
 * `vi.spyOn(console, ...)` (sanctioned per Phase 6 precedent for log-discipline).
 *
 * AC: AC-22.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
  activeSigningSecret,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeBootstrapCodeOnBoot } from '../../../apps/web/src/auth-bootstrap/boot';
import { authorizeUpgrade } from '../../../apps/web/src/features/064-terminal/server/terminal-auth';
import { getBootstrapCodeAndKey } from '../../../apps/web/src/lib/bootstrap-code';
import { requireLocalAuth } from '../../../apps/web/src/lib/local-auth';
import { POST as verifyPOST } from '../../../apps/web/app/api/bootstrap/verify/route';

import { setupBootstrapTestEnv } from '../../helpers/auth-bootstrap-code';

const VERIFY_URL = 'http://localhost:3000/api/bootstrap/verify';
const SINK_URL = 'http://localhost:3000/api/event-popper/list';

function makeVerifyReq(code: string, ip = '1.2.3.4'): NextRequest {
  return new NextRequest(VERIFY_URL, {
    method: 'POST',
    body: JSON.stringify({ code }),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
  });
}

function makeSinkReq(opts: { cookieValue?: string } = {}): NextRequest {
  const headers: Record<string, string> = {
    'x-forwarded-for': '127.0.0.1',
    host: 'localhost:3000',
  };
  if (opts.cookieValue !== undefined) {
    headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${opts.cookieValue}`;
  }
  return new NextRequest(SINK_URL, { method: 'GET', headers });
}

/** Stringify a spy call's args list — handles strings, objects, errors. */
function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

describe('AC-22 log-discipline audit (Phase 7 T010)', () => {
  let env: ReturnType<typeof setupBootstrapTestEnv>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalAuthSecret: string | undefined;

  beforeEach(() => {
    originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET; // exercise the HKDF path (worst case for AC-22)
    env = setupBootstrapTestEnv();
    // Spies installed AFTER setupBootstrapTestEnv so its internal log lines
    // (if any) don't pollute our audit window. The audit specifically verifies
    // log discipline of the production surfaces, not the test helper.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    env.cleanup();
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  /**
   * Collect every captured log/warn/error call's arguments into a single
   * string. This is the haystack we grep against the bootstrap code needle.
   */
  function captureAllLogged(): string {
    const lines: string[] = [];
    for (const call of logSpy.mock.calls) lines.push(stringifyArgs(call));
    for (const call of warnSpy.mock.calls) lines.push(stringifyArgs(call));
    for (const call of errorSpy.mock.calls) lines.push(stringifyArgs(call));
    return lines.join('\n');
  }

  it('boot + verify + sink-auth + WS-authorize: zero matches of the code value across all captured console.* calls', async () => {
    const realCode = env.code;
    expect(realCode.length).toBeGreaterThan(0);

    // (1) Boot path — emits `[bootstrap-code] active code at <abs-path>`.
    await writeBootstrapCodeOnBoot(env.cwd);

    // (2) Accessor — Phase 3 module-cached read.
    const codeAndKey = await getBootstrapCodeAndKey();
    expect(codeAndKey.code).toBe(realCode);

    // (3) Verify route — success path
    const goodRes = await verifyPOST(makeVerifyReq(realCode, '10.0.0.1'));
    expect(goodRes.status).toBe(200);

    // (3) Verify route — wrong-code path (different valid Crockford code,
    //     wrong against the active one)
    const wrongCode = 'XXXX-XXXX-XXXX' === realCode ? 'YYYY-YYYY-YYYY' : 'XXXX-XXXX-XXXX';
    const badRes = await verifyPOST(makeVerifyReq(wrongCode, '10.0.0.2'));
    expect(badRes.status).toBe(401);

    // (3) Verify route — malformed-code path (must NOT echo the bad input)
    const malformedRes = await verifyPOST(makeVerifyReq('not-a-code', '10.0.0.3'));
    expect(malformedRes.status).toBe(400);

    // (4) requireLocalAuth — cookie path, no-credential path, bad-credential path
    const key = activeSigningSecret(env.cwd);
    const goodCookie = buildCookieValue(realCode, key);
    expect((await requireLocalAuth(makeSinkReq({ cookieValue: goodCookie }))).ok).toBe(true);
    expect(await requireLocalAuth(makeSinkReq())).toEqual({
      ok: false,
      reason: 'no-credential',
    });
    expect(
      await requireLocalAuth(makeSinkReq({ cookieValue: 'totally-bogus-cookie' })),
    ).toEqual({ ok: false, reason: 'bad-credential' });

    // (5) authorizeUpgrade — allow + deny paths
    const allowReq = {
      headers: { get: (n: string) => (n === 'origin' ? 'http://localhost:3000' : null) },
    } as unknown as Parameters<typeof authorizeUpgrade>[0];
    const denyReq = {
      headers: { get: (n: string) => (n === 'origin' ? 'https://evil.example.com' : null) },
    } as unknown as Parameters<typeof authorizeUpgrade>[0];
    await authorizeUpgrade(allowReq, { workspaceRoot: env.cwd });
    await authorizeUpgrade(denyReq, { workspaceRoot: env.cwd });

    // ── AC-22 ASSERTIONS ──
    const haystack = captureAllLogged();

    // Primary assertion: the real generated code never appears anywhere
    expect(haystack.includes(realCode)).toBe(false);

    // Defense in depth: also check the unhyphenated form (12 chars) — if any
    // future formatter strips hyphens, that'd still be a leak.
    const compactCode = realCode.replace(/-/g, '');
    expect(haystack.includes(compactCode)).toBe(false);

    // Secondary: the canonical `[bootstrap-code]` log line was emitted at least
    // once with the file path. Confirms operators can find the file from logs.
    expect(haystack).toMatch(/\[bootstrap-code\] (?:active|generated new) code at /);
    // Path must end in bootstrap-code.json (no value smuggled into the path)
    expect(haystack).toMatch(/bootstrap-code\.json/);
  });

  it('rate-limit error response (Phase 3 leaky bucket) does NOT echo the submitted bad code', async () => {
    // Burn through the rate limit (5/60s) using malformed inputs so the route
    // hits 429 fast. Each attempt's body is a unique non-matching string.
    const realCode = env.code;
    const probe = 'AAAA-BBBB-CCCC';
    let rateLimited = false;
    for (let i = 0; i < 8; i++) {
      const res = await verifyPOST(makeVerifyReq(probe, '10.0.0.10'));
      if (res.status === 429) {
        rateLimited = true;
        // Read response body — verify route doesn't echo the submitted code there
        const bodyText = await res.text();
        expect(bodyText.includes(realCode)).toBe(false);
        expect(bodyText.includes(probe)).toBe(false); // also doesn't echo probe
        break;
      }
    }
    expect(rateLimited).toBe(true);

    // Console output across the rate-limit run still contains zero code matches
    const haystack = captureAllLogged();
    expect(haystack.includes(realCode)).toBe(false);
    expect(haystack.includes(realCode.replace(/-/g, ''))).toBe(false);
  });

  it('bootstrap-unavailable warn message is SECRET-FREE (no code value)', async () => {
    // Force the bootstrap-code-unreadable branch by replacing .chainglass with
    // a regular file — mkdirSync EEXIST → ensureBootstrapCode throws → the
    // warn-once message fires from requireLocalAuth's catch block.
    const realCode = env.code;
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dotChainglass = path.join(env.cwd, '.chainglass');
    fs.rmSync(dotChainglass, { recursive: true, force: true });
    fs.writeFileSync(dotChainglass, 'sentinel');

    // Reset the cached `getBootstrapCodeAndKey` so it actually re-reads
    const { _resetForTests: resetBootstrapCache } = await import(
      '../../../apps/web/src/lib/bootstrap-code'
    );
    resetBootstrapCache();

    // Pass any cookie value — `requireLocalAuth` short-circuits at the
    // `getBootstrapCodeAndKey()` throw before evaluating the cookie. Calling
    // `activeSigningSecret(env.cwd)` here would EEXIST against the sentinel.
    const result = await requireLocalAuth(makeSinkReq({ cookieValue: 'sentinel-test-cookie' }));
    expect(result).toEqual({ ok: false, reason: 'bootstrap-unavailable' });

    // The warn message must be the fixed secret-free string from local-auth.ts:84
    expect(warnSpy).toHaveBeenCalledWith(
      '[requireLocalAuth] bootstrap-code.json unreadable; rejecting all requests until restored',
    );

    // Once again — no code value anywhere in captured output
    const haystack = captureAllLogged();
    expect(haystack.includes(realCode)).toBe(false);
  });
});
