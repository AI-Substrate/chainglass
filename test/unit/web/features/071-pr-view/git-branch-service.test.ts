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

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getChangedFilesBranch,
  getCurrentBranch,
  getDefaultBaseBranch,
  getMergeBase,
  parseNameStatus,
} from '@/features/071-pr-view/lib/git-branch-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

function git(cmd: string) {
  execSync(`git ${cmd}`, { cwd: tmpDir, stdio: 'ignore' });
}

function gitOutput(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: tmpDir }).toString().trim();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-branch-'));
  git('init -b main');
  git('config user.email "test@test.com"');
  git('config user.name "Test"');
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Hello\n');
  git('add .');
  git('commit -m "initial"');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getCurrentBranch', () => {
  /**
   * Why: Header needs branch name display.
   * Contract: Returns current branch name.
   */
  it('returns current branch name', async () => {
    const branch = await getCurrentBranch(tmpDir);
    expect(branch).toBe('main');
  });

  /**
   * Why: Feature branches need correct names.
   * Contract: Returns name after checkout.
   */
  it('returns feature branch name after checkout', async () => {
    git('checkout -b feature/test');
    const branch = await getCurrentBranch(tmpDir);
    expect(branch).toBe('feature/test');
  });

  /**
   * Why: Detached HEAD is a valid state.
   * Contract: Returns 'HEAD' for detached state.
   */
  it('returns HEAD for detached state', async () => {
    const sha = gitOutput('rev-parse HEAD');
    git(`checkout ${sha}`);
    const branch = await getCurrentBranch(tmpDir);
    expect(branch).toBe('HEAD');
  });
});

describe('getDefaultBaseBranch', () => {
  /**
   * Why: No remote configured — should fall back.
   * Contract: Returns 'main' when no origin/HEAD.
   */
  it('falls back to main when no remote', async () => {
    const base = await getDefaultBaseBranch(tmpDir);
    expect(base).toBe('main');
  });
});

describe('getMergeBase', () => {
  /**
   * Why: Branch mode needs merge-base SHA.
   * Contract: Returns SHA of common ancestor.
   */
  it('returns merge-base SHA', async () => {
    const initialSha = gitOutput('rev-parse HEAD');
    git('checkout -b feature/test');
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'feature\n');
    git('add .');
    git('commit -m "feature commit"');

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
    const baseSha = gitOutput('rev-parse HEAD');
    git('checkout -b feature/test');
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'added\n');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Updated\n');
    git('add .');
    git('commit -m "feature changes"');

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
