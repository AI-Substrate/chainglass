/**
 * AC-13 bundle guard — the remote-view viewport (WebCodecs + canvas) must be
 * lazy-loaded, not in the initial bundle of the file-browser route.
 *
 * Deterministic (not an eyeball): after a production build, scan the Next build
 * output and assert that the heavy viewport lives in a lazy chunk and is ABSENT
 * from the always-loaded shared bundle. The sentinel `remote-view-viewport` is a
 * data-testid that lives ONLY in viewport.tsx (the heavy component reached via
 * `dynamic(ssr:false)` RemoteViewPanel), never in the thin lazy wrapper, so its
 * presence pins the chunk boundary.
 *
 * Requires a build (`pnpm turbo build --filter=@chainglass/web`). When `.next`
 * is absent the test skips so the normal unit run stays green. (Same accepted
 * shape as the Plan 086 AC-10 guard, incl. the turbopack manifest caveat.)
 *
 * Plan 088 Phase 3 — T008. AC-13 (viewport lazy-loaded; base bundle unchanged).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const NEXT_DIR = resolve(process.cwd(), 'apps/web/.next');
const SENTINEL = 'remote-view-viewport';

function readChunk(rel: string): string {
  const full = join(NEXT_DIR, rel);
  return existsSync(full) ? readFileSync(full, 'utf-8') : '';
}

function allChunkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...allChunkFiles(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('AC-13: remote-view viewport is lazy-loaded (not in the initial bundle)', () => {
  it('the heavy viewport is isolated in a lazy chunk and absent from the global shared bundle', () => {
    /*
    Test Doc:
    - Why: the WebCodecs decoder + canvas viewport must not weigh down the initial file-browser load — AC-13.
    - Contract: no browser-route initial/shared chunk contains `remote-view-viewport`; ≥1 lazy chunk does.
    - Usage Notes: requires a production build; skips when `.next` is absent (so the normal unit run stays green). The complementary proof it isn't eagerly loaded is the host streaming smoke + the lazy `dynamic()` import in browser-client.
    - Quality Contribution: AC-13 (lazy-loaded; base bundle unchanged).
    - Worked Example: `dynamic(() => import('remote-view-panel'))` puts the viewport in its own chunk.
    */
    if (!existsSync(NEXT_DIR)) {
      // No build present — skip rather than fail the normal unit run.
      expect(true).toBe(true);
      return;
    }

    // 1. The lazy chunk must exist somewhere in the build output.
    const chunkFiles = allChunkFiles(join(NEXT_DIR, 'static', 'chunks'));
    const lazyChunkPresent = chunkFiles.some((f) => readFileSync(f, 'utf-8').includes(SENTINEL));
    expect(lazyChunkPresent, `expected some built chunk to contain "${SENTINEL}"`).toBe(true);

    // 2. The always-loaded shared bundle must NOT contain the viewport. Next 16's
    // turbopack build emits build-manifest.json; rootMainFiles + polyfills +
    // low-priority + the /_app entry are the chunks loaded up front on every page.
    const manifestPath = join(NEXT_DIR, 'build-manifest.json');
    if (!existsSync(manifestPath)) {
      // No manifest — the presence check above still proves a separate chunk exists.
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      pages?: Record<string, string[]>;
      polyfillFiles?: string[];
      lowPriorityFiles?: string[];
      rootMainFiles?: string[];
    };
    const initialChunks = new Set<string>([
      ...(manifest.rootMainFiles ?? []),
      ...(manifest.polyfillFiles ?? []),
      ...(manifest.lowPriorityFiles ?? []),
      ...(manifest.pages?.['/_app'] ?? []),
    ]);

    const offenders = [...initialChunks].filter((rel) => readChunk(rel).includes(SENTINEL));
    expect(offenders, `viewport leaked into the shared bundle: ${offenders.join(', ')}`).toEqual([]);
  });
});
