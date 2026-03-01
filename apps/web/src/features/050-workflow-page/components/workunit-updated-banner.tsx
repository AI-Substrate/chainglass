'use client';

/**
 * Banner component that shows when work unit templates have changed on disk.
 *
 * Placed at page layout level (not inside WorkflowEditor) to avoid
 * coupling with workflow's own toast-based external change handling.
 *
 * Per DYK #2: Neutral wording covers both external edits and user's own edits.
 * Per DYK #4: Page layout level placement.
 *
 * Plan 058, Phase 4, T004.
 */

import { RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useWorkunitCatalogChanges } from '@/features/058-workunit-editor/hooks/use-workunit-catalog-changes';

/**
 * Dismissible banner for work unit catalog changes.
 * Shows "Refresh" button that calls router.refresh() to reload page data.
 */
export function WorkUnitUpdatedBanner() {
  const { changed, dismiss } = useWorkunitCatalogChanges();
  const router = useRouter();

  if (!changed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
      <span className="text-blue-800 dark:text-blue-200">
        Work unit templates have changed. Refresh to load latest.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            router.refresh();
            dismiss();
          }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Refresh
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
