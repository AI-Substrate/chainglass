/**
 * Plan 084 Phase 6 — T005 integration test for `<BootstrapPopup>`.
 *
 * Exercises the popup against the REAL verify route (in-process, no server
 * boot) via a `globalThis.fetch` adapter. Cookie round-trip is end-to-end:
 * real signing key, real HMAC, real Set-Cookie header from the route handler.
 *
 * Constitution P3 (TDD) + P4 (Fakes Over Mocks). Sanctioned exceptions:
 *   - `vi.mock('next/navigation', ...)` — sanctioned per repo precedent (see
 *     test/unit/web/components/dashboard-sidebar.test.tsx). Next.js 16 RSC
 *     has no public router test stub for jsdom.
 *
 * Phase 7 forward marker (validation fix H6): T007's `setupBootstrapTestEnv`
 * helper does NOT support a deterministic `seedCode` parameter; Phase 7
 * task 7.10 (AC-22 log audit) will extend the helper. Phase 6 doesn't need
 * the override.
 */
import { rmSync } from 'node:fs';

import {
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
} from '@chainglass/shared/auth-bootstrap-code';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetForTests as _resetBootstrapCache } from '../../../apps/web/src/lib/bootstrap-code';
import {
  POST as verifyPOST,
  _resetRateLimitForTests,
} from '../../../apps/web/app/api/bootstrap/verify/route';
import { BootstrapPopup } from '@/features/063-login/components/bootstrap-popup';
import { INVALID_FORMAT_SAMPLES } from '../../unit/shared/auth-bootstrap-code/test-fixtures';
import { setupBootstrapTestEnv } from '../../helpers/auth-bootstrap-code';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const VERIFY_URL = 'http://localhost:3000/api/bootstrap/verify';

describe('Phase 6 popup integration', () => {
  let env: ReturnType<typeof setupBootstrapTestEnv>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    refresh.mockReset();
    env = setupBootstrapTestEnv();
    originalFetch = globalThis.fetch;
    // Route fetch('/api/bootstrap/verify') in the popup to the real verify
    // route handler in-process. No server boot. Other URLs throw so a
    // misrouted call fails loudly.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/bootstrap/verify')) {
        // The route uses NextRequest's IP detection via x-forwarded-for; tests
        // pass a stable IP per scenario so the rate-limit bucket is isolated.
        const headers = new Headers(init?.headers);
        if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', '7.7.7.7');
        return verifyPOST(
          new NextRequest(VERIFY_URL, { ...init, headers, method: 'POST' }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    env.cleanup();
  });

  // (1) Happy path — cookie round-trip via real route handler
  it('1: correct code → 200 + Set-Cookie + router.refresh()', async () => {
    render(
      <BootstrapPopup bootstrapVerified={false}>
        <div data-testid="protected">protected</div>
      </BootstrapPopup>,
    );
    const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
    fireEvent.change(input, { target: { value: env.code } });
    fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  // (2) Wrong code — popup remains, error displayed, input retained
  it('2: wrong code → 401 from real route → "Wrong code" + popup remains + input retained', async () => {
    render(
      <BootstrapPopup bootstrapVerified={false}>
        <div>x</div>
      </BootstrapPopup>,
    );
    const wrong = '7K2P-9XQM-3T8R'; // valid format, vanishingly unlikely match
    if (wrong === env.code) throw new Error('test fixture collision; rerun');
    const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
    fireEvent.change(input, { target: { value: wrong } });
    fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/wrong code/i),
    );
    expect(input.value).toBe(wrong);
    expect(screen.getByTestId('bootstrap-popup')).toBeInTheDocument();
  });

  // (3a) Format error — client-side rejects before fetch
  it('3a: malformed input → submit disabled (client-side reject; no fetch)', () => {
    render(
      <BootstrapPopup bootstrapVerified={false}>
        <div>x</div>
      </BootstrapPopup>,
    );
    const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
    // Use a sample that's < 14 chars after autoformat (ensures submit stays disabled)
    fireEvent.change(input, { target: { value: INVALID_FORMAT_SAMPLES[0] } });
    expect((screen.getByTestId('bootstrap-code-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  // (3b) Format error — server-side defence-in-depth via direct route call
  it('3b: malformed body → 400 from real route directly (defence-in-depth)', async () => {
    const res = await verifyPOST(
      new NextRequest(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.8.8.8' },
        body: JSON.stringify({ code: 'NOTVALIDFORMAT' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-format' });
  });

  // (4) Rate-limited — trip the route, popup displays countdown, submit disabled
  it('4: 6 wrong attempts → real route 429 → popup countdown + submit disabled', async () => {
    render(
      <BootstrapPopup bootstrapVerified={false}>
        <div>x</div>
      </BootstrapPopup>,
    );
    const wrong = '7K2P-9XQM-3T8R';
    const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
    const submit = screen.getByTestId<HTMLButtonElement>('bootstrap-code-submit');
    // Trip the route 5 times (each returns 401 from real verifyPOST)
    for (let i = 0; i < 5; i++) {
      fireEvent.change(input, { target: { value: wrong } });
      fireEvent.click(submit);
      await waitFor(() => expect(input.value).toBe(wrong));
      // Wait for popup to settle from previous attempt
      await waitFor(() => expect(submit.disabled).toBe(false), { timeout: 1000 });
    }
    // 6th attempt → 429
    fireEvent.change(input, { target: { value: wrong } });
    fireEvent.click(submit);
    await waitFor(
      () =>
        expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(
          /rate limited.*\d+ seconds/i,
        ),
      { timeout: 2000 },
    );
    expect(submit.disabled).toBe(true);
  });

  // (5) 503 — file unavailable, popup shows "Server unavailable"
  it('5: missing bootstrap file → 503 from real route → "Server unavailable"', async () => {
    // Remove the bootstrap-code file AND chmod the parent dir read-only
    // so ensureBootstrapCode in the verify route can't regenerate it.
    rmSync(`${env.cwd}/.chainglass`, { recursive: true, force: true });
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const { mkdirSync, chmodSync } = await import('node:fs');
    mkdirSync(`${env.cwd}/.chainglass`);
    chmodSync(`${env.cwd}/.chainglass`, 0o555);

    try {
      render(
        <BootstrapPopup bootstrapVerified={false}>
          <div>x</div>
        </BootstrapPopup>,
      );
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: env.code } }); // any 14-char string
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(
        () =>
          expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(
            /server unavailable/i,
          ),
        { timeout: 2000 },
      );
      expect(input.value).toBe(env.code);
    } finally {
      // Restore for cleanup
      const { chmodSync: chmod2 } = await import('node:fs');
      chmod2(`${env.cwd}/.chainglass`, 0o755);
    }
  });

  // Smoke test: helper itself round-trips
  it('smoke: setupBootstrapTestEnv() returns a usable code that verifies via the real route', async () => {
    const res = await verifyPOST(
      new NextRequest(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.9.9.9' },
        body: JSON.stringify({ code: env.code }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('chainglass-bootstrap=');
  });
});

// Avoid unused-import warnings if the test runner trims imports
void ensureBootstrapCode;
void _resetRateLimitForTests;
