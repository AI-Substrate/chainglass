/**
 * URL normalizer tests — FX004-1.
 *
 * Covers all 5 URL normalization rules + workspace auto-detect.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { normalizeUrl, resolveWorkspace, defaultWorktree } from '../../../src/cdp/url-normalizer.js';

describe('normalizeUrl', () => {
  // Rule 1: Full URL pass-through
  it('passes through full http URLs unchanged', () => {
    const url = 'http://localhost:3000/workspaces/ws/browser?file=test.md';
    expect(normalizeUrl(url)).toBe(url);
  });

  it('passes through full https URLs unchanged', () => {
    const url = 'https://example.com/page';
    expect(normalizeUrl(url)).toBe(url);
  });

  // Rule 2: Workspace-prefixed path
  it('prepends base URL for /workspaces/ paths', () => {
    expect(normalizeUrl('/workspaces/my-ws/browser?file=test.md')).toBe(
      'http://127.0.0.1:3000/workspaces/my-ws/browser?file=test.md'
    );
  });

  // Rule 3: Absolute path
  it('prepends base URL for absolute paths', () => {
    expect(normalizeUrl('/api/health')).toBe('http://127.0.0.1:3000/api/health');
  });

  // Rule 4: Bare path — prepend workspace
  it('prepends workspace for bare paths', () => {
    expect(normalizeUrl('browser?file=test.md&mode=rich', { workspace: 'harness-test-workspace' })).toBe(
      'http://127.0.0.1:3000/workspaces/harness-test-workspace/browser?file=test.md&mode=rich'
    );
  });

  it('uses auto-detected workspace for bare paths when no workspace specified', () => {
    // Default fallback is 'harness-test-workspace'
    expect(normalizeUrl('browser')).toBe(
      'http://127.0.0.1:3000/workspaces/harness-test-workspace/browser'
    );
  });

  // Rule 5: Inject worktree
  it('injects worktree param when absent and worktree option set', () => {
    const result = normalizeUrl('/workspaces/ws/browser?file=test.md', {
      worktree: '/app/scratch/ws',
    });
    expect(result).toContain('worktree=%2Fapp%2Fscratch%2Fws');
    expect(result).toContain('file=test.md');
  });

  it('does NOT inject worktree when already present', () => {
    const url = '/workspaces/ws/browser?worktree=%2Fexisting&file=test.md';
    const result = normalizeUrl(url, { worktree: '/app/scratch/ws' });
    // Should not double-inject
    expect(result.match(/worktree=/g)?.length).toBe(1);
    expect(result).toContain('worktree=%2Fexisting');
  });

  it('does NOT inject worktree when not specified', () => {
    const result = normalizeUrl('browser?file=test.md');
    expect(result).not.toContain('worktree=');
  });

  // Custom port/host
  it('uses custom port and host', () => {
    expect(normalizeUrl('/page', { port: 4000, host: 'localhost' })).toBe(
      'http://localhost:4000/page'
    );
  });
});

describe('resolveWorkspace', () => {
  const originalEnv = process.env.HARNESS_WORKSPACE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.HARNESS_WORKSPACE = originalEnv;
    } else {
      delete process.env.HARNESS_WORKSPACE;
    }
  });

  it('returns explicit workspace when provided', () => {
    expect(resolveWorkspace('my-ws')).toBe('my-ws');
  });

  it('returns HARNESS_WORKSPACE env when no explicit workspace', () => {
    process.env.HARNESS_WORKSPACE = 'env-ws';
    expect(resolveWorkspace()).toBe('env-ws');
  });

  it('returns default workspace as fallback', () => {
    delete process.env.HARNESS_WORKSPACE;
    expect(resolveWorkspace()).toBe('harness-test-workspace');
  });
});

describe('defaultWorktree', () => {
  it('constructs worktree path from workspace slug', () => {
    expect(defaultWorktree('my-ws')).toBe('/app/scratch/my-ws');
  });
});
