/**
 * TerminalModifierToolbar Tests — TDD
 *
 * Tests for the modifier key toolbar (Esc/Tab/Ctrl/Alt/arrows).
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TerminalModifierToolbar } from '../../../../../apps/web/src/features/064-terminal/components/terminal-modifier-toolbar';

describe('TerminalModifierToolbar', () => {
  it('renders all 8 buttons', () => {
    render(<TerminalModifierToolbar onKey={() => {}} />);
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('Tab')).toBeInTheDocument();
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('Alt')).toBeInTheDocument();
    expect(screen.getByText('←')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('↓')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('has 36px height on modifier bar', () => {
    const { container } = render(<TerminalModifierToolbar onKey={() => {}} />);
    // The root is a wrapper div; the modifier bar is the last child
    const modifierBar = container.firstElementChild?.lastElementChild as HTMLElement;
    expect(modifierBar.style.height).toBe('36px');
  });

  it('sends \\x1b on Esc tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('Esc'));
    expect(onKey).toHaveBeenCalledWith('\x1b');
  });

  it('sends \\t on Tab tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('Tab'));
    expect(onKey).toHaveBeenCalledWith('\t');
  });

  it('sends \\x1b[A on ↑ tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('↑'));
    expect(onKey).toHaveBeenCalledWith('\x1b[A');
  });

  it('sends \\x1b[B on ↓ tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('↓'));
    expect(onKey).toHaveBeenCalledWith('\x1b[B');
  });

  it('sends \\x1b[C on → tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('→'));
    expect(onKey).toHaveBeenCalledWith('\x1b[C');
  });

  it('sends \\x1b[D on ← tap', () => {
    const onKey = vi.fn();
    render(<TerminalModifierToolbar onKey={onKey} />);
    fireEvent.click(screen.getByText('←'));
    expect(onKey).toHaveBeenCalledWith('\x1b[D');
  });

  describe('Ctrl toggle', () => {
    it('does not send key immediately on Ctrl tap', () => {
      const onKey = vi.fn();
      render(<TerminalModifierToolbar onKey={onKey} />);
      fireEvent.click(screen.getByText('Ctrl'));
      expect(onKey).not.toHaveBeenCalled();
    });

    it('reports Ctrl active via onModifierChange', () => {
      const onModifierChange = vi.fn();
      render(<TerminalModifierToolbar onKey={() => {}} onModifierChange={onModifierChange} />);
      fireEvent.click(screen.getByText('Ctrl'));
      expect(onModifierChange).toHaveBeenCalledWith({ ctrl: true, alt: false });
    });

    it('deactivates Ctrl on second tap', () => {
      const onModifierChange = vi.fn();
      render(<TerminalModifierToolbar onKey={() => {}} onModifierChange={onModifierChange} />);
      fireEvent.click(screen.getByText('Ctrl'));
      fireEvent.click(screen.getByText('Ctrl'));
      expect(onModifierChange).toHaveBeenLastCalledWith({ ctrl: false, alt: false });
    });
  });

  describe('Alt toggle', () => {
    it('reports Alt active via onModifierChange', () => {
      const onModifierChange = vi.fn();
      render(<TerminalModifierToolbar onKey={() => {}} onModifierChange={onModifierChange} />);
      fireEvent.click(screen.getByText('Alt'));
      expect(onModifierChange).toHaveBeenCalledWith({ ctrl: false, alt: true });
    });
  });

  it('calls resetModifiers when invoked externally', () => {
    const onModifierChange = vi.fn();
    const ref = { current: null as { resetModifiers: () => void } | null };
    render(
      <TerminalModifierToolbar
        onKey={() => {}}
        onModifierChange={onModifierChange}
        toolbarRef={(r) => {
          ref.current = r;
        }}
      />
    );
    fireEvent.click(screen.getByText('Ctrl'));
    expect(onModifierChange).toHaveBeenCalledWith({ ctrl: true, alt: false });

    ref.current?.resetModifiers();
    expect(onModifierChange).toHaveBeenLastCalledWith({ ctrl: false, alt: false });
  });
});
