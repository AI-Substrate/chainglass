/**
 * Repo URL Builder — Unit Tests (TDD)
 *
 * Why: Pure URL builder is the only piece of FX007 with non-trivial branching
 *   (host detection, ref-type switching, encoding). Highest-leverage place to
 *   invest in tests.
 * Contract: parseRemote(string) → Remote | null;
 *   buildFileUrl(remote, { ref, refType, relativePath }) → string.
 * Usage Notes: All tests are pure — no fs, no execFile, no network. Real
 *   fixtures only (no mocks).
 * Quality Contribution: Encodes the GitHub + Azure DevOps URL formats
 *   accurately, including credential stripping (Plan 084 finding 12) and
 *   per-segment encoding for path + branch with `/`, `#`, etc.
 * Worked Example:
 *   parseRemote('git@github.com:org/repo.git')
 *     → { host: 'github', org: 'org', project: null, repo: 'repo' }
 *   buildFileUrl(remote, { ref: 'main', refType: 'branch', relativePath: 'a/b.ts' })
 *     → 'https://github.com/org/repo/blob/main/a/b.ts'
 *
 * Plan 084 FX007 — copy-repo-url. Findings: 03, 10, 12.
 */

import {
  type BuildOptions,
  type Remote,
  buildFileUrl,
  parseRemote,
} from '@/features/_platform/git';
import { describe, expect, it } from 'vitest';

describe('parseRemote', () => {
  it('parses GitHub HTTPS remote', () => {
    expect(parseRemote('https://github.com/org/repo.git')).toEqual({
      host: 'github',
      org: 'org',
      project: null,
      repo: 'repo',
    });
  });

  it('parses GitHub HTTPS without .git suffix', () => {
    expect(parseRemote('https://github.com/org/repo')).toEqual({
      host: 'github',
      org: 'org',
      project: null,
      repo: 'repo',
    });
  });

  it('parses GitHub SSH remote', () => {
    expect(parseRemote('git@github.com:org/repo.git')).toEqual({
      host: 'github',
      org: 'org',
      project: null,
      repo: 'repo',
    });
  });

  it('parses Azure DevOps HTTPS remote', () => {
    expect(parseRemote('https://dev.azure.com/org/project/_git/repo')).toEqual({
      host: 'azure-devops',
      org: 'org',
      project: 'project',
      repo: 'repo',
    });
  });

  it('parses Azure DevOps SSH remote', () => {
    expect(parseRemote('git@ssh.dev.azure.com:v3/org/project/repo')).toEqual({
      host: 'azure-devops',
      org: 'org',
      project: 'project',
      repo: 'repo',
    });
  });

  it('strips embedded credentials (per Plan 084 finding 12)', () => {
    // GitHub HTTPS with user:token in URL — the parsed Remote must contain
    // no trace of the credentials, so a downstream buildFileUrl cannot leak
    // them into the clipboard.
    const remote = parseRemote('https://user:token@github.com/org/repo.git');
    expect(remote).toEqual({
      host: 'github',
      org: 'org',
      project: null,
      repo: 'repo',
    });
    expect(JSON.stringify(remote)).not.toMatch(/user|token/);
  });

  it('returns host:unknown for legacy visualstudio.com tenants', () => {
    // Spec § Acceptance Criteria 6: legacy ADO out of scope.
    const remote = parseRemote('https://myorg.visualstudio.com/myproject/_git/myrepo');
    expect(remote?.host).toBe('unknown');
  });

  it('returns host:unknown for GitLab and other unrecognized hosts', () => {
    expect(parseRemote('git@gitlab.com:org/repo.git')?.host).toBe('unknown');
    expect(parseRemote('https://bitbucket.org/org/repo.git')?.host).toBe('unknown');
  });

  it('returns null for empty / malformed input', () => {
    expect(parseRemote('')).toBeNull();
    expect(parseRemote('not a url')).toBeNull();
    expect(parseRemote('   ')).toBeNull();
  });
});

describe('buildFileUrl — GitHub', () => {
  const githubRemote: Remote = {
    host: 'github',
    org: 'org',
    project: null,
    repo: 'repo',
  };

  it('builds branch URL with simple branch + path', () => {
    const opts: BuildOptions = {
      ref: 'main',
      refType: 'branch',
      relativePath: 'apps/web/src/foo.ts',
    };
    expect(buildFileUrl(githubRemote, opts)).toBe(
      'https://github.com/org/repo/blob/main/apps/web/src/foo.ts'
    );
  });

  it('preserves slashes in branch names like feature/foo', () => {
    const opts: BuildOptions = {
      ref: 'feature/foo',
      refType: 'branch',
      relativePath: 'src/lib/util.ts',
    };
    const url = buildFileUrl(githubRemote, opts);
    expect(url).toContain('/feature/foo/');
    expect(url).toContain('src/lib/util.ts');
    // Slashes must NOT be percent-encoded.
    expect(url).not.toContain('%2F');
  });

  it('URL-encodes # in branch names while preserving /', () => {
    const opts: BuildOptions = {
      ref: 'feature/foo#bar',
      refType: 'branch',
      relativePath: 'a.ts',
    };
    const url = buildFileUrl(githubRemote, opts);
    expect(url).toContain('feature/foo%23bar');
    expect(url).not.toContain('feature/foo#bar');
  });

  it('uses literal master when default branch is master', () => {
    expect(
      buildFileUrl(githubRemote, {
        ref: 'master',
        refType: 'branch',
        relativePath: 'README.md',
      })
    ).toBe('https://github.com/org/repo/blob/master/README.md');
  });

  it('builds commit URL for refType:commit', () => {
    const sha = '1234567890abcdef1234567890abcdef12345678';
    expect(
      buildFileUrl(githubRemote, {
        ref: sha,
        refType: 'commit',
        relativePath: 'src/lib/util.ts',
      })
    ).toBe(`https://github.com/org/repo/blob/${sha}/src/lib/util.ts`);
  });
});

describe('buildFileUrl — Azure DevOps', () => {
  const adoRemote: Remote = {
    host: 'azure-devops',
    org: 'myorg',
    project: 'myproject',
    repo: 'myrepo',
  };

  it('builds branch URL with GB prefix', () => {
    expect(
      buildFileUrl(adoRemote, {
        ref: 'main',
        refType: 'branch',
        relativePath: 'src/lib/util.ts',
      })
    ).toBe(
      'https://dev.azure.com/myorg/myproject/_git/myrepo?path=/src/lib/util.ts&version=GBmain'
    );
  });

  it('builds commit URL with GC prefix', () => {
    const sha = '1234567890abcdef1234567890abcdef12345678';
    expect(
      buildFileUrl(adoRemote, {
        ref: sha,
        refType: 'commit',
        relativePath: 'src/lib/util.ts',
      })
    ).toBe(
      `https://dev.azure.com/myorg/myproject/_git/myrepo?path=/src/lib/util.ts&version=GC${sha}`
    );
  });

  it('preserves slashes in branch + path', () => {
    const url = buildFileUrl(adoRemote, {
      ref: 'feature/foo',
      refType: 'branch',
      relativePath: 'a/b/c.ts',
    });
    expect(url).toContain('path=/a/b/c.ts');
    expect(url).toContain('version=GBfeature/foo');
  });

  it('URL-encodes # in branch while preserving /', () => {
    const url = buildFileUrl(adoRemote, {
      ref: 'feature/foo#bar',
      refType: 'branch',
      relativePath: 'a.ts',
    });
    expect(url).toContain('version=GBfeature/foo%23bar');
  });
});
