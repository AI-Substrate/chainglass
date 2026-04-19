'use client';

/**
 * MarkdownWysiwygEditorLazy — dynamic-import wrapper for MarkdownWysiwygEditor.
 *
 * Tiptap + ProseMirror weigh ~125 KB gzipped. This wrapper keeps that cost
 * out of the initial bundle; only consumers that actually open Rich mode
 * download the editor chunk.
 *
 * Mirrors the pattern in `./code-editor.tsx` (Plan 058).
 */

import dynamic from 'next/dynamic';

import type { MarkdownWysiwygEditorProps } from '../lib/wysiwyg-extensions';

export type { MarkdownWysiwygEditorProps };

export const MarkdownWysiwygEditorLazy = dynamic<MarkdownWysiwygEditorProps>(
  () =>
    import('./markdown-wysiwyg-editor').then((m) => ({
      default: m.MarkdownWysiwygEditor,
    })),
  {
    ssr: false,
    loading: () => <div className="animate-pulse rounded bg-muted p-4 h-64" />,
  }
);
