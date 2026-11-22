import { TooltipProvider } from '@/components/ui/tooltip';
import type { MoveWindowRequest, TerminalWindow } from '@/features/064-terminal/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectWindowMock = vi.fn();
const moveWindowMock = vi.fn<(request: MoveWindowRequest) => void>();

const windowFixtures: TerminalWindow[] = [
  {
    id: '@1',
    index: 0,
    name: 'alpha',
    active: true,
    idleSeconds: null,
    activeSeconds: null,
    question: false,
    agent: null,
    background: null,
    lastLine: null,
    seatId: null,
    context: null,
  },
  {
    id: '@2',
    index: 59,
    name: 'beta',
    active: false,
    idleSeconds: null,
    activeSeconds: null,
    question: false,
    agent: null,
    background: null,
    lastLine: null,
    seatId: null,
    context: null,
  },
  {
    id: '@3',
    index: 86,
    name: 'gamma',
    active: false,
    idleSeconds: null,
    activeSeconds: null,
    question: false,
    agent: null,
    background: null,
    lastLine: null,
    seatId: null,
    context: null,
  },
];

vi.mock('@/features/064-terminal/components/terminal-theme-select', () => ({
  TerminalThemeSelect: () => <button type="button" aria-label="Terminal color theme" />,
}));

vi.mock('@/features/064-terminal/components/terminal-singleton-provider', () => ({
  useTerminalSingleton: () => ({
    connectionStatus: 'connected',
    sendPrompt: null,
    renameWindow: null,
    resizeMode: false,
    toggleResizeMode: vi.fn(),
    windows: windowFixtures,
    selectWindow: selectWindowMock,
    newWindow: null,
    moveWindow: moveWindowMock,
  }),
}));

import { TerminalPaneHeader } from '@/features/064-terminal/components/terminal-pane-header';

function makeDomRect(left: number, top: number, width = 32, height = 28): DOMRect {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function renderHeaderWithRects() {
  const result = render(
    <TooltipProvider>
      <TerminalPaneHeader sessionName="worktree-a" connectionStatus="connected" />
    </TooltipProvider>
  );

  const nav = screen.getByRole('navigation', { name: 'tmux windows' });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(makeDomRect(100, 20, 200, 28));

  const btn0 = screen.getByRole('button', { name: /Window 0: alpha/ });
  const btn1 = screen.getByRole('button', { name: /Window 59: beta/ });
  const btn2 = screen.getByRole('button', { name: /Window 86: gamma/ });
  vi.spyOn(btn0, 'getBoundingClientRect').mockReturnValue(makeDomRect(100, 20));
  vi.spyOn(btn1, 'getBoundingClientRect').mockReturnValue(makeDomRect(136, 20));
  vi.spyOn(btn2, 'getBoundingClientRect').mockReturnValue(makeDomRect(172, 20));

  return { ...result, nav, btn0, btn1, btn2 };
}

beforeEach(() => {
  selectWindowMock.mockReset();
  moveWindowMock.mockReset();
});

describe('TerminalPaneHeader window strip drag-to-reorder', () => {
  it('plain click still selects without triggering a drag', () => {
    const { btn1 } = renderHeaderWithRects();

    fireEvent.pointerDown(btn1, {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 150,
      clientY: 34,
    });
    // Tiny jitter below 5px threshold must not start a drag.
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 152, clientY: 34 });
    expect(document.querySelector('[data-window-drop-indicator]')).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 152, clientY: 34 });
    fireEvent.click(btn1);

    expect(moveWindowMock).not.toHaveBeenCalled();
    expect(selectWindowMock).toHaveBeenCalledWith('@2', 59);
  });

  it('shows the black vertical drop bar in the gap while dragging and emits moveWindow on drop', () => {
    const { btn0 } = renderHeaderWithRects();

    // Drag window 0 (@1) past threshold into the gap between window 59 (@2) and 86 (@3).
    fireEvent.pointerDown(btn0, {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 116,
      clientY: 34,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 170, clientY: 34 });

    const indicator = document.querySelector('[data-window-drop-indicator]') as HTMLElement | null;
    expect(indicator).not.toBeNull();
    expect(indicator?.dataset.dropSlot).toBe('2');
    expect(indicator?.style.left).toBe('70px');
    expect(indicator?.className).toContain('bg-black');

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 170, clientY: 34 });
    // Browser dispatches a synthetic click after mouseup; drag must suppress it.
    fireEvent.click(btn0);

    expect(document.querySelector('[data-window-drop-indicator]')).toBeNull();
    expect(selectWindowMock).not.toHaveBeenCalled();
    expect(moveWindowMock).toHaveBeenCalledWith({
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@2',
      targetIndex: 59,
      position: 'after',
    });
  });

  it('cancels drag on Escape without moving or letting the overlay Escape listener fire', () => {
    const { btn0 } = renderHeaderWithRects();
    const overlayEscape = vi.fn();
    document.addEventListener('keydown', overlayEscape);

    try {
      fireEvent.pointerDown(btn0, {
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 116,
        clientY: 34,
      });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 170, clientY: 34 });
      expect(document.querySelector('[data-window-drop-indicator]')).not.toBeNull();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(document.querySelector('[data-window-drop-indicator]')).toBeNull();
      expect(overlayEscape).not.toHaveBeenCalled();

      fireEvent.pointerUp(window, { pointerId: 1, clientX: 170, clientY: 34 });
      expect(moveWindowMock).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', overlayEscape);
    }
  });

  it('does nothing when dropped back at its starting position', () => {
    const { btn1 } = renderHeaderWithRects();

    fireEvent.pointerDown(btn1, {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 152,
      clientY: 34,
    });
    // Move far enough to start drag, then return to original slot (between 0 and 59 -> slot 1).
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 190, clientY: 34 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 135, clientY: 34 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 135, clientY: 34 });

    expect(moveWindowMock).not.toHaveBeenCalled();
  });
});
