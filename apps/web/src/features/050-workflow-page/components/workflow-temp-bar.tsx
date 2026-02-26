'use client';

/**
 * WorkflowTempBar — Temporary top bar for the workflow editor.
 *
 * Shows graph name, template/instance breadcrumb, and placeholder Run button.
 * Will be replaced by shared ExplorerBar domain in a future plan.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

export interface WorkflowTempBarProps {
  graphSlug: string;
  templateSource?: string;
}

export function WorkflowTempBar({ graphSlug, templateSource }: WorkflowTempBarProps) {
  return (
    <div
      data-testid="workflow-temp-bar"
      className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0"
    >
      {/* Left: graph name + breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{graphSlug}</span>
        {templateSource && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground text-xs">
              from template <span className="font-medium">{templateSource}</span>
            </span>
          </>
        )}
      </div>

      {/* Right: placeholder Run button */}
      <button
        type="button"
        disabled
        className="px-3 py-1 text-xs rounded bg-muted text-muted-foreground cursor-not-allowed"
        title="Coming in future plan"
      >
        ▶ Run
      </button>
    </div>
  );
}
