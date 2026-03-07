import { InlineEditInput } from '@/features/041-file-browser/components/inline-edit-input';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('InlineEditInput', () => {
  /**
   * Why: Core contract — input must be visible and ready for typing on mount
   * Contract: Auto-focuses via requestAnimationFrame (DYK-P2-01)
   */
  it('renders an input that receives focus on mount', async () => {
    render(<InlineEditInput onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    // requestAnimationFrame focus — wait a tick
    await vi.waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  /**
   * Why: Primary confirm path — Enter submits the valid name
   * Contract: onConfirm called with trimmed value on Enter
   */
  it('calls onConfirm with value when Enter is pressed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<InlineEditInput onConfirm={onConfirm} onCancel={vi.fn()} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'new-file.ts{Enter}');

    expect(onConfirm).toHaveBeenCalledWith('new-file.ts');
  });

  /**
   * Why: Primary cancel path — Escape discards without side effects
   * Contract: onCancel called on Escape, onConfirm not called
   */
  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<InlineEditInput onConfirm={onConfirm} onCancel={onCancel} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'partial{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * Why: Client-side validation prevents invalid names from reaching server
   * Contract: Invalid chars show inline error, Enter does not fire onConfirm
   */
  it('shows error for invalid filename and blocks confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<InlineEditInput onConfirm={onConfirm} onCancel={vi.fn()} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'bad:name{Enter}');

    expect(screen.getByText(/not allowed/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * Why: Blur behavior differs for create (cancel) vs rename (commit) — DYK-P2-03
   * Contract: Default commitOnBlur=false means blur cancels
   */
  it('cancels on blur when commitOnBlur is false (default)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<InlineEditInput onConfirm={onConfirm} onCancel={onCancel} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test.txt' } });
    fireEvent.blur(input);

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
