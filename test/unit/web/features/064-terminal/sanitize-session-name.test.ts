import { sanitizeSessionName } from '@/features/064-terminal/lib/sanitize-session-name';
import { describe, expect, it } from 'vitest';

describe('sanitizeSessionName', () => {
  it('passes through already-valid names unchanged', () => {
    expect(sanitizeSessionName('064-tmux')).toBe('064-tmux');
    expect(sanitizeSessionName('my_session')).toBe('my_session');
    expect(sanitizeSessionName('ABC-123')).toBe('ABC-123');
  });

  it('replaces dots with hyphens', () => {
    expect(sanitizeSessionName('customer-myob.wiki')).toBe('customer-myob-wiki');
  });

  it('replaces colons with hyphens', () => {
    expect(sanitizeSessionName('feature:login')).toBe('feature-login');
  });

  it('replaces spaces and special characters', () => {
    expect(sanitizeSessionName('my project (v2)')).toBe('my-project-v2');
  });

  it('collapses consecutive hyphens', () => {
    expect(sanitizeSessionName('a..b::c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(sanitizeSessionName('.hidden')).toBe('hidden');
    expect(sanitizeSessionName('trailing.')).toBe('trailing');
  });

  it('handles paths with multiple dots', () => {
    expect(sanitizeSessionName('repo.name.git')).toBe('repo-name-git');
  });

  it('returns empty string for all-invalid input', () => {
    expect(sanitizeSessionName('...')).toBe('');
  });
});
