/**
 * useAttentionTitle Hook Tests
 *
 * Purpose: Verify browser tab title updates with workspace emoji prefix
 *          and attention indicator.
 * Quality Contribution: Prevents tab title regressions — critical for
 *          multi-workspace tab identification.
 * Acceptance Criteria: AC-14
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { useAttentionTitle } from '@/features/041-file-browser/hooks/use-attention-title';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ============ T011: useAttentionTitle Tests (RED) ============

describe('useAttentionTitle', () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    document.title = 'Chainglass';
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it('sets document.title with emoji prefix', () => {
    renderHook(() => useAttentionTitle({ emoji: '🔮', pageName: 'Browser' }));

    expect(document.title).toBe('🔮 Browser');
  });

  it('uses first letter fallback when emoji is empty', () => {
    renderHook(() =>
      useAttentionTitle({ emoji: '', pageName: 'Browser', workspaceName: 'substrate' })
    );

    expect(document.title).toBe('S Browser');
  });

  it('prepends attention indicator when needsAttention is true', () => {
    renderHook(() => useAttentionTitle({ emoji: '🔮', pageName: 'Browser', needsAttention: true }));

    expect(document.title).toBe('❗ 🔮 Browser');
  });

  it('updates title when props change', () => {
    const { rerender } = renderHook(
      ({ emoji, pageName, needsAttention }) =>
        useAttentionTitle({ emoji, pageName, needsAttention }),
      { initialProps: { emoji: '🔮', pageName: 'Browser', needsAttention: false } }
    );

    expect(document.title).toBe('🔮 Browser');

    rerender({ emoji: '🔮', pageName: 'Agents', needsAttention: true });
    expect(document.title).toBe('❗ 🔮 Agents');
  });

  it('restores original title on unmount', () => {
    const { unmount } = renderHook(() => useAttentionTitle({ emoji: '🔮', pageName: 'Browser' }));

    expect(document.title).toBe('🔮 Browser');
    unmount();
    expect(document.title).toBe('Chainglass');
  });
});
