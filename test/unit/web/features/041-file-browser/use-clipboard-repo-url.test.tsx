/**
 * useClipboard — Repo URL handlers (Plan 084 FX007)
 *
 * @vitest-environment jsdom
 *
 * Why: The two new handlers (`handleCopyRepoUrlCurrentRef`,
 *   `handleCopyRepoUrlDefaultBranch`) carry detached-HEAD + null-SHA edge
 *   cases that are hard to verify by eye. Visibility gating lives in
 *   T007's components, but the no-op behaviour is owned here.
 * Contract: Both handlers no-op when `repoInfo` is missing or
 *   `host === 'unknown'`; current-ref handler also no-ops when
 *   detached + null SHA. Happy path: copy URL + toast.
 * Usage Notes: Mocks `sonner` toast (no React render) and stubs
 *   `navigator.clipboard.writeText`. Real `buildFileUrl` from
 *   `_platform/git` so the URL we assert is the real production output.
 * Quality Contribution: Lock in the no-op semantics before T007 wires
 *   the menu items into 3 render sites.
 *
 * Plan 084 FX007. Findings: 07, 08, 14.
 */

import { useClipboard } from '@/features/041-file-browser/hooks/use-clipboard';
import type { RepoInfo } from '@/features/_platform/git';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
const writeText = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: (msg: string) => toastSuccess(msg), error: vi.fn() },
}));

beforeEach(() => {
  toastSuccess.mockClear();
  writeText.mockClear();
  Object.defineProperty(globalThis, 'isSecureContext', {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

const baseOptions = {
  slug: 'ws',
  worktreePath: '/wt',
  readFile: vi.fn(),
};

const githubRepoInfo: RepoInfo = {
  host: 'github',
  org: 'o',
  project: null,
  repo: 'r',
  currentBranch: 'feature/foo',
  defaultBranch: 'main',
  currentSha: 'a'.repeat(40),
  isDetached: false,
};

describe('handleCopyRepoUrlCurrentRef', () => {
  it('builds a branch URL with the current branch', () => {
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: githubRepoInfo }));
    result.current.handleCopyRepoUrlCurrentRef('apps/web/src/foo.ts');
    expect(writeText).toHaveBeenCalledWith(
      'https://github.com/o/r/blob/feature/foo/apps/web/src/foo.ts'
    );
    expect(toastSuccess).toHaveBeenCalledWith('URL copied');
  });

  it('uses the SHA when detached HEAD has a non-null currentSha', () => {
    const detached: RepoInfo = {
      ...githubRepoInfo,
      isDetached: true,
      currentBranch: 'HEAD',
    };
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: detached }));
    result.current.handleCopyRepoUrlCurrentRef('a.ts');
    expect(writeText).toHaveBeenCalledWith(`https://github.com/o/r/blob/${'a'.repeat(40)}/a.ts`);
  });

  it('no-ops on detached + null SHA (zero-commit worktree)', () => {
    const broken: RepoInfo = {
      ...githubRepoInfo,
      isDetached: true,
      currentBranch: 'HEAD',
      currentSha: null,
    };
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: broken }));
    result.current.handleCopyRepoUrlCurrentRef('a.ts');
    expect(writeText).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('no-ops when repoInfo is null', () => {
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: null }));
    result.current.handleCopyRepoUrlCurrentRef('a.ts');
    expect(writeText).not.toHaveBeenCalled();
  });

  it("no-ops when host === 'unknown'", () => {
    const unknown: RepoInfo = {
      host: 'unknown',
      org: null,
      project: null,
      repo: null,
      currentBranch: 'main',
      defaultBranch: 'main',
      currentSha: null,
      isDetached: false,
    };
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: unknown }));
    result.current.handleCopyRepoUrlCurrentRef('a.ts');
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('handleCopyRepoUrlDefaultBranch', () => {
  it('always uses defaultBranch regardless of detached state', () => {
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: githubRepoInfo }));
    result.current.handleCopyRepoUrlDefaultBranch('a.ts');
    expect(writeText).toHaveBeenCalledWith('https://github.com/o/r/blob/main/a.ts');
    expect(toastSuccess).toHaveBeenCalledWith('URL copied');
  });

  it('no-ops when repoInfo is null', () => {
    const { result } = renderHook(() => useClipboard({ ...baseOptions, repoInfo: null }));
    result.current.handleCopyRepoUrlDefaultBranch('a.ts');
    expect(writeText).not.toHaveBeenCalled();
  });
});
