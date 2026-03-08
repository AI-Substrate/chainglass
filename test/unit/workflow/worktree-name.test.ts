import {
  allocateOrdinal,
  buildWorktreeName,
  extractOrdinals,
  hasBranchConflict,
  normalizeSlug,
  parseRequestedName,
  resolveWorktreeName,
} from '@chainglass/workflow/services/worktree-name';
import type { OrdinalSources } from '@chainglass/workflow/services/worktree-name';
import { describe, expect, it } from 'vitest';

// ==================== normalizeSlug ====================

describe('normalizeSlug', () => {
  it('should lowercase and hyphenate a plain string', () => {
    expect(normalizeSlug('My Feature')).toBe('my-feature');
  });

  it('should collapse consecutive hyphens', () => {
    expect(normalizeSlug('hello--world')).toBe('hello-world');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(normalizeSlug('-hello-')).toBe('hello');
  });

  it('should replace special characters with hyphens', () => {
    expect(normalizeSlug('feat!@#$%^&*ure')).toBe('feat-ure');
  });

  it('should trim whitespace', () => {
    expect(normalizeSlug('  hello world  ')).toBe('hello-world');
  });

  it('should return null for empty input', () => {
    expect(normalizeSlug('')).toBeNull();
  });

  it('should return null for input that normalizes to empty', () => {
    expect(normalizeSlug('---')).toBeNull();
    expect(normalizeSlug('!!!')).toBeNull();
  });

  it('should handle pure numeric slugs', () => {
    expect(normalizeSlug('123')).toBe('123');
  });
});

// ==================== parseRequestedName ====================

describe('parseRequestedName', () => {
  it('should parse a plain slug', () => {
    const result = parseRequestedName('my-feature');
    expect(result).toEqual({ slug: 'my-feature', providedOrdinal: undefined });
  });

  it('should parse a pasted NNN-slug', () => {
    const result = parseRequestedName('069-my-feature');
    expect(result).toEqual({ slug: 'my-feature', providedOrdinal: 69 });
  });

  it('should handle 4-digit ordinals', () => {
    const result = parseRequestedName('1234-big-project');
    expect(result).toEqual({ slug: 'big-project', providedOrdinal: 1234 });
  });

  it('should normalize the slug part of pasted input', () => {
    const result = parseRequestedName('069-My Feature!!');
    expect(result).toEqual({ slug: 'my-feature', providedOrdinal: 69 });
  });

  it('should return null for empty input', () => {
    expect(parseRequestedName('')).toBeNull();
    expect(parseRequestedName('   ')).toBeNull();
  });

  it('should return null if slug part normalizes to empty', () => {
    expect(parseRequestedName('069-!!!')).toBeNull();
  });

  it('should treat 2-digit prefix as plain slug, not ordinal', () => {
    const result = parseRequestedName('42-answer');
    // 2-digit doesn't match ^\d{3,}- pattern, so treated as plain slug
    expect(result).toEqual({ slug: '42-answer', providedOrdinal: undefined });
  });

  it('should handle leading zeros in ordinal', () => {
    const result = parseRequestedName('001-first');
    expect(result).toEqual({ slug: 'first', providedOrdinal: 1 });
  });
});

// ==================== extractOrdinals ====================

describe('extractOrdinals', () => {
  it('should extract ordinals from branch names', () => {
    const branches = ['main', '067-foo', '068-bar', 'feature-branch'];
    expect(extractOrdinals(branches)).toEqual([67, 68]);
  });

  it('should strip remote prefixes', () => {
    const branches = ['origin/067-foo', 'origin/main', 'origin/068-bar'];
    expect(extractOrdinals(branches)).toEqual([67, 68]);
  });

  it('should return empty array when no ordinals found', () => {
    expect(extractOrdinals(['main', 'develop', 'feature'])).toEqual([]);
  });

  it('should handle empty input', () => {
    expect(extractOrdinals([])).toEqual([]);
  });
});

// ==================== allocateOrdinal ====================

describe('allocateOrdinal', () => {
  it('should return max + 1 across all sources', () => {
    const sources: OrdinalSources = {
      localBranches: ['067-foo', '068-bar'],
      remoteBranches: ['origin/067-foo'],
      planFolders: ['065-old', '066-older'],
    };
    expect(allocateOrdinal(sources)).toBe(69);
  });

  it('should return 1 when no ordinals exist', () => {
    const sources: OrdinalSources = {
      localBranches: ['main'],
      remoteBranches: ['origin/main'],
      planFolders: [],
    };
    expect(allocateOrdinal(sources)).toBe(1);
  });

  it('should handle plan folders with higher ordinals than branches', () => {
    const sources: OrdinalSources = {
      localBranches: ['067-foo'],
      remoteBranches: [],
      planFolders: ['067-foo', '070-planned'],
    };
    expect(allocateOrdinal(sources)).toBe(71);
  });

  it('should handle remote-only ordinals', () => {
    const sources: OrdinalSources = {
      localBranches: ['main'],
      remoteBranches: ['origin/099-remote-only'],
      planFolders: [],
    };
    expect(allocateOrdinal(sources)).toBe(100);
  });
});

// ==================== buildWorktreeName ====================

describe('buildWorktreeName', () => {
  it('should zero-pad to 3 digits', () => {
    expect(buildWorktreeName(1, 'foo')).toBe('001-foo');
    expect(buildWorktreeName(42, 'bar')).toBe('042-bar');
    expect(buildWorktreeName(100, 'baz')).toBe('100-baz');
  });

  it('should handle 4+ digit ordinals without truncation', () => {
    expect(buildWorktreeName(1234, 'big')).toBe('1234-big');
  });
});

// ==================== resolveWorktreeName ====================

describe('resolveWorktreeName', () => {
  const sources: OrdinalSources = {
    localBranches: ['067-foo', '068-bar'],
    remoteBranches: ['origin/067-foo'],
    planFolders: ['065-old'],
  };

  it('should allocate next ordinal for plain slug', () => {
    const result = resolveWorktreeName('my-feature', sources);
    expect(result).toEqual({
      ordinal: 69,
      slug: 'my-feature',
      branchName: '069-my-feature',
    });
  });

  it('should use provided ordinal for pasted NNN-slug', () => {
    const result = resolveWorktreeName('042-custom', sources);
    expect(result).toEqual({
      ordinal: 42,
      slug: 'custom',
      branchName: '042-custom',
    });
  });

  it('should normalize the slug in the result', () => {
    const result = resolveWorktreeName('My Cool Feature!!', sources);
    expect(result).toEqual({
      ordinal: 69,
      slug: 'my-cool-feature',
      branchName: '069-my-cool-feature',
    });
  });

  it('should return null for invalid input', () => {
    expect(resolveWorktreeName('', sources)).toBeNull();
    expect(resolveWorktreeName('---', sources)).toBeNull();
  });
});

// ==================== hasBranchConflict ====================

describe('hasBranchConflict', () => {
  const sources: OrdinalSources = {
    localBranches: ['067-foo', '068-bar'],
    remoteBranches: ['origin/067-foo', 'origin/069-baz'],
    planFolders: [],
  };

  it('should detect conflict with local branch', () => {
    expect(hasBranchConflict('067-foo', sources)).toBe(true);
  });

  it('should detect conflict with remote branch (stripped prefix)', () => {
    expect(hasBranchConflict('069-baz', sources)).toBe(true);
  });

  it('should return false for non-conflicting name', () => {
    expect(hasBranchConflict('070-new', sources)).toBe(false);
  });
});
