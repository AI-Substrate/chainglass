import type { MoveWindowRequest, TerminalWindow } from '../types';

/** Minimal rectangle shape needed for drop-slot hit testing (compatible with DOMRect). */
export interface StripRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** Position of the vertical insertion bar relative to the strip container's top-left corner. */
export interface DropIndicatorGeometry {
  left: number;
  top: number;
  height: number;
}

export interface WindowDropTarget {
  /** Insertion slot in `[0, rects.length]`: `0` = before first, `rects.length` = after last. */
  slotIndex: number;
  /** Visual bar coordinates relative to the strip container. */
  indicator: DropIndicatorGeometry;
}

/** Movement in pixels before a pointer press turns into a window drag (keeps plain clicks crisp). */
export const WINDOW_DRAG_THRESHOLD_PX = 5;

/** Fallback half-gap (in px) when a row has only one button and interior gap cannot be measured. */
const DEFAULT_HALF_GAP_PX = 2;

interface StripRow {
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
}

/**
 * Group wrapped flex items into visual rows in DOM order.
 * Two consecutive buttons share a row when their vertical extents overlap.
 */
function groupIntoRows(rects: readonly StripRect[]): StripRow[] {
  const rows: StripRow[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const current = rows[rows.length - 1];
    if (current && rect.top < current.bottom && rect.bottom > current.top) {
      current.endIndex = i;
      current.top = Math.min(current.top, rect.top);
      current.bottom = Math.max(current.bottom, rect.bottom);
    } else {
      rows.push({ startIndex: i, endIndex: i, top: rect.top, bottom: rect.bottom });
    }
  }
  return rows;
}

/** Measure half the horizontal gap between adjacent buttons in the strip (falls back to 2px). */
function measureHalfGap(rects: readonly StripRect[], rows: readonly StripRow[]): number {
  for (const row of rows) {
    if (row.endIndex > row.startIndex) {
      const gap = rects[row.startIndex + 1].left - rects[row.startIndex].right;
      if (gap > 0) return Math.min(4, gap / 2);
    }
  }
  return DEFAULT_HALF_GAP_PX;
}

/**
 * Given pointer coordinates, each window button's bounding rect (in strip order), and the strip
 * container's bounding rect, compute which insertion slot the pointer targets and where to draw
 * the vertical drop indicator bar.
 *
 * Handles wrapped multi-row strips: chooses the vertically closest row, then splits each button
 * at its horizontal midpoint so the bar lands cleanly in the gap between neighbours (or at the
 * leading/trailing edge of that row).
 */
export function computeWindowDropTarget(
  clientX: number,
  clientY: number,
  rects: readonly StripRect[],
  containerRect: Pick<StripRect, 'left' | 'top'>
): WindowDropTarget | null {
  if (rects.length === 0) return null;

  const rows = groupIntoRows(rects);
  const halfGap = measureHalfGap(rects, rows);

  // Pick the row closest to clientY (0 distance when inside a row's vertical band).
  let bestRow = rows[0];
  let bestDist = Number.POSITIVE_INFINITY;
  let bestMidDist = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const dist =
      clientY < row.top ? row.top - clientY : clientY > row.bottom ? clientY - row.bottom : 0;
    const midDist = Math.abs(clientY - (row.top + row.bottom) / 2);
    if (dist < bestDist || (dist === bestDist && midDist < bestMidDist)) {
      bestRow = row;
      bestDist = dist;
      bestMidDist = midDist;
    }
  }

  // Within the chosen row, walk buttons left-to-right and split at each button's midpoint.
  const first = rects[bestRow.startIndex];
  if (clientX < (first.left + first.right) / 2) {
    return {
      slotIndex: bestRow.startIndex,
      indicator: {
        left: first.left - halfGap - containerRect.left,
        top: first.top - containerRect.top,
        height: first.height,
      },
    };
  }

  for (let i = bestRow.startIndex; i < bestRow.endIndex; i++) {
    const leftRect = rects[i];
    const rightRect = rects[i + 1];
    const rightMid = (rightRect.left + rightRect.right) / 2;
    if (clientX < rightMid) {
      const top = Math.min(leftRect.top, rightRect.top);
      const bottom = Math.max(leftRect.bottom, rightRect.bottom);
      return {
        slotIndex: i + 1,
        indicator: {
          left: (leftRect.right + rightRect.left) / 2 - containerRect.left,
          top: top - containerRect.top,
          height: bottom - top,
        },
      };
    }
  }

  const last = rects[bestRow.endIndex];
  return {
    slotIndex: bestRow.endIndex + 1,
    indicator: {
      left: last.right + halfGap - containerRect.left,
      top: last.top - containerRect.top,
      height: last.height,
    },
  };
}

/**
 * Translate a `(sourcePos, slotIndex)` drop into a tmux `move-window` request, or `null` when
 * the drop leaves the window in its current position.
 *
 * Uses `'after'` the left neighbour whenever one exists (`slotIndex > 0`) and `'before'` the
 * first window for `slotIndex === 0`. With sparse tmux indexes (e.g. 59 then 86), inserting
 * `'after'` 59 takes slot 60 without shifting 86; inserting `'before'` index 0 shifts 0+ up.
 */
export function resolveMoveTarget(
  windows: readonly Pick<TerminalWindow, 'id' | 'index'>[],
  sourcePos: number,
  slotIndex: number
): MoveWindowRequest | null {
  if (sourcePos < 0 || sourcePos >= windows.length) return null;
  if (slotIndex < 0 || slotIndex > windows.length) return null;
  // Dropping immediately before or immediately after the source leaves order unchanged.
  if (slotIndex === sourcePos || slotIndex === sourcePos + 1) return null;

  const source = windows[sourcePos];
  if (slotIndex === 0) {
    const target = windows[0];
    return {
      sourceId: source.id,
      sourceIndex: source.index,
      targetId: target.id,
      targetIndex: target.index,
      position: 'before',
    };
  }

  const target = windows[slotIndex - 1];
  return {
    sourceId: source.id,
    sourceIndex: source.index,
    targetId: target.id,
    targetIndex: target.index,
    position: 'after',
  };
}
