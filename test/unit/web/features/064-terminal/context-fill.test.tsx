import { ContextFillBar } from '@/features/064-terminal/components/context-fill-bar';
import {
  contextBand,
  contextFill,
  contextLabel,
  seatContext,
} from '@/features/064-terminal/lib/context-fill';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const tokens = (value: unknown) => ({ value, basis: 'native' });
const seat = (used: unknown, window: unknown) => ({
  sessionStatus: {
    status: { contextUsedTokens: tokens(used), contextWindowTokens: tokens(window) },
  },
});

describe('context fill', () => {
  it('maps fill to bands at their lower edges', () => {
    expect([0, 0.4999, 0.5, 0.6999, 0.7, 0.8499, 0.85, 1].map(contextBand)).toEqual([
      'green',
      'green',
      'yellow',
      'yellow',
      'orange',
      'orange',
      'red',
      'red',
    ]);
  });

  it('clamps fill to 0–100% and labels the real token counts, floored to stay inside the band', () => {
    expect(contextFill({ usedTokens: 1_200_000, windowTokens: 1_000_000 })).toBe(1);
    expect(contextFill({ usedTokens: -5, windowTokens: 1_000 })).toBe(0);
    expect(contextLabel({ usedTokens: 468_000, windowTokens: 1_000_000 })).toBe(
      'context 46% (468k / 1.0M)'
    );
    expect(contextLabel({ usedTokens: 4_997, windowTokens: 10_000 })).toBe(
      'context 49% (5k / 10k)'
    );
  });

  it('reads a seat only when both counts are reported and the window is positive', () => {
    expect(seatContext(seat(332_921, 922_000))).toEqual({
      usedTokens: 332_921,
      windowTokens: 922_000,
    });
    expect(seatContext(seat(332_921, null))).toBeNull();
    expect(seatContext(seat(undefined, 922_000))).toBeNull();
    expect(seatContext(seat(10, 0))).toBeNull();
    expect(seatContext({ sessionStatus: { status: {} } })).toBeNull();
    expect(seatContext({})).toBeNull();
  });

  it('draws no bar without context, and a banded bar with it', () => {
    const { container, rerender } = render(<ContextFillBar context={null} className="" />);
    expect(container.firstChild).toBeNull();

    rerender(<ContextFillBar context={{ usedTokens: 900, windowTokens: 1_000 }} className="" />);
    const bar = container.querySelector('[data-context-band]');
    expect(bar?.getAttribute('data-context-band')).toBe('red');
    expect(bar?.getAttribute('aria-label')).toBe('context 90% (900 / 1k)');
  });
});
