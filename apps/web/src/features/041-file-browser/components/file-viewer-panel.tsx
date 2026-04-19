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
import type { Editor } from '@tiptap/react';
import {
  ArrowUp,
  Edit,
  ExternalLink,
  Eye,
  GitCompare,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  WrapText,
  X,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LinkPopover,
  MarkdownWysiwygEditorLazy,
  WysiwygToolbar,
  exceedsRichSizeCap,
  hasTables,
  resolveImageUrl,
} from '@/features/_platform/viewer';
import { detectContentType } from '@/lib/content-type-detection';
import { AudioViewer } from './audio-viewer';
import { BinaryPlaceholder } from './binary-placeholder';
import { HtmlViewer } from './html-viewer';
import { ImageViewer } from './image-viewer';
import { MarkdownPreview } from './markdown-preview';
import { PdfViewer } from './pdf-viewer';
import { VideoViewer } from './video-viewer';

// Lazy-load heavy components
const CodeEditor = lazy(() => import('./code-editor').then((m) => ({ default: m.CodeEditor })));
const DiffViewer = lazy(() =>
  import('@/components/viewers/diff-viewer').then((m) => ({ default: m.DiffViewer }))
);

export type ViewerMode = 'source' | 'rich' | 'preview' | 'diff';

const TABLE_BANNER_SESSION_KEY = 'md-wysiwyg:dismissed-table-banners';

/** Read dismissed-paths array from sessionStorage; tolerant of quota/security/parse failures. */
function readDismissedBanners(): string[] {
  try {
    const raw = sessionStorage.getItem(TABLE_BANNER_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // QuotaExceeded on read is impossible, but JSON.parse errors + SecurityError (Safari
    // private mode for some setups) are — treat as empty.
    return [];
  }
}

/** Write dismissed-paths array to sessionStorage; swallow quota/security errors. */
function writeDismissedBanners(paths: string[]): void {
  try {
    sessionStorage.setItem(TABLE_BANNER_SESSION_KEY, JSON.stringify(paths));
  } catch {
    // Banner reappearing next session is acceptable graceful degradation.
  }
}

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
  /** Base URL for raw file API (without &file= param), for resolving relative images in markdown */
  rawFileBaseUrl?: string;
  /** URL for pop-out button — opens file in new tab (Phase 5) */
  popOutUrl?: string;
  /** Line number to scroll to in code editor (Plan 047 Phase 6) */
  scrollToLine?: number | null;
  /** Called when user clicks a relative file link in markdown preview */
  onNavigateToFile?: (resolvedPath: string) => void;
  /**
   * Optional save implementation — used by integration tests to intercept save calls with
   * a `FakeSaveFile` class (plan 083 Phase 5 Finding 05). Production callers pass nothing,
   * in which case the existing `onSave` prop is invoked synchronously and wrapped in a
   * resolved Promise.
   */
  saveFileImpl?: (content: string) => Promise<void>;
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
  rawFileBaseUrl,
  popOutUrl,
  scrollToLine,
  onNavigateToFile,
  saveFileImpl,
}: FileViewerPanelProps) {
  // All hooks must be called before any early returns (Rules of Hooks)
  const isMarkdown = language === 'markdown';
  const currentContent = editContent ?? content ?? '';
  const isEditable = mode === 'source' || mode === 'rich';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  // Rich-mode composition state — shared open/close across the toolbar Link button and the
  // editor's Mod-k shortcut. Ref to the toolbar Link button so the LinkPopover anchors to it.
  const [linkOpen, setLinkOpen] = useState(false);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const richEditorRef = useRef<Editor | null>(null);
  // Mount wrapper ref — T011 writes the last-emitted markdown to its `data-emitted-markdown`
  // attribute so harness smoke + Phase 6.2 corpus tests can assert round-trip integrity.
  const richMountRef = useRef<HTMLDivElement>(null);

  // Phase 6.6 will swap this for an ErrorBoundary; for now the `.md-wysiwyg-editor-mount`
  // wrapper is the single independently-wrappable node (toolbar + popover are siblings).
  const handleRichEditorReady = useCallback((editor: Editor | null) => {
    richEditorRef.current = editor;
  }, []);
  const handleOpenLinkDialog = useCallback(() => {
    setLinkOpen(true);
  }, []);

  // Size + language gate for the Rich button (plan 083 Phase 5 T004, AC-01 + AC-16a).
  const richDisabled = useMemo(() => exceedsRichSizeCap(currentContent), [currentContent]);

  // Table-warn banner (plan 083 Phase 5 T005, AC-11). Dismissal is per-file-path and
  // session-scoped; initial state reads sessionStorage so an in-tab reload keeps dismissal.
  const [tableBannerDismissed, setTableBannerDismissed] = useState(false);
  useEffect(() => {
    setTableBannerDismissed(readDismissedBanners().includes(filePath));
  }, [filePath]);
  const tableBannerVisible = mode === 'rich' && hasTables(currentContent) && !tableBannerDismissed;
  const dismissTableBanner = useCallback(() => {
    setTableBannerDismissed(true);
    const current = readDismissedBanners();
    if (!current.includes(filePath)) {
      writeDismissedBanners([...current, filePath]);
    }
  }, [filePath]);

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

  // Unified save dispatch used by BOTH the Save button AND the Cmd+S handler. When
  // `saveFileImpl` is provided (integration tests inject a `FakeSaveFile`), it's invoked
  // instead of `onSave` — a minimal DI surface per Constitution §4/§7 (Finding 05).
  const performSave = useCallback(
    (next: string) => {
      if (saveFileImpl) {
        void saveFileImpl(next);
        return;
      }
      onSave(next);
    },
    [saveFileImpl, onSave]
  );

  const handleEditModeKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (mode !== 'source' && mode !== 'rich') ||
        event.repeat ||
        event.shiftKey ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 's'
      ) {
        return;
      }

      event.preventDefault();
      performSave(currentContent);
    },
    [mode, performSave, currentContent]
  );

  // Mirror the last-emitted markdown into the mount wrapper's data-attr (T011). Phase 6.2
  // round-trip corpus tests read from this attribute — it is an intentional test affordance.
  const handleRichChange = useCallback(
    (next: string) => {
      onEditChange?.(next);
      const el = richMountRef.current;
      if (el) {
        el.dataset.emittedMarkdown = next;
      }
    },
    [onEditChange]
  );

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
        rawFileBaseUrl={rawFileBaseUrl}
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
            {isEditable && (
              <button
                type="button"
                onClick={() => performSave(currentContent)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-green-600 text-white hover:bg-green-700 shrink-0"
                aria-label="Save file"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            )}
            <ModeButton
              label="Source"
              icon={<Edit className="h-3.5 w-3.5" />}
              active={mode === 'source'}
              onClick={() => onModeChange('source')}
            />
            {isMarkdown && (
              <ModeButton
                label="Rich"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                active={mode === 'rich'}
                onClick={() => onModeChange('rich')}
                disabled={richDisabled}
                title={
                  richDisabled
                    ? 'File too large for Rich mode — use Source'
                    : 'Rich (WYSIWYG markdown editor)'
                }
              />
            )}
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
            {mode === 'source' && (
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

      {/* Table warn banner — Rich mode only, dismissable per-file for the session */}
      {tableBannerVisible && (
        <div
          className="border-b bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-between"
          data-testid="rich-mode-table-warning"
        >
          <span>
            This file contains Markdown tables. Rich mode may reformat them — Source mode preserves
            exact formatting.
          </span>
          <button
            type="button"
            onClick={dismissTableBanner}
            className="rounded p-0.5 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900"
            aria-label="Dismiss table warning"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Externally changed banner — only when user has dirty edits or in diff mode */}
      {externallyChanged && isEditable && editContent != null && (
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

      {/* Content area — in editable modes, content fills via flex */}
      <div
        ref={isEditable ? undefined : scrollRef}
        onScroll={isEditable ? undefined : handleScroll}
        onKeyDownCapture={isEditable ? handleEditModeKeyDownCapture : undefined}
        className={isEditable ? 'flex-1 min-h-0 flex flex-col' : 'flex-1 overflow-auto'}
      >
        <Suspense fallback={<LoadingFallback />}>
          {mode === 'source' && (
            <CodeEditor
              key={filePath}
              value={currentContent}
              language={language}
              onChange={onEditChange}
              scrollToLine={scrollToLine}
              wordWrap={wordWrap}
            />
          )}
          {mode === 'rich' && (
            <>
              <WysiwygToolbar
                editor={richEditorRef.current}
                onOpenLinkDialog={handleOpenLinkDialog}
                linkButtonRef={linkButtonRef}
              />
              <div
                ref={richMountRef}
                className="md-wysiwyg-editor-mount flex-1 min-h-0 overflow-auto"
                data-emitted-markdown={currentContent}
              >
                <MarkdownWysiwygEditorLazy
                  value={currentContent}
                  onChange={handleRichChange}
                  imageUrlResolver={resolveImageUrl}
                  currentFilePath={filePath}
                  rawFileBaseUrl={rawFileBaseUrl}
                  onEditorReady={handleRichEditorReady}
                  onOpenLinkDialog={handleOpenLinkDialog}
                />
              </div>
              <LinkPopover
                editor={richEditorRef.current}
                open={linkOpen}
                onOpenChange={setLinkOpen}
                anchorRef={linkButtonRef}
              />
            </>
          )}
          {mode === 'preview' && (
            <div className="p-4">
              {isMarkdown && markdownHtml ? (
                <MarkdownPreview
                  html={markdownHtml}
                  currentFilePath={filePath}
                  rawFileBaseUrl={rawFileBaseUrl}
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
  disabled,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const activeClasses = active
    ? 'bg-accent text-accent-foreground font-medium'
    : 'text-muted-foreground hover:text-foreground';
  const disabledClasses = disabled
    ? 'opacity-50 cursor-not-allowed hover:text-muted-foreground'
    : '';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      title={title}
      data-disabled={disabled ? 'true' : undefined}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${activeClasses} ${disabledClasses}`.trim()}
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
  rawFileBaseUrl,
  onRefresh,
}: {
  filePath: string;
  contentType: string;
  size: number;
  rawFileUrl: string;
  rawFileBaseUrl?: string;
  onRefresh: () => void;
}) {
  const filename = filePath.split('/').pop() ?? filePath;
  const { category } = detectContentType(filename);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    onRefresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Preview</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Refresh file"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {category === 'image' && <ImageViewer key={refreshKey} src={rawFileUrl} alt={filename} />}
        {category === 'pdf' && <PdfViewer key={refreshKey} src={rawFileUrl} />}
        {category === 'html' && (
          <HtmlViewer
            key={refreshKey}
            src={rawFileUrl}
            currentFilePath={filePath}
            rawFileBaseUrl={rawFileBaseUrl}
          />
        )}
        {category === 'video' && (
          <VideoViewer key={refreshKey} src={rawFileUrl} mimeType={contentType} />
        )}
        {category === 'audio' && (
          <AudioViewer
            key={refreshKey}
            src={rawFileUrl}
            mimeType={contentType}
            filename={filename}
          />
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
