/**
 * Empty state placeholders for the workflow canvas.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

export interface EmptyCanvasPlaceholderProps {
  onAddLine?: () => void;
}

export function EmptyCanvasPlaceholder({ onAddLine }: EmptyCanvasPlaceholderProps) {
  return (
    <div
      data-testid="empty-canvas"
      className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-muted-foreground/50"
    >
      <button
        type="button"
        onClick={onAddLine}
        className="w-16 h-16 rounded-2xl border-2 border-dashed border-border/30 flex items-center justify-center text-2xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all duration-200"
        aria-label="Add first line"
      >
        +
      </button>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/60">Create your first line</p>
        <p className="text-xs mt-1 text-muted-foreground/40">Drag work units from the right panel</p>
      </div>
    </div>
  );
}

export function EmptyLinePlaceholder() {
  return (
    <div
      data-testid="empty-line"
      className="flex items-center justify-center min-h-[60px] rounded-xl border-2 border-dashed border-border/20 text-muted-foreground/30"
    >
      <p className="text-xs">Drop work units here</p>
    </div>
  );
}
