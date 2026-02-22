/**
 * Tests for workspaceHref() URL builder.
 *
 * Purpose: Verify workspace-scoped URL construction with encoding,
 *   default omission, and flat options API (DYK-P2-03).
 * Quality Contribution: Prevents malformed URLs, broken deep links,
 *   and XSS via unencoded path segments.
 * Acceptance Criteria: AC-18 — workspaceHref() builds workspace-scoped URLs
 *
 * Domain: _platform/workspace-url
 * Plan: 041-file-browser Phase 2 (T002)
 */

import { workspaceHref } from '@/lib/workspace-url';
import { describe, expect, it } from 'vitest';

describe('workspaceHref', () => {
  it('builds basic workspace URL with just slug and subPath', () => {
    expect(workspaceHref('my-proj', '/browser')).toBe('/workspaces/my-proj/browser');
  });

  it('includes worktree param from options', () => {
    const url = workspaceHref('my-proj', '/browser', { worktree: '/home/jak/proj' });
    expect(url).toContain('worktree=%2Fhome%2Fjak%2Fproj');
    expect(url).toMatch(/^\/workspaces\/my-proj\/browser\?/);
  });

  it('includes feature params alongside worktree', () => {
    const url = workspaceHref('my-proj', '/browser', {
      worktree: '/path',
      file: 'README.md',
      mode: 'edit',
    });
    expect(url).toContain('worktree=%2Fpath');
    expect(url).toContain('file=README.md');
    expect(url).toContain('mode=edit');
  });

  it('omits empty string params', () => {
    const url = workspaceHref('my-proj', '/browser', { file: '', dir: '' });
    expect(url).toBe('/workspaces/my-proj/browser');
  });

  it('omits false params', () => {
    const url = workspaceHref('my-proj', '/browser', { changed: false });
    expect(url).toBe('/workspaces/my-proj/browser');
  });

  it('omits undefined params', () => {
    const url = workspaceHref('my-proj', '/browser', { file: undefined });
    expect(url).toBe('/workspaces/my-proj/browser');
  });

  it('keeps truthy boolean params', () => {
    const url = workspaceHref('my-proj', '/browser', { changed: true });
    expect(url).toContain('changed=true');
  });

  it('keeps numeric params including zero', () => {
    const url = workspaceHref('my-proj', '/browser', { page: 0 });
    expect(url).toContain('page=0');
  });

  it('encodes worktree paths with slashes and special chars', () => {
    const url = workspaceHref('my-proj', '/browser', {
      worktree: '/home/jak/my project/src',
    });
    // URLSearchParams encodes spaces as + (valid per spec)
    expect(url).toContain('worktree=%2Fhome%2Fjak%2Fmy+project%2Fsrc');
  });

  it('encodes slug with special characters', () => {
    const url = workspaceHref('my proj', '/browser');
    expect(url).toBe('/workspaces/my%20proj/browser');
  });

  it('places worktree first in query string', () => {
    const url = workspaceHref('proj', '/browser', {
      file: 'a.ts',
      worktree: '/path',
      mode: 'edit',
    });
    // worktree should appear before other params
    const qs = url.split('?')[1];
    expect(qs).toMatch(/^worktree=/);
  });

  it('returns no query string when options is omitted', () => {
    const url = workspaceHref('proj', '/browser');
    expect(url).not.toContain('?');
  });

  it('returns no query string when options is empty object', () => {
    const url = workspaceHref('proj', '/browser', {});
    expect(url).not.toContain('?');
  });
});
