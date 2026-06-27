'use client';

/**
 * ImageEditorToolbar — pen controls + save actions for the image editor.
 *
 * v1 is pen-only by deliberate decision (no eraser/text/shapes): a color
 * picker (presets), 2–3 stroke widths, Undo, and the two explicit save
 * actions (Save over / Save as new) plus Cancel.
 *
 * Plan 086: In-browser Image Editor — T010
 * AC-2 (pen color/width), AC-12 (two save actions), AC-11 (cancel)
 */

import { Button } from '@/components/ui/button';

export interface ImageEditorToolbarProps {
  colors: readonly string[];
  activeColor: string;
  onColorChange: (color: string) => void;

  widths: readonly number[];
  activeWidth: number;
  onWidthChange: (width: number) => void;

  onUndo: () => void;
  canUndo: boolean;

  onSaveOver: () => void;
  onSaveAsNew: () => void;
  onCancel: () => void;

  /** Disable the save actions (no edits yet, mid-save, or load failure). */
  canSave: boolean;
  /** A save is in flight. */
  saving: boolean;
}

export function ImageEditorToolbar({
  colors,
  activeColor,
  onColorChange,
  widths,
  activeWidth,
  onWidthChange,
  onUndo,
  canUndo,
  onSaveOver,
  onSaveAsNew,
  onCancel,
  canSave,
  saving,
}: ImageEditorToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b bg-muted/40 p-2"
      data-testid="image-editor-toolbar"
    >
      {/* Color presets */}
      <div className="flex items-center gap-1" data-testid="image-editor-colors">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Pen color ${color}`}
            data-testid={`image-editor-color-${color}`}
            aria-pressed={color === activeColor}
            onClick={() => onColorChange(color)}
            className={`h-6 w-6 rounded-full border ${
              color === activeColor ? 'ring-2 ring-offset-1 ring-primary' : 'border-border'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Stroke widths */}
      <div className="flex items-center gap-1" data-testid="image-editor-widths">
        {widths.map((width) => (
          <button
            key={width}
            type="button"
            aria-label={`Stroke width ${width}`}
            data-testid={`image-editor-width-${width}`}
            aria-pressed={width === activeWidth}
            onClick={() => onWidthChange(width)}
            className={`flex h-7 w-7 items-center justify-center rounded border ${
              width === activeWidth ? 'border-primary bg-primary/10' : 'border-border'
            }`}
          >
            <span
              className="rounded-full bg-foreground"
              style={{ width: Math.max(2, width), height: Math.max(2, width) }}
            />
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo || saving}
        data-testid="image-editor-undo"
      >
        Undo
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          data-testid="image-editor-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSaveAsNew}
          disabled={!canSave || saving}
          data-testid="image-editor-save-as-new"
        >
          Save as new
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSaveOver}
          disabled={!canSave || saving}
          data-testid="image-editor-save-over"
        >
          {saving ? 'Saving…' : 'Save over'}
        </Button>
      </div>
    </div>
  );
}
