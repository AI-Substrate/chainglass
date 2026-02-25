/**
 * Tests for EmojiPicker component.
 *
 * Phase 5: Attention System — Plan 041
 */

import { EmojiPicker } from '@/features/041-file-browser/components/emoji-picker';
import { WORKSPACE_EMOJI_PALETTE } from '@chainglass/workflow/constants/workspace-palettes';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('EmojiPicker', () => {
  it('renders all palette emojis', () => {
    render(<EmojiPicker current="" onSelect={vi.fn()} />);
    for (const emoji of WORKSPACE_EMOJI_PALETTE) {
      expect(screen.getByRole('button', { name: emoji })).toBeDefined();
    }
  });

  it('calls onSelect when emoji is clicked', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker current="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '🔮' }));
    expect(onSelect).toHaveBeenCalledWith('🔮');
  });

  it('visually distinguishes current emoji', () => {
    render(<EmojiPicker current="🔮" onSelect={vi.fn()} />);
    const btn = screen.getByRole('button', { name: '🔮' });
    expect(btn.className).toContain('ring');
  });

  it('renders a clear button when current is set', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker current="🔮" onSelect={onSelect} />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
