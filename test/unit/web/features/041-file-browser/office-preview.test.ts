import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { officePreviewUrl } from '../../../../../apps/web/src/features/041-file-browser/lib/office-preview-url';
import {
  OfficeConverterMissingError,
  type OfficePreviewDeps,
  findSoffice,
  officePreviewPdf,
} from '../../../../../apps/web/src/features/041-file-browser/services/office-preview';
import { detectContentType } from '../../../../../apps/web/src/lib/content-type-detection';

describe('officePreviewPdf', () => {
  let root: string;
  let deck: string;
  let conversions: string[][];
  let deps: OfficePreviewDeps;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-preview-'));
    deck = path.join(root, 'Quarterly Review.pptx');
    fs.writeFileSync(deck, 'pptx bytes');
    conversions = [];
    deps = {
      cacheDir: path.join(root, 'cache'),
      findSoffice: async () => '/opt/soffice',
      // Stands in for soffice: writes <name>.pdf into --outdir, as LibreOffice does.
      run: async (command, args) => {
        conversions.push([command, ...args]);
        const outdir = args[args.indexOf('--outdir') + 1];
        const input = args.at(-1) as string;
        fs.writeFileSync(path.join(outdir, `${path.parse(input).name}.pdf`), `pdf of ${input}`);
      },
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('converts once per version, with its own profile, and serves the cache after that', async () => {
    const first = await officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps);
    const again = await officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps);

    expect(again).toBe(first);
    expect(fs.readFileSync(first, 'utf8')).toBe(`pdf of ${deck}`);
    expect(conversions).toHaveLength(1);
    expect(conversions[0]).toEqual(
      expect.arrayContaining(['/opt/soffice', '--headless', '--convert-to', 'pdf', deck])
    );
    expect(conversions[0][1]).toMatch(/^-env:UserInstallation=file:\/\/.*\/cache\/profile$/);
  });

  it('shares one conversion between concurrent requests', async () => {
    const [a, b] = await Promise.all([
      officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps),
      officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps),
    ]);
    expect(a).toBe(b);
    expect(conversions).toHaveLength(1);
  });

  it('reconverts an edited file and drops the old version', async () => {
    const before = await officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps);
    const after = await officePreviewPdf(deck, { mtimeMs: 2, size: 12 }, deps);

    expect(after).not.toBe(before);
    expect(conversions).toHaveLength(2);
    expect(fs.existsSync(before)).toBe(false);
    expect(fs.existsSync(after)).toBe(true);
  });

  it('says how to install LibreOffice when it is missing, and recovers once it is there', async () => {
    const missing = { ...deps, findSoffice: async () => null };
    await expect(officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, missing)).rejects.toThrow(
      OfficeConverterMissingError
    );
    await expect(officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, deps)).resolves.toMatch(/\.pdf$/);
  });

  it('fails clearly when soffice writes no PDF', async () => {
    const silent = { ...deps, run: async () => undefined };
    await expect(officePreviewPdf(deck, { mtimeMs: 1, size: 10 }, silent)).rejects.toThrow(
      'LibreOffice produced no PDF for Quarterly Review.pptx'
    );
  });
});

describe('findSoffice', () => {
  it('prefers CHAINGLASS_SOFFICE, then the macOS app, then PATH', async () => {
    const present =
      (...files: string[]) =>
      async (file: string) =>
        files.includes(file);
    const mac = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
    const env = { CHAINGLASS_SOFFICE: '/custom/soffice', PATH: '/usr/bin:/opt/lo/bin' };

    expect(await findSoffice(env, present('/custom/soffice', mac))).toBe('/custom/soffice');
    expect(await findSoffice(env, present(mac, '/opt/lo/bin/soffice'))).toBe(mac);
    expect(await findSoffice(env, present('/opt/lo/bin/libreoffice'))).toBe(
      '/opt/lo/bin/libreoffice'
    );
    expect(await findSoffice(env, present())).toBeNull();
  });
});

describe('office documents in the file browser', () => {
  it('routes Word, PowerPoint, Excel and OpenDocument files to the office preview', () => {
    for (const name of [
      'a.docx',
      'a.DOC',
      'b.pptx',
      'b.ppt',
      'c.xlsx',
      'c.xls',
      'd.odt',
      'e.rtf',
    ]) {
      expect(detectContentType(name).category).toBe('office');
    }
    expect(
      officePreviewUrl('/api/workspaces/w/files/raw?worktree=%2Fr&file=a.pptx', '2026-10-07')
    ).toBe('/api/workspaces/w/files/office-preview?worktree=%2Fr&file=a.pptx&_v=2026-10-07');
  });
});
