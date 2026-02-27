import { getDisplayStatus } from '@/features/050-workflow-page/lib/display-status';
import { describe, expect, it } from 'vitest';

describe('getDisplayStatus', () => {
  it('returns awaiting-input for user-input + pending + ready', () => {
    expect(getDisplayStatus('user-input', 'pending', true)).toBe('awaiting-input');
  });

  it('returns pending for user-input + pending + NOT ready', () => {
    expect(getDisplayStatus('user-input', 'pending', false)).toBe('pending');
  });

  it('returns original status for agent + pending + ready', () => {
    expect(getDisplayStatus('agent', 'pending', true)).toBe('pending');
  });

  it('returns original status for code + pending + ready', () => {
    expect(getDisplayStatus('code', 'pending', true)).toBe('pending');
  });

  it('returns complete for user-input + complete + ready', () => {
    expect(getDisplayStatus('user-input', 'complete', true)).toBe('complete');
  });

  it('returns original status when not pending', () => {
    expect(getDisplayStatus('user-input', 'agent-accepted', true)).toBe('agent-accepted');
  });
});
