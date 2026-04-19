# Domain: Viewer

**Slug**: _platform/viewer
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from existing codebase (Plan 006-web-extras)
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/viewer.md)

## Purpose

Reusable rendering primitives for displaying code, markdown, and git diffs. Provides syntax-highlighted code display (Shiki server-side), markdown preview with mermaid support, and split/unified diff viewing. Built as headless-first components with separated state hooks — any feature can compose these viewers without coupling to specific UI patterns.

## Boundary

### Owns
- Code display component (FileViewer — read-only, keyboard nav, line numbers)
- Markdown rendering (MarkdownViewer + MarkdownServer — source/preview toggle, mermaid)
- Diff display (DiffViewer — split/unified modes via @git-diff-view/react)
- Code block routing (CodeBlock — mermaid vs syntax-highlighted)
- Shiki syntax highlighting (server-side singleton, 30+ languages, dual themes)
- Language detection utility (`detectLanguage(filename)`)
- Headless state hooks (useFileViewerState, useMarkdownViewerState, useDiffViewerState)
- ViewerFile interface and DiffError types
- highlight server action (highlightCodeAction)

### Does NOT Own
- CodeMirror editor (editing is `file-browser` domain concern)
- Git diff DATA fetching (getGitDiff action — viewer receives diff string as prop)
- File reading / file system operations — that's `_platform/file-ops`
- Page routing or URL state — viewers are embedded in pages, not routed themselves

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `FileViewer` | Component | file-browser, demo pages | `<FileViewer file={ViewerFile} highlightedHtml={string} />` |
| `MarkdownViewer` | Component | file-browser, demo pages | `<MarkdownViewer file={ViewerFile} />` with source/preview toggle |
| `DiffViewer` | Component | file-browser, demo pages | `<DiffViewer diffData={string} />` with split/unified modes |
| `highlightCodeAction()` | Server action | Server Components needing highlighted HTML | `(code, lang) → Promise<string>` (HTML) |
| `detectLanguage()` | Function | Shiki, CodeMirror, any language-aware component | `(filename) → string` language ID |
| `ViewerFile` | Interface | All viewer consumers | `{ path, filename, content }` |
| `DiffError` | Type | DiffViewer consumers | `'not-git' \| 'no-changes' \| 'git-not-available' \| null` |
| `detectContentType()` | Function | file-browser | `(filename) → { category, mimeType }` |
| `isBinaryExtension()` | Function | file-browser | `(filename) → boolean` |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `FileViewer` | Code display with line numbers | `useFileViewerState`, highlighted HTML (prop) |
| `MarkdownViewer` | Markdown source/preview | `useMarkdownViewerState`, `MarkdownServer`, `FileViewer` |
| `MarkdownServer` | Server-side markdown rendering | `react-markdown`, `@shikijs/rehype`, `CodeBlock` |
| `CodeBlock` | Mermaid/code routing for markdown | `MermaidRenderer`, Shiki |
| `DiffViewer` | Git diff display | `useDiffViewerState`, `@git-diff-view/react`, `@git-diff-view/shiki` |
| `shiki-processor` | Server-side syntax highlighter | `shiki` (npm), lazy singleton |
| `detectLanguage()` | File extension → language mapping | Nothing (pure function) |
| Headless hooks | State management | `viewer-state-utils` base factory |

## Source Location

Primary: `apps/web/src/components/viewers/` + `apps/web/src/lib/server/` + `apps/web/src/hooks/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/components/viewers/file-viewer.tsx` | FileViewer component | Client Component |
| `apps/web/src/components/viewers/markdown-viewer.tsx` | MarkdownViewer component | Client Component |
| `apps/web/src/components/viewers/diff-viewer.tsx` | DiffViewer component | Client Component |
| `apps/web/src/components/viewers/code-block.tsx` | CodeBlock (mermaid routing) | Client Component |
| `apps/web/src/components/viewers/markdown-server.tsx` | Server-side markdown | Server Component |
| `apps/web/src/lib/server/shiki-processor.ts` | Shiki highlighter singleton | Server-only |
| `apps/web/src/lib/server/highlight-action.ts` | highlight server action | Server Action |
| `apps/web/src/lib/language-detection.ts` | detectLanguage() | Pure function |
| `apps/web/src/lib/viewer-state-utils.ts` | Shared base state | Pure function |
| `apps/web/src/hooks/useFileViewerState.ts` | FileViewer state hook | Client hook |
| `apps/web/src/hooks/useMarkdownViewerState.ts` | MarkdownViewer state hook | Client hook |
| `apps/web/src/hooks/useDiffViewerState.ts` | DiffViewer state hook | Client hook |
| `packages/shared/src/interfaces/viewer.interface.ts` | ViewerFile interface | Shared type |
| `packages/shared/src/interfaces/diff.interface.ts` | DiffError type | Shared type |
| `apps/web/src/lib/content-type-detection.ts` | detectContentType + isBinaryExtension | Content type detection |

## Dependencies

### This Domain Depends On
- `shiki` (npm) — syntax highlighting engine
- `react-markdown` + `@shikijs/rehype` — markdown rendering
- `@git-diff-view/react` + `@git-diff-view/shiki` — diff rendering
- `_platform/file-ops` — indirectly (Shiki reads files server-side)

### Domains That Depend On This
- `file-browser` — integrates FileViewer, MarkdownViewer, DiffViewer in the viewer panel
- Demo pages (Plan 006) — showcase viewer capabilities

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 006-web-extras | Built all viewer components (Phases 1-5) | 2026-02 (prior) |
| *(extracted)* | Domain extracted from Plan 006 deliverables | 2026-02-24 |
| Plan 083-md-editor / Phase 1 | Added `MarkdownWysiwygEditor` (Tiptap) + lazy wrapper; added shared `resolveImageUrl` utility in `lib/image-url.ts` consumed by both Preview and Rich surfaces; added `lib/wysiwyg-extensions.ts` type module. Full Owns/Composition/Concepts alignment and stale "Does NOT Own: CodeMirror" correction deferred to Phase 6.8. | 2026-04-18 |
| Plan 083-md-editor / Phase 2 | Added `WysiwygToolbar` client component + `lib/wysiwyg-toolbar-config.ts` (5 groups / 16 actions); extended `MarkdownWysiwygEditorProps` with additive `onEditorReady?(editor)` callback (Phase 1 editor now exposes its Tiptap `Editor` instance for sibling composition); shipped scoped placeholder CSS (`.md-wysiwyg .ProseMirror p.is-editor-empty:first-child::before` in `globals.css`); extended dev smoke route + harness spec (desktop + tablet green, Bold/H2 click + `Mod-Alt-C` chord verified). | 2026-04-18 |
| Plan 083-md-editor / Phase 3 | Added `LinkPopover` client component (desktop Popover `modal={true}` + mobile Sheet `side="bottom"`, anchored via Radix `PopoverAnchor virtualRef` to the toolbar Link button) + `lib/sanitize-link-href.ts` pure utility (allow-list http/https/mailto, `javascript:*`/data/vbscript/file rejected, evasion vectors incl. `\t`/`\n`/`\r` embeds + `%XX` + fullwidth Unicode guarded). Extended `MarkdownWysiwygEditorProps` with optional `onOpenLinkDialog?` + wired `TiptapLink.configure({ isAllowedUri }).extend({ addKeyboardShortcuts: 'Mod-k' })` (defense-in-depth gate at the Tiptap layer in addition to the popover-layer sanitizer). Extended `WysiwygToolbarProps` with optional `linkButtonRef` for Radix anchor. 87/87 unit tests green (26 sanitize + 13 popover + 3 editor new — TDD RED→GREEN for sanitize). Harness smoke: desktop + tablet green; 8 new assertions covering every didyouknow-v2 insight (popover anchor, selection pre-fill, parenthesized URL round-trip, Mod-k swallow while open, focus-return split by open path). Mobile deferred to Phase 6.4. | 2026-04-19 |
| Plan 083-md-editor / Phase 4 | Added three pure-utility modules — `lib/markdown-frontmatter.ts` (`splitFrontMatter`/`joinFrontMatter` — BOM + CRLF tolerant, 500-line scan cap, setext-`---`-in-body safe, forward + reverse round-trip invariant documented in JSDoc); `lib/markdown-has-tables.ts` (`hasTables` — GFM detector with fence-type pairing so ``` inside ~~~ correctly stays fenced, rejects 4-space-indented tables as CommonMark code blocks, accepts alignment colons); `lib/rich-size-cap.ts` (`RICH_MODE_SIZE_CAP_BYTES = 200_000` with decimal-KB-not-KiB disambiguation JSDoc + `exceedsRichSizeCap` via `TextEncoder`). Wired the fm codec into `markdown-wysiwyg-editor.tsx`, replacing the Phase 1 passthrough stubs; added a lifecycle-safety test that mounts fm-bearing content, triggers a real edit via `editor.commands.insertContent`, and asserts the emitted onChange starts with the original front-matter — closes the silent-data-loss path that pure unit tests cannot detect (Finding 03, FC-validator Issue 4). Extended barrel with 5 new exports consumed by Phase 5. 148/148 unit tests green (59 new: 34 frontmatter + 18 has-tables + 7 rich-size-cap). Harness smoke: desktop + tablet green with new fm-round-trip assertions proving end-to-end fm preservation through a real edit. | 2026-04-19 |
| Plan 041 Phase 4 | Extracts `detectLanguage()` as shared utility (DYK-P4-05), integrates viewers in file browser | 2026-02-24 |
| Plan 046 | Added detectContentType() and isBinaryExtension() content type utilities | 2026-02-24 |
