/**
 * Working Changes Service Tests
 *
 * Purpose: Verify git status --porcelain=v1 parsing for all status codes.
 * Tests the parser logic with known porcelain output strings.
 *
 * Phase 2: Git Services — Plan 043
 * DYK-P2-01: --ignore-submodules flag, MM emits two entries
 */

import {
  type ChangedFile,
  parsePorcelainOutput,
} from '@/features/041-file-browser/services/working-changes';
import { describe, expect, it } from 'vitest';

describe('parsePorcelainOutput', () => {
  it('parses staged modified (M_)', () => {
    const result = parsePorcelainOutput('M  src/utils.ts\n');
    expect(result).toEqual([{ path: 'src/utils.ts', status: 'modified', area: 'staged' }]);
  });

  it('parses unstaged modified (_M)', () => {
    const result = parsePorcelainOutput(' M src/utils.ts\n');
    expect(result).toEqual([{ path: 'src/utils.ts', status: 'modified', area: 'unstaged' }]);
  });

  it('parses staged added (A_)', () => {
    const result = parsePorcelainOutput('A  src/new-file.ts\n');
    expect(result).toEqual([{ path: 'src/new-file.ts', status: 'added', area: 'staged' }]);
  });

  it('parses unstaged deleted (_D)', () => {
    const result = parsePorcelainOutput(' D src/old-file.ts\n');
    expect(result).toEqual([{ path: 'src/old-file.ts', status: 'deleted', area: 'unstaged' }]);
  });

  it('parses untracked (??)', () => {
    const result = parsePorcelainOutput('?? scratch.ts\n');
    expect(result).toEqual([{ path: 'scratch.ts', status: 'untracked', area: 'untracked' }]);
  });

  it('parses rename (R_) with arrow format', () => {
    const result = parsePorcelainOutput('R  old-name.ts -> new-name.ts\n');
    expect(result).toEqual([{ path: 'new-name.ts', status: 'renamed', area: 'staged' }]);
  });

  it('parses MM as two entries (staged + unstaged)', () => {
    const result = parsePorcelainOutput('MM src/both.ts\n');
    expect(result).toEqual([
      { path: 'src/both.ts', status: 'modified', area: 'staged' },
      { path: 'src/both.ts', status: 'modified', area: 'unstaged' },
    ]);
  });

  it('parses multiple lines', () => {
    const output = ['M  src/staged.ts', ' M src/unstaged.ts', '?? new-file.ts', ''].join('\n');

    const result = parsePorcelainOutput(output);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ path: 'src/staged.ts', area: 'staged' });
    expect(result[1]).toMatchObject({
      path: 'src/unstaged.ts',
      area: 'unstaged',
    });
    expect(result[2]).toMatchObject({
      path: 'new-file.ts',
      area: 'untracked',
    });
  });

  it('returns empty array for empty output', () => {
    expect(parsePorcelainOutput('')).toEqual([]);
    expect(parsePorcelainOutput('\n')).toEqual([]);
  });

  it('skips lines it cannot parse', () => {
    const result = parsePorcelainOutput('XX something-weird\n');
    expect(result).toEqual([]);
  });
});
