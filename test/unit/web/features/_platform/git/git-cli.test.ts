/**
 * Git CLI Wrappers — Unit Tests (lightweight, real git in tmpdir)
 *
 * Why: Thin wrappers around `git` CLI — verify happy path + failure path for
 *   each. Pure pass-through of `cwd`, no behavior of our own beyond
 *   try/catch + trim + SHA-shape validation.
 * Contract: getRemoteUrl/getCurrentCommitSha return string|null;
 *   getCurrentBranch returns string ('HEAD' on detach);
 *   getDefaultBaseBranch returns string ('main' fallback).
 * Usage Notes: Uses real `git` against a tmpdir per project convention
 *   (matches `apps/web/src/features/071-pr-view/lib/git-branch-service.ts`
 *   tests). Failure paths point at non-git directories or unset state.
 * Quality Contribution: Catches contract drift between the lifted PR-view
 *   helpers and the new sub-domain location.
 * Worked Example:
 *   tmp = init repo with one commit on `main`
 *   getCurrentBranch(tmp) === 'main'
 *   getRemoteUrl(tmp) === null  (no origin configured)
 *
 * Plan 084 FX007 — copy-repo-url. Findings: 14.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getCurrentBranch,
  getCurrentCommitSha,
  getDefaultBaseBranch,
  getRemoteUrl,
} from '@/features/_platform/git/index.server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git } from '../../../../../helpers/git';
import { makeTmpDir, removeTmpDir } from '../../../../../helpers/tmpdir';

let tmp: string;

beforeEach(async () => {
  tmp = makeTmpDir('git-cli');
  await git(tmp, 'init', '-b', 'main');
  await git(tmp, 'config', 'user.email', 't@t.com');
  await git(tmp, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(tmp, 'README.md'), '# x\n');
  await git(tmp, 'add', '.');
  await git(tmp, 'commit', '-m', 'initial');
});

afterEach(() => {
  removeTmpDir(tmp);
});

describe('getRemoteUrl', () => {
  it('returns the origin URL when configured', async () => {
    await git(tmp, 'remote', 'add', 'origin', 'https://github.com/org/repo.git');
    expect(await getRemoteUrl(tmp)).toBe('https://github.com/org/repo.git');
  });

  it('returns null when no origin remote is set', async () => {
    expect(await getRemoteUrl(tmp)).toBeNull();
  });

  it('returns null when cwd is not a git repo', async () => {
    const nonRepo = makeTmpDir('not-git');
    try {
      expect(await getRemoteUrl(nonRepo)).toBeNull();
    } finally {
      removeTmpDir(nonRepo);
    }
  });
});

describe('getCurrentBranch', () => {
  it('returns the branch name', async () => {
    expect(await getCurrentBranch(tmp)).toBe('main');
  });

  it("returns 'HEAD' in detached state", async () => {
    await git(tmp, 'checkout', '--detach', 'HEAD');
    expect(await getCurrentBranch(tmp)).toBe('HEAD');
  });

  it("returns 'HEAD' when cwd is not a git repo", async () => {
    const nonRepo = makeTmpDir('not-git');
    try {
      expect(await getCurrentBranch(nonRepo)).toBe('HEAD');
    } finally {
      removeTmpDir(nonRepo);
    }
  });
});

describe('getDefaultBaseBranch', () => {
  it("returns 'main' when origin/HEAD is unset (fallback)", async () => {
    expect(await getDefaultBaseBranch(tmp)).toBe('main');
  });

  it('returns the actual default ref when origin/HEAD is set', async () => {
    // Simulate: a remote exists and origin/HEAD points at master.
    // We can fake this by adding a remote and writing origin/HEAD directly.
    await git(tmp, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
    fs.mkdirSync(path.join(tmp, '.git', 'refs', 'remotes', 'origin'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmp, '.git', 'refs', 'remotes', 'origin', 'master'),
      `${await git(tmp, 'rev-parse', 'HEAD')}\n`
    );
    await git(tmp, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master');
    expect(await getDefaultBaseBranch(tmp)).toBe('master');
  });
});

describe('getCurrentCommitSha', () => {
  it('returns the full 40-char SHA on success', async () => {
    const sha = await getCurrentCommitSha(tmp);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null in a zero-commit worktree', async () => {
    const empty = makeTmpDir('empty-git');
    try {
      await git(empty, 'init', '-b', 'main');
      expect(await getCurrentCommitSha(empty)).toBeNull();
    } finally {
      removeTmpDir(empty);
    }
  });

  it('returns null when cwd is not a git repo', async () => {
    const nonRepo = makeTmpDir('not-git');
    try {
      expect(await getCurrentCommitSha(nonRepo)).toBeNull();
    } finally {
      removeTmpDir(nonRepo);
    }
  });
});
