/**
 * @vitest-environment node
 */
/**
 * /login must be reachable without a session when GitHub OAuth is on.
 *
 * proxy.ts's OAuth stage redirected every unauthenticated page request to /login, including
 * /login itself, so a signed-out browser looped on 307 /login → /login (ERR_TOO_MANY_REDIRECTS)
 * and could never sign in. Runs the real proxy (bootstrap cookie stage + Auth.js chain) with
 * OAuth enabled and a valid bootstrap cookie but no session.
 *
 * Env is set before the dynamic import: auth.ts decides at module load whether `auth(cb)` is
 * the real Auth.js middleware or the disabled pass-through.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  buildCookieValue,
  ensureBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';
import { type NextFetchEvent, NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { removeTmpDir } from '../../helpers/tmpdir';
import { mkTempCwd } from '../shared/auth-bootstrap-code/test-fixtures';

const ENV_KEYS = ['DISABLE_AUTH', 'DISABLE_GITHUB_OAUTH', 'AUTH_SECRET'] as const;

describe('proxy with GitHub OAuth enabled, no session', () => {
  let cwd: string;
  let originalCwd: string;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.AUTH_SECRET = 'test-secret-for-proxy-login-redirect-0123456789';
    originalCwd = process.cwd();
    cwd = mkTempCwd('proxy-login-');
    process.chdir(cwd);
    _resetSigningSecretCacheForTests();
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
    _resetSigningSecretCacheForTests();
    removeTmpDir(cwd);
  });

  async function runProxy(pathname: string) {
    const code = ensureBootstrapCode(cwd).data.code;
    const cookie = buildCookieValue(code, activeSigningSecret(cwd));
    // Dynamic on purpose: auth.ts picks real vs disabled Auth.js at module load, after the env above.
    const { default: proxy } = await import('../../../apps/web/proxy');
    const req = new NextRequest(`http://localhost:3000${pathname}`, {
      headers: { cookie: `${BOOTSTRAP_COOKIE_NAME}=${cookie}` },
    });
    return (await proxy(req, {} as NextFetchEvent)) as Response;
  }

  it('lets an unauthenticated GET /login through instead of redirecting it to itself', async () => {
    /*
    Test Doc:
    - Why: a signed-out browser looped on 307 /login -> /login and could never reach sign-in.
    - Contract: with OAuth on and no session, the proxy passes /login through (next()).
    - Usage Notes: real proxy + Auth.js chain; env set before import (auth.ts reads it at load).
    - Quality Contribution: catches any gate that redirects the sign-in page to itself.
    - Worked Example: GET /login, bootstrap cookie, no session -> x-middleware-next: 1, no Location.
    */
    const res = await runProxy('/login');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets the sign-in page load its icon theme manifest without a session', async () => {
    // The root providers fetch this on /login; redirected to /login it parses as HTML and throws.
    const res = await runProxy('/icons/material-icon-theme/manifest.json');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/workspaces/demo', '/login/elsewhere', '/iconsx'])(
    'still redirects other unauthenticated pages (%s) to /login',
    async (path) => {
      const res = await runProxy(path);
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
    }
  );

  it('still answers 401 to unauthenticated API calls', async () => {
    const res = await runProxy('/api/workspaces');
    expect(res.status).toBe(401);
  });
});
