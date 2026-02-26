/**
 * File Filter Utilities Tests (TDD — RED first)
 *
 * Tests for pure functions: filterFiles, sortByRecent, sortAlpha,
 * hideDotPaths, isGlobPattern.
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 */

import { describe, expect, it } from 'vitest';

import {
  type FilterableFile,
  filterFiles,
  hideDotPaths,
  isGlobPattern,
  sortAlpha,
  sortByRecent,
} from '@/features/041-file-browser/services/file-filter';

const makeFile = (
  path: string,
  mtime = 1000,
  lastChanged: number | null = null
): FilterableFile => ({
  path,
  mtime,
  modified: lastChanged !== null,
  lastChanged,
});

describe('isGlobPattern', () => {
  it('returns false for plain text', () => {
    expect(isGlobPattern('app')).toBe(false);
    expect(isGlobPattern('src/utils')).toBe(false);
  });

  it('returns true for * character', () => {
    expect(isGlobPattern('*.tsx')).toBe(true);
    expect(isGlobPattern('src/**/*.test')).toBe(true);
  });

  it('returns true for ? character', () => {
    expect(isGlobPattern('file?.ts')).toBe(true);
  });

  it('returns true for { character', () => {
    expect(isGlobPattern('*.{ts,tsx}')).toBe(true);
  });
});

describe('filterFiles — substring', () => {
  const files = [
    makeFile('src/app.tsx'),
    makeFile('src/components/AppHeader.tsx'),
    makeFile('src/lib/appUtils.ts'),
    makeFile('config/app.config.ts'),
    makeFile('README.md'),
  ];

  it('filters by case-insensitive substring', () => {
    const result = filterFiles(files, 'app');
    expect(result.map((f) => f.path)).toEqual([
      'src/app.tsx',
      'src/components/AppHeader.tsx',
      'src/lib/appUtils.ts',
      'config/app.config.ts',
    ]);
  });

  it('returns all files for empty query', () => {
    const result = filterFiles(files, '');
    expect(result).toHaveLength(5);
  });

  it('returns empty for no match', () => {
    const result = filterFiles(files, 'zzz');
    expect(result).toHaveLength(0);
  });

  it('matches path separators', () => {
    const result = filterFiles(files, 'src/lib');
    expect(result.map((f) => f.path)).toEqual(['src/lib/appUtils.ts']);
  });
});

describe('filterFiles — glob', () => {
  const files = [
    makeFile('src/app.tsx'),
    makeFile('src/app.test.tsx'),
    makeFile('src/lib/utils.ts'),
    makeFile('config/app.config.ts'),
  ];

  it('matches glob patterns with extension', async () => {
    const result = await filterFiles(files, '*.tsx');
    expect(result.map((f) => f.path)).toEqual(['src/app.tsx', 'src/app.test.tsx']);
  });

  it('matches recursive glob patterns', async () => {
    const result = await filterFiles(files, 'src/**/*.ts');
    expect(result.map((f) => f.path)).toEqual(['src/lib/utils.ts']);
  });
});

describe('sortByRecent', () => {
  it('sorts by mtime descending', () => {
    const files = [makeFile('a.ts', 100), makeFile('b.ts', 300), makeFile('c.ts', 200)];
    const result = sortByRecent(files);
    expect(result.map((f) => f.path)).toEqual(['b.ts', 'c.ts', 'a.ts']);
  });

  it('prioritizes lastChanged over mtime', () => {
    const files = [makeFile('a.ts', 100, 500), makeFile('b.ts', 300), makeFile('c.ts', 200)];
    const result = sortByRecent(files);
    expect(result[0].path).toBe('a.ts'); // lastChanged=500 beats mtime=300
  });
});

describe('sortAlpha', () => {
  it('sorts ascending by path', () => {
    const files = [makeFile('c.ts'), makeFile('a.ts'), makeFile('b.ts')];
    const result = sortAlpha(files, 'asc');
    expect(result.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('sorts descending by path', () => {
    const files = [makeFile('c.ts'), makeFile('a.ts'), makeFile('b.ts')];
    const result = sortAlpha(files, 'desc');
    expect(result.map((f) => f.path)).toEqual(['c.ts', 'b.ts', 'a.ts']);
  });
});

describe('hideDotPaths', () => {
  it('filters out dot-prefixed path segments', () => {
    const files = [
      makeFile('src/app.ts'),
      makeFile('.github/workflows/ci.yml'),
      makeFile('.env'),
      makeFile('src/.hidden/file.ts'),
    ];
    const result = hideDotPaths(files);
    expect(result.map((f) => f.path)).toEqual(['src/app.ts']);
  });

  it('keeps files with no dot-prefixed segments', () => {
    const files = [makeFile('src/app.ts'), makeFile('README.md')];
    const result = hideDotPaths(files);
    expect(result).toHaveLength(2);
  });
});
