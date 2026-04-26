# Research Dossier: WYSIWYG Markdown Editing

**Plan**: `083-md-editor`
**Generated**: 2026-04-18
**Query**: "WYSIWYG editing for our .md files — currently we allow source editing. Find our editor, then research how to do this in Next.js. Needs basic tools — type `# TEXT` shows as heading, toolbar for H1/H2, bold, strikethrough, italics."
**Mode**: Pre-plan research (branch `083-md-editor`)
**FlowSpace**: ✅ Available
**External research**: ✅ [external-research/wysiwyg-markdown-libraries.md](external-research/wysiwyg-markdown-libraries.md)

## Executive Summary

### What exists today
Markdown files in the app are edited via **CodeMirror 6** (source editing with markdown syntax highlighting) inside `FileViewerPanel`, which offers three modes: `edit` / `preview` / `diff`. Preview is server-rendered via a react-markdown + remark-gfm + Shiki + Mermaid pipeline. A second editor surface exists in `AgentEditor` (plan 058) using the same CodeMirror component with debounced autosave.

### What's needed
A new WYSIWYG mode where typing `# Hello` immediately *looks* like a heading (no separate preview pane) and a toolbar provides H1/H2/H3, bold, italic, strikethrough, etc. Saves must round-trip back to plain markdown text through the existing save pipeline.

### Key decisions
1. **Adopt Tiptap + `@tiptap/markdown`** as a new client-only editor component alongside CodeMirror. (See external research for full justification.)
2. **Integrate as a new mode on `FileViewerPanel`** (e.g., rename `edit` → `source` and add `rich`, or add a 4th mode). Do not replace CodeMirror — keep source editing as a fallback for power users and non-markdown files.
3. **Leverage existing patterns**: dynamic import, `next-themes` sync, `useAutoSave`, Cmd/Ctrl+S keyboard save, conflict-detection save pipeline. All of these work unchanged — Tiptap just emits plain markdown.
4. **Scope discipline**: MVP toolbar is H1/H2/H3, Bold, Italic, Strikethrough, Inline code, Lists (UL/OL), Link, Blockquote, Code block. **No** images, tables, mentions, collaboration, or custom syntax in v1.

### Quick stats
- Markdown edit sites in codebase: **2** (FileViewerPanel, AgentEditor)
- Markdown rendering packages: react-markdown ^10.1.0, remark-gfm ^4.0.1, @shikijs/rehype ^3.21.0, mermaid ^11.12.2, rehype-slug, rehype-stringify
- CodeMirror packages: @uiw/react-codemirror ^4.25.4 + 13 language extensions (@codemirror/lang-markdown ^6.5.0)
- Candidate WYSIWYG library bundle (Tiptap + markdown): **~80–90 KB gz**, lazy-loaded
- Prior-art workshop: plan 058 workshop 003 already evaluated code/prompt editors — picked CodeMirror 6 for source editing. That decision stands; this plan *adds* a WYSIWYG layer, doesn't replace source.

## Current System: How Markdown Editing Works Today

### Edit surfaces

**EL-01 — File Browser (plan 041)** — primary markdown editor.
- `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx:84` — `FileViewerPanel` with `edit`/`preview`/`diff` modes.
- `edit` mode renders `<CodeEditor>` (lazy-loaded) at `file-viewer-panel.tsx:318`.
- Save: `onSave(currentContent)` at `file-viewer-panel.tsx:205` → parent calls server action.

**EL-02 — Work Unit Editor (plan 058)** — agent prompts (markdown).
- `apps/web/src/features/058-workunit-editor/components/agent-editor.tsx:20` — `AgentEditor` wraps `CodeEditor` with `language="markdown"`.
- 500 ms debounced autosave via `useAutoSave` → `saveUnitContent()` server action → `unit.setPrompt(ctx, content)`.

**EL-03 — Note Modal (plan 071)** — plain `<textarea>`, not a markdown editor. Not affected by this plan.

### Editor internals
**EL-06/07** — `apps/web/src/features/_platform/viewer/components/code-editor.tsx` wraps `@uiw/react-codemirror`, lazy-loaded via `dynamic({ ssr: false })` (line 50). Theme synced via `useTheme()` from `next-themes` (line 93). Word-wrap togglable. `basicSetup` enables line numbers, fold gutter, active-line highlight, bracket matching. **No custom decorations.** Extending *this* to be WYSIWYG would mean implementing an entire ProseMirror-equivalent document model on top of CodeMirror — not viable (see external research §"stay on CodeMirror" for full reasoning).

### Preview pipeline
**EL-04** — Server-side only. `apps/web/src/lib/server/markdown-renderer.ts:35` — `renderMarkdownToHtml()` runs remark-parse → remark-gfm → remark-mermaid → remark-rehype → rehype-slug → rehype-shiki (themes: `github-light`/`github-dark`) → rehype-stringify. Output is a pre-built HTML string.

**EL-05/18/23** — `apps/web/src/features/041-file-browser/components/markdown-preview.tsx` receives the HTML and uses a `ref.innerHTML` pattern (not `dangerouslySetInnerHTML`) so that Mermaid placeholder `<div data-mermaid>` elements survive for React portals to mount `MermaidRenderer` into.

### Save flow (important — WYSIWYG must flow through this unchanged)
**EL-09** — File browser save pipeline:
```
onSave(content)
  → saveFile(slug, worktreePath, filePath, content, expectedMtime)   [server action]
  → saveFileService() validates path, checks mtime conflict, atomic write (tmp + rename)
  → returns { ok: true, newMtime } | { ok: false, error: 'conflict' }
  → UI shows conflict banner if stale (file-viewer-panel.tsx:277)
```
A WYSIWYG editor emits markdown text → reuses this *as-is*. No server changes required.

**EL-10** — Work Unit save: `saveUnitContent()` server action + `useAutoSave` hook (500 ms debounce, tracks `idle|saving|saved|error`).

### Reusable patterns
| Pattern | Source | Reuse for WYSIWYG |
|---|---|---|
| `dynamic(() => import(...), { ssr: false })` | `code-editor.tsx:50` | Lazy-load Tiptap identically |
| `useTheme()` from next-themes | `code-editor.tsx:93` | Pass to Tiptap editor container class |
| `useAutoSave` (500 ms debounced) | `agent-editor.tsx:33` | Reuse in WYSIWYG AgentEditor variant if scope expanded |
| Cmd/Ctrl+S capture | `file-viewer-panel.tsx:135–152` | Works unchanged — reads `currentContent` |
| Word-wrap toggle | `file-viewer-panel.tsx:233` | Not relevant to WYSIWYG (rich rendering wraps naturally) |
| Suspense + lazy fallback | `file-viewer-panel.tsx:316` | Reuse for WYSIWYG component |
| `prose dark:prose-invert max-w-none` | `markdown-server.tsx:44` | Apply to Tiptap's `editor-content` wrapper |

### Constraints & gotchas
- **EL-19** — Next.js App Router. `FileViewerPanel` is `'use client'`. Any WYSIWYG editor must be client-only and dynamically imported.
- **EL-22** — Dark mode via next-themes + `prose dark:prose-invert`. Tiptap has no bundled theme; we style it via Tailwind on the editor content area.
- **EL-24** — No client-side markdown validation currently. Keep that — no need for WYSIWYG to lint.
- **EL-25** — 5 MB file read limit at the server; not a WYSIWYG concern.

## External Research Summary

Full analysis: [external-research/wysiwyg-markdown-libraries.md](external-research/wysiwyg-markdown-libraries.md).

**Pick: Tiptap + `@tiptap/markdown` extension.**
- ~65–90 KB gz lazy-loaded, React 19 supported.
- Headless — build toolbar from shadcn `Button` + `lucide-react`. Active state via `editor.isActive('bold')`.
- Next.js App Router needs `immediatelyRender: false` to avoid hydration mismatch.
- Clean round-trip via per-extension `renderMarkdown` handlers; configure GFM + `indentation: { style: 'space', size: 2 }` to match repo convention.

**Disqualified**:
- **BlockNote** — React 19 / StrictMode broken ([issue #1021](https://github.com/TypeCellOS/BlockNote/issues/1021)); asks users to set `reactStrictMode: false`. Unacceptable.
- **MDXEditor** — 851 KB gz (Shiki-heavy). Historical ESM/CJS pain.
- **CodeMirror Live Preview** — community plugin exists, but toolbar on raw text is brittle; selection→Bold on `**foo**` yields `****foo****`. Semantic document model wins.

**Runner-up: Milkdown** — markdown-first, Typora-inspired, natively does "type `#` → heading". Smaller ecosystem than Tiptap is the main reason it's runner-up.

## Prior Art (Do Not Re-evaluate)

**EL-26/27 — Plan 058 workshop 003** (`docs/plans/058-workunit-editor/workshops/003-code-prompt-editor-component-selection.md`): evaluated Monaco vs. CodeMirror vs. textarea-plus-Shiki and picked CodeMirror 6. Decision stands — this plan does *not* replace CodeMirror. It **adds** a second editor (Tiptap) for users who want WYSIWYG on `.md` files. Source mode remains available.

## Integration Sketch (for the spec / architect phases, not this phase)

```
FileViewerPanel
├── Toolbar: [Save] [Source] [Rich] [Preview] [Diff]    <-- new: Rich mode
├── Content area
│    mode === 'source'   → existing <CodeEditor>
│    mode === 'rich'     → <MarkdownWysiwygEditor value={content} onChange={...} />   <-- new
│    mode === 'preview'  → existing <MarkdownPreview>
│    mode === 'diff'     → existing <DiffViewer>
```
- New file: `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` — `'use client'`, dynamically imports Tiptap. Exposes `{ value, onChange(markdown) }`. Emits markdown via `editor.storage.markdown.getMarkdown()` on transaction.
- Toolbar as sibling: `markdown-wysiwyg-toolbar.tsx` — shadcn `Button` + lucide icons.
- Existing `editContent`/`onEditChange`/`onSave`/conflict banner all work **unchanged** — Tiptap just produces a string.
- Non-markdown files still use `<CodeEditor>`. Rich mode button is disabled / hidden for non-markdown.

## Open Questions (resolve in `/plan-1b-specify`)

1. **Mode model**: rename `edit` → `source` and add `rich`, or keep `edit` and add `rich` as a sibling? Affects state persistence in `useViewerState`.
2. **Default mode for `.md`**: Source (current) or Rich (new)? Probably Source for now — don't surprise existing users.
3. **Scope of adoption**: FileViewerPanel only, or also AgentEditor? Prompts often contain `{{template vars}}` which WYSIWYG would hide/mangle — recommend FileViewerPanel only in v1.
4. **Code blocks**: plain monospace `<pre>` in WYSIWYG, or add `@tiptap/extension-code-block-lowlight` (~50 KB) for syntax highlighting in rich mode?
5. **Mermaid**: keep as opaque fenced code block in rich mode, render only in Preview. Agree?
6. **Round-trip test fixtures**: which existing `.md` files in the repo become our round-trip test corpus? (Candidates: a research dossier, a plan spec, an ADR.)

## Critical Discoveries

**🚨 CD-01 — BlockNote is disqualified by React 19 / StrictMode incompatibility.** If anyone suggests BlockNote later, point to [issue #1021](https://github.com/TypeCellOS/BlockNote/issues/1021). This codebase cannot disable StrictMode safely.

**🚨 CD-02 — Save flow does not need changes.** Existing `saveFile()` server action with mtime conflict detection + atomic write handles WYSIWYG identically to CodeMirror. Tiptap emits a string; everything downstream stays.

**🚨 CD-03 — Mermaid pipeline depends on ref.innerHTML + portals.** Not a blocker for WYSIWYG (we're editing, not rendering mermaid live), but worth flagging: if the plan later grows to "render mermaid inside the WYSIWYG editor", that's a significant architectural expansion — current pattern doesn't adapt.

## Recommendations for the Spec Phase

- Specify the mode model first (question 1 above). Everything else hinges on it.
- Specify the exact toolbar action set — don't let this grow mid-implementation.
- Write the round-trip test plan as part of the acceptance criteria (pick 3 representative `.md` files; each must survive open → save → open with byte-identical content).
- Call out in the spec that this is an *additive* change; `source` mode must remain on parity.

## Next Steps

Research complete. **Stopping here.** Suggested next command:
- `/plan-1b-specify "Add WYSIWYG markdown editing mode to FileViewerPanel using Tiptap"` to draft the feature spec.

No code changes were made. No further exploration needed before spec unless you want to answer any of the Open Questions first (then use `/plan-2-v2-clarify`).
