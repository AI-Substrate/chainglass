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
  canvas.tabIndex = 0; // focusable so the capture focus-gate (F009) can engage in jsdom
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
    // Stable ref object (created once per mount, not per render) — mirrors the viewport's
    // useRef. An inline `{ current }` would change identity each render and re-run the
    // capture effect (resetting the focus flag) when setCapturing fires.
    const ref = { current: canvas };
    return renderHook(() => useInputCapture({ canvasRef: ref, send }));
  }

  it('normalizes + clamps coords, coalesces moves, serializes click buttons (AC-3)', async () => {
    const batches: InputEvent[][] = [];
    mount((e) => batches.push(e));
    canvas.dispatchEvent(new Event('focus')); // capture is focus-gated (F009)

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
    canvas.dispatchEvent(new Event('focus')); // capture is focus-gated (F009)

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

  it('sends nothing before focus; pointerdown enables capture; blur stops it [F009]', async () => {
    /*
    Test Doc:
    - Why: Workshop 001 §Focus requires capture ONLY while focused — hovering/scrolling an unfocused
      viewport must not drive the remote app (companion F009, HIGH). Before the fix, pointermove/up/wheel
      serialized regardless of focus.
    - Contract: with the canvas unfocused, pointermove + wheel send nothing; a pointerdown focuses (the
      capture entry) and then a pointermove serializes; after blur, subsequent moves are dropped.
    - Usage Notes: gate is `document.activeElement === canvas` (synchronous); pointerdown calls focus()
      before sending. jsdom canvas has tabIndex so focus()/blur() move activeElement.
    - Quality Contribution: regression guard for the focus-capture safety contract.
    - Worked Example: unfocused pointermove → 0 events; pointerdown→focus→pointermove → mousedown+mousemove.
    */
    const batches: InputEvent[][] = [];
    mount((e) => batches.push(e));

    // Unfocused: hovering + scrolling send nothing.
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new Event('wheel'));
    await new Promise((r) => setTimeout(r, 60));
    expect(batches.flat()).toHaveLength(0);

    // pointerdown is the capture entry: it focuses, then a move serializes.
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0 }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 60 }));
    await waitFor(() => expect(batches.flat().some((e) => e.k === 'mousemove')).toBe(true));
    expect(batches.flat().some((e) => e.k === 'mousedown')).toBe(true);

    // blur stops capture → later moves are dropped.
    const before = batches.flat().length;
    canvas.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    await new Promise((r) => setTimeout(r, 60));
    expect(batches.flat().length).toBe(before);
  });
});
