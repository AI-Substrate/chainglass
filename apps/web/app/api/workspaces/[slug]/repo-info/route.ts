/**
 * Repo Info API — `GET /api/workspaces/[slug]/repo-info?worktree=<path>`
 *
 * Plan 084 FX007 (copy-repo-url) — surfaces the parsed remote + branch +
 * SHA state of a worktree to the file-browser client so the right-click
 * "Copy URL" menu items can build host-aware web URLs.
 *
 * **Hardening (per plan key findings)**:
 * - Finding 02: Independent bootstrap-cookie verify on top of `auth()`. The
 *   RootLayout `<BootstrapGate>` is client-only and does NOT gate API
 *   routes. Mirrors `apps/web/app/api/terminal/token/route.ts:45-64`.
 * - Finding 01: Two-layer worktree validation — defensive (`startsWith('/')`
 *   + no `..`) AND closed-set against `IWorkspaceService.getInfo(slug)?.worktrees[].path`.
 * - Finding 11: Next 16 conventions — `params: Promise<{slug}>`, `await
 *   params`, `export const dynamic = 'force-dynamic'`.
 * - Finding 12: Response shape carries no raw `remoteUrl` — only the parsed
 *   `host`/`org`/`project`/`repo` fields. Credentials in the source URL are
 *   stripped by `parseRemote` before this route ever sees them.
 */

import { auth } from '@/auth';
import {
  getCurrentBranch,
  getCurrentCommitSha,
  getDefaultBaseBranch,
  getRemoteUrl,
  parseRemote,
  type RepoInfo,
} from '@/features/_platform/git';
import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import {
  BOOTSTRAP_COOKIE_NAME,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { type NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  // (a) NextAuth session check.
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // (b) Independent bootstrap-cookie check — defence-in-depth (finding 02).
  const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value;
  let codeAndKey: { code: string; key: Buffer };
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    return NextResponse.json(
      { error: 'bootstrap-unavailable' },
      { status: 503 },
    );
  }
  if (!verifyCookieValue(cookieValue, codeAndKey.code, codeAndKey.key)) {
    return NextResponse.json(
      { error: 'bootstrap-cookie-required' },
      { status: 401 },
    );
  }

  const { slug } = await params;

  // (c) Defensive worktree-path validation (finding 01a).
  const { searchParams } = new URL(req.url);
  const worktree = searchParams.get('worktree');
  if (!worktree) {
    return NextResponse.json(
      { error: 'Missing worktree parameter' },
      { status: 400 },
    );
  }
  if (!worktree.startsWith('/') || worktree.includes('..')) {
    return NextResponse.json(
      { error: 'Invalid worktree path' },
      { status: 400 },
    );
  }

  // (d) Closed-set worktree validation against the workspace's known
  //     worktrees (finding 01b). `getInfo(slug) === null` → 400.
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE,
  );
  const info = await workspaceService.getInfo(slug);
  if (!info) {
    return NextResponse.json(
      { error: 'Workspace not found' },
      { status: 400 },
    );
  }
  const isKnownWorktree = info.worktrees.some((w) => w.path === worktree);
  if (!isKnownWorktree) {
    return NextResponse.json(
      { error: 'Worktree not in workspace' },
      { status: 400 },
    );
  }

  // (e) Read git state. All four reads run in parallel; each gracefully
  //     degrades to its own null/fallback on failure.
  const [remoteUrl, currentBranch, defaultBranch, currentSha] =
    await Promise.all([
      getRemoteUrl(worktree),
      getCurrentBranch(worktree),
      getDefaultBaseBranch(worktree),
      getCurrentCommitSha(worktree),
    ]);

  const remote = remoteUrl ? parseRemote(remoteUrl) : null;
  const isDetached = currentBranch === 'HEAD';

  // (f) Response shape — no raw `remoteUrl` (finding 12).
  const payload: RepoInfo = remote
    ? {
        host: remote.host,
        org: remote.org,
        project: remote.project,
        repo: remote.repo,
        currentBranch,
        defaultBranch,
        currentSha,
        isDetached,
      }
    : {
        host: 'unknown',
        org: null,
        project: null,
        repo: null,
        currentBranch,
        defaultBranch,
        currentSha,
        isDetached,
      };

  return NextResponse.json(payload);
}
