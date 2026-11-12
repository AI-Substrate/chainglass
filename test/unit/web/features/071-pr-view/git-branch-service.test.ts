/**
 * Git Branch Service — Unit Tests
 *
 * Why: Validates branch info, merge-base, and branch file listing.
 * Contract: getCurrentBranch returns branch name, getMergeBase returns SHA.
 * Usage Notes: Tests use real git repos in tmpdir with actual branches.
 * Quality Contribution: Ensures Branch mode comparison works correctly.
 * Worked Example: create branch → getCurrentBranch → verify name.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getChangedFilesBranch,
  getMergeBase,
  parseNameStatus,
} from '@/features/071-pr-view/lib/git-branch-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git, initRepo } from '../../../../helpers/git';
import { makeTmpDir, removeTmpDir } from '../../../../helpers/tmpdir';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = makeTmpDir('git-branch');
  await initRepo(tmpDir);
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Hello\n');
  await git(tmpDir, 'add', '.');
  await git(tmpDir, 'commit', '-m', 'initial');
});

afterEach(() => {
  removeTmpDir(tmpDir);
});

// Plan 084 FX007 — getCurrentBranch + getDefaultBaseBranch lifted to
// `_platform/git`. Their tests live in
// `test/unit/web/features/_platform/git/git-cli.test.ts`.

describe('getMergeBase', () => {
  /**
   * Why: Branch mode needs merge-base SHA.
   * Contract: Returns SHA of common ancestor.
   */
  it('returns merge-base SHA', async () => {
    const initialSha = await git(tmpDir, 'rev-parse', 'HEAD');
    await git(tmpDir, 'checkout', '-b', 'feature/test');
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'feature\n');
    await git(tmpDir, 'add', '.');
    await git(tmpDir, 'commit', '-m', 'feature commit');

    const mergeBase = await getMergeBase(tmpDir, 'main');
    expect(mergeBase).toBe(initialSha);
  });

  /**
   * Why: Invalid base branch.
   * Contract: Returns null for non-existent branch.
   */
  it('returns null for non-existent base branch', async () => {
    const mergeBase = await getMergeBase(tmpDir, 'nonexistent');
    expect(mergeBase).toBeNull();
  });
});

describe('getChangedFilesBranch', () => {
  /**
   * Why: Branch mode needs list of changed files.
   * Contract: Returns files changed between base and HEAD.
   */
  it('returns files changed on branch', async () => {
    const baseSha = await git(tmpDir, 'rev-parse', 'HEAD');
    await git(tmpDir, 'checkout', '-b', 'feature/test');
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'added\n');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Updated\n');
    await git(tmpDir, 'add', '.');
    await git(tmpDir, 'commit', '-m', 'feature changes');

    const files = await getChangedFilesBranch(tmpDir, baseSha);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('new.txt');
    expect(paths).toContain('README.md');
  });
});

describe('parseNameStatus', () => {
  /**
   * Why: Parser is the core logic — test independently.
   * Contract: Parses git diff --name-status output correctly.
   */
  it('parses modified and added files', () => {
    const output = 'M\tsrc/app.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(3);
    expect(files[0]).toEqual({ path: 'src/app.ts', status: 'modified' });
    expect(files[1]).toEqual({ path: 'src/new.ts', status: 'added' });
    expect(files[2]).toEqual({ path: 'src/old.ts', status: 'deleted' });
  });

  /**
   * Why: Renames have two paths — use new path.
   * Contract: Extracts new path from R100 rename entry.
   */
  it('handles renames (uses new path)', () => {
    const output = 'R100\tsrc/old.ts\tsrc/new.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ path: 'src/new.ts', status: 'renamed' });
  });

  /**
   * Why: Empty output is valid.
   * Contract: Returns empty array.
   */
  it('returns empty for empty output', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});
