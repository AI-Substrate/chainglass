'use client';

/**
 * Dev-only smoke route for Phase 1 + Phase 2 + Phase 3 harness validation.
 *
 * Mounts the lazy WYSIWYG editor with a fixed sample markdown string, a
 * `WysiwygToolbar` sibling wired through `onEditorReady`, and a
 * `LinkPopover` (Phase 3) composed via shared open-state.
 *
 * Phase 1 assertions (T006): h1 renders, img src routes through resolver,
 * no hydration warnings in console.
 *
 * Phase 2 assertions (T008): toolbar `role="toolbar"` present with
 * 16 buttons; clicking Bold toggles `<strong>`; clicking H2 toggles `<h2>`;
 * `Mod-Alt-c` chord toggles `<pre><code>`.
 *
 * Phase 3 assertions (T008):
 *   - Click the toolbar Link button → popover opens with role="dialog".
 *   - Type a URL + Enter → editor DOM contains <a href="…">.
 *   - Mod-k while caret inside link → popover reopens in Edit mode with
 *     URL + Text pre-filled; Update submits; Unlink removes the link.
 *   - Esc closes and returns focus to the opener (toolbar-button vs editor).
 *   - javascript: URLs rejected with inline error.
 *   - Mod-k while popover open is swallowed; browser chrome unaffected.
 *   - Parenthesized URL round-trip preserved byte-for-byte (read via
 *     data-markdown-output attribute the harness inspects).
 *
 * Guarded: in production, the route 404s. Tracked for deletion at Phase 5.11
 * once the harness smoke migrates onto `FileViewerPanel`.
 */

import type { Editor } from '@tiptap/react';
import { notFound } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LinkPopover,
  MarkdownWysiwygEditorLazy,
  WysiwygToolbar,
  resolveImageUrl,
} from '@/features/_platform/viewer';

const SAMPLE_MARKDOWN = '# Hello\n\nSome text.\n\n![alt](./test.png)\n';

// Phase 4 / T007: front-matter-bearing fixture used by the fm round-trip
// assertion. When the user clicks the toggle button, the editor's `value`
// prop switches to this sample. The harness spec then reads
// window.__smokeGetMarkdown() before and after a user edit and asserts
// the front-matter prefix is preserved byte-for-byte.
const SAMPLE_MARKDOWN_FRONTMATTER =
  '---\ntitle: Test Doc\ntags:\n  - a\n  - b\n---\n\n# Body\n\nparagraph.\n';

export default function MarkdownWysiwygSmokePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const [editor, setEditor] = useState<Editor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [value, setValue] = useState(SAMPLE_MARKDOWN);
  const toolbarLinkBtnRef = useRef<HTMLButtonElement | null>(null);
  // Phase 4 / T007: captures the most recent onChange argument so the harness
  // can read the full assembled markdown (front-matter + body). Ref-based to
  // avoid re-rendering on every keystroke (Phase 3 gotcha).
  const lastEmittedMarkdownRef = useRef<string>('');

  const openLink = useCallback(() => setLinkOpen(true), []);
  const toggleFrontmatter = useCallback(
    () => setValue(SAMPLE_MARKDOWN_FRONTMATTER),
    [],
  );
  const captureOnChange = useCallback((md: string) => {
    lastEmittedMarkdownRef.current = md;
  }, []);

  // Expose the current serialized markdown to the harness via a global
  // hook on window so the round-trip assertion can read it without
  // triggering a React re-render on every edit (which disrupted Tiptap
  // shortcut timing in Phase 2's assertion).
  useEffect(() => {
    if (!editor) return;
    type WithGetter = Window & {
      __smokeGetMarkdown?: () => string;
      __smokeGetLastEmittedMarkdown?: () => string;
    };
    const w = window as WithGetter;
    w.__smokeGetMarkdown = () => {
      const storage = (editor.storage as { markdown?: { getMarkdown: () => string } })
        .markdown;
      return storage?.getMarkdown() ?? '';
    };
    // Phase 4 / T007: authoritative full-output getter — returns the most
    // recent argument passed to the parent onChange handler (fm + body
    // assembled by the editor's joinFrontMatter path). Proves end-to-end
    // that split + ref + join preserves the fm prefix across a real edit.
    w.__smokeGetLastEmittedMarkdown = () => lastEmittedMarkdownRef.current;
    return () => {
      delete w.__smokeGetMarkdown;
      delete w.__smokeGetLastEmittedMarkdown;
    };
  }, [editor]);

  return (
    <div className="min-h-screen p-8 bg-background text-foreground">
      <h2 className="text-xl mb-4" data-testid="smoke-heading">
        Markdown WYSIWYG Smoke (Phase 3 / T008 + Phase 4 / T007)
      </h2>
      <div className="mb-4">
        <button
          type="button"
          onClick={toggleFrontmatter}
          data-testid="fixture-toggle-frontmatter"
          className="px-3 py-1 border rounded text-sm"
        >
          Load front-matter fixture
        </button>
      </div>
      <div
        className="max-w-3xl border rounded overflow-hidden"
        data-testid="markdown-output-container"
      >
        <WysiwygToolbar
          editor={editor}
          onOpenLinkDialog={openLink}
          linkButtonRef={toolbarLinkBtnRef}
        />
        <div className="p-4">
          <MarkdownWysiwygEditorLazy
            value={value}
            onChange={captureOnChange}
            imageUrlResolver={resolveImageUrl}
            currentFilePath="smoke.md"
            rawFileBaseUrl="/api/workspaces/test/files/raw?worktree=test"
            onEditorReady={setEditor}
            onOpenLinkDialog={openLink}
          />
        </div>
      </div>
      <LinkPopover
        editor={editor}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        anchorRef={toolbarLinkBtnRef}
      />
    </div>
  );
}
