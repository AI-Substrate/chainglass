'use client';

import type { AutoSaveStatus } from '@/features/_platform/hooks/use-auto-save';

interface SaveIndicatorProps {
  status: AutoSaveStatus;
  error: string | null;
}

/**
 * Inline save status indicator for auto-save editors.
 * Shows saving/saved/error states. Error renders as persistent banner (DYK #5).
 */
export function SaveIndicator({ status, error }: SaveIndicatorProps) {
  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded">
        <span className="shrink-0">Save failed</span>
        {error && <span className="text-red-500 dark:text-red-400 truncate">{error}</span>}
      </div>
    );
  }

  if (status === 'saving') {
    return <span className="text-sm text-muted-foreground animate-pulse">Saving...</span>;
  }

  return <span className="text-sm text-green-600 dark:text-green-400">Saved</span>;
}
