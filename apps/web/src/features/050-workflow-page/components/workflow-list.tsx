'use client';

/**
 * WorkflowList — Client component rendering the workflow list.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { WorkflowSummary } from '../types';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  complete: 'bg-green-500',
  failed: 'bg-red-500',
};

export interface WorkflowListProps {
  slug: string;
  workflows: WorkflowSummary[];
  worktreePath?: string;
}

export function WorkflowList({ slug, workflows, worktreePath }: WorkflowListProps) {
  const wtParam = worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : '';
  if (workflows.length === 0) {
    return (
      <div
        data-testid="workflow-list-empty"
        className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground"
      >
        <p className="text-sm">No workflows yet</p>
        <p className="text-xs">Create a workflow to get started</p>
      </div>
    );
  }

  return (
    <div data-testid="workflow-list" className="flex flex-col gap-2">
      {workflows.map((wf) => (
        <a
          key={wf.slug}
          href={`/workspaces/${slug}/workflows/${wf.slug}${wtParam}`}
          data-testid={`workflow-item-${wf.slug}`}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{wf.slug}</span>
            {wf.description && (
              <span className="text-xs text-muted-foreground">{wf.description}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{wf.lineCount} lines</span>
            <span>{wf.nodeCount} nodes</span>
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[wf.status] ?? 'bg-gray-400'}`} />
          </div>
        </a>
      ))}
    </div>
  );
}
