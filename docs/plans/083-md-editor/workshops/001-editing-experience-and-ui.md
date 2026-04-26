# Workshop: WYSIWYG Editing Experience & UI

**Type**: UI / Interaction Design
**Plan**: 083-md-editor
**Research Dossier**: [research-dossier.md](../research-dossier.md)
**External Research**: [wysiwyg-markdown-libraries.md](../external-research/wysiwyg-markdown-libraries.md)
**Created**: 2026-04-18
**Status**: Draft

**Related Documents**:
- `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` — current host for edit/preview/diff modes
- `apps/web/src/features/_platform/viewer/components/code-editor.tsx` — existing CodeMirror editor (source mode)
- `apps/web/src/components/viewers/markdown-server.tsx` / `markdown-renderer.ts` — server-side preview pipeline (will be reused for Preview mode)

**Domain Context**:
- **Primary Domain**: `file-browser` (owns `FileViewerPanel` and all viewing modes for `.md` files)
- **Related Domains**: `_platform/viewer` (shared editor components), `_platform/themes` (dark/light sync)

---

## Purpose

Nail down the **end-user editing experience** for the new WYSIWYG mode before architecture. Design the mode model, toolbar, keyboard shortcuts, markdown input rules, mode transitions, and all the little UX details so the spec and implementation phases have a single reference. This is the document to keep open while coding.

## Key Questions Addressed

1. How does a user switch between Source, WYSIWYG, Preview, and Diff — one toggle or separate controls?
2. What exact buttons live in the toolbar, in what order, with what icons and shortcuts?
3. Which keyboard shortcuts does the WYSIWYG editor respond to (standard and markdown-style)?
4. Which typed sequences auto-convert to rich formatting (e.g., `# ` → H1)?
5. What happens to unsaved edits when the user toggles between modes mid-edit?
6. How are code blocks, mermaid blocks, and other "not really WYSIWYG" constructs displayed in Rich mode?
7. Round-trip: which markdown details are preserved exactly, and which normalize when editing in Rich mode?
8. Link insertion — how does a user add or edit a hyperlink?
9. Mobile: how does the toolbar behave on a narrow viewport?
10. What does the editor look like while Tiptap is lazy-loading, and what if it fails?

---

## TL;DR — Design Summary

- **Four modes** on `FileViewerPanel`, with `edit` renamed to `source`: `[Source] [Rich] [Preview] [Diff]`. Rich only offered for `.md` files.
- **Default mode stays Source** for `.md` files (don't surprise existing users; Rich is opt-in via button).
- **Toolbar**: 15 buttons in 4 logical groups separated by dividers. All shadcn `<Button variant="ghost" size="sm">` with `lucide-react` icons, `aria-pressed` on active formats.
- **Markdown input rules**: typing `# ` at line start creates an H1, `**bold**` creates bold, etc. — 13 trigger patterns total.
- **Keyboard shortcuts**: standard (`Cmd+B`, `Cmd+I`, `Cmd+Shift+X`, `Cmd+K`, …) + full undo/redo + existing `Cmd+S` save.
- **Content sync**: Source and Rich share one `editContent` string in parent state. Switching mode re-parses/re-serializes; round-trip is lossless for MVP syntax (see § Round-trip Rules).
- **Code blocks & mermaid** render as plain monospace blocks in Rich mode; live syntax highlighting and mermaid diagrams only appear in Preview mode. Keeps scope tight and avoids perf/complexity.
- **Link insertion**: `Cmd+K` or toolbar button opens a small popover (`Text`, `URL` fields). Desktop: inline floating. Mobile: bottom-sheet.
- **Mobile**: toolbar horizontally scrolls if it overflows. No "compact mode" hiding buttons — every MVP action must be reachable.

---

## 1. Mode Model

### 1.1 The modes

| Mode | Control | Applies to | Purpose |
|---|---|---|---|
| **Source** | Button (was "Edit") | all files | Raw text editing via CodeMirror (unchanged) |
| **Rich** | Button, **new** | `.md` only | Tiptap WYSIWYG |
| **Preview** | Button | all text files | Read-only rendered output (server-side react-markdown + Shiki) |
| **Diff** | Button | all files | Git diff vs HEAD (unchanged) |

**Renaming rationale** — "Edit" is ambiguous once there are two editors. `Source` vs `Rich` is a standard pairing that users in other tools (Notion, Obsidian, Ghost, Bear) will recognize.

### 1.2 When is Rich offered?

```
isMarkdown = language === 'markdown'
Rich button is rendered:   isMarkdown && !isBinary && !errorType
Rich button is disabled:   false  (if rendered, always enabled)
```

For non-markdown files, the toolbar shows `[Save] [Source] [Preview] [Diff]` (3 mode buttons, matching today).

### 1.3 Default mode on file open

- `.md` file: **Source** (preserves current behavior; Rich is opt-in).
- All other files: unchanged.
- *Future*: allow a user setting "Default to Rich for markdown" — deferred, not MVP.

Mode persistence: reuse existing `useMarkdownViewerState` pattern (or extend `useViewerState` to track the four modes). Per-file persistence via sessionStorage — not a new concept.

### 1.4 Mode toggle UI

```
┌───────────────────────────────────────────────────────────────────────┐
│ [💾 Save]   [ Source │ Rich │ Preview │ Diff ]        [↩ wrap] [⟳] [⎋]│
└───────────────────────────────────────────────────────────────────────┘
```

- `Save` button visible only when an editing mode is active (`source` or `rich`).
- Word-wrap toggle visible only in `source` mode (not meaningful in Rich — rich rendering always wraps).
- Refresh (`⟳`) and Pop-out (`⎋`) always visible.
- Active mode: `bg-accent text-accent-foreground font-medium` (matches existing `ModeButton`).

### 1.5 Mode transitions — content sync

Parent holds a single `editContent: string` (the unsaved markdown). Both editors read from it and call `onEditChange(newMarkdown)` to write back.

```
              ┌────────────────────────┐
              │  editContent: string   │   ← parent state (single source of truth)
              └─┬──────┬───────┬───────┘
                │      │       │
         reads/writes  │       │ reads
                │      │       │
       ┌────────▼──┐ ┌─▼─────┐ ▼
       │  Source   │ │ Rich  │ Preview (rendered HTML computed server-side on save or debounced)
       │ (CodeMirr)│ │(Tiptap)│
       └───────────┘ └───────┘
```

**Transition rules**:

| From → To | What happens |
|---|---|
| Source → Rich | Parse `editContent` (markdown) into Tiptap doc via markdown extension. Cursor position NOT preserved across modes. Scroll position NOT preserved. |
| Rich → Source | Serialize Tiptap doc to markdown via `editor.storage.markdown.getMarkdown()`. Cursor/scroll reset. |
| Source ↔ Preview | No content transformation; Preview reads current `editContent` (renders the unsaved version, not the on-disk version). |
| Rich ↔ Preview | Same — Rich serializes to markdown first, Preview renders it. |
| Any → Diff | Diff compares current `editContent` against HEAD. Dirty edits are visible in the diff. |

**Dirty state is preserved across mode switches.** Switching Source → Rich → Source does NOT save; editing in Rich and switching to Source shows the Rich-normalized markdown in the source editor.

**"Switch normalizes markdown" warning**: If a user opens a `.md` file with unusual-but-valid markdown (e.g. ATX setext headings, 4-space list indentation, trailing spaces), switching to Rich and back *will* normalize it. Acceptable cost. Document it in the spec's Limitations section.

---

## 2. UI Layout — Rich Mode

### 2.1 ASCII mockup — desktop

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║ [💾 Save]  [ Source │Rich│ Preview │ Diff ]                          [⟳] [⎋] ║ ← existing toolbar
╠═══════════════════════════════════════════════════════════════════════════════╣
║ ⚠ Conflict: file modified externally … [Refresh]                              ║ ← existing banner (unchanged)
╠═══════════════════════════════════════════════════════════════════════════════╣
║ [H1 H2 H3] │ [B I S <>] │ [• 1. "] │ [{ } 🔗] │ [↶ ↷]                         ║ ← NEW rich-mode toolbar
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║    # Welcome to the Editor                                                    ║
║                                                                               ║
║    This paragraph is **bold in the middle** and has *emphasis*.               ║
║                                                                               ║
║    - First bullet                                                             ║
║    - Second bullet                                                            ║
║    │                                                                          ║ ← caret (|)
║                                                                               ║
║    > A blockquote line.                                                       ║
║                                                                               ║
║    ```                                                                        ║
║    const x = 1;                                                               ║
║    ```                                                                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

- Rich toolbar sits **below** the mode bar and **above** the editor content.
- Editor content uses the existing Tailwind `prose dark:prose-invert max-w-none` classes (identical to Preview), so WYSIWYG visually matches Preview for the subset of supported nodes.
- Padding: `px-4 py-3` on the content wrapper.
- Scroll: the editor area scrolls, not the whole page — existing `scrollRef` pattern.

### 2.2 Toolbar grouping (with dividers)

```
Group 1 — Block type:     [H1] [H2] [H3] [¶]
Group 2 — Inline format:  [Bold] [Italic] [Strike] [Code]
Group 3 — Lists/Block:    [UL] [OL] [Quote]
Group 4 — Insert:         [Code Block] [HR] [Link]
Group 5 — History:        [Undo] [Redo]
```

Visual dividers: `className="mx-1 h-5 w-px bg-border"`.

### 2.3 Toolbar button inventory

| ID | Icon (lucide) | Label / tooltip | Action | Shortcut |
|---|---|---|---|---|
| h1 | `Heading1` | Heading 1 | toggle H1 | Cmd+Alt+1 |
| h2 | `Heading2` | Heading 2 | toggle H2 | Cmd+Alt+2 |
| h3 | `Heading3` | Heading 3 | toggle H3 | Cmd+Alt+3 |
| p  | `Pilcrow` | Paragraph | set paragraph | Cmd+Alt+0 |
| bold | `Bold` | Bold | toggle bold | Cmd+B |
| italic | `Italic` | Italic | toggle italic | Cmd+I |
| strike | `Strikethrough` | Strikethrough | toggle strike | Cmd+Shift+X |
| code | `Code` | Inline code | toggle inline code | Cmd+E |
| ul | `List` | Bulleted list | toggle UL | Cmd+Shift+8 |
| ol | `ListOrdered` | Ordered list | toggle OL | Cmd+Shift+7 |
| quote | `Quote` | Blockquote | toggle blockquote | Cmd+Shift+B |
| codeblock | `SquareCode` | Code block | toggle fenced code block | Cmd+Alt+C |
| hr | `Minus` | Horizontal rule | insert `---` | — |
| link | `Link` | Insert/edit link | open link popover | Cmd+K |
| undo | `Undo2` | Undo | history.undo | Cmd+Z |
| redo | `Redo2` | Redo | history.redo | Cmd+Shift+Z |

**Buttons are `<button>` not `<a>` — keyboard-focusable natively, Enter/Space activates.**

Active state (button is pressed when the caret is inside a matching node/mark):
```tsx
<Button
  variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
  size="sm"
  aria-label="Bold"
  aria-pressed={editor.isActive('bold')}
  onClick={() => editor.chain().focus().toggleBold().run()}
  title="Bold (⌘B)"
>
  <Bold className="h-3.5 w-3.5" />
</Button>
```

### 2.4 Disabled-button rules

- When caret is inside a code block: `bold`, `italic`, `strike`, `code` (inline), `link`, `h1/2/3` — all disabled. Reason: markdown doesn't support marks inside fenced code.
- When editor is empty: `undo`, `redo` disabled (history extension handles this).
- When no text is selected AND button requires selection (`link` does not — it can insert): — no disable (Tiptap handles gracefully).

Disabled style: `disabled:opacity-40 disabled:pointer-events-none`.

---

## 3. Markdown Input Rules (Type-to-Format)

Tiptap's StarterKit ships with most of these; we enable the full set explicitly so the behavior is documented.

| User types (at right position) | Triggers | Final state |
|---|---|---|
| `# ` at line start | input rule | H1 of remaining line |
| `## ` | " | H2 |
| `### ` | " | H3 |
| `* ` or `- ` at line start | " | Bulleted list item |
| `1. ` at line start (any digit) | " | Ordered list item, starting at typed number |
| `> ` at line start | " | Blockquote |
| ` ``` ` at line start (three backticks) | " | Code block (empty) |
| `---` on an otherwise empty line + Enter | " | Horizontal rule |
| `**bold**` or `__bold__` | inline input rule | **bold** |
| `*italic*` or `_italic_` | " | *italic* |
| `~~strike~~` | " | ~~strike~~ |
| `` `code` `` | " | `code` |
| `[text](url)` | " | link |

**Markdown shortcut edge cases**:
- Typing `# ` inside an existing paragraph at cursor position mid-line → does NOT convert (only at line start). This matches Obsidian and Bear behavior.
- Typing `* ` inside a bulleted list item at position 0 → converts to nested list (Tiptap's `sinkListItem`), not a fresh bulleted list. Intuitive.
- `Shift+Enter` inside paragraph → `<br>` (markdown: two trailing spaces + newline). Plain `Enter` creates a new paragraph.

**Delete-to-undo the transformation**: pressing Backspace immediately after an input-rule fires undoes the transformation, leaving the typed text. E.g. type `# `, see H1; press Backspace — reverts to `# ` in a paragraph. Tiptap gives this for free.

---

## 4. Keyboard Shortcuts — Full Table

| Shortcut | Action | Notes |
|---|---|---|
| ⌘B / Ctrl+B | Toggle bold | |
| ⌘I / Ctrl+I | Toggle italic | |
| ⌘Shift+X | Toggle strikethrough | |
| ⌘E | Toggle inline code | |
| ⌘Alt+0 | Paragraph | |
| ⌘Alt+1 | H1 | |
| ⌘Alt+2 | H2 | |
| ⌘Alt+3 | H3 | |
| ⌘Shift+8 | Bulleted list | |
| ⌘Shift+7 | Ordered list | |
| ⌘Shift+B | Blockquote | |
| ⌘Alt+C | Code block | |
| ⌘K | Open link popover | see § 5 |
| ⌘Z | Undo | |
| ⌘Shift+Z / Ctrl+Y | Redo | |
| Tab (in list item) | Sink list item (indent) | Tiptap default |
| Shift+Tab (in list item) | Lift list item (outdent) | Tiptap default |
| Enter | Split block / exit list | Tiptap default |
| Shift+Enter | Hard line break | |
| **⌘S / Ctrl+S** | **Save file** | **bubbles to parent via existing `handleEditModeKeyDownCapture`** |
| Esc (in link popover) | Close popover | |

**⌘S specifics** — The existing `handleEditModeKeyDownCapture` on `FileViewerPanel` (file-viewer-panel.tsx:135) handles `mode === 'edit'`. We extend the guard:

```diff
- if (mode !== 'edit' || ...) return;
+ if ((mode !== 'source' && mode !== 'rich') || ...) return;
```

and it keeps working because `currentContent = editContent ?? content ?? ''` is the latest markdown regardless of which editor produced it.

---

## 5. Link Insertion UX

### 5.1 Flow

1. User presses ⌘K **or** clicks the Link button.
2. A popover appears anchored to the caret position.
3. Popover has two inputs: `Text` (auto-filled from selection) and `URL` (focused on open).
4. If no selection existed and the user typed only a URL, the URL becomes both text and href.
5. Enter confirms; Esc cancels.

### 5.2 Popover layout — desktop

```
┌──────────────────────────────────┐
│ 🔗 Insert link                   │
│                                  │
│ Text:  [Claude Code       ]      │
│ URL:   [https://…         ]      │
│                                  │
│            [Cancel] [Insert]     │
└──────────────────────────────────┘
```

### 5.3 Editing an existing link

When the caret is inside an existing link, pressing ⌘K (or clicking Link) opens the popover pre-filled with current `Text` and `URL`, and adds an **Unlink** button:

```
┌──────────────────────────────────┐
│ 🔗 Edit link                     │
│                                  │
│ Text:  [Existing text     ]      │
│ URL:   [https://existing  ]      │
│                                  │
│  [Unlink]  [Cancel] [Update]     │
└──────────────────────────────────┘
```

### 5.4 Mobile

On viewports narrower than `md` (≤ 768 px), the popover becomes a bottom-sheet using the existing `Drawer` / `Sheet` component from shadcn. Keyboard auto-focuses the URL field; `enter` submits.

### 5.5 URL sanitation

- Strip leading/trailing whitespace.
- If URL has no scheme (no `://`), prepend `https://`. Allow exceptions: `mailto:`, `/relative/path`, `#anchor`, `./file.md`.
- Reject `javascript:` schemes — Tiptap's link extension does this by default via `protocols` allow-list.

---

## 6. Visual Styling

### 6.1 Prose classes on editor content

```tsx
editorProps: {
  attributes: {
    class: 'prose dark:prose-invert max-w-none focus:outline-none px-4 py-3 min-h-full',
  }
}
```

- Same `prose` Tailwind utility used by the Preview mode → Rich and Preview look visually identical for supported nodes (minus Mermaid/Shiki).
- `focus:outline-none` because Tiptap renders a `contenteditable` div; we suppress the browser ring and use a container ring instead (see § 6.3).
- `min-h-full` lets the editor fill the available scroll container so clicking below the last paragraph still focuses the editor.

### 6.2 Placeholder (empty state)

Use `@tiptap/extension-placeholder`. Shows grey text when doc is empty:

```
"Start writing…"
```

Specifically, the placeholder appears in the empty first paragraph. CSS:

```css
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  float: left;
  height: 0;
}
```

### 6.3 Focus ring

Wrap the editor in `<div className="rounded-sm ring-0 focus-within:ring-2 focus-within:ring-ring">` so keyboard focus is visible at the container level.

### 6.4 Theme sync

```tsx
const { resolvedTheme } = useTheme();
// Pass through via class:
<div className={cn('tiptap-wrapper', resolvedTheme === 'dark' && 'dark')}>
```

`prose dark:prose-invert` then picks up the right variant automatically, matching the existing preview pipeline. No custom Tiptap theme required.

### 6.5 Caret and selection colors

Inherit browser defaults; don't override. The existing `active-line` yellow highlight from CodeMirror does NOT apply here — that was a CodeMirror-specific affordance for search navigation. Rich mode has no equivalent concept.

---

## 7. Special-content Handling (Rich Mode)

### 7.1 Code blocks

- Displayed as `<pre><code>` with plain monospace font, `bg-muted` background, `rounded`, `p-3`.
- **No live syntax highlighting** in Rich mode — Shiki runs server-side and lighting it up in-editor would add ~100+ KB and require theme synchronization work. If a user wants to see highlighted code, they use Preview mode.
- Language: Tiptap's code-block extension stores a `language` attr; we ignore it visually for MVP but preserve it on save (so `` ```python `` round-trips correctly).
- A small, plain pill in the top-right of the code block showing the language (`python`) is a nice-to-have for MVP. If included, it's read-only in v1. Edit the language by switching to Source mode.

### 7.2 Mermaid blocks

- Treated as a code block with language `mermaid`. Same plain-monospace display in Rich mode; no diagram preview.
- Preserved on save. User must switch to Preview to see the rendered diagram. This matches Obsidian's "Source mode" behavior.

### 7.3 Inline HTML

- Tiptap's markdown extension preserves raw HTML by default (`html: true` option). In Rich mode it renders as-is (which may look weird for unsupported tags).
- **Decision**: for MVP, we enable HTML pass-through but don't advertise it. If a file has `<details>`, `<kbd>`, `<br>` — they survive round-trip. Anything more complex (tables written as HTML, custom components) users should edit in Source mode.

### 7.4 Images

- Markdown `![alt](url)` is **preserved but not interactable** in Rich mode. They render inline (Tiptap's default image extension handles this if we enable it).
- No image upload. No drag-drop. Pasting an image → discarded with a toast `"Image pasting not supported — use Markdown syntax in Source mode"`.
- Open question: include `@tiptap/extension-image` in MVP for display only? Defer to spec.

### 7.5 Tables

- **Not supported in MVP.** Tables in the source file will round-trip as raw markdown text (which Tiptap will wrap in a paragraph and break). To avoid corruption: when parsing markdown that contains table syntax, **either** (a) show a warning banner and recommend Source mode, or (b) parse tables as fenced raw blocks that Rich mode treats as immutable.
- **Recommended for spec**: option (a) — show a one-time warning "This file contains tables, which aren't supported in Rich mode. Switching to Rich may affect table formatting." Leave the user in Source mode by default.

---

## 8. Paste Behavior

| Paste source | Behavior |
|---|---|
| Plain text with markdown syntax (e.g. from another editor) | Parse as markdown via Tiptap's markdown paste handler. |
| Plain text with no markdown | Insert as text. |
| Rich HTML (from a webpage) | Tiptap's default HTML → doc converter. Unsupported nodes (tables, images) are stripped or reduced. |
| File/image | Discarded. Toast: "Image pasting not supported yet." |
| Clipboard from VS Code with formatting | Usually pasted as plain text with whitespace preserved. Works fine. |

Configure Tiptap with `handlePaste` or use the markdown extension's `transformPastedHTML` hook to route cleanly. No custom paste UI.

---

## 9. Undo / Redo

- Tiptap's StarterKit ships `@tiptap/extension-history` — enabled by default.
- Undo boundaries: typing a character within the same word merges into one undo step; format toggles, paste operations, and Enter/newline each create fresh boundaries.
- Depth: default 100 steps.
- Undo after mode switch: **undo does NOT cross mode boundaries.** Switching Source → Rich and hitting Ctrl+Z in Rich will undo Rich-mode edits only. Rationale: different undo stacks in different editors; trying to unify would be surprising.

---

## 10. Loading & Error States

### 10.1 Lazy loading

```tsx
const MarkdownWysiwygEditor = lazy(() =>
  import('./markdown-wysiwyg-editor').then((m) => ({ default: m.MarkdownWysiwygEditor }))
);
```

While loading, show the same skeleton as CodeEditor:

```tsx
<div className="animate-pulse rounded bg-muted p-4 h-64" />
```

### 10.2 Initialization failure

If Tiptap fails to initialize (rare — e.g., malformed markdown that crashes the parser), the component catches the error and renders a fallback:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Rich mode couldn't load this file.                    │
│                                                         │
│ [Switch to Source mode]                                 │
│                                                         │
│ Details: [error message]                                │
└─────────────────────────────────────────────────────────┘
```

Clicking "Switch to Source mode" calls `onModeChange('source')`.

### 10.3 Save in progress

No visual change — the existing toolbar Save button keeps its default style. If we want to add a spinner later (not MVP), it goes on the Save button directly.

---

## 11. Mobile Adaptation

### 11.1 Toolbar overflow

On narrow viewports the toolbar horizontally scrolls inside its container:

```
│ [H1][H2][H3]│[B][I][S][<>]│[•][1.]["]│…   ← swipeable, no squish
```

```tsx
<div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar px-2 py-1 border-b">
  {/* buttons */}
</div>
```

No "compact" hiding. Every button must be reachable — a mobile user editing a doc shouldn't lose H3 because of a menu we didn't build.

### 11.2 Touch targets

Buttons: `min-h-9 min-w-9` (36 px), matching shadcn's `size="sm"` with a small tweak. Meets WCAG 2.5.5 target size.

### 11.3 Link popover on mobile

Use the shadcn `Drawer` (bottom-sheet) instead of `Popover`. Keyboard pushes content up; `enter` key on URL field submits. Autofocus the URL field.

### 11.4 Context menu / selection bubble

**Not MVP.** iOS/Android select handles and native context menu work inside `contenteditable`. We don't intercept. (Apple's "BIU" popup still appears on iOS for bold/italic/underline, which is fine — Tiptap's default keymap handles ⌘B.)

### 11.5 Plan 078 swipe navigation

Plan 078 added full-screen swipe between views on phone viewports. **Concern**: swiping inside the editor conflicts with text selection drag. Existing fix pattern (there is one — check `apps/web/src/features/swipe-*` if it exists) should be honored — the editor area must call `stopPropagation` or set `data-prevent-swipe` on the swipe handler's root. Verify during implementation; flag as a test case.

---

## 12. Accessibility

| Concern | Implementation |
|---|---|
| Toolbar buttons labeled | `aria-label="Bold"` + `title="Bold (⌘B)"` on every button |
| Toggle state | `aria-pressed={editor.isActive(…)}` |
| Disabled state | `disabled` HTML attr when unavailable (do NOT also set `aria-disabled` — see correction below) |
| Toolbar container | `role="toolbar"` + `aria-label="Formatting toolbar"` for semantic grouping |
| Editor semantics | Tiptap renders `<div contenteditable="true">` with `role="textbox" aria-multiline="true"` by default |
| Focus visible | Focus ring on the editor container, not suppressed |
| Keyboard navigation | All buttons reachable via Tab; Shift+Tab goes backward |
| Screen reader | Each format toggle announces pressed/unpressed via `aria-pressed` |
| Color contrast | Inherit from theme; `prose-invert` palette passes AA in dark mode |

**Known gap**: the editor's internal node structure isn't announced as a document outline (H1/H2/H3 are just styled `<h1>` etc., which screen readers handle correctly). Full landmarks/outline-nav support is future work; not MVP.

### Corrections

| Date | Section | Correction | Source |
|------|---------|------------|--------|
| 2026-04-18 | § 12 row "Disabled state" | Original draft recommended `aria-disabled` AND `disabled` together. The dual-attribute pattern is an anti-pattern: `disabled` is both semantic and accessible (screen readers announce unavailable; element is removed from tab order — correct for context-dependent disabled states), so `aria-disabled` is redundant and can create conflicting signals. Use `disabled` alone. | Phase 2 dossier validation (Completeness lens) — see `tasks/phase-2-toolbar-shortcuts/tasks.md` § Validation Record |
| 2026-04-18 | § 12 (new row) | Added `role="toolbar"` + `aria-label="Formatting toolbar"` on the toolbar container. Originally omitted; screen readers would otherwise iterate 16 buttons with no semantic grouping. | Phase 2 dossier validation (Completeness lens) — same record |

---

## 13. Round-trip Fidelity Rules

The central promise: **what a user saves in Rich mode must re-open in Source mode as valid, semantically-equivalent markdown.** Not byte-identical — semantically equivalent.

### 13.1 Preserved exactly (round-trip bit-for-bit for un-edited content)

If the user opens a `.md` file in Rich mode and saves WITHOUT editing, the file on disk is unchanged. Implementation: when `editContent === content && !editor.state.doc.hasChanged`, skip the save. (Or: don't round-trip through Tiptap unless the user actually typed.)

### 13.2 Preserved semantically (normalized but equivalent)

Edits in Rich mode normalize these (acceptable):

| Source | May become |
|---|---|
| ATX headings `# H` | ATX headings (no change) |
| Setext headings `H\n===` | ATX headings `# H` |
| Mixed `*` and `-` list markers | Consistent marker (Tiptap decision) |
| 4-space list indent | 2-space indent |
| Trailing whitespace | Stripped |
| Tabs | Spaces (2) |
| Emphasis: `_italic_` | `*italic*` |
| Bold: `__bold__` | `**bold**` |
| Ordered list `5.` start | Preserved if the markdown extension supports `start` attr |
| Autolinks `<https://…>` | `[https://…](https://…)` |
| Reference-style links `[text][ref]` | Inline `[text](url)` |

### 13.3 NOT preserved by Rich mode (edit in Source)

| Feature | Fate if edited in Rich |
|---|---|
| Tables (GFM) | Likely corrupted → warn user, recommend Source |
| Footnotes `[^1]` | Not supported → text-only leak |
| Definition lists | Not supported |
| HTML blocks beyond `<br>`, `<kbd>`, `<details>` | Preserved as raw text but uneditable |
| YAML front-matter `---\nkey: val\n---` at top | **Must be preserved**. Current `.md` files in this repo include front-matter for some docs. Strategy: extract front-matter before Tiptap parses; re-attach on save. Implementation detail — flag as a spec requirement. |
| Comments `<!-- … -->` | Preserved as HTML pass-through |

### 13.4 Front-matter handling

**Critical**: some `.md` files in this repo have YAML front-matter (research dossiers, specs). Tiptap's markdown extension doesn't know about front-matter.

**Design**:
```
On entering Rich mode:
  if content starts with /^---\n/:
    splitAt = indexOfSecondClosingFence('\n---\n')
    frontMatter = content.slice(0, splitAt + 4)   // "---\n…\n---\n"
    body = content.slice(splitAt + 4)
    editor.load(body)
    rememberFrontMatter(frontMatter)

On serializing:
  return frontMatter + editor.getMarkdown()
```

Same logic in reverse on Source ↔ Rich transitions. Safeguard: if the trailing fence isn't found in the first 200 lines, treat it as body (no front-matter). Validate with tests.

### 13.5 Round-trip test corpus

Three files exercise the rules above; each must survive Source → open → switch to Rich → switch back to Source → save:

1. `docs/plans/083-md-editor/research-dossier.md` (this plan's own dossier) — exercises tables, front-matter? (no front-matter but lots of tables → must warn user).
2. `docs/adr/<pick-one>.md` — exercises ADR structure, often has front-matter.
3. A simple plan spec — mostly prose + headings, lists, blockquotes.

Automated round-trip: snapshot test that opens each file, enters Rich, exits, and diffs. Tolerate whitespace changes; fail on structural changes. List these in the spec's Acceptance Criteria.

---

## 14. Edge Cases

| Case | Behavior |
|---|---|
| Empty file | Placeholder "Start writing…" visible. Single empty paragraph. |
| File with only whitespace | Treated as empty. |
| File with only front-matter, no body | Placeholder shows below an imaginary dividing rule (or just empty paragraph). |
| Very long file (e.g., 10k lines) | Tiptap handles large docs reasonably but will be slower than CodeMirror. Mitigation: do not load Rich mode by default; user must opt in. If perf is a problem, gate Rich mode behind `content.length < 100_000`. |
| File open, user switches workspaces or file | Existing `key={filePath}` pattern on editor component forces remount — editor state resets cleanly. |
| External change while in Rich mode | Existing `externallyChanged` banner shows "This file was modified outside the editor" — unchanged. User refreshes to reload. |
| Conflict on save (mtime mismatch) | Existing conflict banner shows — unchanged. |
| Network save failure | Existing error UI — unchanged. |
| User types `#` and pauses, no space | No conversion yet — waits for space. |
| User selects across code-block boundary and presses Bold | Tiptap's `isActive('bold')` returns false; `toggleBold` applies only to non-code-block portions (Tiptap handles this). |
| User pastes 5 MB of text | Same 5 MB file-size read limit on the server side. Editor doesn't impose a limit, but saves will fail via existing server error path. |
| File has Windows line endings | Tiptap normalizes to `\n` on parse. On serialize, output is `\n`. Existing server code does not re-insert `\r\n` — acceptable, consistent with Source mode today. |

---

## 15. Component API

### 15.1 `<MarkdownWysiwygEditor />` — new component

```tsx
// apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx
'use client';

export interface MarkdownWysiwygEditorProps {
  /** Current markdown text (may include front-matter). */
  value: string;
  /** Called when the user edits; receives full markdown including front-matter. */
  onChange: (markdown: string) => void;
  /** Show placeholder when empty. */
  placeholder?: string;
  /** Read-only (not MVP, but shape supports it). */
  readOnly?: boolean;
}

export function MarkdownWysiwygEditor({ value, onChange, placeholder, readOnly }: MarkdownWysiwygEditorProps): JSX.Element;
```

Internally handles front-matter split/rejoin, theme sync, placeholder extension, markdown extension, history extension, input rules.

### 15.2 `<WysiwygToolbar />` — separate component

```tsx
export interface WysiwygToolbarProps {
  editor: Editor | null;   // Tiptap editor instance from useEditor()
  onOpenLinkDialog: () => void;
}
```

Pure, stateless (reads state from `editor`). Renders the 16 buttons + 4 dividers. Re-renders on every editor transaction via Tiptap's `useEditor`'s update subscription.

### 15.3 Integration into `FileViewerPanel`

```diff
- export type ViewerMode = 'edit' | 'preview' | 'diff';
+ export type ViewerMode = 'source' | 'rich' | 'preview' | 'diff';

  // ...
  {mode === 'source' && <CodeEditor … />}
+ {mode === 'rich' && isMarkdown && (
+   <div className="flex flex-col flex-1 min-h-0">
+     <WysiwygToolbar editor={editor} onOpenLinkDialog={…} />
+     <div className="flex-1 min-h-0 overflow-auto">
+       <MarkdownWysiwygEditor value={currentContent} onChange={onEditChange} />
+     </div>
+   </div>
+ )}
  {mode === 'preview' && …}
  {mode === 'diff' && …}
```

Callers of `FileViewerPanel` must migrate `'edit'` → `'source'` for type-check to pass — one-line change per call site, checked via TypeScript.

---

## 16. Open Questions

### Q1: Replace `edit` with `source`, or keep `edit` and add `rich`?

**RESOLVED**: Rename `edit` → `source`. "Edit" becomes ambiguous with two editors. TypeScript enforces all call sites migrate. Worth the churn.

### Q2: Default mode for `.md` files on first open?

**RESOLVED**: Keep **Source** as default. Rich is opt-in. Future user preference can flip this; not MVP.

### Q3: Include link-editing in MVP, or defer?

**RESOLVED**: Include. Links are too common to leave out — a markdown editor without link insertion feels incomplete.

### Q4: Syntax-highlighted code blocks in Rich mode?

**RESOLVED**: No. Plain monospace in Rich; Shiki only in Preview. Saves ~100 KB bundle and avoids theme-sync complexity.

### Q5: Image display in Rich mode?

**OPEN**: Inline-display only (no upload/drag) via `@tiptap/extension-image`.
- **Pro**: Visual parity with Preview for files that use images.
- **Con**: Broken relative paths look ugly; the Preview pipeline has image-URL rewriting that Rich mode wouldn't replicate.
- **Leaning**: defer. Images stay as `![alt](url)` source text in Rich mode for MVP.

### Q6: Table handling — warn banner, Source-only lock, or parse-and-preserve?

**OPEN**: Leaning toward **warn banner + allow Rich**. On opening a table-containing file in Rich mode, show a dismissible banner: *"This file has tables. Edit those in Source mode — Rich mode may reformat them."* Don't block, don't prevent — users who only want to edit text above/below the table shouldn't be forced to Source. The warning sets expectations.

### Q7: Placeholder text for empty doc?

**OPEN**: `"Start writing…"` is fine. Could be filename-aware (`Start writing README.md…`) — tiny bit of polish, low cost.

### Q8: Does `AgentEditor` (plan 058) also get Rich mode?

**RESOLVED**: **No, not in MVP.** Agent prompts often contain `{{template_vars}}` and control-flow hints (`// INSTRUCTION:`) that a WYSIWYG editor would hide or mis-render. Keep AgentEditor on CodeMirror. Revisit if user feedback demands it.

### Q9: Should Rich mode be gated by file size?

**OPEN**: Suggest a soft ceiling of 200 KB (or ~5000 lines). Above that, show a tooltip on the Rich button: *"File too large for Rich mode"* and keep it disabled. Tiptap handles large docs but the UX degrades.

### Q10: Undo behavior across mode switches?

**RESOLVED**: Undo does NOT cross modes. Each editor has its own history. Switching mode clears the undo stack of the newly-activated editor (fresh doc parse = new history). Document in the spec's Limitations.

---

## 17. Quick Reference — "Keep this open while implementing"

### Toolbar — in order

```
[H1]·[H2]·[H3]·[¶]  │  [B]·[I]·[S]·[<>]  │  [UL]·[OL]·["]  │  [{}]·[—]·[🔗]  │  [↶]·[↷]
```

### Shortcuts cheatsheet

```
Formatting:  ⌘B  bold     ⌘I  italic    ⌘Shift+X  strike    ⌘E  inline code
Blocks:      ⌘Alt+1/2/3  H1/H2/H3     ⌘Alt+0  paragraph     ⌘Alt+C  code block
Lists:       ⌘Shift+8  UL        ⌘Shift+7  OL        ⌘Shift+B  blockquote
Link:        ⌘K  open popover
History:     ⌘Z  undo     ⌘Shift+Z  redo
Save:        ⌘S  (unchanged; existing pipeline)
```

### Input rules cheatsheet

```
# / ## / ### space          → H1 / H2 / H3
- space  OR  * space         → bullet
1. space                      → ordered list (any digit)
> space                       → blockquote
``` + enter                   → code block
---  + enter                  → horizontal rule
**text**  /  __text__         → bold
*text*  /  _text_             → italic
~~text~~                      → strike
`text`                        → inline code
[text](url)                   → link
```

### Tiptap extension list (MVP)

```
@tiptap/starter-kit            // paragraph, heading, bold, italic, strike, code, codeBlock, blockquote, lists, hr, history, dropcursor, gapcursor
@tiptap/extension-link         // link mark with popover
@tiptap/extension-placeholder  // empty-state text
@tiptap/markdown               // markdown <-> doc conversion
```

Bundle target: **≤ 120 KB gzipped** total, lazy-loaded.

### Files to create

```
apps/web/src/features/_platform/viewer/components/
  markdown-wysiwyg-editor.tsx   (new, 'use client')
  markdown-wysiwyg-toolbar.tsx  (new, 'use client')
  link-popover.tsx              (new, 'use client')
```

### Files to modify

```
apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx
  - Add 'rich' to ViewerMode union
  - Rename 'edit' → 'source' in this file + all callers (TypeScript will list them)
  - Wire rich-mode branch (see § 15.3)
  - Extend keyboard-save guard to cover 'rich'
apps/web/src/hooks/useMarkdownViewerState.ts  (or wherever mode state is owned)
  - Update mode union + persistence
```

### Acceptance criteria (for the spec to formalize)

- [ ] Typing `# Hello` shows a rendered H1 immediately
- [ ] Toolbar Bold/Italic/Strike/Code/H1/H2/H3 all toggle correctly with keyboard shortcuts AND mouse
- [ ] Round-trip: opening the three corpus files, entering Rich, exiting without edits → file unchanged on disk
- [ ] Round-trip after edit: opening a plain-prose `.md`, adding a bold word in Rich, saving → diff shows only the expected change
- [ ] Front-matter preserved exactly across mode switches
- [ ] ⌘S saves from both Source and Rich
- [ ] Conflict banner, externally-changed banner, refresh, pop-out all still work in Rich
- [ ] Mobile: toolbar scrolls horizontally; link popover opens as bottom-sheet
- [ ] Dark mode: Rich view matches Preview visually for supported nodes
- [ ] Lazy load verified: Rich bundle not loaded until user clicks `Rich` button
- [ ] Tiptap init failure falls back with "Switch to Source mode" banner

---

## 18. Out of Scope (Explicit)

- Image upload / drag-drop / paste
- Table editing (rows/columns UI)
- Footnote, definition-list, custom-container syntax editing
- Collaborative / multi-user editing
- Comment / annotation overlays
- Spell check beyond browser default
- Custom syntax highlighting in Rich code blocks
- AI-assisted writing (rewrite, summarize)
- PDF / Word / HTML export
- Per-user default-mode setting
- Full document outline / TOC sidebar
- Find-and-replace in Rich mode (use Source)
