# Workshop: NPM Library Research for Office Document Preview

**Type**: Integration Pattern
**Plan**: 055-document-preview
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- Plan 041 File Browser (existing file viewer infrastructure)

---

## Purpose

Evaluate open-source NPM packages for previewing Microsoft Office documents (.docx, .xlsx, .pptx) in the browser. The Chainglass file browser currently handles code, markdown, and images — this extends it to Office formats.

## Key Questions Addressed

- What libraries exist on NPM for client-side Office document rendering?
- Which approach best fits our existing FileViewerPanel architecture?
- What are the tradeoffs between visual fidelity, bundle size, and format coverage?

---

## Research Summary

### Landscape Overview

The ecosystem offers four main approaches:

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Client-side HTML render** | Parse Office XML, emit styled HTML/CSS | No server needed, works offline | Format-specific, fidelity varies |
| **Semantic HTML conversion** | Extract content structure, emit clean HTML | Lightweight, accessible | Loses visual formatting |
| **Iframe/external service** | Delegate to Microsoft viewer or Google Docs | High fidelity, multi-format | Requires public URL, privacy concern |
| **Canvas/PDF render** | Convert to PDF/canvas server-side | Pixel-perfect | Requires server, heavy |

### Top Candidates

#### 1. `docx-preview` (recommended for .docx)

- **NPM**: [docx-preview](https://www.npmjs.com/package/docx-preview)
- **GitHub**: [VolodymyrBaydalka/docxjs](https://github.com/VolodymyrBaydalka/docxjs) (~600+ stars)
- **License**: MIT
- **Bundle**: ~200KB
- **Approach**: Client-side HTML render — parses OOXML, emits styled HTML/CSS into a container
- **API**: `renderAsync(arrayBuffer, containerElement, styleContainer?, options?)`
- **Format support**: .docx only
- **Rendering quality**: Good — preserves layout, styles, tables, images, headers/footers, numbering
- **Maintenance**: Active (regular releases through 2025-2026)

**Why it fits Chainglass**:
- Pure client-side — no server dependency
- Simple API that accepts ArrayBuffer (we already read files as buffers via the file API)
- Renders into a DOM container (slots into FileViewerPanel's content area)
- Good visual fidelity for document preview use case

**Integration sketch**:
```typescript
import { renderAsync } from 'docx-preview';

// In FileViewerPanel or a new DocxViewer component
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (containerRef.current && fileContent) {
    renderAsync(fileContent, containerRef.current, undefined, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
    });
  }
}, [fileContent]);
```

#### 2. `mammoth` (alternative for .docx)

- **NPM**: [mammoth](https://www.npmjs.com/package/mammoth)
- **GitHub**: [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) (~12k stars)
- **License**: BSD-2-Clause
- **Bundle**: ~70KB
- **Approach**: Semantic HTML conversion — prioritizes clean HTML over visual reproduction
- **API**: `mammoth.convertToHtml({ arrayBuffer })` → `{ value: html, messages: [] }`
- **Format support**: .docx only
- **Rendering quality**: Content-accurate but loses visual formatting (margins, exact fonts, page layout)
- **Maintenance**: Mature/stable, less frequent updates

**When to prefer over docx-preview**:
- When content matters more than layout (e.g., indexing, search)
- When bundle size is critical (~70KB vs ~200KB)
- When you want semantic HTML for accessibility
- When you need style mapping customization

**Not recommended as primary** because users expect a document preview to look like the document, not a re-styled HTML page.

#### 3. `@cyntler/react-doc-viewer` (multi-format wrapper)

- **NPM**: [@cyntler/react-doc-viewer](https://www.npmjs.com/package/@cyntler/react-doc-viewer)
- **GitHub**: [cyntler/react-doc-viewer](https://github.com/cyntler/react-doc-viewer) (~400+ stars)
- **License**: Apache-2.0
- **Approach**: React component with pluggable renderers per file type
- **Format support**: .docx, .xlsx, .pptx, PDF, images, text, CSV, and more
- **Rendering quality**: Varies by format — Office formats delegate to Microsoft iframe viewer

**Critical limitation**: Office format rendering requires the document to be at a **publicly accessible URL** — it uses Microsoft's Office Online viewer (`https://view.officeapps.live.com/op/embed.aspx?src=...`). This won't work for local files or private content.

**Verdict**: Not suitable as primary renderer for Chainglass (local files, privacy). Could be useful as a fallback for public URLs in future.

#### 4. `xlsx-preview` (for .xlsx)

- **NPM**: [xlsx-preview](https://www.npmjs.com/package/xlsx-preview)
- **License**: MIT
- **Approach**: Client-side HTML table rendering from spreadsheet data
- **Format support**: .xlsx, .xls
- **Rendering quality**: Functional — renders sheets as HTML tables with basic formatting

**Integration**: Similar pattern to docx-preview — accepts buffer, renders into container.

#### 5. `js-pptx` (for .pptx — limited)

- **NPM**: [js-pptx](https://www.npmjs.com/package/js-pptx)
- **GitHub**: [won21kr/js-pptx](https://github.com/won21kr/js-pptx)
- **License**: MIT
- **Approach**: Read/write PPTX programmatically
- **Rendering quality**: No built-in visual rendering — it's a data manipulation library

**Verdict**: Not a preview solution. PPTX preview in the browser remains a gap in the open-source ecosystem.

#### 6. `@ranui/preview` (emerging multi-format)

- **NPM**: [@ranui/preview](https://www.npmjs.com/package/@ranui/preview)
- **Approach**: Web Component wrapping multiple format renderers
- **Format support**: .docx, .xlsx, .pptx, PDF
- **Rendering quality**: Uses docx-preview and xlsx internally
- **Maintenance**: Newer, less battle-tested

**Verdict**: Worth watching but not mature enough for production use.

---

## Recommendation Matrix

| Format | Recommended Library | Fallback | Gap? |
|--------|-------------------|----------|------|
| **.docx** | `docx-preview` | `mammoth` (semantic) | No |
| **.xlsx** | `xlsx-preview` | SheetJS (`xlsx`) + custom render | No |
| **.pptx** | None suitable | Server-side LibreOffice conversion | **Yes** |
| **.pdf** | Already handled (or `react-pdf`) | iframe | No |

## Recommended Approach for Chainglass

### Phase 1: DOCX Preview
- Install `docx-preview`
- Create `DocxViewer` component
- Integrate into FileViewerPanel alongside existing code/markdown/image viewers
- File extension detection routes `.docx` to DocxViewer

### Phase 2: XLSX Preview (if needed)
- Install `xlsx-preview`
- Create `XlsxViewer` component
- Same integration pattern

### Phase 3: Unsupported Format Messaging
- For `.pptx` and other unsupported Office formats, show a clear "Preview not available for this format" message with file metadata (name, size, modified date)
- Could offer download link

### Architecture Fit

The existing FileViewerPanel already switches on content type:
- Code → CodeEditor (CodeMirror)
- Markdown → MarkdownPreview
- Image → Image viewer
- Binary/large → Error state

Adding Office formats follows the same pattern — detect by extension, route to the appropriate viewer component. The file content is already available as a buffer from the file reading API.

## Bundle Size Impact

| Library | Gzipped | Impact |
|---------|---------|--------|
| `docx-preview` | ~60KB gzipped | Moderate — could be lazy-loaded |
| `mammoth` | ~25KB gzipped | Small |
| `xlsx-preview` | ~15KB gzipped | Small |

**Mitigation**: Use `next/dynamic` with `ssr: false` to lazy-load Office viewers only when needed. This keeps the main bundle clean and loads the library only when a user opens an Office document.

## Open Questions

### Q1: Should we support editing or just preview?

**OPEN**: Preview-only is the clear first step. Editing Office documents in-browser is a fundamentally different scope (ONLYOFFICE territory).

### Q2: How to handle large documents?

**OPEN**: `docx-preview` renders the entire document into the DOM. For very large documents (100+ pages), this could be slow. Options:
- Show a loading spinner during render
- Paginate (docx-preview supports `breakPages: true`)
- Set a size limit with fallback to download

### Q3: Should we extract text for search indexing?

**OPEN**: `mammoth.extractRawText()` could be used alongside `docx-preview` to make Office document content searchable via the existing code search (`#` prefix). This would be a separate feature.

### Q4: Dark mode support?

**OPEN**: Office documents are white-background by design. Options:
- Render as-is (white document on dark background — like a "page" floating in the UI)
- Attempt to invert (likely breaks images and formatting)
- Recommendation: render as-is, which is how VS Code and other editors handle document preview

---

## References

- [docx-preview NPM](https://www.npmjs.com/package/docx-preview)
- [docxjs GitHub](https://github.com/VolodymyrBaydalka/docxjs)
- [mammoth.js GitHub](https://github.com/mwilliamson/mammoth.js)
- [@cyntler/react-doc-viewer](https://github.com/cyntler/react-doc-viewer)
- [xlsx-preview NPM](https://www.npmjs.com/package/xlsx-preview)
- [@ranui/preview NPM](https://www.npmjs.com/package/@ranui/preview)
