'use client';

/**
 * WorkflowTempBar — Top bar for the workflow editor.
 *
 * Shows graph name, template/instance breadcrumb, undo/redo buttons, and placeholder Run button.
 * Will be replaced by shared ExplorerBar domain in a future plan.
 *
 * Phase 2+5: Canvas Core + Layout, Undo/Redo — Plan 050
 */

export interface WorkflowTempBarProps {
  graphSlug: string;
  templateSource?: string;
  undoDepth?: number;
  redoDepth?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function WorkflowTempBar({
  graphSlug,
  templateSource,
  undoDepth = 0,
  redoDepth = 0,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: WorkflowTempBarProps) {
  return (
    <div
      data-testid="workflow-temp-bar"
      className="flex items-center justify-between px-6 py-3.5 rounded-t-xl bg-gray-800 dark:bg-gray-950 text-white shrink-0"
    >
      {/* Left: graph name + breadcrumb */}
      <div className="flex items-center gap-2.5">
        <span className="text-base font-semibold tracking-tight">{graphSlug}</span>
        {templateSource && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-white/50 text-sm">
              from <span className="font-medium text-white/70">{templateSource}</span>
            </span>
          </>
        )}
      </div>

      {/* Right: undo/redo + Run */}
      <div className="flex items-center gap-2">
        {/* Undo button */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          data-testid="undo-button"
          className="relative px-2.5 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 transition-colors"
          title="Undo"
        >
          ↶
          {undoDepth > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-violet-500 text-white rounded-full px-1">
              {undoDepth}
            </span>
          )}
        </button>

        {/* Redo button */}
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          data-testid="redo-button"
          className="relative px-2.5 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 transition-colors"
          title="Redo"
        >
          ↷
          {redoDepth > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-violet-500 text-white rounded-full px-1">
              {redoDepth}
            </span>
          )}
        </button>

        {/* Placeholder Run button */}
        <button
          type="button"
          disabled
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white/40 cursor-not-allowed border border-white/10"
          title="Coming in future plan"
        >
          ▶ Run
        </button>
      </div>
    </div>
  );
}
