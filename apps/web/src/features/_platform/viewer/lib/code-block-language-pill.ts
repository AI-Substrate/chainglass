/**
 * Tiptap extension — renders a read-only language pill inside every code block
 * that carries a non-empty `language` attribute.
 *
 * Plan 083-md-editor / Phase 5 T007 / AC-12.
 *
 * Internal to `_platform/viewer` — consumed only by `markdown-wysiwyg-editor.tsx`
 * via a direct relative import. NOT re-exported from the barrel so bundle analysis
 * (Phase 6.7) can confirm the pill ships inside the lazy editor chunk and not the
 * eager bundle.
 *
 * Widget placement: `Decoration.widget(pos, toDOM, { side: -1 })` at
 * `blockNode.pos + 1` — the widget DOM is a DESCENDANT of the `<pre>`, which is
 * what makes the CSS `.md-wysiwyg-code-lang-pill { position: absolute }` resolve
 * against `.md-wysiwyg pre { position: relative }` rather than some ancestor.
 *
 * Serialization: widget decorations do NOT participate in Tiptap's markdown
 * serializer (they're DOM-only render-time overlays). This is asserted in a
 * unit test so any future regression where the pill leaks into emitted markdown
 * is caught immediately.
 */

import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const LANGUAGE_PILL_TESTID = 'code-block-language-pill';

function buildLanguagePillWidget(language: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'md-wysiwyg-code-lang-pill';
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-testid', LANGUAGE_PILL_TESTID);
  span.textContent = language;
  return span;
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return;
    const language = typeof node.attrs.language === 'string' ? node.attrs.language.trim() : '';
    if (!language) return;
    // side: -1 keeps the widget before the block's inline content so the caret
    // does not land on it while typing at the start of a fresh code block.
    decorations.push(
      Decoration.widget(pos + 1, () => buildLanguagePillWidget(language), { side: -1 })
    );
  });
  return DecorationSet.create(doc, decorations);
}

const pluginKey = new PluginKey<DecorationSet>('code-block-language-pill');

export const CodeBlockLanguagePill = Extension.create({
  name: 'codeBlockLanguagePill',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, old) => {
            if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
            return buildDecorations(tr.doc);
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state) ?? null;
          },
        },
      }),
    ];
  },
});
