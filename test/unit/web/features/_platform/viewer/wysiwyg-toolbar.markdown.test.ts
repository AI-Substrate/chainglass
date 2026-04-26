/**
 * WysiwygToolbar — markdown serialization tests (Phase 2 T007, file 2 of 2).
 *
 * Primary test surface per Tiptap docs: the markdown output emitted by
 * `editor.storage.markdown.getMarkdown()` (from `tiptap-markdown`) is the
 * contract that matters to real users. DOM assertions (the other file)
 * prove state reactivity; these prove round-trip behaviour.
 *
 * Uses a headless `Editor` constructed against a detached `<div>` — no React,
 * no jsdom reliance on contenteditable. Actions are invoked directly via each
 * toolbar action's `run(editor, …)` function — the exact function the UI
 * calls.
 *
 * Constitution §4/§7: no vi.mock, vi.fn, vi.spyOn. Plain callbacks only.
 */

import { Image as TiptapImage } from '@tiptap/extension-image';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { describe, expect, it } from 'vitest';

import {
  WYSIWYG_TOOLBAR_ACTIONS,
  WYSIWYG_TOOLBAR_GROUPS,
} from '../../../../../../apps/web/src/features/_platform/viewer/lib/wysiwyg-toolbar-config';

function makeHeadlessEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      TiptapLink.configure({ openOnClick: false, autolink: false }),
      TiptapImage.configure({ inline: false }),
    ],
    content,
  });
}

function getMarkdown(editor: Editor): string {
  const storage = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown;
  return storage?.getMarkdown() ?? '';
}

function findAction(id: string) {
  const action = WYSIWYG_TOOLBAR_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`Toolbar action not found: ${id}`);
  return action;
}

describe('WysiwygToolbar — markdown serialization contract', () => {
  it('Bold wraps selected text with ** (workshop § 13.2 normalization)', () => {
    /*
    Test Doc:
    - Why: Workshop § 13.2 states bold normalizes to `**` (NOT `__`).
    - Contract: toggleBold on a full-paragraph selection emits `**word**`.
    */
    const editor = makeHeadlessEditor('word');
    try {
      editor.commands.selectAll();
      findAction('bold').run(editor, {});
      const md = getMarkdown(editor);
      expect(md, `json=${JSON.stringify(editor.getJSON())}`).toContain('**word**');
      expect(md).not.toContain('__word__');
    } finally {
      editor.destroy();
    }
  });

  it('Italic wraps selected text with * (not _)', () => {
    const editor = makeHeadlessEditor('word');
    try {
      editor.commands.selectAll();
      findAction('italic').run(editor, {});
      const md = getMarkdown(editor);
      expect(md).toContain('*word*');
      expect(md).not.toContain('_word_');
    } finally {
      editor.destroy();
    }
  });

  it('Strikethrough wraps selected text with ~~', () => {
    const editor = makeHeadlessEditor('word');
    try {
      editor.commands.selectAll();
      findAction('strike').run(editor, {});
      const md = getMarkdown(editor);
      expect(md).toContain('~~word~~');
    } finally {
      editor.destroy();
    }
  });

  it('Inline code wraps selected text with backticks', () => {
    const editor = makeHeadlessEditor('word');
    try {
      editor.commands.selectAll();
      findAction('inline-code').run(editor, {});
      const md = getMarkdown(editor);
      expect(md).toContain('`word`');
    } finally {
      editor.destroy();
    }
  });

  it.each([
    ['h1', '# text'],
    ['h2', '## text'],
    ['h3', '### text'],
  ])('Heading action %s emits ATX form %s (not setext)', (id, expectedPrefix) => {
    /*
    Test Doc:
    - Why: Workshop § 13.2 — setext `===`/`---` headings normalize to ATX (`#`).
    - Contract: toggleHeading({level:N}) produces '# text' / '## text' / '### text'.
    */
    const editor = makeHeadlessEditor('text');
    try {
      editor.commands.selectAll();
      findAction(id).run(editor, {});
      const md = getMarkdown(editor);
      expect(md.startsWith(expectedPrefix)).toBe(true);
      // No setext underlines.
      expect(md).not.toMatch(/\n[=-]{3,}\n?$/);
    } finally {
      editor.destroy();
    }
  });

  it('Bulleted list emits a recognised marker (- or *) — discovery-logged if *', () => {
    /*
    Test Doc:
    - Why: `tiptap-markdown@0.8.10`'s default `bulletListMarker` may be `*`
      (CommonMark default) instead of `-`. Both are valid markdown. This test
      asserts a list emitted as SOME valid marker and records which one for the
      phase Discoveries table.
    */
    const editor = makeHeadlessEditor('item');
    try {
      editor.commands.selectAll();
      findAction('bullet-list').run(editor, {});
      const md = getMarkdown(editor);
      // Either '- item' or '* item' on its own line.
      const matched = /^([*-])\s+item/m.test(md);
      expect(matched, `json=${JSON.stringify(editor.getJSON())} md=${md}`).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('Ordered list emits 1. marker', () => {
    const editor = makeHeadlessEditor('item');
    try {
      editor.commands.selectAll();
      findAction('ordered-list').run(editor, {});
      const md = getMarkdown(editor);
      expect(/^1\.\s+item/m.test(md)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('Blockquote emits a leading > on each wrapped line', () => {
    const editor = makeHeadlessEditor('quoted');
    try {
      editor.commands.selectAll();
      findAction('blockquote').run(editor, {});
      const md = getMarkdown(editor);
      expect(/^>\s+quoted/m.test(md)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('Code block wraps content in triple-backtick fences', () => {
    const editor = makeHeadlessEditor('const x = 1');
    try {
      editor.commands.selectAll();
      findAction('code-block').run(editor, {});
      const md = getMarkdown(editor);
      expect(md.includes('```')).toBe(true);
      expect(md).toMatch(/```[\s\S]*const x = 1[\s\S]*```/);
    } finally {
      editor.destroy();
    }
  });

  it('Horizontal rule inserts a --- block', () => {
    const editor = makeHeadlessEditor('before');
    try {
      editor.commands.focus('end');
      findAction('hr').run(editor, {});
      const md = getMarkdown(editor);
      expect(md).toMatch(/^---$/m);
    } finally {
      editor.destroy();
    }
  });

  it('round-trips **bold** via setContent → getMarkdown', () => {
    const editor = makeHeadlessEditor('**bold**');
    try {
      const md = getMarkdown(editor);
      expect(md).toContain('**bold**');
    } finally {
      editor.destroy();
    }
  });

  it('groups cover every action and run() is present on each', () => {
    // Re-exercised here to ensure group/action wiring is consistent at the
    // serializer layer too — catches config drift.
    let count = 0;
    for (const group of WYSIWYG_TOOLBAR_GROUPS) {
      for (const action of group.actions) {
        expect(typeof action.run).toBe('function');
        count += 1;
      }
    }
    expect(count).toBe(16);
  });
});
