/**
 * Office document previews — Word, PowerPoint, Excel (and their older / OpenDocument kin) are
 * converted to PDF by LibreOffice and shown in the PDF viewer (Jordan, 2026-10-07).
 *
 * Server-only (spawns `soffice`). A conversion is cached per file version (path + mtime + size),
 * so reopening is instant and an edit converts once; an older version's PDF is dropped when its
 * file's next version is converted. Conversions run one at a time: soffice will not share its
 * profile between two running instances, and chainglass keeps its own profile so a desktop
 * LibreOffice the user has open is never touched.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** A large deck takes a few seconds; this only stops a wedged soffice holding the queue. */
export const OFFICE_CONVERT_TIMEOUT_MS = 120_000;

const MAC_SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

export class OfficeConverterMissingError extends Error {
  constructor() {
    super(
      'LibreOffice is not installed, so Office documents cannot be previewed. Install it (macOS: brew install --cask libreoffice) or set CHAINGLASS_SOFFICE to its soffice binary.'
    );
    this.name = 'OfficeConverterMissingError';
  }
}

export interface OfficePreviewDeps {
  cacheDir: string;
  findSoffice: () => Promise<string | null>;
  run: (command: string, args: string[], timeoutMs: number) => Promise<void>;
}

const defaultDeps: OfficePreviewDeps = {
  cacheDir: path.join(os.tmpdir(), 'chainglass-office-preview'),
  findSoffice: () => findSoffice(),
  run: (command, args, timeoutMs) =>
    new Promise((resolve, reject) => {
      execFile(command, args, { timeout: timeoutMs }, (error, _stdout, stderr) =>
        error ? reject(new Error(stderr.trim() || error.message)) : resolve()
      );
    }),
};

/** `CHAINGLASS_SOFFICE`, the macOS app bundle, then `soffice` / `libreoffice` on PATH. */
export async function findSoffice(
  env: Record<string, string | undefined> = process.env,
  isExecutable: (file: string) => Promise<boolean> = executable
): Promise<string | null> {
  const onPath = (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((dir) => [path.join(dir, 'soffice'), path.join(dir, 'libreoffice')]);
  for (const candidate of [env.CHAINGLASS_SOFFICE, MAC_SOFFICE, ...onPath]) {
    if (candidate && (await isExecutable(candidate))) return candidate;
  }
  return null;
}

async function executable(file: string): Promise<boolean> {
  try {
    await fs.access(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<string>>();

/**
 * The PDF for this version of an Office file, converting it if it is not cached yet.
 * Resolves to the cached PDF's path.
 */
export async function officePreviewPdf(
  absolutePath: string,
  version: { mtimeMs: number; size: number },
  deps: OfficePreviewDeps = defaultDeps
): Promise<string> {
  const fileKey = digest(absolutePath);
  const pdf = path.join(
    deps.cacheDir,
    `${fileKey}-${digest(`${version.mtimeMs}:${version.size}`)}.pdf`
  );
  try {
    await fs.access(pdf);
    return pdf;
  } catch {
    // Not converted yet.
  }
  const pending = inFlight.get(pdf);
  if (pending) return pending;

  const job = queue
    .catch(() => undefined)
    .then(() => convert(absolutePath, fileKey, pdf, deps))
    .finally(() => inFlight.delete(pdf));
  queue = job;
  inFlight.set(pdf, job);
  return job;
}

async function convert(
  absolutePath: string,
  fileKey: string,
  pdf: string,
  deps: OfficePreviewDeps
): Promise<string> {
  const soffice = await deps.findSoffice();
  if (!soffice) throw new OfficeConverterMissingError();
  await fs.mkdir(deps.cacheDir, { recursive: true });
  const work = await fs.mkdtemp(path.join(deps.cacheDir, 'convert-'));
  try {
    await deps.run(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(path.join(deps.cacheDir, 'profile')).href}`,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        work,
        absolutePath,
      ],
      OFFICE_CONVERT_TIMEOUT_MS
    );
    const output = path.join(work, `${path.parse(absolutePath).name}.pdf`);
    try {
      await fs.access(output);
    } catch {
      throw new Error(`LibreOffice produced no PDF for ${path.basename(absolutePath)}`);
    }
    // Drop this file's earlier versions, then publish the new one.
    for (const entry of await fs.readdir(deps.cacheDir)) {
      if (entry.startsWith(`${fileKey}-`) && entry.endsWith('.pdf')) {
        await fs.rm(path.join(deps.cacheDir, entry), { force: true });
      }
    }
    await fs.rename(output, pdf);
    return pdf;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
