import { TooltipProvider } from '@/components/ui/tooltip';
import { NEW_STAR_LIMIT } from '@/features/064-terminal/lib/window-recency';
import type { TerminalWindow } from '@/features/064-terminal/types';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION = 'badge-test-session';
const KNOWN_KEY = `chainglass:terminal-window-recency:known:${SESSION}`;

let currentWindows: TerminalWindow[] = [];

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
    windows: currentWindows,
    selectWindow: vi.fn(),
    newWindow: null,
    moveWindow: null,
  }),
}));

import { TerminalPaneHeader } from '@/features/064-terminal/components/terminal-pane-header';

function makeWindow(id: string, index: number, active = false): TerminalWindow {
  return {
    id,
    index,
    name: `win-${id}`,
    active,
    idleSeconds: null,
    activeSeconds: null,
    question: false,
    agent: null,
    background: null,
    lastLine: null,
    seatId: null,
    context: null,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  currentWindows = [];
});

afterEach(() => {
  window.localStorage.clear();
});

describe('TerminalPaneHeader new-window badge', () => {
  it('pins compact round badge size and offset so ring-included protrusion stays <= 3px inside gap-1', async () => {
    window.localStorage.setItem(KNOWN_KEY, JSON.stringify(['@1']));
    currentWindows = [makeWindow('@1', 0, true), makeWindow('@2', 1)];

    render(
      <TooltipProvider>
        <TerminalPaneHeader sessionName={SESSION} connectionStatus="connected" />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(document.querySelectorAll('[data-window-new="true"]')).toHaveLength(1);
    });

    const badge = document.querySelector('[data-window-new="true"]') as HTMLElement;
    const classes = badge.className.split(/\s+/);

    // 8px round dot (size-2), shifted right by 2px + 1px ring = 3px total protrusion (< 4px gap-1).
    expect(classes).toContain('size-2');
    expect(classes).toContain('translate-x-[2px]');
    expect(classes).toContain('-translate-y-1/2');
    expect(classes).toContain('ring-1');
    expect(classes).toContain('rounded-full');

    // Regression guards against growing back over the neighbour's agent triangle.
    expect(classes).not.toContain('size-3');
    expect(classes).not.toContain('translate-x-1/2');
    expect(classes).not.toContain('ring-2');
  });

  it('renders at most NEW_STAR_LIMIT badges for the newest numeric ids regardless of strip order', async () => {
    window.localStorage.setItem(KNOWN_KEY, JSON.stringify(['@1']));
    // 6 unseen windows in scrambled strip order; @8 is oldest unseen and must drop off.
    currentWindows = [
      makeWindow('@1', 0, true),
      makeWindow('@13', 1),
      makeWindow('@10', 2),
      makeWindow('@8', 3),
      makeWindow('@12', 4),
      makeWindow('@9', 5),
      makeWindow('@11', 6),
    ];

    render(
      <TooltipProvider>
        <TerminalPaneHeader sessionName={SESSION} connectionStatus="connected" />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(document.querySelectorAll('[data-window-new="true"]')).toHaveLength(NEW_STAR_LIMIT);
    });

    // @8 must not carry a badge; @9..@13 must.
    const wrapperFor = (label: RegExp) => screen.getByRole('button', { name: label }).parentElement;
    expect(wrapperFor(/Window 3: win-@8/)?.querySelector('[data-window-new="true"]')).toBeNull();
    for (const pattern of [
      /Window 5: win-@9/,
      /Window 2: win-@10/,
      /Window 6: win-@11/,
      /Window 4: win-@12/,
      /Window 1: win-@13/,
    ]) {
      expect(wrapperFor(pattern)?.querySelector('[data-window-new="true"]')).not.toBeNull();
    }
  });
});
