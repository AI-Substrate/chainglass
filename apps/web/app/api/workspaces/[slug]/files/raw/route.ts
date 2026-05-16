/**
 * Raw File API Route — GET /api/workspaces/[slug]/files/raw
 *
 * Streams raw binary file content with correct Content-Type headers.
 * Supports HTTP Range requests for video seeking.
 *
 * Security: Uses IPathResolver for path traversal prevention.
 * Symlinks are followed — this is a local dev tool.
 *
 * Plan 046: Binary File Viewers
 * DYK-01: Uses fs.createReadStream — never buffers full file.
 * DYK-03: Content-Disposition: inline by default; ?download=true for attachment.
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { auth } from '@/auth';
import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { getContainer } from '@/lib/bootstrap-singleton';
import { detectContentType } from '@/lib/content-type-detection';
import { type IPathResolver, PathSecurityError, SHARED_DI_TOKENS } from '@chainglass/shared';
import { verifyAssetToken } from '@chainglass/shared/auth-bootstrap-code';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  await params; // consume async params (required by Next.js 16)
  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');
  const file = searchParams.get('file');
  const download = searchParams.get('download') === 'true';
  const assetToken = searchParams.get('_at');

  // FX011 three-branch auth logic.
  //
  // (1) `_at` present + valid + worktree matches → proceed (skip auth())
  // (2) `_at` present + INVALID → reject explicitly with 401. We MUST NOT
  //     fall through to auth(): under `DISABLE_GITHUB_OAUTH=true` the
  //     auth() wrapper returns a fake passing session
  //     (`apps/web/src/auth.ts:75-83`), which would silently grant access
  //     on a bad token. Explicit rejection closes that gap.
  // (3) `_at` absent → call auth() as before. This preserves the original
  //     browser flow where the bootstrap cookie + Auth.js session do the
  //     authentication.
  //
  // Defense in depth: the proxy already rejects no-cookie + bad-token at
  // the boundary; this handler check is the second layer.
  if (assetToken !== null) {
    if (worktree === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let key: Buffer;
    try {
      key = (await getBootstrapCodeAndKey()).key;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const nowS = Math.floor(Date.now() / 1000);
    if (!verifyAssetToken(assetToken, worktree, key, nowS)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Token valid → skip auth() and proceed.
  } else {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!worktree || !file) {
    return new Response('Missing worktree or file parameter', { status: 400 });
  }

  if (!worktree.startsWith('/')) {
    return new Response('Invalid worktree path', { status: 400 });
  }

  // Security: use IPathResolver for path traversal + symlink escape prevention
  const container = getContainer();
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktree, file);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return new Response('Path traversal not allowed', { status: 403 });
    }
    return new Response('File not found', { status: 404 });
  }

  // Symlink following: allow symlinks that point outside the workspace.
  // PathResolver.resolvePath() above already prevents ../traversal in the URL path.
  // This is a local dev tool — the user controls what's symlinked.

  // Stat for size + existence
  let stat: fs.Stats;
  try {
    stat = await fsPromises.stat(absolutePath);
    if (!stat.isFile()) {
      return new Response('Not a file', { status: 400 });
    }
  } catch {
    return new Response('File not found', { status: 404 });
  }

  const { mimeType } = detectContentType(file);
  const filename = path.basename(file);
  const sanitizedFilename = filename.replace(/"/g, '');
  const disposition = download ? `attachment; filename="${sanitizedFilename}"` : 'inline';

  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Disposition': disposition,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=0',
  };

  // Handle Range requests
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (!match) {
      return new Response('Invalid range', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }

    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(absolutePath, { start, end });
    const webStream = readableNodeToWeb(stream);

    return new Response(webStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': String(chunkSize),
      },
    });
  }

  // Full file streaming
  const stream = fs.createReadStream(absolutePath);
  const webStream = readableNodeToWeb(stream);

  return new Response(webStream, {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(stat.size),
    },
  });
}

/** Convert Node.js Readable to Web ReadableStream */
function readableNodeToWeb(nodeStream: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
