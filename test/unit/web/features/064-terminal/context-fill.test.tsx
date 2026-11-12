import { ContextFillBar } from '@/features/064-terminal/components/context-fill-bar';
import {
  contextBand,
  contextFill,
  contextLabel,
  fullestContext,
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
/** A window whose only reporting seat is `pij-a`. */
const one = (usedTokens: number, windowTokens: number) => ({
  usedTokens,
  windowTokens,
  seatId: 'pij-a',
  seats: 1,
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
    expect(contextLabel(one(468_000, 1_000_000))).toBe('context 46% (468k / 1.0M)');
    expect(contextLabel(one(4_997, 10_000))).toBe('context 49% (5k / 10k)');
  });

  it('names the fullest seat and the count only when several seats report', () => {
    expect(
      contextLabel({ usedTokens: 720_000, windowTokens: 1_000_000, seatId: 'pij-foo', seats: 3 })
    ).toBe('context 72% (720k / 1.0M), fullest of 3 agents: pij-foo');
  });

  it('ranks seats by used over window unclamped, so an over-full seat beats an exactly full one', () => {
    const full = { usedTokens: 1_000_000, windowTokens: 1_000_000 };
    const over = { usedTokens: 1_200_000, windowTokens: 1_000_000 };
    expect(
      fullestContext([
        { id: 'pij-full', context: full },
        { id: 'pij-over', context: over },
      ])
    ).toEqual({ ...over, seatId: 'pij-over', seats: 2 });
    // Equal ratios keep the earlier seat.
    expect(
      fullestContext([
        { id: 'pij-first', context: { usedTokens: 500, windowTokens: 1_000 } },
        { id: 'pij-second', context: { usedTokens: 1_000, windowTokens: 2_000 } },
      ])?.seatId
    ).toBe('pij-first');
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

    rerender(<ContextFillBar context={one(900, 1_000)} className="" />);
    const bar = container.querySelector('[data-context-band]');
    expect(bar?.getAttribute('data-context-band')).toBe('red');
    expect(bar?.getAttribute('aria-label')).toBe('context 90% (900 / 1k)');
  });
});
