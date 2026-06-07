# Domain: Viewer

**Slug**: _platform/viewer
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from existing codebase (Plan 006-web-extras)
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/viewer.md)
**User Guide**: [Markdown WYSIWYG Editor](../../../how/markdown-wysiwyg.md)

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
- WYSIWYG markdown editor (`MarkdownWysiwygEditor` — Tiptap-backed, lazy-loaded)
- WYSIWYG editor lazy wrapper (`MarkdownWysiwygEditorLazy` — dynamic import boundary)
- WYSIWYG toolbar (`WysiwygToolbar` — 16-button toolbar with active/disabled states)
- Link insertion popover (`LinkPopover` — desktop popover + mobile bottom-sheet)
- WYSIWYG extension types (`wysiwyg-extensions.ts` — type-only module)
- WYSIWYG toolbar config (`wysiwyg-toolbar-config.ts` — action definitions)
- Link URL sanitizer (`sanitize-link-href.ts` — allow-list scheme validation)
- Front-matter codec (`markdown-frontmatter.ts` — `splitFrontMatter` / `joinFrontMatter`)
- Table detection (`markdown-has-tables.ts` — GFM table heuristic)
- Rich mode size cap (`rich-size-cap.ts` — 200 KB threshold)
- Image URL resolver (`image-url.ts` — shared by Preview and Rich)
- Code block language pill (`code-block-language-pill.ts` — internal decoration)
- Extension factory (`build-markdown-extensions.ts` — runtime Tiptap extension builder)

### Does NOT Own
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
| `ImageEditorLazy` | Component | file-browser | `<ImageEditorLazy imageSrc filename onSaveOver onSaveAsNew onCancel />` — lazy (`ssr:false`) pen-annotation canvas editor for raster images |
| `ImageEditorProps` / `ImageSaveOutcome` | Types | file-browser | Editor props; `{ ok; error? }` save-result shape returned from the save callbacks |
| `canvasExportFormat` / `exceedsCanvasLimit` | Functions | file-browser | Canvas export MIME/quality/flatten policy + iOS large-image guard (>4096px or >16.7M px) |
| `MarkdownWysiwygEditor` | Component | file-browser | `<MarkdownWysiwygEditorLazy value={string} onChange={fn} />` — Tiptap WYSIWYG editor for `.md` files, lazy-loaded |
| `splitFrontMatter` | Function | file-browser, roundtrip tests | `(md) → { frontMatter, body }` — YAML front-matter codec |
| `joinFrontMatter` | Function | file-browser, roundtrip tests | `(fm, body) → string` — YAML front-matter rejoin |
| `resolveImageUrl` | Function | file-browser | `(src, currentFilePath, rawFileBaseUrl) → string \| null` — shared image URL resolver |
| `exceedsRichSizeCap` | Function | file-browser | `(content) → boolean` — 200 KB threshold check |
| `hasTables` | Function | file-browser | `(md) → boolean` — GFM table detection |
| `buildMarkdownExtensions` | Function | roundtrip tests | `(config?) → Extension[]` — headless-safe Tiptap extension factory |

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
| `MarkdownWysiwygEditor` | Tiptap WYSIWYG markdown editor | `buildMarkdownExtensions`, `markdown-frontmatter`, `useEditor` (@tiptap/react) |
| `MarkdownWysiwygEditorLazy` | Dynamic import wrapper | `next/dynamic`, `MarkdownWysiwygEditor` |
| `WysiwygToolbar` | 16-button formatting toolbar | Tiptap `Editor` instance, `wysiwyg-toolbar-config` |
| `LinkPopover` | Link insert/edit popover | `sanitize-link-href`, Radix Popover + shadcn Sheet |
| `buildMarkdownExtensions` | Runtime extension factory | StarterKit, tiptap-markdown, Link, Image, Placeholder, CodeBlockLanguagePill |
| `markdown-frontmatter` | YAML front-matter codec | Nothing (pure function) |
| `markdown-has-tables` | GFM table detector | Nothing (pure function) |
| `rich-size-cap` | 200 KB threshold | TextEncoder |
| `sanitize-link-href` | URL allow-list validator | Nothing (pure function) |

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
| `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` | MarkdownWysiwygEditor | Client Component (lazy-loaded) |
| `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor-lazy.tsx` | Dynamic import wrapper | Client Component |
| `apps/web/src/features/_platform/viewer/components/wysiwyg-toolbar.tsx` | WysiwygToolbar | Client Component |
| `apps/web/src/features/_platform/viewer/components/link-popover.tsx` | LinkPopover | Client Component |
| `apps/web/src/features/_platform/viewer/lib/wysiwyg-extensions.ts` | Type-only module | Types for editor, toolbar, actions |
| `apps/web/src/features/_platform/viewer/lib/wysiwyg-toolbar-config.ts` | Toolbar action definitions | Pure data |
| `apps/web/src/features/_platform/viewer/lib/build-markdown-extensions.ts` | Runtime extension factory | Pure function |
| `apps/web/src/features/_platform/viewer/lib/sanitize-link-href.ts` | URL sanitizer | Pure function |
| `apps/web/src/features/_platform/viewer/lib/markdown-frontmatter.ts` | Front-matter codec | Pure function |
| `apps/web/src/features/_platform/viewer/lib/markdown-has-tables.ts` | GFM table detector | Pure function |
| `apps/web/src/features/_platform/viewer/lib/rich-size-cap.ts` | Size threshold | Pure function |
| `apps/web/src/features/_platform/viewer/lib/image-url.ts` | Image URL resolver | Pure function |
| `apps/web/src/features/_platform/viewer/lib/code-block-language-pill.ts` | Language pill decoration | Internal (not exported from barrel) |

## Concepts

| Concept | Entry Point | Description |
|---------|-------------|-------------|
| **WYSIWYG Markdown Editing** | `MarkdownWysiwygEditorLazy` | Tiptap-backed editor that parses markdown in, emits markdown out. Split front-matter before parse, rejoin after serialize. `onChange` only fires on user edits (AC-08). Lazy-loaded via `dynamic(...)` to keep the 125 KB Tiptap bundle out of the eager path. |
| **Formatting Toolbar** | `WysiwygToolbar` | 16-button toolbar driven by a Tiptap `Editor` instance. Each button maps to a `ToolbarAction` with `isActive`/`isDisabled` predicates. `aria-pressed` + `role="toolbar"` for accessibility. Config in `wysiwyg-toolbar-config.ts`. |
| **Link Insertion** | `LinkPopover` | Desktop popover + mobile bottom-sheet for insert/edit/unlink. URL validated by `sanitize-link-href.ts` (allow-list: http/https/mailto). Anchored to the toolbar Link button via Radix `PopoverAnchor virtualRef`. |

## Dependencies

### This Domain Depends On
- `shiki` (npm) — syntax highlighting engine
- `react-markdown` + `@shikijs/rehype` — markdown rendering
- `@git-diff-view/react` + `@git-diff-view/shiki` — diff rendering
- `_platform/file-ops` — indirectly (Shiki reads files server-side)
- `@tiptap/core` + `@tiptap/react` + `@tiptap/starter-kit` + `tiptap-markdown` — WYSIWYG editor (lazy-loaded)
- `@tiptap/extension-image` + `@tiptap/extension-link` + `@tiptap/extension-placeholder` — Tiptap extensions

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
| Plan 083-md-editor / Phase 5 | Added internal `lib/code-block-language-pill.ts` Tiptap extension (ProseMirror `DecorationSet` plugin; widget decoration with `side:-1` placed as descendant of `<pre>`); wired into `markdown-wysiwyg-editor.tsx` via direct relative import; `.md-wysiwyg-code-lang-pill` CSS positioning in `globals.css`; `.md-wysiwyg pre { position: relative }` parent anchor. Extension intentionally NOT exported from the barrel — private dependency of the Rich editor so Phase 6.7 bundle analysis can confirm lazy-chunk inclusion. Consumer-side changes live in `file-browser` (`FileViewerPanel` Rich branch). | 2026-04-19 |
| Plan 083-md-editor / Phase 4 | Added three pure-utility modules — `lib/markdown-frontmatter.ts` (`splitFrontMatter`/`joinFrontMatter` — BOM + CRLF tolerant, 500-line scan cap, setext-`---`-in-body safe, forward + reverse round-trip invariant documented in JSDoc); `lib/markdown-has-tables.ts` (`hasTables` — GFM detector with fence-type pairing so ``` inside ~~~ correctly stays fenced, rejects 4-space-indented tables as CommonMark code blocks, accepts alignment colons); `lib/rich-size-cap.ts` (`RICH_MODE_SIZE_CAP_BYTES = 200_000` with decimal-KB-not-KiB disambiguation JSDoc + `exceedsRichSizeCap` via `TextEncoder`). Wired the fm codec into `markdown-wysiwyg-editor.tsx`, replacing the Phase 1 passthrough stubs; added a lifecycle-safety test that mounts fm-bearing content, triggers a real edit via `editor.commands.insertContent`, and asserts the emitted onChange starts with the original front-matter — closes the silent-data-loss path that pure unit tests cannot detect (Finding 03, FC-validator Issue 4). Extended barrel with 5 new exports consumed by Phase 5. 148/148 unit tests green (59 new: 34 frontmatter + 18 has-tables + 7 rich-size-cap). Harness smoke: desktop + tablet green with new fm-round-trip assertions proving end-to-end fm preservation through a real edit. | 2026-04-19 |
| Plan 041 Phase 4 | Extracts `detectLanguage()` as shared utility (DYK-P4-05), integrates viewers in file browser | 2026-02-24 |
| Plan 086-image-editor | Added `ImageEditor` (perfect-freehand + raw Canvas 2D, Pointer Events + coalesced + undo) + `ImageEditorLazy` (`ssr:false` lazy chunk) + `ImageEditorToolbar` + `lib/canvas-coords.ts` (object-contain CSS→image-px map) + `lib/image-export.ts` (`canvasExportFormat`/`exceedsCanvasLimit`, GIF→PNG, iOS guard). Barrel adds `ImageEditorLazy`/`ImageEditorProps`/`ImageSaveOutcome`/`canvasExportFormat`/`exceedsCanvasLimit`. Save flows DOWN as callbacks — viewer still never imports file-browser (guard test). User guide: `docs/how/image-editor.md`. | 2026-06-08 |
| Plan 046 | Added detectContentType() and isBinaryExtension() content type utilities | 2026-02-24 |
| Plan 083-md-editor / Phase 6 | Extracted `buildMarkdownExtensions()` runtime factory from inline extensions (T002); added `EditorErrorBoundary` + fallback panel with "Switch to Source mode" button (T006, AC-18); wired `onFallback` prop through lazy wrapper to `FileViewerPanel`; reconciled domain.md — added Owns/Contracts/Composition/Source/Concepts entries for all WYSIWYG components, removed stale "Does NOT Own: CodeMirror" line (Finding 02, F005); published user guide at `docs/how/markdown-wysiwyg.md`. | 2026-04-20 |
