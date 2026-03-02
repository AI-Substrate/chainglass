# Component: Viewer (`_platform/viewer`)

> **Domain Definition**: [_platform/viewer/domain.md](../../../../domains/_platform/viewer/domain.md)
> **Source**: `apps/web/src/components/viewers/` + `apps/web/src/lib/server/` + `apps/web/src/hooks/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: Viewer

Reusable rendering primitives for displaying code, markdown, and git diffs. Provides syntax-highlighted code display (Shiki server-side singleton), markdown preview with mermaid support, and split/unified diff viewing. Built as headless-first components with separated state hooks.

```mermaid
C4Component
    title Component diagram — Viewer (_platform/viewer)

    Container_Boundary(viewer, "Viewer") {
        Component(fileViewer, "FileViewer", "Client Component", "Displays pre-highlighted code<br/>with line numbers, keyboard nav,<br/>CSS counter line numbers")
        Component(mdViewer, "MarkdownViewer", "Client Component", "Source/preview toggle<br/>wrapping FileViewer + MarkdownServer")
        Component(diffViewer, "DiffViewer", "Client Component", "Split/unified git diff<br/>via @git-diff-view/react")
        Component(mdServer, "MarkdownServer", "Server Component", "Async markdown rendering:<br/>react-markdown + remark-gfm +<br/>@shikijs/rehype pipeline")
        Component(codeBlock, "CodeBlock", "Component", "Routes code fences by language:<br/>mermaid → MermaidRenderer<br/>others → Shiki HTML output")
        Component(mermaid, "MermaidRenderer", "Client Component", "Lazy-loaded Mermaid SVG<br/>dynamic import, theme-aware,<br/>re-renders on theme change")
        Component(shiki, "ShikiProcessor", "Server Module", "Singleton syntax highlighter<br/>30+ languages, dual themes<br/>(--shiki-dark CSS vars)")
        Component(remarkMermaid, "remarkMermaid", "Remark Plugin", "AST transform: extracts<br/>mermaid blocks before Shiki,<br/>preserves code in data-attrs")
        Component(langDetect, "detectLanguage", "Utility", "Filename → Shiki language ID<br/>extension-based + special files")
        Component(contentType, "detectContentType", "Utility", "Filename → category + MIME type<br/>image, pdf, video, audio, binary")
        Component(highlightAction, "highlightCodeAction", "Server Action", "Server action wrapper<br/>for ShikiProcessor")
        Component(fvState, "useFileViewerState", "Hook", "Headless state: language,<br/>showLineNumbers, toggleLineNumbers")
        Component(mvState, "useMarkdownViewerState", "Hook", "Headless state: mode<br/>(source/preview), toggleMode")
        Component(dvState, "useDiffViewerState", "Hook", "Headless state: split/unified<br/>mode toggle")
    }

    Rel(mdViewer, fileViewer, "Source mode renders via")
    Rel(mdViewer, mdServer, "Preview mode renders via")
    Rel(mdViewer, mvState, "Manages state with")
    Rel(fileViewer, fvState, "Manages state with")
    Rel(diffViewer, dvState, "Manages state with")
    Rel(mdServer, codeBlock, "Routes code blocks through")
    Rel(mdServer, remarkMermaid, "Extracts mermaid via")
    Rel(mdServer, shiki, "Highlights via @shikijs/rehype")
    Rel(codeBlock, mermaid, "Delegates mermaid blocks to")
    Rel(fileViewer, highlightAction, "Receives highlighted HTML from")
    Rel(highlightAction, shiki, "Wraps")
    Rel(highlightAction, langDetect, "Resolves language with")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| FileViewer | Client Component | Read-only code display with line numbers, keyboard nav, CSS counters |
| MarkdownViewer | Client Component | Source/preview toggle wrapping FileViewer + MarkdownServer |
| DiffViewer | Client Component | Split/unified git diff via @git-diff-view/react + @git-diff-view/shiki |
| MarkdownServer | Server Component | Async markdown pipeline: react-markdown + remark-gfm + @shikijs/rehype |
| CodeBlock | Component | Routes code fences: mermaid → MermaidRenderer, others → Shiki HTML |
| MermaidRenderer | Client Component | Lazy-loaded Mermaid SVG, dynamic import('mermaid'), theme-aware re-render |
| remarkMermaid | Remark Plugin | AST transform extracting mermaid blocks before Shiki processes them |
| ShikiProcessor | Server Module | Singleton highlighter, 30+ languages, dual themes via CSS variables |
| detectLanguage | Utility | Extension-based filename → Shiki language ID mapping |
| detectContentType | Utility | Filename → {category, mimeType} for viewer routing |
| highlightCodeAction | Server Action | Server action wrapper: (code, lang) → highlighted HTML |
| useFileViewerState | Hook | Headless state for FileViewer (language, line numbers) |
| useMarkdownViewerState | Hook | Headless state for MarkdownViewer (source/preview mode) |
| useDiffViewerState | Hook | Headless state for DiffViewer (split/unified mode) |

## External Dependencies

Depends on: shiki, react-markdown, @shikijs/rehype, @git-diff-view/react, mermaid, _platform/file-ops (IFileSystem).
Consumed by: file-browser, workunit-editor (CodeEditor), demo pages.

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/viewer/domain.md](../../../../domains/_platform/viewer/domain.md)
- **Hub**: [C4 Overview](../../README.md)
