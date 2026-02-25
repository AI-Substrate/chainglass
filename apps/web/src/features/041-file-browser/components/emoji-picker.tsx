'use client';

/**
 * EmojiPicker — Grid of curated workspace emojis.
 *
 * Phase 5: Attention System — Plan 041
 */

import { cn } from '@/lib/utils';
import { WORKSPACE_EMOJI_PALETTE } from '@chainglass/workflow/constants/workspace-palettes';

export interface EmojiPickerProps {
  current: string;
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ current, onSelect }: EmojiPickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1">
        {WORKSPACE_EMOJI_PALETTE.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onSelect(emoji)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted',
              current === emoji && 'ring-2 ring-primary ring-offset-1 bg-muted'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      {current && (
        <button
          type="button"
          aria-label="Clear emoji"
          onClick={() => onSelect('')}
          className="w-full rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Clear
        </button>
      )}
    </div>
  );
}
