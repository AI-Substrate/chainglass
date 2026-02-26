'use client';

/**
 * WorkflowListClient — Client wrapper for workflow list page with naming modals.
 *
 * Phase 3: Drag-and-Drop + Persistence — Plan 050
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createWorkflow } from '../../../../app/actions/workflow-actions';
import type { WorkflowSummary } from '../types';
import { NamingModal } from './naming-modal';
import { WorkflowList } from './workflow-list';

export interface WorkflowListClientProps {
  slug: string;
  workflows: WorkflowSummary[];
  worktreePath?: string;
}

export function WorkflowListClient({ slug, workflows, worktreePath }: WorkflowListClientProps) {
  const [showNewBlank, setShowNewBlank] = useState(false);
  const router = useRouter();
  const wtParam = worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : '';

  const handleCreateBlank = async (graphSlug: string) => {
    setShowNewBlank(false);
    const result = await createWorkflow(slug, graphSlug, worktreePath);
    if (result.errors.length === 0 && result.graphSlug) {
      router.push(`/workspaces/${slug}/workflows/${result.graphSlug}${wtParam}`);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">Workflows</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowNewBlank(true)}
            className="px-3 py-1.5 text-xs rounded border hover:bg-accent transition-colors"
            data-testid="new-blank-button"
          >
            New Blank
          </button>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 text-xs rounded border text-muted-foreground cursor-not-allowed"
            title="Coming soon"
            data-testid="new-from-template-button"
          >
            New from Template
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        <WorkflowList slug={slug} workflows={workflows} worktreePath={worktreePath} />
      </div>

      {/* Modals */}
      {showNewBlank && (
        <NamingModal
          title="New Workflow"
          onConfirm={handleCreateBlank}
          onCancel={() => setShowNewBlank(false)}
        />
      )}
    </>
  );
}
