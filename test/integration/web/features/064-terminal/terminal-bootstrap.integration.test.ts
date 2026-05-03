// @vitest-environment node
/**
 * Plan 084 Phase 4 — Integration tests T005 + T006.
 *
 * **AC-13** (silent-bypass closed): with `AUTH_SECRET` unset, the terminal
 * channel must still require authentication — the HKDF-derived bootstrap key
 * takes over. Two scenarios prove closure:
 *   (a) cookie set → token route returns 200 + JWT signed via HKDF; the WS
 *       sidecar accepts that JWT.
 *   (b) cookie missing → token route returns 401; a hand-crafted
 *       unsigned-or-wrong-key WS upgrade is rejected.
 *
 * **AC-14** (parity): with `AUTH_SECRET` set, existing flows still work.
 *
 * Constitution P4: real `node:crypto`, real `jose`, real fs (`mkTempCwd`),
 * no `vi.mock`. Session faking via `DISABLE_AUTH=true` (production-proven
 * Phase 3 path). The WS upgrade is simulated by calling the exported
 * `authorizeUpgrade()` directly — no real WS server stand-up.
 */
import { rmSync } from 'node:fs';

import {
  TERMINAL_JWT_AUDIENCE,
  TERMINAL_JWT_ISSUER,
  authorizeUpgrade,
  buildDefaultAllowedOrigins,
} from '@/features/064-terminal/server/terminal-ws';
import {
  BOOTSTRAP_COOKIE_NAME,
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  buildCookieValue,
  ensureBootstrapCode,
  findWorkspaceRoot,
} from '@chainglass/shared/auth-bootstrap-code';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';
import { GET as TOKEN_GET } from '../../../../../apps/web/app/api/terminal/token/route';
import { mkTempCwd } from '../../../../unit/shared/auth-bootstrap-code/test-fixtures';

const TOKEN_URL = 'http://localhost:3000/api/terminal/token';

function tokenRequest(cookieValue: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue !== undefined) {
    headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${cookieValue}`;
  }
  return new NextRequest(TOKEN_URL, { method: 'GET', headers });
}

interface UpgradeReqInit {
  origin?: string;
  token?: string;
}

function upgradeRequest(init: UpgradeReqInit) {
  const url = init.token
    ? `/?token=${encodeURIComponent(init.token)}&session=test&cwd=/tmp`
    : '/?session=test&cwd=/tmp';
  return {
    headers: { origin: init.origin ?? 'http://localhost:3000', host: 'localhost:4500' },
    url,
  };
}

describe('Phase 4 integration — terminal bootstrap auth (AC-13 + AC-14)', () => {
  let cwd: string;
  let resolvedCwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let originalDisableAuth: string | undefined;
  let activeCode: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableAuth = process.env.DISABLE_AUTH;
    delete process.env.AUTH_SECRET;
    process.env.DISABLE_AUTH = 'true';
    cwd = mkTempCwd('p4-integration-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    activeCode = ensureBootstrapCode(cwd).data.code;
    // Resolve the workspace root the same way the route + sidecar do.
    resolvedCwd = findWorkspaceRoot(process.cwd());
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  describe('AC-13 — silent-bypass closed (AUTH_SECRET unset)', () => {
    it('scenario (a): cookie set → token route 200 → WS upgrade accepted (HKDF path proves auth)', async () => {
      // (1) Token route: cookie + fake session → 200 + JWT signed via HKDF.
      const key = activeSigningSecret(resolvedCwd);
      const cookie = buildCookieValue(activeCode, key);
      const tokenRes = await TOKEN_GET(tokenRequest(cookie));
      expect(tokenRes.status).toBe(200);
      const { token } = await tokenRes.json();
      expect(typeof token).toBe('string');

      // (2) WS upgrade: same JWT, valid Origin → accepted.
      const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
      const result = await authorizeUpgrade(
        upgradeRequest({ origin: 'http://localhost:3000', token }),
        { cwd: resolvedCwd, allowedOrigins, signingKey: key },
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.username).toBe('debug');
    });

    it('scenario (b): NO cookie → token route 401 → hand-crafted unsigned upgrade rejected', async () => {
      // (1) Token route: no cookie → 401 (proxy cookie-gate analogue blocks
      // even with a fake NextAuth session present).
      const tokenRes = await TOKEN_GET(tokenRequest(undefined));
      expect(tokenRes.status).toBe(401);

      // (2) Attacker hand-crafts a JWT signed with a different key — WS
      // upgrade rejected with 4403 (silent-bypass path proven closed).
      const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
      const realKey = activeSigningSecret(resolvedCwd);
      const wrongKey = Buffer.from('attacker-supplied-key-32-bytes!!');
      const forgedToken = await new SignJWT({
        sub: 'attacker',
        iss: TERMINAL_JWT_ISSUER,
        aud: TERMINAL_JWT_AUDIENCE,
        cwd: resolvedCwd,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(wrongKey);
      const result = await authorizeUpgrade(
        upgradeRequest({ origin: 'http://localhost:3000', token: forgedToken }),
        { cwd: resolvedCwd, allowedOrigins, signingKey: realKey },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(4403);
    });
  });

  describe('AC-14 — AUTH_SECRET parity', () => {
    it('with AUTH_SECRET set: token route signs via the env secret; WS sidecar accepts', async () => {
      process.env.AUTH_SECRET = 'parity-integration-test-secret-32b';
      _resetSigningSecretCacheForTests();
      _resetBootstrapCache();

      const key = activeSigningSecret(resolvedCwd);
      const cookie = buildCookieValue(activeCode, key);

      const tokenRes = await TOKEN_GET(tokenRequest(cookie));
      expect(tokenRes.status).toBe(200);
      const { token } = await tokenRes.json();

      const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
      const result = await authorizeUpgrade(
        upgradeRequest({ origin: 'http://localhost:3000', token }),
        { cwd: resolvedCwd, allowedOrigins, signingKey: key },
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.username).toBe('debug');
    });
  });
});
