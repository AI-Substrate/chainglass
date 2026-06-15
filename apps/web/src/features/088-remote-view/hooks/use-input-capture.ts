'use client';

/**
 * useInputCapture — capture pointer/keyboard/wheel on the viewport canvas and
 * serialize them to protocol `input` events (Plan 088 Phase 3, T006; Workshop 001 §Focus).
 *
 * Rules:
 *   - the canvas is focusable (`tabIndex`); input is captured ONLY while it has focus;
 *   - mouse/wheel x/y are normalized to `[0,1]` of the canvas rect and clamped (P2-F003 —
 *     the daemon owns the pixel mapping; out-of-range is never sent); wheel dx/dy are raw;
 *   - `Meta+Shift+Escape` is the release chord (drops capture, not forwarded); a plain
 *     `Escape` IS forwarded to the streamed app;
 *   - events are rAF-batched into a single `{t:'input', events}` per frame, with runs of
 *     `mousemove` coalesced to the latest (drag/hover stay cheap);
 *   - only mouse buttons 0/1/2 are forwarded (ButtonSchema); others are ignored.
 *
 * Returns `{ capturing }` so the viewport can show a "keys captured" indicator.
 */

import { type RefObject, useEffect, useRef, useState } from 'react';
import type { InputEvent, Mods } from '../protocol/messages';

export interface UseInputCaptureOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Forward a batch of input events (the hook's sendInput). */
  send: (events: InputEvent[]) => void;
  /** Capture only while streaming (default true). */
  enabled?: boolean;
}

export interface InputCaptureResult {
  capturing: boolean;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const modsOf = (e: KeyboardEvent): Mods => ({
  shift: e.shiftKey,
  ctrl: e.ctrlKey,
  alt: e.altKey,
  meta: e.metaKey,
});

export function useInputCapture({
  canvasRef,
  send,
  enabled = true,
}: UseInputCaptureOptions): InputCaptureResult {
  const [capturing, setCapturing] = useState(false);
  const bufferRef = useRef<InputEvent[]>([]);
  const rafRef = useRef<number | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const norm = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp01(rect.width ? (clientX - rect.left) / rect.width : 0),
        y: clamp01(rect.height ? (clientY - rect.top) / rect.height : 0),
      };
    };
    const flush = () => {
      rafRef.current = null;
      if (bufferRef.current.length === 0) return;
      const events = bufferRef.current;
      bufferRef.current = [];
      sendRef.current(events);
    };
    const schedule = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    };
    const push = (ev: InputEvent, coalesceMove = false) => {
      const buf = bufferRef.current;
      const last = buf[buf.length - 1];
      if (coalesceMove && last && last.k === 'mousemove') buf[buf.length - 1] = ev;
      else buf.push(ev);
      schedule();
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = norm(e.clientX, e.clientY);
      push({ k: 'mousemove', x, y }, true);
    };
    const onPointerDown = (e: PointerEvent) => {
      canvas.focus();
      if (e.button > 2) return; // ButtonSchema is 0/1/2 only
      const { x, y } = norm(e.clientX, e.clientY);
      push({ k: 'mousedown', x, y, button: e.button as 0 | 1 | 2 });
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button > 2) return;
      const { x, y } = norm(e.clientX, e.clientY);
      push({ k: 'mouseup', x, y, button: e.button as 0 | 1 | 2 });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = norm(e.clientX, e.clientY);
      push({ k: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Release chord: Meta+Shift+Escape drops capture and is NOT forwarded.
      // Keyed on `code` (layout-independent physical key, always present) not `key`.
      if (e.code === 'Escape' && e.metaKey && e.shiftKey) {
        e.preventDefault();
        canvas.blur();
        return;
      }
      e.preventDefault(); // keep browser shortcuts from firing; plain Escape is still forwarded
      push({ k: 'keydown', code: e.code, modifiers: modsOf(e) });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      push({ k: 'keyup', code: e.code, modifiers: modsOf(e) });
    };
    const onFocus = () => setCapturing(true);
    const onBlur = () => setCapturing(false);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('focus', onFocus);
      canvas.removeEventListener('blur', onBlur);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      bufferRef.current = [];
      setCapturing(false);
    };
  }, [canvasRef, enabled]);

  return { capturing };
}
