/**
 * SplitTerminalToggleButton — Plan 084 split-terminal-view (FX012-updated)
 *
 * Covers:
 *   T005: click flips state via onChange; ARIA contract (role=switch,
 *         aria-checked, aria-label).
 *   T008 / FX012: non-subscription to overlay:close-all — receiving the
 *         event from another source MUST NOT change the toggle's state.
 *
 * FX012 removed the button's internal `overlay:close-all` dispatch. State-
 * transition side effects (close float on A→B, open float on B→A) now live in
 * `BrowserClient.handleSplitToggleChange` — the button is a thin presentation
 * primitive.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SplitTerminalToggleButton } from '@/features/041-file-browser/components/split-terminal-toggle-button';

describe('SplitTerminalToggleButton — T005 click + ARIA', () => {
  it('renders with role=switch and aria-checked reflecting value', () => {
    const { rerender } = render(<SplitTerminalToggleButton value={false} onChange={vi.fn()} />);
    const btn = screen.getByRole('switch');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-checked', 'false');

    rerender(<SplitTerminalToggleButton value={true} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('has a sensible aria-label', () => {
    render(<SplitTerminalToggleButton value={false} onChange={vi.fn()} />);
    const btn = screen.getByRole('switch');
    expect(btn).toHaveAttribute('aria-label', 'Toggle inline terminal');
  });

  it('calls onChange(true) on false→true click', async () => {
    const onChange = vi.fn();
    render(<SplitTerminalToggleButton value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange(false) on true→false click', async () => {
    const onChange = vi.fn();
    render(<SplitTerminalToggleButton value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('FX012: does NOT dispatch overlay:close-all internally — caller owns side effects', async () => {
    /*
    Test Doc:
    - Why: Pre-FX012 the button dispatched overlay:close-all on false→true; FX012 moves that responsibility into BrowserClient.handleSplitToggleChange (which calls overlay.closeTerminal directly) so the side effect is unconditional and side-effect ordering is owned by one place
    - Contract: Button click never dispatches overlay:close-all on the window
    - Usage Notes: Regression lock for the FX012 ownership change
    - Quality Contribution: Prevents a future re-introduction of the internal dispatch (which would race the new singleton-aware handler)
    - Worked Example: Click false→true and true→false; window event listener fires 0 times
    */
    const onChange = vi.fn();
    const handler = vi.fn();
    window.addEventListener('overlay:close-all', handler);
    const { rerender } = render(<SplitTerminalToggleButton value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    rerender(<SplitTerminalToggleButton value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('overlay:close-all', handler);
  });
});

describe('SplitTerminalToggleButton — T008 non-subscription to overlay:close-all', () => {
  it('does NOT re-render or invoke onChange when an external overlay:close-all fires', () => {
    const onChange = vi.fn();
    render(<SplitTerminalToggleButton value={true} onChange={onChange} />);

    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    window.dispatchEvent(new CustomEvent('overlay:close-all'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
