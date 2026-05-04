/**
 * Pure-helper tests for `sessionNameFromWorktreePath`.
 *
 * Plan FX006-1: validates the inverse of `tmux new-session -A -s <basename>`
 * — given a worktree path, derive the session name. Edge cases were
 * enumerated in the dossier; each gets its own kebab-case test name.
 */

import { sessionNameFromWorktreePath } from '@/features/064-terminal/lib/session-name-from-worktree-path';
import { describe, expect, it } from 'vitest';

describe('sessionNameFromWorktreePath — FX006', () => {
  it('helper.higgs-path: returns "higgs-jordo" for /Users/jordanknight/github/higgs-jordo', () => {
    expect(sessionNameFromWorktreePath('/Users/jordanknight/github/higgs-jordo')).toBe(
      'higgs-jordo'
    );
  });

  it('helper.trailing-slash: returns "" for trailing-slash paths (split.pop is empty)', () => {
    // The overlay's existing inline expression exhibits the same behavior;
    // the dossier explicitly accepts this and documents that callers must
    // handle the empty-string return.
    expect(sessionNameFromWorktreePath('/Users/jordanknight/github/higgs-jordo/')).toBe('');
  });

  it('helper.empty: returns "" for empty string, single-slash, whitespace, null, undefined', () => {
    expect(sessionNameFromWorktreePath('')).toBe('');
    expect(sessionNameFromWorktreePath('/')).toBe('');
    expect(sessionNameFromWorktreePath('   ')).toBe('');
    expect(sessionNameFromWorktreePath(null)).toBe('');
    expect(sessionNameFromWorktreePath(undefined)).toBe('');
  });

  it('helper.sanitize-dots: replaces dots and other non-[a-zA-Z0-9_-] chars per sanitizeSessionName', () => {
    // tmux uses dots as pane separators; basename "with.dots" becomes "with-dots".
    expect(sessionNameFromWorktreePath('/path/with.dots')).toBe('with-dots');
    expect(sessionNameFromWorktreePath('/path/has spaces')).toBe('has-spaces');
    expect(sessionNameFromWorktreePath('/path/colon:thing')).toBe('colon-thing');
  });

  it('helper.single-segment: returns the segment itself for paths with no slashes', () => {
    expect(sessionNameFromWorktreePath('just-a-name')).toBe('just-a-name');
  });

  it('helper.absolute-vs-relative: same basename regardless of leading slash', () => {
    expect(sessionNameFromWorktreePath('/abs/higgs-jordo')).toBe('higgs-jordo');
    expect(sessionNameFromWorktreePath('relative/higgs-jordo')).toBe('higgs-jordo');
  });
});
