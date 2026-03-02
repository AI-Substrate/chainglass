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
import {
  ArrowUp,
  Edit,
  ExternalLink,
  Eye,
  GitCompare,
  Loader2,
  RefreshCw,
  Save,
  WrapText,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import { detectContentType } from '@/lib/content-type-detection';
import { AudioViewer } from './audio-viewer';
import { BinaryPlaceholder } from './binary-placeholder';
import { ImageViewer } from './image-viewer';
import { MarkdownPreview } from './markdown-preview';
import { PdfViewer } from './pdf-viewer';
import { VideoViewer } from './video-viewer';

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
  errorType?: 'file-too-large' | 'not-found' | 'security';
  /** Whether the file was modified outside the editor (shows blue banner when dirty) */
  externallyChanged?: boolean;
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
  /** Binary file metadata (Plan 046) */
  isBinary?: boolean;
  binaryContentType?: string;
  binarySize?: number;
  rawFileUrl?: string;
  /** URL for pop-out button — opens file in new tab (Phase 5) */
  popOutUrl?: string;
  /** Line number to scroll to in code editor (Plan 047 Phase 6) */
  scrollToLine?: number | null;
  /** Called when user clicks a relative file link in markdown preview */
  onNavigateToFile?: (resolvedPath: string) => void;
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
  externallyChanged,
  highlightedHtml,
  markdownHtml,
  diffData,
  diffError,
  diffLoading,
  isBinary,
  binaryContentType,
  binarySize,
  rawFileUrl,
  popOutUrl,
  scrollToLine,
  onNavigateToFile,
}: FileViewerPanelProps) {
  // All hooks must be called before any early returns (Rules of Hooks)
  const isMarkdown = language === 'markdown';
  const currentContent = editContent ?? content ?? '';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrolledDown(el.scrollTop > 100);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset scroll state when file changes
  useEffect(() => {
    setScrolledDown(false);
    if (!scrollToLine && typeof scrollRef.current?.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: 0 });
    }
  }, [filePath]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Error states
  if (errorType === 'file-too-large') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <p className="text-lg">File too large to display</p>
        <p className="text-sm">Files over 5MB cannot be viewed in the browser.</p>
      </div>
    );
  }

  if (errorType === 'not-found') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <p className="text-lg">File not found</p>
        <p className="text-sm">This file may have been moved or deleted.</p>
      </div>
    );
  }

  if (errorType === 'security') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <p className="text-lg">Access denied</p>
        <p className="text-sm">This file is outside the workspace boundary.</p>
      </div>
    );
  }

  // Binary file viewing (Plan 046)
  if (isBinary && rawFileUrl) {
    return (
      <BinaryFileView
        filePath={filePath}
        contentType={binaryContentType ?? 'application/octet-stream'}
        size={binarySize ?? 0}
        rawFileUrl={rawFileUrl}
        onRefresh={onRefresh}
      />
    );
  }

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
          <div className="flex items-center gap-0.5">
            {mode === 'edit' && (
              <button
                type="button"
                onClick={() => setWordWrap((w) => !w)}
                className={`rounded p-1 ${wordWrap ? 'text-foreground bg-muted' : 'text-muted-foreground'} hover:text-foreground`}
                aria-label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
              >
                <WrapText className="h-3.5 w-3.5" />
              </button>
            )}
            {scrolledDown && (
              <button
                type="button"
                onClick={scrollToTop}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Scroll to top"
              >
                <ArrowUp className="h-3.5 w-3.5" />
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
            {popOutUrl && (
              <button
                type="button"
                onClick={() => window.open(popOutUrl, '_blank')}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conflict error */}
      {conflictError && (
        <div className="border-b bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ Conflict: {conflictError}
        </div>
      )}

      {/* Externally changed banner — only when user has dirty edits or in diff mode */}
      {externallyChanged && mode === 'edit' && editContent != null && (
        <div className="border-b bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <span>ℹ️ This file was modified outside the editor</span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            Refresh
          </button>
        </div>
      )}
      {externallyChanged && mode === 'diff' && (
        <div className="border-b bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <span>ℹ️ Diff may be outdated — file was modified</span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Content area — in edit mode, CodeEditor fills this entirely via flex */}
      <div
        ref={mode !== 'edit' ? scrollRef : undefined}
        onScroll={mode !== 'edit' ? handleScroll : undefined}
        className={mode === 'edit' ? 'flex-1 min-h-0 flex flex-col' : 'flex-1 overflow-auto'}
      >
        <Suspense fallback={<LoadingFallback />}>
          {mode === 'edit' && (
            <CodeEditor
              key={filePath}
              value={currentContent}
              language={language}
              onChange={onEditChange}
              scrollToLine={scrollToLine}
              wordWrap={wordWrap}
            />
          )}
          {mode === 'preview' && (
            <div className="p-4">
              {isMarkdown && markdownHtml ? (
                <MarkdownPreview
                  html={markdownHtml}
                  currentFilePath={filePath}
                  onNavigateToFile={onNavigateToFile}
                />
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

/** Binary file viewer — routes to correct viewer by content type category */
function BinaryFileView({
  filePath,
  contentType,
  size,
  rawFileUrl,
  onRefresh,
}: {
  filePath: string;
  contentType: string;
  size: number;
  rawFileUrl: string;
  onRefresh: () => void;
}) {
  const filename = filePath.split('/').pop() ?? filePath;
  const { category } = detectContentType(filename);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Preview</span>
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
      <div className="flex-1 flex flex-col min-h-0">
        {category === 'image' && <ImageViewer src={rawFileUrl} alt={filename} />}
        {category === 'pdf' && <PdfViewer src={rawFileUrl} />}
        {category === 'video' && <VideoViewer src={rawFileUrl} mimeType={contentType} />}
        {category === 'audio' && (
          <AudioViewer src={rawFileUrl} mimeType={contentType} filename={filename} />
        )}
        {category === 'binary' && (
          <BinaryPlaceholder
            src={rawFileUrl}
            size={size}
            mimeType={contentType}
            filename={filename}
          />
        )}
      </div>
    </div>
  );
}
