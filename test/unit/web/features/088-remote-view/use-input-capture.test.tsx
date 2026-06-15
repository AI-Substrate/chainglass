/**
 * Plan 088 Phase 3 — T006: useInputCapture serialization (AC-3 serialize half).
 *
 * Why: input correctness is the contract the Swift daemon parses (Phase 4) — coords MUST be
 *   normalized [0,1] (P2-F003, daemon owns the pixel mapping) and the release chord MUST NOT
 *   leak to the app. This is pure DOM→protocol serialization (no WebCodecs), so it's unit-tested
 *   here; the live land-at-coordinates fidelity is Phase 4/6, and the in-browser capture is T007.
 * Contract: pointer/keyboard events on the canvas → rAF-batched `InputEvent[]`; mousemove runs
 *   coalesce to the latest; out-of-frame coords clamp to [0,1]; buttons map 0/1/2; keydown carries
 *   modifiers; Meta+Shift+Escape releases (not forwarded).
 * Usage Notes: getBoundingClientRect is stubbed 800×600; events dispatched on the canvas fire the
 *   listeners regardless of focus; rAF flush observed via waitFor.
 * Quality Contribution: locks the wire shape downstream (Phase 4 parser) depends on.
 * Worked Example: pointerdown @ (400,300) on an 800×600 canvas → {k:'mousedown', x:0.5, y:0.5, button:0}.
 */

import { useInputCapture } from '@/features/088-remote-view/hooks/use-input-capture';
import type { InputEvent } from '@/features/088-remote-view/protocol/messages';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(canvas);
  return canvas;
}

describe('useInputCapture', () => {
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    canvas = makeCanvas();
  });
  afterEach(() => {
    canvas.remove();
  });

  function mount(send: (e: InputEvent[]) => void) {
    return renderHook(() => useInputCapture({ canvasRef: { current: canvas }, send }));
  }

  it('normalizes + clamps coords, coalesces moves, serializes click buttons (AC-3)', async () => {
    const batches: InputEvent[][] = [];
    mount((e) => batches.push(e));

    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 1200, clientY: -50 })); // out of frame
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0 }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 400, clientY: 300, button: 2 }));

    await waitFor(() => expect(batches.length).toBeGreaterThanOrEqual(1));
    const flat = batches.flat();
    const moves = flat.filter((e) => e.k === 'mousemove');
    expect(moves).toHaveLength(1); // runs of moves coalesce to the latest
    expect(moves[0]).toEqual({ k: 'mousemove', x: 1, y: 0 }); // 1200/800→clamp 1, -50→clamp 0
    expect(flat).toContainEqual({ k: 'mousedown', x: 0.5, y: 0.5, button: 0 });
    expect(flat).toContainEqual({ k: 'mouseup', x: 0.5, y: 0.5, button: 2 });
  });

  it('serializes keydown with modifiers; Meta+Shift+Escape releases (not forwarded)', async () => {
    const batches: InputEvent[][] = [];
    mount((e) => batches.push(e));

    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', shiftKey: true }));
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', metaKey: true, shiftKey: true })
    );

    await waitFor(() => expect(batches.flat().length).toBeGreaterThanOrEqual(1));
    const flat = batches.flat();
    expect(flat).toContainEqual({
      k: 'keydown',
      code: 'KeyW',
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    });
    // the release chord is swallowed — never serialized to the app
    expect(flat.some((e) => e.k === 'keydown' && e.code === 'Escape')).toBe(false);
  });
});
