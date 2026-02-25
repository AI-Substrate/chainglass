'use client';

/**
 * ColorPicker — Swatch grid of curated workspace colors.
 *
 * Phase 5: Attention System — Plan 041
 */

import { cn } from '@/lib/utils';
import { WORKSPACE_COLOR_PALETTE } from '@chainglass/workflow/constants/workspace-palettes';

export interface ColorPickerProps {
  current: string;
  onSelect: (colorName: string) => void;
}

export function ColorPicker({ current, onSelect }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {WORKSPACE_COLOR_PALETTE.map((color) => (
          <button
            key={color.name}
            type="button"
            aria-label={color.name}
            onClick={() => onSelect(color.name)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
              current === color.name
                ? 'ring-2 ring-primary ring-offset-2 border-transparent'
                : 'border-transparent'
            )}
            style={{ backgroundColor: color.light }}
          />
        ))}
      </div>
      {current && (
        <button
          type="button"
          aria-label="Clear color"
          onClick={() => onSelect('')}
          className="w-full rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Clear
        </button>
      )}
    </div>
  );
}
