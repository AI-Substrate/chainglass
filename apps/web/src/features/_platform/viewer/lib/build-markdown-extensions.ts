/**
 * build-markdown-extensions — runtime Tiptap extension factory.
 *
 * Phase 6 / T002: extracted from the inline array in markdown-wysiwyg-editor.tsx
 * so the same set can drive both the React component and headless Node tests.
 *
 * `wysiwyg-extensions.ts` is type-only — this file is the runtime counterpart.
 */

import type { Extension } from '@tiptap/core';
import { Image as TiptapImage } from '@tiptap/extension-image';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

import { CodeBlockLanguagePill } from './code-block-language-pill';
import { sanitizeLinkHref } from './sanitize-link-href';
import type { ImageUrlResolver } from './wysiwyg-extensions';

const DEFAULT_PLACEHOLDER = 'Start writing…';

export interface BuildMarkdownExtensionsConfig {
  placeholder?: string;
  imageUrlResolver?: ImageUrlResolver;
  currentFilePath?: string;
  rawFileBaseUrl?: string;
  /** Mod-k handler for the link dialog. Omit in headless tests. */
  onOpenLinkDialog?: () => void;
  /**
   * When true, skip browser-only extensions (CodeBlockLanguagePill).
   * Useful for headless Node tests where `document` is not available.
   */
  headless?: boolean;
}

/**
 * Builds a read-only Image extension whose rendered `src` routes through
 * the provided resolver. When the resolver returns null, the original src
 * is preserved (external URLs, data URLs, etc.).
 */
function buildImageExtension(
  resolver: ImageUrlResolver | undefined,
  currentFilePath: string | undefined,
  rawFileBaseUrl: string | undefined
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
          ...((parentAttrs as Record<string, unknown>).src as object),
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

/**
 * Returns the full Tiptap extension array for the WYSIWYG markdown editor.
 *
 * Deterministic — same config always produces the same extension set.
 * The returned array can be passed to `useEditor({ extensions })` (React)
 * or `new Editor({ extensions })` (headless Node tests).
 */
export function buildMarkdownExtensions(config?: BuildMarkdownExtensionsConfig): Extension[] {
  const {
    placeholder = DEFAULT_PLACEHOLDER,
    imageUrlResolver,
    currentFilePath,
    rawFileBaseUrl,
    onOpenLinkDialog,
    headless = false,
  } = config ?? {};

  const extensions: Extension[] = [
    StarterKit as Extension,
    Markdown.configure({ html: false, transformPastedText: true }) as Extension,
    Placeholder.configure({ placeholder }) as Extension,
    TiptapLink.configure({
      openOnClick: false,
      autolink: false,
      protocols: ['http', 'https', 'mailto'],
      isAllowedUri: (url: string) => sanitizeLinkHref(url).ok,
    }).extend({
      addKeyboardShortcuts() {
        return {
          'Mod-k': () => {
            if (!this.editor.isEditable) return false;
            onOpenLinkDialog?.();
            return true;
          },
        };
      },
    }) as Extension,
    buildImageExtension(imageUrlResolver, currentFilePath, rawFileBaseUrl) as Extension,
  ];

  // CodeBlockLanguagePill uses DOM APIs — skip in headless mode.
  if (!headless) {
    extensions.push(CodeBlockLanguagePill as Extension);
  }

  return extensions;
}
