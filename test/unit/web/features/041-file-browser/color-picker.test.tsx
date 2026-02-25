/**
 * Tests for ColorPicker component.
 *
 * Phase 5: Attention System — Plan 041
 */

import { ColorPicker } from '@/features/041-file-browser/components/color-picker';
import { WORKSPACE_COLOR_PALETTE } from '@chainglass/workflow/constants/workspace-palettes';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('ColorPicker', () => {
  it('renders all palette colors', () => {
    render(<ColorPicker current="" onSelect={vi.fn()} />);
    for (const color of WORKSPACE_COLOR_PALETTE) {
      expect(screen.getByRole('button', { name: color.name })).toBeDefined();
    }
  });

  it('calls onSelect when color is clicked', () => {
    const onSelect = vi.fn();
    render(<ColorPicker current="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'purple' }));
    expect(onSelect).toHaveBeenCalledWith('purple');
  });

  it('visually distinguishes current color', () => {
    render(<ColorPicker current="purple" onSelect={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'purple' });
    expect(btn.className).toContain('ring');
  });

  it('renders a clear button when current is set', () => {
    const onSelect = vi.fn();
    render(<ColorPicker current="purple" onSelect={onSelect} />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
