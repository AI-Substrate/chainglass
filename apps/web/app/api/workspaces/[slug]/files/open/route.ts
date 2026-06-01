/**
 * Open-in-System API Route — POST /api/workspaces/[slug]/files/open
 *
 * Opens a file with the host OS's default application (the same as
 * double-clicking it in Finder/Explorer) — e.g. a `.pptx` opens in PowerPoint.
 *
 * The open command runs on the MACHINE HOSTING this server, so it only makes
 * sense when the browser and the server are the same machine. Two gates enforce
 * that:
 *   1. `localhostGuard` — rejects any non-loopback request (403). This is the
 *      real security boundary: it prevents a remote user from launching apps on
 *      someone else's machine. The button is also hidden client-side off-local.
 *   2. `auth()` — same session requirement as the raw-file route (401).
 *
 * Security: path traversal is prevented via `IPathResolver` (shared with the
 * raw route). The absolute path is passed to `execFile` as an argv element
 * (never through a shell), so metacharacters in the path can't be exploited.
 */

import { execFile } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { promisify } from 'node:util';
import { auth } from '@/auth';
import { getContainer } from '@/lib/bootstrap-singleton';
import { localhostGuard } from '@/lib/localhost-guard';
import { type IPathResolver, PathSecurityError, SHARED_DI_TOKENS } from '@chainglass/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

/** Resolve the platform-specific "open with default app" command + argv. */
function openCommand(absolutePath: string): { cmd: string; args: string[] } {
  switch (process.platform) {
    case 'darwin':
      return { cmd: 'open', args: [absolutePath] };
    case 'win32':
      // `start` is a cmd builtin; the first quoted arg is the window title.
      return { cmd: 'cmd', args: ['/c', 'start', '', absolutePath] };
    default:
      return { cmd: 'xdg-open', args: [absolutePath] };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  await params; // consume async params (required by Next.js 16)

  // Gate 1: loopback-only — the app launches on the server's desktop.
  const guard = localhostGuard(request);
  if (guard) return guard;

  // Gate 2: authenticated session (matches the raw-file route).
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');
  const file = searchParams.get('file');

  if (!worktree || !file) {
    return NextResponse.json({ error: 'Missing worktree or file parameter' }, { status: 400 });
  }
  if (!worktree.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid worktree path' }, { status: 400 });
  }

  // Security: resolve + path-traversal prevention via the shared resolver.
  const container = getContainer();
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktree, file);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 403 });
    }
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const stat = await fsPromises.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { cmd, args } = openCommand(absolutePath);
  try {
    await execFileAsync(cmd, args);
  } catch (err) {
    console.error('[files/open] failed to launch system app', err);
    return NextResponse.json({ error: 'Failed to open file' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
