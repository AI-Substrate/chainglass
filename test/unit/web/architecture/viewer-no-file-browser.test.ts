/**
 * Architecture guard — `_platform/viewer` must not import `041-file-browser`.
 *
 * The image editor lives in the generic viewer domain; save flows DOWN as
 * callbacks (file-browser → viewer), never the reverse. This guard makes the
 * one-directional dependency a deterministic test rather than an eyeball — it
 * closes the single genuinely-ABSENT sensor from the backpressure survey.
 *
 * Plan 086: In-browser Image Editor — T019
 * G3 (architecture), AC boundary invariant
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEWER_DIR = resolve(process.cwd(), 'apps/web/src/features/_platform/viewer');

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Match `import ... from '...041-file-browser...'` and `import('...041-file-browser...')`. */
const FILE_BROWSER_IMPORT = /(?:from\s+|import\(\s*)['"][^'"]*041-file-browser[^'"]*['"]/;

describe('viewer ↛ file-browser dependency direction', () => {
  it('no viewer source imports from 041-file-browser', () => {
    /*
    Test Doc:
    - Why: keep the viewer generic — file-browser depends on viewer, not vice versa (G3)
    - Contract: zero viewer files reference an 041-file-browser import specifier
    - Usage Notes: scans every .ts/.tsx under _platform/viewer
    - Quality Contribution: G3, plan boundary invariant, closes the ABSENT sensor
    - Worked Example: image-editor.tsx imports only ./lib + ui — never file-browser
    */
    const offenders: string[] = [];
    for (const file of collectSourceFiles(VIEWER_DIR)) {
      const source = readFileSync(file, 'utf-8');
      for (const line of source.split('\n')) {
        if (FILE_BROWSER_IMPORT.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
