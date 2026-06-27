/**
 * Architecture guard — `_platform/*` must not import `088-remote-view`.
 *
 * remote-view is a leaf-like business domain that consumes `_platform/*`
 * contracts; the platform must never depend back on it. This guard makes that
 * one-directional dependency a deterministic test rather than an eyeball — the
 * Spec Domain Review condition for approving remote-view as a NEW domain.
 *
 * Mechanism re-rooted from `viewer-no-file-browser.test.ts` (single recursive
 * source collect + import-specifier regex), pointed at the whole `_platform/`
 * feature tree. Scope is the `_platform/*` feature tree only — there is no
 * separate "platform packages" sweep (packages don't import feature dirs).
 *
 * Plan 088: Remote App View — T002 (Phase 2)
 * G3 (architecture), dep-direction invariant
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLATFORM_DIR = resolve(process.cwd(), 'apps/web/src/features/_platform');

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

/** Match `import ... from '...088-remote-view...'` and `import('...088-remote-view...')`. */
const REMOTE_VIEW_IMPORT = /(?:from\s+|import\(\s*)['"][^'"]*088-remote-view[^'"]*['"]/;

describe('_platform ↛ remote-view dependency direction', () => {
  it('no _platform source imports from 088-remote-view', () => {
    /*
    Test Doc:
    - Why: keep _platform free of business-domain deps — remote-view consumes _platform, never the reverse (G3); the Spec Domain Review approval condition for the new domain.
    - Contract: zero files under apps/web/src/features/_platform reference an 088-remote-view import specifier (static `from '…'` or dynamic `import('…')`).
    - Usage Notes: recursively scans every .ts/.tsx under _platform/; scope is the _platform feature tree only (no separate package sweep — packages don't import feature dirs).
    - Quality Contribution: G3 architecture invariant; makes the dep-direction a deterministic test the moment the domain exists, before any code can violate it.
    - Worked Example: remote-view's token route imports @chainglass/shared auth + @/features/064-terminal consts — never the inverse; _platform/auth stays oblivious to remote-view.
    */
    const offenders: string[] = [];
    for (const file of collectSourceFiles(PLATFORM_DIR)) {
      const source = readFileSync(file, 'utf-8');
      for (const line of source.split('\n')) {
        if (REMOTE_VIEW_IMPORT.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
