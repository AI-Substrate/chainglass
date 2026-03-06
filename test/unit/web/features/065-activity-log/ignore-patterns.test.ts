import os from 'node:os';
import { shouldIgnorePaneTitle } from '@/features/065-activity-log/lib/ignore-patterns';
import { describe, expect, it } from 'vitest';

describe('shouldIgnorePaneTitle', () => {
  it('ignores Mac.localdomain', () => {
    expect(shouldIgnorePaneTitle('Mac.localdomain')).toBe(true);
  });

  it('ignores Jordans-MacBook-Pro.local', () => {
    expect(shouldIgnorePaneTitle('Jordans-MacBook-Pro.local')).toBe(true);
  });

  it('ignores empty string', () => {
    expect(shouldIgnorePaneTitle('')).toBe(true);
  });

  it('ignores shell names', () => {
    expect(shouldIgnorePaneTitle('bash')).toBe(true);
    expect(shouldIgnorePaneTitle('zsh')).toBe(true);
    expect(shouldIgnorePaneTitle('fish')).toBe(true);
    expect(shouldIgnorePaneTitle('-bash')).toBe(true);
    expect(shouldIgnorePaneTitle('-zsh')).toBe(true);
  });

  it('ignores bare paths', () => {
    expect(shouldIgnorePaneTitle('~/project')).toBe(true);
    expect(shouldIgnorePaneTitle('/usr/bin')).toBe(true);
  });

  it('ignores the current hostname and short hostname', () => {
    const fullHostname = os.hostname();
    const shortHostname = fullHostname.split('.')[0];
    expect(shouldIgnorePaneTitle(fullHostname)).toBe(true);
    expect(shouldIgnorePaneTitle(shortHostname)).toBe(true);
  });

  it('allows meaningful activity titles', () => {
    expect(shouldIgnorePaneTitle('Implementing Phase 1')).toBe(false);
    expect(shouldIgnorePaneTitle('Running tests')).toBe(false);
    expect(shouldIgnorePaneTitle('Code review')).toBe(false);
  });

  it('allows emoji prefixed titles', () => {
    expect(shouldIgnorePaneTitle('🤖 Exploring codebase')).toBe(false);
    expect(shouldIgnorePaneTitle('🔮 Implementing Phase')).toBe(false);
  });

  it('allows titles with dots that are not hostnames', () => {
    expect(shouldIgnorePaneTitle('Running v2.1.0 tests')).toBe(false);
  });
});
