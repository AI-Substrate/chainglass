/**
 * Diff Stats Service Tests
 *
 * Purpose: Verify git diff HEAD --shortstat parsing for file count,
 * insertions, and deletions. Tests the parser logic with known output strings.
 *
 * Feature 1: File Change Statistics — Plan 049
 * DYK-01: Use HEAD to capture staged+unstaged
 * DYK-05: Use --shortstat for simpler parsing
 */

import {
  type DiffStatsResult,
  parseShortstatOutput,
} from '@/features/041-file-browser/services/diff-stats';
import { describe, expect, it } from 'vitest';

describe('parseShortstatOutput', () => {
  it('parses normal output with files, insertions, and deletions', () => {
    const result = parseShortstatOutput(' 3 files changed, 42 insertions(+), 18 deletions(-)');
    expect(result).toEqual({ files: 3, insertions: 42, deletions: 18 });
  });

  it('parses output with insertions only (no deletions)', () => {
    const result = parseShortstatOutput(' 1 file changed, 10 insertions(+)');
    expect(result).toEqual({ files: 1, insertions: 10, deletions: 0 });
  });

  it('parses output with deletions only (no insertions)', () => {
    const result = parseShortstatOutput(' 2 files changed, 5 deletions(-)');
    expect(result).toEqual({ files: 2, insertions: 0, deletions: 5 });
  });

  it('parses singular "file changed"', () => {
    const result = parseShortstatOutput(' 1 file changed, 1 insertion(+), 1 deletion(-)');
    expect(result).toEqual({ files: 1, insertions: 1, deletions: 1 });
  });

  it('returns zeros for empty output (no changes)', () => {
    const result = parseShortstatOutput('');
    expect(result).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });

  it('returns zeros for whitespace-only output', () => {
    const result = parseShortstatOutput('  \n');
    expect(result).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });

  it('handles large numbers', () => {
    const result = parseShortstatOutput(
      ' 150 files changed, 12345 insertions(+), 9876 deletions(-)'
    );
    expect(result).toEqual({ files: 150, insertions: 12345, deletions: 9876 });
  });
});

describe('getDiffStats', () => {
  it('returns not-git error for non-git workspaces', async () => {
    const { getDiffStats } = await import('@/features/041-file-browser/services/diff-stats');
    const result = await getDiffStats(`/tmp/definitely-not-a-git-repo-${Date.now()}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not-git');
    }
  });
});
