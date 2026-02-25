# Flight Plan: Fix FX001 — Wire File Browser End-to-End 222

**Fix**: [FX001-wire-browser-e2e.md](./FX001-wire-browser-e2e.md)
**Status**: Ready

## What → Why

**Problem**: File browser has all components but nothing is wired — files don't load, preview is placeholder text, diff has no data, tree doesn't expand to deep-linked file.
**Fix**: Wire readFile with Shiki highlighting, integrate real viewer components, add lazy diff, auto-expand tree, fix changed-files filter.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `file-browser` | primary | BrowserClient flows, FileViewerPanel rendering, readFile result shape |
| `_platform/viewer` | consumed | FileViewer for code preview (existing component, no changes) |
| `_platform/file-ops` | consumed | IFileSystem.realpath boundary check (already fixed) |

## Stages

### S1: Server-Side Rendering (FX001-5, FX001-6)
- [ ] FX001-5: readFile returns highlightedHtml via Shiki
- [ ] FX001-6: readFile returns previewHtml for markdown (mermaid + syntax)

### S2: Viewer Integration (FX001-7, FX001-8)
- [ ] FX001-7: FileViewerPanel uses CodeEditor/Shiki HTML/DiffViewer
- [ ] FX001-8: Lazy diff loading on mode switch

### S3: Tree + Filter (FX001-9, FX001-10)
- [ ] FX001-9: FileTree auto-expands to deep-linked file
- [ ] FX001-10: Changed-files filter wired

### S4: Docs (FX001-11)
- [ ] FX001-11: Domain docs path alignment

## Acceptance

- [ ] File loads with syntax highlighting on click
- [ ] Markdown preview has mermaid + code blocks
- [ ] Edit mode has CodeMirror
- [ ] Diff mode fetches and displays git diff
- [ ] Tree auto-expands to `?file=` param
- [ ] Changed-only filter works
- [ ] `just fft` passes
