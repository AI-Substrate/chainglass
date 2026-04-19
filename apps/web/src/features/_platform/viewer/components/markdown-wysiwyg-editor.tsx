'use client';

/**
 * MarkdownWysiwygEditor — Tiptap-backed WYSIWYG editor for markdown.
 *
 * Phase 1: scaffolds the core editing surface. No toolbar (Phase 2),
 * no link popover (Phase 3), and YAML front-matter is passed through
 * unsplit (Phase 4 replaces the passthrough with real YAML split/rejoin).
 *
 * Contract:
 *   - onChange fires ONLY when the user edits (Tiptap transaction.docChanged === true).
 *     Mounting, remounting with the same value, or changing unrelated props
 *     does NOT emit. This preserves bit-identical round-trip for unedited files.
 *   - editor.destroy() is called on unmount (managed by @tiptap/react's useEditor,
 *     plus an explicit cleanup as belt-and-suspenders per Tiptap common pitfall).
 *
 * Extensions:
 *   StarterKit + tiptap-markdown + Placeholder + Link + Image (read-only rendering).
 *   Code-block-lowlight is deliberately NOT included (130 KB gz budget).
 *
 * Image handling: when `imageUrlResolver` is provided, image src attributes
 * are rewritten at render time via the shared resolver — same logic as Preview.
 */

import { Image as TiptapImage } from '@tiptap/extension-image';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { Markdown } from 'tiptap-markdown';

import { joinFrontMatter, splitFrontMatter } from '../lib/markdown-frontmatter';
import { sanitizeLinkHref } from '../lib/sanitize-link-href';
import type { ImageUrlResolver, MarkdownWysiwygEditorProps } from '../lib/wysiwyg-extensions';

const DEFAULT_PLACEHOLDER = 'Start writing…';

/**
 * Builds a read-only Image extension whose rendered `src` routes through
 * the provided resolver. When the resolver returns null, the original src
 * is preserved (external URLs, data URLs, etc.).
 */
function buildImageExtension(
  resolver: ImageUrlResolver | undefined,
  currentFilePath: string | undefined,
  rawFileBaseUrl: string | undefined,
) {
  const base = TiptapImage.configure({
    inline: false,
    HTMLAttributes: { class: 'md-inline-image' },
  });
  if (!resolver) return base;

  return base.extend({
    addAttributes() {
      const parentAttrs = this.parent?.() ?? {};
      return {
        ...parentAttrs,
        src: {
          ...(parentAttrs as Record<string, unknown>).src as object,
          default: null,
          renderHTML: (attributes: Record<string, unknown>) => {
            const src = typeof attributes.src === 'string' ? attributes.src : undefined;
            if (!src) return {};
            const resolved = resolver({ src, currentFilePath, rawFileBaseUrl });
            return { src: resolved ?? src };
          },
        },
      };
    },
  });
}

export function MarkdownWysiwygEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = DEFAULT_PLACEHOLDER,
  imageUrlResolver,
  currentFilePath,
  rawFileBaseUrl,
  className,
  onEditorReady,
  onOpenLinkDialog,
}: MarkdownWysiwygEditorProps) {
  const { resolvedTheme } = useTheme();

  // Tracks the last `value` the editor was loaded with. Guards against
  // cascading setContent calls from unrelated parent re-renders.
  const lastRenderedValueRef = useRef<string | null>(null);

  // Latest onChange reference — kept in a ref so the Tiptap onUpdate handler
  // captured at mount doesn't go stale when the parent passes a new callback.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Same ref pattern for onEditorReady — parent re-render with a new callback
  // identity must not re-fire the ready effect (it only re-fires on editor change).
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  // Ref-stable link dialog opener — captured once inside the Tiptap Link
  // extension's `addKeyboardShortcuts` closure so callback-identity changes
  // from the parent don't require re-registering extensions (which would
  // thrash useEditor's dependency array).
  const onOpenLinkDialogRef = useRef(onOpenLinkDialog);
  onOpenLinkDialogRef.current = onOpenLinkDialog;

  const frontMatterRef = useRef<string>('');

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      Placeholder.configure({ placeholder }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: false,
        // Allow-list at the Tiptap layer too — defense-in-depth so a
        // programmatic `setLink({ href: 'javascript:…' })` is refused
        // even if the popover is bypassed.
        protocols: ['http', 'https', 'mailto'],
        isAllowedUri: (url: string) => sanitizeLinkHref(url).ok,
      }).extend({
        addKeyboardShortcuts() {
          return {
            'Mod-k': () => {
              if (!this.editor.isEditable) return false;
              onOpenLinkDialogRef.current?.();
              return true;
            },
          };
        },
      }),
      buildImageExtension(imageUrlResolver, currentFilePath, rawFileBaseUrl),
    ],
    onUpdate({ editor: updatedEditor, transaction }) {
      if (!transaction.docChanged) return;
      // tiptap-markdown exposes a markdown serializer via editor.storage.markdown.
      const storage = (updatedEditor.storage as { markdown?: { getMarkdown: () => string } })
        .markdown;
      const bodyMarkdown = storage?.getMarkdown() ?? '';
      const assembled = joinFrontMatter(frontMatterRef.current, bodyMarkdown);
      lastRenderedValueRef.current = assembled;
      onChangeRef.current(assembled);
    },
  });

  // Sync `value` → editor content. Uses a ref-based equality check so that
  // same-value parent re-renders do not trigger setContent (which would
  // thrash the DOM and could break the onChange-on-docChanged contract).
  useEffect(() => {
    if (!editor) return;
    if (value === lastRenderedValueRef.current) return;

    const { frontMatter, body } = splitFrontMatter(value);
    frontMatterRef.current = frontMatter;
    lastRenderedValueRef.current = value;

    // emitUpdate === false → prevents this sync from triggering onUpdate.
    // Without it, AC-08 (no onChange on mount) would fail.
    editor.commands.setContent(body, false);
  }, [editor, value]);

  // Sync readOnly → editor.setEditable.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Belt-and-suspenders destroy on unmount. @tiptap/react's useEditor cleans
  // up automatically, but an explicit destroy guards against future upstream
  // changes to the library and makes the lifecycle explicit.
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  // Expose the Editor instance to the parent once it's ready. Fires when
  // `editor` transitions from null (immediatelyRender: false gap) to a live
  // instance; consumers manage their own cleanup on unmount (setState pattern).
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

  if (!editor) {
    // Rendering path during SSR / first paint before immediatelyRender resolves.
    // Minimal placeholder keeps the smoke test from hard-crashing; full
    // error-fallback UI arrives in Phase 6 (AC-18).
    return <div className={wrapperClass} data-testid="md-wysiwyg-loading" />;
  }

  return (
    <div className={wrapperClass} data-testid="md-wysiwyg-root">
      <EditorContent editor={editor} />
    </div>
  );
}
