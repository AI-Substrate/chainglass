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

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getCurrentBranch,
  getCurrentCommitSha,
  getDefaultBaseBranch,
  getRemoteUrl,
} from '@/features/_platform/git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmp: string;

function git(cmd: string) {
  execSync(`git ${cmd}`, { cwd: tmp, stdio: 'ignore' });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-cli-'));
  git('init -b main');
  git('config user.email "t@t.com"');
  git('config user.name "T"');
  fs.writeFileSync(path.join(tmp, 'README.md'), '# x\n');
  git('add .');
  git('commit -m "initial"');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('getRemoteUrl', () => {
  it('returns the origin URL when configured', async () => {
    git('remote add origin https://github.com/org/repo.git');
    expect(await getRemoteUrl(tmp)).toBe('https://github.com/org/repo.git');
  });

  it('returns null when no origin remote is set', async () => {
    expect(await getRemoteUrl(tmp)).toBeNull();
  });

  it('returns null when cwd is not a git repo', async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
    try {
      expect(await getRemoteUrl(nonRepo)).toBeNull();
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

describe('getCurrentBranch', () => {
  it('returns the branch name', async () => {
    expect(await getCurrentBranch(tmp)).toBe('main');
  });

  it("returns 'HEAD' in detached state", async () => {
    git('checkout --detach HEAD');
    expect(await getCurrentBranch(tmp)).toBe('HEAD');
  });

  it("returns 'HEAD' when cwd is not a git repo", async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
    try {
      expect(await getCurrentBranch(nonRepo)).toBe('HEAD');
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
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
    git('remote add origin https://example.invalid/repo.git');
    fs.mkdirSync(path.join(tmp, '.git', 'refs', 'remotes', 'origin'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmp, '.git', 'refs', 'remotes', 'origin', 'master'),
      `${execSync('git rev-parse HEAD', { cwd: tmp }).toString().trim()}\n`,
    );
    git('symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/master');
    expect(await getDefaultBaseBranch(tmp)).toBe('master');
  });
});

describe('getCurrentCommitSha', () => {
  it('returns the full 40-char SHA on success', async () => {
    const sha = await getCurrentCommitSha(tmp);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null in a zero-commit worktree', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-git-'));
    try {
      execSync('git init -b main', { cwd: empty, stdio: 'ignore' });
      expect(await getCurrentCommitSha(empty)).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('returns null when cwd is not a git repo', async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
    try {
      expect(await getCurrentCommitSha(nonRepo)).toBeNull();
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
