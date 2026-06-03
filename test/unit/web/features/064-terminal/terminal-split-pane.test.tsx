/**
 * Regression lock for FX014: the inline split pane (side-by-side terminal)
 * must expose the same controls as the floating overlay — the theme picker
 * and the copy-tmux-buffer button. Before FX014 the split pane rendered a
 * bare viewport, so those controls were unreachable in side-by-side mode.
 *
 * Heavy dependencies are stubbed: `TerminalThemeSelect` needs the SDK
 * provider, `TerminalViewport` drives the singleton xterm, and the singleton
 * context supplies connection status. We mock all three so the test asserts
 * the *composition* (controls present in the header) deterministically.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/064-terminal/components/terminal-theme-select', () => ({
  // Stand-in keeps the same aria-label as the real picker's trigger button.
  TerminalThemeSelect: () => <button type="button" aria-label="Terminal color theme" />,
}));

vi.mock('@/features/064-terminal/components/terminal-viewport', () => ({
  TerminalViewport: ({ id }: { id: string }) => (
    <div data-testid="viewport" data-viewport-id={id} />
  ),
}));

vi.mock('@/features/064-terminal/components/terminal-singleton-provider', () => ({
  useTerminalSingleton: () => ({ connectionStatus: 'connected' }),
}));

import { TerminalSplitPane } from '@/features/064-terminal/components/terminal-split-pane';

describe('TerminalSplitPane — FX014', () => {
  it('split-pane.exposes-theme-and-copy: renders the theme picker and copy-buffer controls', () => {
    render(<TerminalSplitPane sessionName="my-session" />);

    // The two controls the bug removed in side-by-side mode.
    expect(screen.getByLabelText('Terminal color theme')).toBeTruthy();
    expect(screen.getByLabelText('Copy tmux buffer')).toBeTruthy();
  });

  it('split-pane.shows-session-and-viewport: labels the session and mounts the inline viewport', () => {
    render(<TerminalSplitPane sessionName="my-session" />);

    expect(screen.getByText('my-session')).toBeTruthy();
    // The singleton slot must still mount on the canonical inline id.
    expect(screen.getByTestId('viewport').getAttribute('data-viewport-id')).toBe('inline-3rd');
  });
});
