# Markdown WYSIWYG Editor — User Guide

The Rich editing mode lets you write and format markdown in a visual editor, without leaving the file browser. Click the **Rich** button in the mode bar to switch from Source (CodeMirror) to WYSIWYG.

## Source vs Rich — When to Pick Each

| Use **Rich** when… | Use **Source** when… |
|---------------------|----------------------|
| Writing prose (docs, READMEs, specs) | Editing config files, YAML, JSON |
| You want visual formatting feedback | You need exact whitespace control |
| Adding bold, italic, headings, lists | Working with code or data files |
| The file is under 200 KB | The file exceeds 200 KB (Rich auto-disables) |

**Default mode is Source.** Rich mode is an opt-in for markdown files only.

## Toolbar Reference

The Rich toolbar provides 16 formatting actions across 5 groups:

| Group | Button | Shortcut | Effect |
|-------|--------|----------|--------|
| **Block** | Heading 1 | — | Toggle `# ` heading |
| | Heading 2 | — | Toggle `## ` heading |
| | Heading 3 | — | Toggle `### ` heading |
| | Paragraph | — | Reset to normal paragraph |
| **Inline** | Bold | `⌘B` | Toggle `**bold**` |
| | Italic | `⌘I` | Toggle `*italic*` |
| | Strikethrough | `⌘⇧X` | Toggle `~~strikethrough~~` |
| | Code | `⌘E` | Toggle `` `inline code` `` |
| **List** | Bullet List | `⌘⇧8` | Toggle `- ` list |
| | Ordered List | `⌘⇧7` | Toggle `1. ` list |
| | Blockquote | `⌘⇧B` | Toggle `> ` blockquote |
| **Code** | Code Block | `⌘⌥C` | Toggle fenced code block |
| | Horizontal Rule | — | Insert `---` thematic break |
| **Link** | Link | `⌘K` | Open link insertion popover |
| **History** | Undo | `⌘Z` | Undo last change |
| | Redo | `⌘⇧Z` | Redo last undone change |

## Keyboard Shortcuts

Quick reference:

- `⌘B` — Bold
- `⌘I` — Italic
- `⌘E` — Inline code
- `⌘K` — Insert/edit link
- `⌘⌥C` — Code block
- `⌘⇧8` — Bullet list
- `⌘⇧7` — Ordered list
- `⌘⇧B` — Blockquote
- `⌘⇧X` — Strikethrough
- `⌘Z` / `⌘⇧Z` — Undo / Redo
- `⌘S` — Save (same as Source mode)
- `Tab` / `Shift+Tab` — Navigate toolbar buttons
- `Esc` — Close link popover

## Markdown Input Rules

The editor supports automatic markdown-to-formatting conversion as you type:

- `# ` at line start → Heading 1 (similarly `## `, `### `)
- `- ` or `* ` at line start → Bullet list
- `1. ` at line start → Ordered list
- `> ` at line start → Blockquote
- `` ``` `` at line start → Code block
- `---` on its own line → Horizontal rule

## Round-Trip Caveats

**Unedited files are preserved byte-for-byte.** If you open a file in Rich mode and switch back without editing, the file is untouched — the editor's `onChange` never fires.

**Post-edit, the markdown is semantically equivalent but may differ in formatting:**

- Trailing whitespace may be normalized
- Leading blank lines between front-matter and body may be removed
- HTML characters like `<` may be entity-escaped to `&lt;`
- **Reference-style links** (`[text][1]` with `[1]: url` definitions) are flattened to inline links (`[text](url)`)
- List marker style may normalize (e.g., `*` → `-`)

These are tiptap-markdown serializer behaviours, not bugs. The rendered output is identical.

## Tables + Front-Matter

### Tables

Rich mode **does not include a table editing extension** (to stay within the 130 KB bundle budget). When a file contains GFM tables:

- A **yellow banner** appears warning that tables may be reformatted in Rich mode
- Tables are rendered as plain text paragraphs in the editor
- **Recommendation**: use Source mode for files with important table formatting

### Front-Matter

YAML front-matter (the `---`-delimited block at the top of the file) is:

- **Automatically detected and preserved** — it's split before the editor parses the body and rejoined on every save
- **Not editable in Rich mode** — you won't see it in the editor, but it's always there
- BOM prefixes and CRLF line endings in the front-matter are preserved

## 200 KB Size Cap

Files larger than 200 KB (200,000 bytes) cannot enter Rich mode. The **Rich** button is disabled with a tooltip explaining why. This prevents the Tiptap editor from loading a very large document into a ProseMirror document model, which would be slow and memory-intensive.

Use Source mode for large files — CodeMirror handles them efficiently.

---

**See also**: [_platform/viewer domain](../domains/_platform/viewer/domain.md) | [Plan 083 Spec](plans/083-md-editor/md-editor-spec.md)
