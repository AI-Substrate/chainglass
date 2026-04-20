'use client';

/**
 * MarkdownWysiwygEditor — Tiptap-backed WYSIWYG editor for markdown.
 *
 * Contract:
 *   - onChange fires ONLY when the user edits (Tiptap transaction.docChanged === true).
 *   - editor.destroy() is called on unmount.
 *   - If Tiptap fails to mount or a post-mount error occurs, the fallback UI renders
 *     with a "Switch to Source mode" button (Phase 6 / T006, AC-18).
 *
 * Extensions built by `buildMarkdownExtensions()` (extracted Phase 6 / T002).
 */

import { EditorContent, useEditor } from '@tiptap/react';
import { useTheme } from 'next-themes';
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import { buildMarkdownExtensions } from '../lib/build-markdown-extensions';
import { joinFrontMatter, splitFrontMatter } from '../lib/markdown-frontmatter';
import type { MarkdownWysiwygEditorProps } from '../lib/wysiwyg-extensions';

// ---------------------------------------------------------------------------
// Error Boundary — catches both mount and post-mount rendering errors
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  onFallback?: () => void;
  fallbackClassName: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: string | null;
}

class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error: error.message || 'Unknown editor error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for debugging — don't swallow the error silently.
    console.error('[MarkdownWysiwygEditor] Caught error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <FallbackPanel
          error={this.state.error}
          onFallback={this.props.onFallback}
          className={this.props.fallbackClassName}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Fallback Panel — shown when editor fails
// ---------------------------------------------------------------------------

function FallbackPanel({
  error,
  onFallback,
  className,
}: {
  error: string;
  onFallback?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 p-8 text-center ${className ?? ''}`}
      data-testid="md-wysiwyg-fallback"
    >
      <h3 className="text-lg font-semibold">Rich mode couldn&apos;t load this file.</h3>
      <p className="text-sm text-muted-foreground max-w-md">{error}</p>
      {onFallback && (
        <Button variant="outline" onClick={onFallback} data-testid="md-wysiwyg-fallback-source-btn">
          Switch to Source mode
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner Editor — the actual Tiptap editor (wrapped by error boundary above)
// ---------------------------------------------------------------------------

function MarkdownWysiwygEditorInner({
  value,
  onChange,
  readOnly = false,
  placeholder,
  imageUrlResolver,
  currentFilePath,
  rawFileBaseUrl,
  className,
  onEditorReady,
  onOpenLinkDialog,
  onFallback,
}: MarkdownWysiwygEditorProps) {
  const { resolvedTheme } = useTheme();
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const lastRenderedValueRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const onOpenLinkDialogRef = useRef(onOpenLinkDialog);
  onOpenLinkDialogRef.current = onOpenLinkDialog;
  const frontMatterRef = useRef<string>('');

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: buildMarkdownExtensions({
      placeholder,
      imageUrlResolver,
      currentFilePath,
      rawFileBaseUrl,
      onOpenLinkDialog: () => onOpenLinkDialogRef.current?.(),
    }),
    onUpdate({ editor: updatedEditor, transaction }) {
      if (!transaction.docChanged) return;
      try {
        const storage = (updatedEditor.storage as { markdown?: { getMarkdown: () => string } })
          .markdown;
        const bodyMarkdown = storage?.getMarkdown() ?? '';
        const assembled = joinFrontMatter(frontMatterRef.current, bodyMarkdown);
        lastRenderedValueRef.current = assembled;
        onChangeRef.current(assembled);
      } catch (err) {
        setRuntimeError(err instanceof Error ? err.message : 'Post-mount editor error');
      }
    },
  });

  // Sync `value` → editor content.
  // Uses addToHistory:false so external state loads (initial + prop changes)
  // don't pollute the undo stack — Ctrl+Z should only undo user edits.
  useEffect(() => {
    if (!editor) return;
    if (value === lastRenderedValueRef.current) return;
    try {
      const { frontMatter, body } = splitFrontMatter(value);
      frontMatterRef.current = frontMatter;
      lastRenderedValueRef.current = value;
      editor
        .chain()
        .command(({ tr }) => {
          tr.setMeta('addToHistory', false);
          return true;
        })
        .setContent(body, false)
        .run();
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to set editor content');
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  useEffect(() => {
    onEditorReadyRef.current?.(editor);
  }, [editor]);

  const wrapperClass = [
    'md-wysiwyg prose max-w-none',
    resolvedTheme === 'dark' ? 'dark:prose-invert' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // Post-mount runtime error — render fallback.
  if (runtimeError) {
    return <FallbackPanel error={runtimeError} onFallback={onFallback} className={wrapperClass} />;
  }

  if (!editor) {
    return <div className={wrapperClass} data-testid="md-wysiwyg-loading" />;
  }

  return (
    <div className={wrapperClass} data-testid="md-wysiwyg-root">
      <EditorContent editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — wraps the inner editor in an error boundary
// ---------------------------------------------------------------------------

export function MarkdownWysiwygEditor(props: MarkdownWysiwygEditorProps) {
  const { resolvedTheme } = useTheme();
  const wrapperClass = [
    'md-wysiwyg prose max-w-none',
    resolvedTheme === 'dark' ? 'dark:prose-invert' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <EditorErrorBoundary
      key={props.currentFilePath ?? '__no-file'}
      onFallback={props.onFallback}
      fallbackClassName={wrapperClass}
    >
      <MarkdownWysiwygEditorInner {...props} />
    </EditorErrorBoundary>
  );
}
