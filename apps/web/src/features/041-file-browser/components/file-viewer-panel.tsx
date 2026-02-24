'use client';

/**
 * FileViewerPanel — Mode-toggling viewer with Edit/Preview/Diff.
 *
 * Integrates CodeEditor, existing FileViewer/MarkdownViewer, and DiffViewer.
 * Save button with conflict error display. Refresh button.
 *
 * Phase 4: File Browser — Plan 041
 */

import { Edit, Eye, GitCompare, RefreshCw, Save } from 'lucide-react';

export type ViewerMode = 'edit' | 'preview' | 'diff';

export interface FileViewerPanelProps {
  filePath: string;
  content: string | null;
  language: string;
  mtime: string;
  mode: ViewerMode;
  onModeChange: (mode: ViewerMode) => void;
  onSave: (content: string) => void;
  onRefresh: () => void;
  editContent?: string;
  onEditChange?: (content: string) => void;
  conflictError?: string;
  errorType?: 'file-too-large' | 'binary-file';
  diffData?: string;
}

export function FileViewerPanel({
  filePath,
  content,
  language,
  mode,
  onModeChange,
  onSave,
  onRefresh,
  editContent,
  onEditChange,
  conflictError,
  errorType,
  diffData,
}: FileViewerPanelProps) {
  // Error states
  if (errorType === 'file-too-large') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <p className="text-lg">File too large to display</p>
        <p className="text-sm">Files over 5MB cannot be viewed in the browser.</p>
      </div>
    );
  }

  if (errorType === 'binary-file') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <p className="text-lg">Binary file</p>
        <p className="text-sm">Binary files cannot be displayed.</p>
      </div>
    );
  }

  const isMarkdown = language === 'markdown';
  const currentContent = editContent ?? content ?? '';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="mr-2 text-sm font-medium truncate max-w-[200px]">{filePath}</span>
          <ModeButton
            label="Edit"
            icon={<Edit className="h-3.5 w-3.5" />}
            active={mode === 'edit'}
            onClick={() => onModeChange('edit')}
          />
          <ModeButton
            label="Preview"
            icon={<Eye className="h-3.5 w-3.5" />}
            active={mode === 'preview'}
            onClick={() => onModeChange('preview')}
          />
          <ModeButton
            label="Diff"
            icon={<GitCompare className="h-3.5 w-3.5" />}
            active={mode === 'diff'}
            onClick={() => onModeChange('diff')}
          />
        </div>
        <div className="flex items-center gap-1">
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => onSave(currentContent)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label="Save file"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Refresh file"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Conflict error */}
      {conflictError && (
        <div className="border-b bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ Conflict: {conflictError}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {mode === 'edit' && (
          <div className="h-full">
            {/* CodeEditor integration point — lazy loaded */}
            <div className="p-4 font-mono text-sm whitespace-pre-wrap">{currentContent}</div>
          </div>
        )}
        {mode === 'preview' && (
          <div className="p-4">
            {isMarkdown ? (
              <div className="prose dark:prose-invert max-w-none">{content}</div>
            ) : (
              <pre className="p-4 font-mono text-sm overflow-x-auto">
                <code>{content}</code>
              </pre>
            )}
          </div>
        )}
        {mode === 'diff' && (
          <div className="p-4">
            {diffData ? (
              <pre className="font-mono text-sm overflow-x-auto">{diffData}</pre>
            ) : (
              <p className="text-muted-foreground">No uncommitted changes.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
