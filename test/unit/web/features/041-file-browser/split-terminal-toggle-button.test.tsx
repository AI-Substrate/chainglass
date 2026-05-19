/**
 * SplitTerminalToggleButton — Plan 084 split-terminal-view
 *
 * Covers:
 *   T005: click flips state, dispatches overlay:close-all only on false→true,
 *         ARIA contract (role=switch, aria-checked, aria-label)
 *   T008: mutual-exclusion non-subscription — receiving overlay:close-all
 *         from another source MUST NOT change the toggle's state
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

  it('dispatches overlay:close-all exactly once on false→true', async () => {
    const onChange = vi.fn();
    const handler = vi.fn();
    window.addEventListener('overlay:close-all', handler);

    render(<SplitTerminalToggleButton value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);

    window.removeEventListener('overlay:close-all', handler);
  });

  it('does NOT dispatch overlay:close-all on true→false', async () => {
    const onChange = vi.fn();
    const handler = vi.fn();
    window.addEventListener('overlay:close-all', handler);

    render(<SplitTerminalToggleButton value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));

    expect(handler).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);

    window.removeEventListener('overlay:close-all', handler);
  });

  it('dispatches BEFORE calling onChange on false→true (ordering)', async () => {
    const calls: string[] = [];
    const onChange = vi.fn(() => calls.push('onChange'));
    const handler = vi.fn(() => calls.push('dispatch'));
    window.addEventListener('overlay:close-all', handler);

    render(<SplitTerminalToggleButton value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));

    expect(calls).toEqual(['dispatch', 'onChange']);

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
