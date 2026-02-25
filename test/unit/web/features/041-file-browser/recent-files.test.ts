/**
 * Recent Files Service Tests
 *
 * Purpose: Verify git log --name-only parsing into deduplicated file list.
 * Tests the parser logic with known git log output strings.
 *
 * Phase 2: Git Services — Plan 043
 * DYK-P2-03: git log -n gives commits not files. Filter empty lines.
 */

import { parseGitLogOutput } from '@/features/041-file-browser/services/recent-files';
import { describe, expect, it } from 'vitest';

describe('parseGitLogOutput', () => {
  it('returns unique file paths from git log output', () => {
    const output = [
      '', // --pretty=format: produces blank between commits
      'src/a.ts',
      'src/b.ts',
      '',
      'src/c.ts',
      'src/a.ts', // duplicate
      '',
    ].join('\n');

    const result = parseGitLogOutput(output, 20);
    expect(result).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('respects limit parameter', () => {
    const output = ['', 'file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'].join('\n');

    const result = parseGitLogOutput(output, 3);
    expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
  });

  it('returns empty array for empty output', () => {
    expect(parseGitLogOutput('', 20)).toEqual([]);
    expect(parseGitLogOutput('\n\n', 20)).toEqual([]);
  });

  it('preserves order (most recent first)', () => {
    const output = ['', 'recent.ts', '', 'older.ts', '', 'oldest.ts'].join('\n');
    const result = parseGitLogOutput(output, 20);
    expect(result).toEqual(['recent.ts', 'older.ts', 'oldest.ts']);
  });
});
