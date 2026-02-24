'use client';

/**
 * FileViewerPanel — Mode-toggling viewer with Edit/Preview/Diff.
 *
 * Integrates CodeEditor, Shiki-highlighted preview, MarkdownPreview, and DiffViewer.
 * Save button with conflict error display. Refresh button.
 *
 * Phase 4: File Browser — Plan 041
 * Fix FX001-7: Real viewer component integration (Workshop D1-D4).
 */

import type { DiffError } from '@chainglass/shared';
import { ClipboardCopy, Edit, Eye, GitCompare, Loader2, RefreshCw, Save } from 'lucide-react';
import { Suspense, lazy } from 'react';

import { MarkdownPreview } from './markdown-preview';

// Lazy-load heavy components
const CodeEditor = lazy(() => import('./code-editor').then((m) => ({ default: m.CodeEditor })));
const DiffViewer = lazy(() =>
  import('@/components/viewers/diff-viewer').then((m) => ({ default: m.DiffViewer }))
);

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
  /** Pre-highlighted HTML from Shiki (for code preview) */
  highlightedHtml?: string;
  /** Pre-rendered markdown HTML (for markdown preview) */
  markdownHtml?: string;
  /** Git diff string (for diff mode) */
  diffData?: string | null;
  /** Diff error (for diff mode) */
  diffError?: DiffError | null;
  /** Whether diff is loading */
  diffLoading?: boolean;
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
  highlightedHtml,
  markdownHtml,
  diffData,
  diffError,
  diffLoading,
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
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-1">
            {mode === 'edit' && (
              <button
                type="button"
                onClick={() => onSave(currentContent)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-green-600 text-white hover:bg-green-700 shrink-0"
                aria-label="Save file"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            )}
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
          <button
            type="button"
            onClick={onRefresh}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Refresh file"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/30">
          <button
            type="button"
            onClick={() => {
              if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(filePath);
              } else {
                setTimeout(() => {
                  const ta = document.createElement('textarea');
                  ta.value = filePath;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.focus();
                  ta.select();
                  try {
                    document.execCommand('copy');
                  } finally {
                    document.body.removeChild(ta);
                  }
                }, 0);
              }
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Copy file path"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm text-muted-foreground font-mono truncate flex-1">
            {filePath}
          </span>
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
        <Suspense fallback={<LoadingFallback />}>
          {mode === 'edit' && (
            <div className="h-full">
              <CodeEditor value={currentContent} language={language} onChange={onEditChange} />
            </div>
          )}
          {mode === 'preview' && (
            <div className="p-4">
              {isMarkdown && markdownHtml ? (
                <MarkdownPreview html={markdownHtml} />
              ) : highlightedHtml ? (
                <div
                  className="shiki-wrapper overflow-x-auto"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML from trusted Shiki server-side highlighting
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : (
                <pre className="p-4 font-mono text-sm overflow-x-auto">
                  <code>{content}</code>
                </pre>
              )}
            </div>
          )}
          {mode === 'diff' && (
            <div className="p-4">
              <DiffViewer
                file={
                  content != null
                    ? { path: filePath, filename: filePath.split('/').pop() ?? filePath, content }
                    : undefined
                }
                diffData={diffData ?? null}
                error={diffError ?? null}
                isLoading={diffLoading}
              />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading...
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
