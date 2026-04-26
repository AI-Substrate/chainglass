# External Research: WYSIWYG Markdown Editors for Next.js 15

**Date**: 2026-04-18
**Source**: Perplexity Deep Research (`sonar-deep-research`, high reasoning effort)
**Question**: Which WYSIWYG markdown editor library is best for Next.js 15 App Router + React 19, with round-trip-stable markdown output, toolbar UX, MVP scope (headings/bold/italic/strikethrough/lists/links/code/blockquote — no images/tables/collab)?

## TL;DR

**Primary recommendation: Tiptap + `@tiptap/markdown` extension.**
**Runner-up: Milkdown** (if markdown-first semantics matter more than ecosystem size).
**Avoid: MDXEditor** (851 KB gzipped) and **BlockNote** (React 19 / StrictMode incompatibility).
**Do not stay on CodeMirror** for true WYSIWYG — a community "Live Preview" plugin exists ([segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc)) but toolbar-driven formatting on raw markdown text is brittle (e.g., user types `**foo**` then hits Bold → `****foo****`). ProseMirror-based editors solve this with a semantic document model.

## Candidate Matrix

| Library | Foundation | Round-trip | Bundle (gz) | React 19 / App Router | Toolbar | Verdict |
|---|---|---|---|---|---|---|
| **Tiptap + markdown ext** | ProseMirror | Clean, bidirectional via render handlers | ~65–90 KB | ✅ Supported; needs `immediatelyRender: false` | Headless (DIY with Tailwind/shadcn) | **Pick** |
| **Milkdown** | ProseMirror + remark | Markdown-first; minor list-item whitespace quirks ([#343](https://github.com/Milkdown/milkdown/issues/343)) | ~85–100 KB | Works; React support native; Next.js recipe documented | DIY via plugins | **Runner-up** |
| **BlockNote** | TipTap/ProseMirror | Block-first, not pristine markdown | ~110–130 KB | ❌ Requires `reactStrictMode: false` ([#1021](https://github.com/TypeCellOS/BlockNote/issues/1021)) | Built-in (Notion-style) | Skip |
| **MDXEditor** | Lexical | Good for MDX, heavy | **851 KB** gz (Shiki-heavy) | Client-only; historical ESM/CJS pain | Built-in | Skip |
| **Lexical + markdown plugin** | Meta/Lexical | Good, transformer-based, explicit config | ~80 KB | Active (v0.43 Sept 2025) | DIY | Viable if TipTap disqualified |
| **CodeMirror 6 + live-preview** | CodeMirror | — (stays as source) | Minimal (reuse existing) | No SSR concerns | DIY, brittle on selection-based formatting | Skip for WYSIWYG |

## Key Technical Points

### Round-trip fidelity
- **Tiptap's markdown extension** uses per-extension `renderMarkdown` handlers; explicit control, clean output. Configure `indentation: { style: 'space', size: 2 }` and GFM to match existing repo conventions. Hard line breaks can serialize as `<br>` — set `breaks` option correctly.
- **Milkdown** uses remark natively, so its AST *is* markdown. Highest inherent fidelity; minor cosmetic drift on list items in some HTML→MD paths.
- **BlockNote** serializes from blocks, not pristine markdown — not ideal when the source of truth is a `.md` file on disk.
- **MDXEditor** optimized for MDX/JSX-in-markdown, not byte-perfect markdown.

### Next.js App Router / React 19 gotchas
- **All rich editors are client-only.** Standard pattern: `'use client'` component + `dynamic(() => import(...), { ssr: false })`.
- **Tiptap**: needs `immediatelyRender: false` to avoid hydration mismatch on mount.
- **MDXEditor**: plugins themselves must be initialized client-side; importing them in a server component triggers hydration errors.
- **BlockNote**: React 19 issue — library pins `"react": "^18"` peer dep, duplicate React instance under StrictMode breaks internals. Project asks users to disable StrictMode globally. Dealbreaker for this codebase.
- **Active maintenance** (April 2026): Tiptap, Milkdown, Lexical, BlockNote, MDXEditor all shipping recent releases. None abandoned.

### Bundle size
- Tiptap core: 219 KB min / 65.7 KB gz. Plus `@tiptap/markdown` overhead → ~80–90 KB gz lazy-loaded.
- MDXEditor: 851 KB gz — dominated by embedded Shiki language bundles (single `.mjs` files exceeding 190 KB gz). Code-splitting doesn't easily help due to tight coupling.
- Lazy-load via `dynamic({ ssr: false })` is viable for all.

### Toolbar UX
- **Tiptap**: headless — build `<button onClick={() => editor.chain().focus().toggleBold().run()}>` with shadcn/ui + Tailwind. Query active state via `editor.isActive('bold')`. Maximum flexibility, zero style fights.
- **BlockNote / MDXEditor**: opinionated built-in UI — faster to ship, harder to match this codebase's shadcn aesthetic.
- **Milkdown**: DIY toolbar via commands, less well-documented than Tiptap.

### CodeMirror "Live Preview" option
- Exists ([segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc)) — uses `lezer-markdown` tokens + decorations + `cm-markdoc-hidden` class to hide syntax on non-focused lines (Obsidian-style).
- **Rejected** because: (a) community-maintained, not canonical; (b) toolbar formatting on raw text is fragile — no semantic document model means selection→Bold must do string manipulation; (c) diminishing returns vs. the effort of adopting Tiptap.

## Recommended Implementation Path

1. `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/markdown` (pinned to versions matching React 19).
2. New component `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` — `'use client'` + dynamic-imported Tiptap. Mirrors lazy-load shape of `code-editor.tsx`.
3. Wire into `FileViewerPanel` as a **new mode** alongside `edit` / `preview` / `diff` — call it `wysiwyg` (or replace `edit` for `.md` files specifically). Emits plain markdown via `editor.storage.markdown.getMarkdown()` on change → existing `onEditChange` → existing `onSave` pipeline (conflict detection, mtime check, atomic write — no changes needed).
4. Build toolbar from shadcn `Button` + `lucide-react` icons: H1/H2/H3, Bold, Italic, Strikethrough, Code, Link, UL/OL, Blockquote, Code block.
5. Theme sync: pass `resolvedTheme` from `next-themes` into editor CSS class (`dark` / `light`).
6. Keyboard save (Cmd/Ctrl+S): existing `handleEditModeKeyDownCapture` on the parent `<div>` already works — current content is whatever Tiptap wrote to `editContent`.
7. Verify round-trip with representative repo `.md` files (test/fixtures, existing plans) before shipping.

## Open Questions for Spec Phase
- Replace `edit` mode for `.md` files, or add a 4th mode toggle? (user-facing: "Source" vs. "Rich")
- Also apply to `AgentEditor` (058) or keep that CodeMirror-only for now? (agent prompts often include template variables `{{var}}` — WYSIWYG would hide markdown syntax, which may not suit prompt-authoring)
- What do we do with code blocks inside WYSIWYG? Tiptap's code block doesn't have syntax highlighting by default — can add `@tiptap/extension-code-block-lowlight` if wanted (adds ~50 KB) or leave as monospace block.
- Mermaid in WYSIWYG mode: treat as a regular fenced code block (no live render while editing), render only in Preview mode. Keeps WYSIWYG scope tight.

## Citations (selected)
- Tiptap docs: [tiptap.dev/docs/editor/markdown](https://tiptap.dev/docs/editor/markdown), [custom-serializing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-serializing)
- Tiptap React 19 discussion: [GitHub #5816](https://github.com/ueberdosis/tiptap/discussions/5816)
- Milkdown: [github.com/Milkdown/milkdown](https://github.com/Milkdown/milkdown), [Next.js recipe](https://milkdown.dev/docs/recipes/nextjs)
- BlockNote React 19 blocker: [GitHub #1021](https://github.com/TypeCellOS/BlockNote/issues/1021)
- MDXEditor bundle size: [bundlephobia](https://bundlephobia.com/package/@mdxeditor/editor), Shiki issue [#1487](https://github.com/TypeCellOS/BlockNote/issues/1487)
- CodeMirror rich markdown: [segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc)
- 2025 editor landscape: [Liveblocks rich-text framework comparison](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
