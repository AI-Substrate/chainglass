/**
 * Office Preview API Route — GET /api/workspaces/[slug]/files/office-preview
 *
 * Serves an Office document (docx, pptx, xlsx, …) as a PDF converted by LibreOffice, for the
 * file browser's PDF viewer. Conversions are cached per file version; see
 * src/features/041-file-browser/services/office-preview.ts.
 *
 * Security: the same session auth and IPathResolver traversal guard as the raw-file route.
 * 501 when LibreOffice is not installed; 502 when a conversion fails. Both carry a plain-text
 * reason the viewer shows.
 */

import type * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { auth } from '@/auth';
import { getContainer } from '@/lib/bootstrap-singleton';
import { detectContentType } from '@/lib/content-type-detection';
import { type IPathResolver, PathSecurityError, SHARED_DI_TOKENS } from '@chainglass/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  OfficeConverterMissingError,
  officePreviewPdf,
} from '../../../../../../src/features/041-file-browser/services/office-preview';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  await params; // consume async params (required by Next.js 16)
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');
  const file = searchParams.get('file');
  if (!worktree || !file) {
    return new Response('Missing worktree or file parameter', { status: 400 });
  }
  if (!worktree.startsWith('/')) {
    return new Response('Invalid worktree path', { status: 400 });
  }
  if (detectContentType(file).category !== 'office') {
    return new Response('Not an Office document', { status: 400 });
  }

  const pathResolver = getContainer().resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktree, file);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return new Response('Path traversal not allowed', { status: 403 });
    }
    return new Response('File not found', { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = await fsPromises.stat(absolutePath);
    if (!stat.isFile()) return new Response('Not a file', { status: 400 });
  } catch {
    return new Response('File not found', { status: 404 });
  }

  let pdf: string;
  try {
    pdf = await officePreviewPdf(absolutePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  } catch (error) {
    if (error instanceof OfficeConverterMissingError) {
      return new Response(error.message, { status: 501 });
    }
    const reason = error instanceof Error ? error.message : 'Conversion failed';
    return new Response(`Could not convert this document for preview: ${reason}`, {
      status: 502,
    });
  }

  // A converted preview is a few MB at most, so it is read whole rather than streamed.
  const body = await fsPromises.readFile(pdf);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=0',
    },
  });
}
