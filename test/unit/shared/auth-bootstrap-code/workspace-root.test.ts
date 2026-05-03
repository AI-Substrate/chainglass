/**
 * findWorkspaceRoot — walks up to the workspace root from a starting dir.
 *
 * Why: Plan 084 FX003. Closes the cwd-divergence gotcha where `pnpm dev`
 *      runs Next at `cwd=apps/web/` and the active `.chainglass/` file
 *      lands under `apps/web/`, not the workspace root the popup mentions.
 * Contract: marker priority is `pnpm-workspace.yaml` → `package.json` with
 *           non-empty `workspaces` → `.git/`. Falls back to the normalized
 *           `startDir` if no marker is reached before the filesystem root.
 *           Errors during fs traversal (parse failures, EACCES) are treated
 *           as "no marker at this level" — the helper never throws on
 *           filesystem inspection failures.
 * Quality contribution: real-fs temp-dir tests (Constitution P4); zero
 *                       mocks; per-test cleanup; cache-discipline test
 *                       proves invalidation works.
 *
 * Implementation Requirements (from validate-v2 pass on FX003 dossier):
 *   R1: cache key normalized via `path.resolve(startDir)`
 *   R2: try/catch around fs reads + JSON.parse — continue walking on error
 *   R3: `workspaces` truthy = non-empty array OR object with non-empty `packages`
 *   R4: cross-platform termination via `path.parse(start).root`
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetWorkspaceRootCacheForTests,
  findWorkspaceRoot,
} from '@chainglass/shared/auth-bootstrap-code';

import { mkTempCwd } from './test-fixtures';

describe('findWorkspaceRoot', () => {
  let temps: string[] = [];

  beforeEach(() => {
    _resetWorkspaceRootCacheForTests();
  });

  afterEach(() => {
    for (const t of temps) {
      rmSync(t, { recursive: true, force: true });
    }
    temps = [];
    _resetWorkspaceRootCacheForTests();
  });

  function track(dir: string): string {
    temps.push(dir);
    return dir;
  }

  it('case 1: returns dir containing pnpm-workspace.yaml (priority over package.json)', () => {
    const root = track(mkTempCwd('fwsr-1-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
    );
    const sub = join(root, 'apps', 'web');
    mkdirSync(sub, { recursive: true });

    expect(findWorkspaceRoot(sub)).toBe(root);
  });

  it('case 2: returns dir containing package.json with workspaces when no pnpm-workspace.yaml', () => {
    const root = track(mkTempCwd('fwsr-2-'));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    );
    const sub = join(root, 'packages', 'core');
    mkdirSync(sub, { recursive: true });

    expect(findWorkspaceRoot(sub)).toBe(root);
  });

  it('case 3: returns dir containing .git/ when no workspace markers', () => {
    const root = track(mkTempCwd('fwsr-3-'));
    mkdirSync(join(root, '.git'), { recursive: true });
    const sub = join(root, 'src', 'lib');
    mkdirSync(sub, { recursive: true });

    expect(findWorkspaceRoot(sub)).toBe(root);
  });

  it('case 4: falls back to normalized startDir when no marker found', () => {
    // System tmpdir on macOS (/var/folders/...) and Linux (/tmp/...) has no
    // workspace markers above it under normal dev/CI conditions. If a CI
    // box ever has markers above tmpdir, this single test will surface it
    // and the helper's fallback semantics can be revisited.
    const root = track(mkTempCwd('fwsr-4-'));
    const sub = join(root, 'lonely', 'subdir');
    mkdirSync(sub, { recursive: true });

    expect(findWorkspaceRoot(sub)).toBe(sub);
  });

  it('case 5: cache discipline — _resetWorkspaceRootCacheForTests invalidates', () => {
    const root = track(mkTempCwd('fwsr-5-'));
    mkdirSync(join(root, '.git'), { recursive: true });
    const sub = join(root, 'src');
    mkdirSync(sub);

    // First call walks → finds .git → caches result
    const first = findWorkspaceRoot(sub);
    expect(first).toBe(root);

    // Delete the marker. Cache hit returns previous value (proves caching).
    rmSync(join(root, '.git'), { recursive: true, force: true });
    const second = findWorkspaceRoot(sub);
    expect(second).toBe(root);

    // Reset → re-walks → no marker → fallback to startDir
    _resetWorkspaceRootCacheForTests();
    const third = findWorkspaceRoot(sub);
    expect(third).toBe(sub);
  });

  it('case 6: integration-test backcompat — mkTempCwd() result is its own root (no marker above)', () => {
    // Phase 1+2+3+6 unit + integration tests pass `mkTempCwd()` directly
    // as cwd. Confirm the helper preserves that contract: the tmpdir has
    // no markers above it on a clean dev/CI box → fallback to startDir.
    const root = track(mkTempCwd('fwsr-6-'));

    expect(findWorkspaceRoot(root)).toBe(root);
  });

  it('case 7: cache key normalization — `/foo/bar` and `/foo/bar/` share cache entry', () => {
    const root = track(mkTempCwd('fwsr-7-'));
    mkdirSync(join(root, '.git'), { recursive: true });
    const sub = join(root, 'apps', 'web');
    mkdirSync(sub, { recursive: true });
    const subTrailing = `${sub}/`;

    // First call: walks from `sub` → finds .git → caches under normalized key
    const first = findWorkspaceRoot(sub);
    expect(first).toBe(root);

    // Delete the marker. If the cache key were NOT normalized, calling
    // with the trailing-slash form would re-walk and miss the marker.
    rmSync(join(root, '.git'), { recursive: true, force: true });
    const second = findWorkspaceRoot(subTrailing);
    expect(second).toBe(root); // cache hit via normalized key

    // After reset, both forms should produce the normalized fallback.
    _resetWorkspaceRootCacheForTests();
    expect(findWorkspaceRoot(subTrailing)).toBe(sub);
    expect(findWorkspaceRoot(sub)).toBe(sub);
  });

  it('case 8: malformed package.json on the walk-up path is skipped, walk continues', () => {
    const root = track(mkTempCwd('fwsr-8-'));
    mkdirSync(join(root, '.git'), { recursive: true });
    const mid = join(root, 'sub');
    mkdirSync(mid);
    // Drop a malformed package.json halfway up the walk-up path.
    writeFileSync(join(mid, 'package.json'), '{not valid json');
    const start = join(mid, 'deeper');
    mkdirSync(start);

    // Walk: start → mid (malformed pkg → skip) → root (.git → match)
    expect(findWorkspaceRoot(start)).toBe(root);
  });
});
