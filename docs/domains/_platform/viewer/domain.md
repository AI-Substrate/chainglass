# Domain: Viewer

**Slug**: _platform/viewer
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from existing codebase (Plan 006-web-extras)
**Status**: active

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
| Plan 041 Phase 4 | Extracts `detectLanguage()` as shared utility (DYK-P4-05), integrates viewers in file browser | 2026-02-24 |
| Plan 046 | Added detectContentType() and isBinaryExtension() content type utilities | 2026-02-24 |
