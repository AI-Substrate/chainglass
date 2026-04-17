import { FileText } from 'lucide-react';

interface ContentEmptyStateProps {
  /** Called when the user clicks "Browse Files" — typically switches to Files view on mobile */
  onBrowseFiles?: () => void;
}

/**
 * ContentEmptyState — shown in the content viewer when no file is selected.
 *
 * Displays a centered icon, heading, and optional "Browse Files" button
 * that navigates back to the Files view on mobile.
 *
 * Plan 078: Mobile Experience — Phase 3
 */
export function ContentEmptyState({ onBrowseFiles }: ContentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <FileText className="h-12 w-12 opacity-40" />
      <p className="text-sm font-medium">Select a file</p>
      {onBrowseFiles && (
        <button
          type="button"
          onClick={onBrowseFiles}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Browse Files
        </button>
      )}
    </div>
  );
}
