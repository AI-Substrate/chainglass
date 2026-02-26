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

      {/* Right: placeholder Run button */}
      <button
        type="button"
        disabled
        className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white/40 cursor-not-allowed border border-white/10"
        title="Coming in future plan"
      >
        ▶ Run
      </button>
    </div>
  );
}
