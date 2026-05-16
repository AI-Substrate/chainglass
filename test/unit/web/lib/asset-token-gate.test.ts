/**
 * Plan 084 FX011 — `isAssetTokenEligiblePath` regex-scoped pathname helper.
 *
 * Locks the contract that the proxy's asset-token short-circuit ONLY fires
 * for `/api/workspaces/<slug>/files/raw` — no trailing slash, no subpath,
 * no over-broadening to `/api/workspaces/*`. Mirrors `isBypassPath` in
 * `cookie-gate.ts` but uses a regex (the route is parameterised, so the
 * existing `startsWith` model can't express it).
 */
import { describe, expect, it } from 'vitest';

import { isAssetTokenEligiblePath } from '../../../../apps/web/src/lib/asset-token-gate';

describe('isAssetTokenEligiblePath', () => {
  it.each([
    // ✓ Eligible — real-world slug shapes
    ['/api/workspaces/my-slug/files/raw', true],
    ['/api/workspaces/my_under_slug/files/raw', true],
    ['/api/workspaces/123/files/raw', true],
    ['/api/workspaces/x/files/raw', true],
    // ✗ Trailing slash — Next.js pathname does not include one for this route
    ['/api/workspaces/foo/files/raw/', false],
    // ✗ Subpath — would over-broaden the bypass
    ['/api/workspaces/foo/files/raw/sub', false],
    ['/api/workspaces/foo/files/raw/../danger', false],
    // ✗ Not the raw route
    ['/api/workspaces/foo/files', false],
    ['/api/workspaces/foo', false],
    // ✗ Empty slug
    ['/api/workspaces//files/raw', false],
    // ✗ Different route entirely
    ['/api/events', false],
    ['/api/bootstrap/asset-token', false],
    ['/api/bootstrap/verify', false],
    ['/', false],
    ['', false],
  ])('isAssetTokenEligiblePath(%s) === %s', (path, expected) => {
    expect(isAssetTokenEligiblePath(path)).toBe(expected);
  });
});
