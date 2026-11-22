import {
  type StripRect,
  computeWindowDropTarget,
  resolveMoveTarget,
} from '@/features/064-terminal/lib/window-drag-reorder';
import { describe, expect, it } from 'vitest';

function rect(left: number, top: number, width = 32, height = 28): StripRect {
  return { left, right: left + width, top, bottom: top + height, width, height };
}

describe('computeWindowDropTarget', () => {
  const container = { left: 100, top: 20 };

  it('returns null when there are no window buttons', () => {
    expect(computeWindowDropTarget(120, 30, [], container)).toBeNull();
  });

  it('splits a single row at button midpoints and places the bar in the gap', () => {
    // Three 32px buttons starting at x=100 with 4px gap:
    // [100..132] (mid 116), [136..168] (mid 152), [172..204] (mid 188)
    const rects = [rect(100, 20), rect(136, 20), rect(172, 20)];

    // Before first midpoint -> slot 0, left of first button by half-gap (2px)
    expect(computeWindowDropTarget(110, 34, rects, container)).toEqual({
      slotIndex: 0,
      indicator: { left: -2, top: 0, height: 28 },
    });

    // Between first and second midpoints -> slot 1, centered in 132..136 gap (x=134 -> rel 34)
    expect(computeWindowDropTarget(135, 34, rects, container)).toEqual({
      slotIndex: 1,
      indicator: { left: 34, top: 0, height: 28 },
    });

    // Between second and third midpoints -> slot 2, centered in 168..172 gap (x=170 -> rel 70)
    expect(computeWindowDropTarget(169, 34, rects, container)).toEqual({
      slotIndex: 2,
      indicator: { left: 70, top: 0, height: 28 },
    });

    // Past last midpoint -> slot 3, right of last button by half-gap (204+2-100 = 106)
    expect(computeWindowDropTarget(250, 34, rects, container)).toEqual({
      slotIndex: 3,
      indicator: { left: 106, top: 0, height: 28 },
    });
  });

  it('tracks wrapped rows by vertical proximity and computes row-local gap coordinates', () => {
    // Row 0 (top=20..48): buttons 0, 1, 2 at x=100, 136, 172
    // Row 1 (top=52..80): buttons 3, 4 at x=100, 136
    const rects = [rect(100, 20), rect(136, 20), rect(172, 20), rect(100, 52), rect(136, 52)];

    // Pointer in row 1 before button 3 midpoint -> slot 3, at leading edge of row 1 (top=32)
    expect(computeWindowDropTarget(105, 64, rects, container)).toEqual({
      slotIndex: 3,
      indicator: { left: -2, top: 32, height: 28 },
    });

    // Pointer in row 1 between button 3 and button 4 -> slot 4, gap x=134 (rel 34), top=32
    expect(computeWindowDropTarget(134, 66, rects, container)).toEqual({
      slotIndex: 4,
      indicator: { left: 34, top: 32, height: 28 },
    });

    // Pointer far right on row 1 (past button 4, even under row 0's button 2) -> slot 5 on row 1
    expect(computeWindowDropTarget(190, 66, rects, container)).toEqual({
      slotIndex: 5,
      indicator: { left: 70, top: 32, height: 28 },
    });

    // Pointer far right on row 0 -> slot 3 at trailing edge of row 0 (top=0)
    expect(computeWindowDropTarget(220, 30, rects, container)).toEqual({
      slotIndex: 3,
      indicator: { left: 106, top: 0, height: 28 },
    });

    // Pointer well below row 1 clamps to row 1
    expect(computeWindowDropTarget(140, 200, rects, container)).toEqual({
      slotIndex: 4,
      indicator: { left: 34, top: 32, height: 28 },
    });
  });
});

describe('resolveMoveTarget', () => {
  const sparse = [
    { id: '@1', index: 0 },
    { id: '@2', index: 59 },
    { id: '@3', index: 86 },
  ];

  it('returns null when dropped back in its own starting slot', () => {
    // Source at pos 1 (@2, index 59): slots 1 (immediately before) and 2 (immediately after) are no-ops.
    expect(resolveMoveTarget(sparse, 1, 1)).toBeNull();
    expect(resolveMoveTarget(sparse, 1, 2)).toBeNull();
    expect(resolveMoveTarget(sparse, 0, 0)).toBeNull();
    expect(resolveMoveTarget(sparse, 0, 1)).toBeNull();
    expect(resolveMoveTarget(sparse, 2, 2)).toBeNull();
    expect(resolveMoveTarget(sparse, 2, 3)).toBeNull();
  });

  it('uses "before" first window when dropping at slot 0', () => {
    expect(resolveMoveTarget(sparse, 2, 0)).toEqual({
      sourceId: '@3',
      sourceIndex: 86,
      targetId: '@1',
      targetIndex: 0,
      position: 'before',
    });
  });

  it('uses "after" left neighbour for interior and trailing slots (clean with sparse gaps)', () => {
    // Dragging @1 (0) into the gap between 59 and 86 (slot 2) -> after 59 (takes 60 without shifting 86)
    expect(resolveMoveTarget(sparse, 0, 2)).toEqual({
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@2',
      targetIndex: 59,
      position: 'after',
    });

    // Dragging @1 (0) to end (slot 3) -> after 86
    expect(resolveMoveTarget(sparse, 0, 3)).toEqual({
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@3',
      targetIndex: 86,
      position: 'after',
    });

    // Dragging @3 (86) into gap between 0 and 59 (slot 1) -> after 0
    expect(resolveMoveTarget(sparse, 2, 1)).toEqual({
      sourceId: '@3',
      sourceIndex: 86,
      targetId: '@1',
      targetIndex: 0,
      position: 'after',
    });
  });

  it('returns null for out-of-bounds indices', () => {
    expect(resolveMoveTarget(sparse, -1, 1)).toBeNull();
    expect(resolveMoveTarget(sparse, 3, 1)).toBeNull();
    expect(resolveMoveTarget(sparse, 0, -1)).toBeNull();
    expect(resolveMoveTarget(sparse, 0, 4)).toBeNull();
  });
});
