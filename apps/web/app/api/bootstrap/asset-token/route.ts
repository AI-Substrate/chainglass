/**
 * Plan 084 FX011 — `POST /api/bootstrap/asset-token`.
 *
 * Mints a short-lived (10 min), HMAC-signed asset token bound to a
 * worktree. Consumed by HtmlViewer so the sandboxed iframe (which can't
 * carry the HttpOnly bootstrap cookie due to its opaque origin) can
 * authenticate sub-resource requests against the raw-file route via
 * `?_at=<token>`.
 *
 * Auth: cookie-gated by the proxy (this route is intentionally NOT in
 * `AUTH_BYPASS_ROUTES` — only cookie-bearing callers can mint tokens).
 *
 * Status codes:
 *   200 → `{ token, expiresAt }`
 *   400 → `{ error: 'bad-request' }` (missing/empty/relative worktree, malformed JSON)
 *   401 → enforced by the proxy layer, not this handler
 *   503 → `{ error: 'unavailable' }` (bootstrap code/key not readable)
 *
 * Shape validation only — path existence and traversal are enforced at
 * the raw-file route via `IPathResolver`. This route does NOT stat the
 * worktree, so minting a token for a nonexistent path is allowed; the
 * raw-file route still rejects unresolvable paths.
 */
import { buildAssetToken } from '@chainglass/shared/auth-bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';

export const dynamic = 'force-dynamic';

const ASSET_TOKEN_TTL_SECONDS = 600; // 10 minutes

function badRequest(): NextResponse {
  return NextResponse.json({ error: 'bad-request' }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest();
  }

  // Shape: { worktree: <non-empty absolute path string> }
  // Mirror verify-route's manual validation pattern — apps/web doesn't
  // depend on Zod and adding it here for one field would be excess.
  const worktree =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { worktree?: unknown }).worktree === 'string'
      ? (body as { worktree: string }).worktree
      : null;
  if (worktree === null || worktree.length === 0 || !worktree.startsWith('/')) {
    return badRequest();
  }

  let codeAndKey: Awaited<ReturnType<typeof getBootstrapCodeAndKey>> | undefined;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const { token, expiresAt } = buildAssetToken(
    worktree,
    codeAndKey.key,
    ASSET_TOKEN_TTL_SECONDS
  );
  return NextResponse.json({ token, expiresAt }, { status: 200 });
}
