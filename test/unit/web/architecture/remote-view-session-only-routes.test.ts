/**
 * Architecture guard — the session-only remote-view routes (`/health`, `/windows`, `/displays`)
 * must stay NextAuth-session-only (Plan 088 Phase 6, T008 — the companion's accepted caveat).
 *
 * Why this exists: T008 proved these routes are session-only *structurally* — they export `GET()` with
 * ZERO parameters, so they never receive a `NextRequest` and cannot read an `X-Local-Token`. The
 * companion accepted that but flagged that the zero-arg assertion is not a *universal* future-proof: a
 * later edit could read a token via `next/headers` `headers()` or import the local-token gate
 * `requireRemoteViewAccess` (which `/sessions` legitimately uses) without adding a `req` param — quietly
 * opening a local-token path on routes documented as NextAuth-only. This makes that a FAILING test, not
 * an eyeball: the two routes may import the session-only gate (`requireRemoteViewSession`) but never the
 * local-token gate or `next/headers`.
 *
 * Mirrors the import-specifier-scan mechanism of `platform-no-remote-view.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The NextAuth-only routes (their handlers take no request → cannot read a token header). */
const SESSION_ONLY_ROUTES = [
  'apps/web/app/api/remote-view/health/route.ts',
  'apps/web/app/api/remote-view/windows/route.ts',
  'apps/web/app/api/remote-view/displays/route.ts',
];

/**
 * Forbidden references. `requireRemoteViewAccess` is the local-token-OR-session gate (only `/sessions`
 * may use it); `next/headers` is the back-door a token could be read through without a `req` param.
 * Note `requireRemoteViewAccess` is matched as a whole word so the allowed `requireRemoteViewSession`
 * never trips it.
 */
const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: 'requireRemoteViewAccess (local-token gate)', re: /\brequireRemoteViewAccess\b/ },
  // Match the quoted module string in ANY reference shape — static `from 'next/headers'`, dynamic
  // `import('next/headers')`, or `require('next/headers')` — so the guard matches its stated contract
  // (companion F002). The route files quote no module in prose, so there is no comment false-positive.
  { name: 'next/headers reference', re: /['"]next\/headers['"]/ },
];

describe('session-only remote-view routes stay NextAuth-only (T008 architecture guard)', () => {
  for (const rel of SESSION_ONLY_ROUTES) {
    it(`${rel} references no local-token gate / next/headers`, () => {
      /*
      Test Doc:
      - Why: keep `/health` + `/windows` NextAuth-session-only (T008) — a future edit must not quietly
        add a local-token (`requireRemoteViewAccess`) or header (`next/headers`) auth path.
      - Contract: neither route source matches `\brequireRemoteViewAccess\b` or a `next/headers` import.
      - Quality Contribution: the deeper guard the companion suggested beyond the zero-arg structural proof.
      - Worked Example: today both gate via `requireRemoteViewSession()` and import only `next/server` → pass.
      */
      const source = readFileSync(resolve(process.cwd(), rel), 'utf-8');
      const hits = FORBIDDEN.filter((f) => f.re.test(source)).map((f) => f.name);
      expect(hits).toEqual([]);
    });
  }
});
