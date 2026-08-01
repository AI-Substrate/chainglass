/**
 * SCAD Compile API Route — GET /api/workspaces/[slug]/files/scad
 *
 * Compiles an OpenSCAD source file to binary STL via the native `openscad`
 * binary and returns the mesh bytes (model/stl). Consumed by the ScadViewer
 * (Preview mode for .scad files) which parses the STL client-side.
 *
 * Compiles the on-disk file (not posted content) so relative `use <>` /
 * `include <>` / `import()` statements resolve against the file's own
 * directory. Output goes to a temp file that is always cleaned up.
 *
 * Security: Uses IPathResolver for path traversal prevention, same as the
 * raw-file route. Session auth only — this endpoint is fetched with
 * credentials by the viewer, never embedded as an HTML sub-resource.
 */

import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { auth } from '@/auth';
import { getContainer } from '@/lib/bootstrap-singleton';
import { type IPathResolver, PathSecurityError, SHARED_DI_TOKENS } from '@chainglass/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Compile timeout — parametric models can be slow, but the viewer should not hang forever. */
const COMPILE_TIMEOUT_MS = 30_000;

/** Refuse to buffer pathological meshes — this box shares the dev server with everything else. */
const MAX_STL_BYTES = 64 * 1024 * 1024;

/**
 * Where to find the openscad binary. CHAINGLASS_OPENSCAD_BIN overrides;
 * then bare `openscad` (PATH lookup), then the common macOS install
 * locations — the dev server's PATH may not include homebrew when
 * launched outside a login shell.
 */
function openscadCandidates(): string[] {
  const override = process.env.CHAINGLASS_OPENSCAD_BIN;
  return [
    ...(override ? [override] : []),
    'openscad',
    '/opt/homebrew/bin/openscad',
    '/usr/local/bin/openscad',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
  ];
}

interface CompileResult {
  ok: boolean;
  stl?: Buffer;
  stderr?: string;
  binaryMissing?: boolean;
}

function runOpenscad(bin: string, scadPath: string, outPath: string): Promise<CompileResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-o', outPath, '--export-format', 'binstl', scadPath],
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ ok: false, binaryMissing: true });
          return;
        }
        if (error) {
          resolve({ ok: false, stderr: stderr || error.message });
          return;
        }
        void (async () => {
          try {
            const s = await fsPromises.stat(outPath);
            if (s.size > MAX_STL_BYTES) {
              resolve({ ok: false, stderr: 'Compiled mesh exceeds the 64MB preview cap' });
              return;
            }
            resolve({ ok: true, stl: await fsPromises.readFile(outPath) });
          } catch {
            resolve({ ok: false, stderr: 'OpenSCAD produced no output file' });
          }
        })();
      }
    );
  });
}

async function compileScad(scadPath: string): Promise<CompileResult> {
  const outPath = path.join(os.tmpdir(), `chainglass-scad-${crypto.randomUUID()}.stl`);
  try {
    let lastResult: CompileResult = { ok: false, binaryMissing: true };
    for (const bin of openscadCandidates()) {
      lastResult = await runOpenscad(bin, scadPath, outPath);
      // Only fall through to the next candidate when THIS binary wasn't found;
      // a real compile error is final regardless of which install produced it.
      if (!lastResult.binaryMissing) return lastResult;
    }
    return lastResult;
  } finally {
    fsPromises.unlink(outPath).catch(() => {});
  }
}

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
    return NextResponse.json({ error: 'Missing worktree or file parameter' }, { status: 400 });
  }
  if (!worktree.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid worktree path' }, { status: 400 });
  }
  if (!file.toLowerCase().endsWith('.scad')) {
    return NextResponse.json({ error: 'Not a .scad file' }, { status: 400 });
  }

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
    if (!stat.isFile()) return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const result = await compileScad(absolutePath);

  if (result.binaryMissing) {
    return NextResponse.json(
      {
        error: 'openscad-not-installed',
        detail: 'Install OpenSCAD (brew install openscad) to preview .scad files.',
      },
      { status: 501 }
    );
  }
  if (!result.ok || !result.stl) {
    return NextResponse.json(
      { error: 'compile-failed', detail: result.stderr ?? 'Unknown OpenSCAD error' },
      { status: 422 }
    );
  }

  return new Response(new Uint8Array(result.stl), {
    status: 200,
    headers: {
      'Content-Type': 'model/stl',
      'Content-Length': String(result.stl.length),
      'Cache-Control': 'private, max-age=0',
    },
  });
}
