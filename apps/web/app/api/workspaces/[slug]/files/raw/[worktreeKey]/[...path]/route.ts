/**
 * Path-style Raw File API — GET /api/workspaces/[slug]/files/raw/[worktreeKey]/[...path]
 *
 * Same file, same checks as the query-style route (`../route.ts`), but with the file's path in
 * the URL so a multi-file HTML page opened directly in a tab can load its siblings by relative
 * URL (`data.js`, `img/a.png`, `../shared.css` within the worktree). `worktreeKey` is the
 * worktree's absolute path, base64url-encoded (`lib/raw-file-path-url.ts`).
 *
 * Delegates to the query-style handler so auth, path-traversal prevention, content types and
 * Range support live in one place. The asset token (`_at`) is dropped: it is honoured only on
 * the query-style route, whose narrow proxy bypass is deliberate (FX011).
 */

import { decodeWorktreeKey } from '@/features/041-file-browser/lib/raw-file-path-url';
import { NextRequest } from 'next/server';
import { GET as getQueryStyle } from '../../route';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; worktreeKey: string; path: string[] }> }
): Promise<Response> {
  const { slug, worktreeKey, path } = await params;
  const worktree = decodeWorktreeKey(worktreeKey);
  if (!worktree) {
    return new Response('Invalid worktree key', { status: 400 });
  }

  const target = new URL(request.url);
  target.pathname = `/api/workspaces/${encodeURIComponent(slug)}/files/raw`;
  target.searchParams.delete('_at');
  target.searchParams.set('worktree', worktree);
  target.searchParams.set('file', path.join('/'));

  const delegated = new NextRequest(target, { method: 'GET', headers: request.headers });
  return getQueryStyle(delegated, { params: Promise.resolve({ slug }) });
}
