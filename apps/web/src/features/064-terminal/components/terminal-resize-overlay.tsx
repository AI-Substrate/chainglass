'use client';

import type { Terminal } from '@xterm/xterm';
import { type PointerEvent, useLayoutEffect, useRef, useState } from 'react';
import type { ResizePaneRequest, TmuxPaneGeometry, TmuxWindowLayout } from '../types';

interface TerminalResizeOverlayProps {
  terminal: Terminal | null;
  layout: TmuxWindowLayout | null;
  error: string | null;
  busy: boolean;
  onResize: (request: ResizePaneRequest) => void;
  onRefresh: () => void;
  onClose?: () => void;
}

export function TerminalResizeOverlay({
  terminal,
  layout,
  error,
  busy,
  onResize,
  onRefresh,
  onClose,
}: TerminalResizeOverlayProps) {
  const rootRef = useRef<HTMLDialogElement>(null);
  const [grid, setGrid] = useState({ left: 0, top: 0, cellWidth: 0, cellHeight: 0 });
  const [drag, setDrag] = useState<{
    paneId: string;
    axis: 'x' | 'y';
    fraction: number;
    startPixel: number;
    startBoundary: number;
  } | null>(null);

  useLayoutEffect(() => {
    rootRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    setDrag(null);
    const screen = terminal?.element?.querySelector('.xterm-screen');
    const root = rootRef.current;
    if (!terminal || !screen || !root || !layout) return;
    const measure = () => {
      const screenRect = screen.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const cellHeight = screenRect.height / terminal.rows;
      // tmux's outer status line is not part of window/pane coordinates.
      const statusRows = layout.statusPosition === 'top' ? layout.statusRows : 0;
      setGrid({
        left: screenRect.left - rootRect.left,
        top: screenRect.top - rootRect.top + statusRows * cellHeight,
        cellWidth: screenRect.width / terminal.cols,
        cellHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(screen);
    const resized = terminal.onResize(measure);
    window.addEventListener('terminal:viewport-changed', measure);
    return () => {
      observer.disconnect();
      resized.dispose();
      window.removeEventListener('terminal:viewport-changed', measure);
    };
  }, [terminal, layout]);

  const apply = (paneId: string, axis: 'x' | 'y', fraction: number) => {
    if (!layout || busy) return;
    onResize({ windowId: layout.windowId, revision: layout.revision, paneId, axis, fraction });
  };

  const position = (event: PointerEvent, pane: TmuxPaneGeometry, axis: 'x' | 'y') => {
    if (!layout || !drag) return 0;
    const extent = axis === 'x' ? layout.width : layout.height;
    const origin = axis === 'x' ? pane.left : pane.top;
    const cell = axis === 'x' ? grid.cellWidth : grid.cellHeight;
    const pixel = axis === 'x' ? event.clientX : event.clientY;
    const boundary = drag.startBoundary + Math.round((pixel - drag.startPixel) / cell);
    return Math.min(extent - 2, Math.max(origin + 2, boundary)) / extent;
  };

  const borders =
    layout && !layout.zoomed
      ? layout.panes.flatMap((pane) => {
          const axes: Array<'x' | 'y'> = [];
          if (pane.left + pane.width < layout.width) axes.push('x');
          if (pane.top + pane.height < layout.height) axes.push('y');
          return axes.map((axis) => ({ pane, axis }));
        })
      : [];

  return (
    <dialog
      ref={rootRef}
      open
      aria-label="Resize tmux panes"
      className="absolute inset-0 z-10 m-0 h-full w-full max-h-none max-w-none overflow-hidden border-0 bg-black/20 p-0 outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose?.();
        }
      }}
    >
      <div className="absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-3 rounded-md bg-background px-3 py-2 text-xs text-foreground shadow-sm">
        <output>
          {error ??
            (busy
              ? 'Reading tmux layout…'
              : layout?.zoomed
                ? 'Unzoom the tmux pane to resize borders.'
                : layout?.panes.length === 1
                  ? 'This window has one pane. Split it in tmux first.'
                  : 'Drag borders · release to resize')}
        </output>
        {error && (
          <button type="button" onClick={onRefresh} className="shrink-0 underline">
            Refresh
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Done
        </button>
      </div>
      {grid.cellWidth > 0 &&
        grid.cellHeight > 0 &&
        borders.map(({ pane, axis }) => {
          if (!layout) return null;
          const vertical = axis === 'x';
          const extent = vertical ? layout.width : layout.height;
          const boundary = vertical ? pane.left + pane.width : pane.top + pane.height;
          const dragging = drag?.paneId === pane.id && drag.axis === axis;
          const coordinate = dragging ? drag.fraction * extent : boundary;
          const fraction = coordinate / extent;
          return (
            <hr
              key={`${pane.id}-${axis}`}
              aria-label={`Resize pane ${pane.id} ${vertical ? 'width' : 'height'}`}
              aria-orientation={vertical ? 'vertical' : 'horizontal'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(fraction * 100)}
              aria-disabled={busy}
              tabIndex={busy ? -1 : 0}
              className={`absolute m-0 touch-none border-0 outline-none before:absolute before:left-1/2 before:top-1/2 before:z-10 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-white before:bg-cyan-400 before:shadow-[0_0_0_2px_#083344] before:content-[''] after:absolute after:bg-cyan-400 after:shadow-[0_0_0_1px_#083344] after:content-[''] hover:before:bg-cyan-200 hover:after:bg-cyan-200 focus-visible:before:bg-white ${vertical ? 'cursor-col-resize before:h-10 before:w-4 after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2' : 'cursor-row-resize before:h-4 before:w-10 after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2'} ${busy ? 'pointer-events-none opacity-50' : ''}`}
              style={
                vertical
                  ? {
                      left: grid.left + (coordinate + 0.5) * grid.cellWidth - 10,
                      top: grid.top + pane.top * grid.cellHeight,
                      width: 20,
                      height: pane.height * grid.cellHeight,
                    }
                  : {
                      left: grid.left + pane.left * grid.cellWidth,
                      top: grid.top + (coordinate + 0.5) * grid.cellHeight - 10,
                      width: pane.width * grid.cellWidth,
                      height: 20,
                    }
              }
              onPointerDown={(event) => {
                if (busy || event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag({
                  paneId: pane.id,
                  axis,
                  fraction,
                  startPixel: vertical ? event.clientX : event.clientY,
                  startBoundary: boundary,
                });
              }}
              onPointerMove={(event) => {
                if (!dragging) return;
                setDrag({ ...drag, fraction: position(event, pane, axis) });
              }}
              onPointerUp={(event) => {
                if (!dragging) return;
                const next = position(event, pane, axis);
                setDrag(null);
                event.currentTarget.releasePointerCapture(event.pointerId);
                apply(pane.id, axis, next);
              }}
              onPointerCancel={() => setDrag(null)}
              onLostPointerCapture={() => setDrag(null)}
              onKeyDown={(event) => {
                const delta = (
                  vertical ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
                ).indexOf(event.key);
                if (delta === -1 || busy) return;
                event.preventDefault();
                const next = boundary + (delta === 0 ? -1 : 1) * (event.shiftKey ? 5 : 1);
                if (next > 0 && next < extent) apply(pane.id, axis, next / extent);
              }}
            />
          );
        })}
      {drag && (
        <output className="absolute bottom-2 right-2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
          {Math.round(drag.fraction * 100)}%
        </output>
      )}
    </dialog>
  );
}
