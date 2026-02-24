# Binary File Viewers

**Plan**: 046-binary-file-viewers
**Created**: 2026-02-24
**Status**: DRAFT

> This specification incorporates findings from research-dossier.md

---

## Research Context

The file browser (Plan 041) detects binary files via null-byte scanning and rejects them with "Binary files cannot be displayed." The paste-upload system (Plan 044) allows uploading images, PDFs, and other binary files into workspaces, but there is no way to view them after upload. Browser-native elements (`<img>`, `<video>`, `<audio>`, `<iframe>`) can render the must-have types with zero NPM dependencies — the missing piece is a raw file serving endpoint and content-type-aware routing in the viewer panel.

Key research findings:
- No raw binary file endpoint exists (Discovery 01)
- Browser handles images, video, audio, PDF natively (Discovery 02)
- `readFileAction` returns `error: 'binary-file'` with no type info (Discovery 03)
- `ViewerMode` needs to accommodate binary-only files (Discovery 04)

---

## Summary

**WHAT**: When a user selects a binary file in the file browser, render it inline instead of showing "Binary files cannot be displayed." Images display as images. PDFs render in an embedded viewer. Videos and audio play with native controls. Unsupported binary types show file metadata and a download button.

**WHY**: Users paste screenshots, upload reference PDFs, and work with media assets. Forcing them to leave the file browser to view these files breaks the workflow. Inline rendering makes the file browser useful for the full range of workspace files.

---

## Goals

- **View images inline** — png, jpg, jpeg, gif, webp, svg, ico, avif, bmp render as images with fit-to-container scaling
- **View PDFs inline** — pdf files render in an embedded viewer with scroll and zoom
- **Play video inline** — mp4 and webm play with native browser controls
- **Play audio inline** — mp3, wav, and ogg play with native browser controls
- **Graceful fallback** — unsupported binary types show file size, type, and a download button instead of an error message
- **Deep-linkable** — binary file preview works via URL (`?file=scratch/paste/screenshot.png&mode=preview`)
- **Secure** — raw file endpoint enforces the same path traversal and symlink protections as existing file actions

---

## Non-Goals

- **Editing binary files** — no image editor, no PDF annotator, no video trimmer
- **Thumbnail generation** — file tree shows generic icons, not thumbnails
- **Font preview** — rendering fonts with sample text (future consideration)
- **Archive browsing** — listing contents of zip/tar files (requires server extraction)
- **Office document rendering** — docx, xlsx, pptx (requires conversion engine)
- **3D model viewing** — stl, obj (niche, future consideration)
- **Image zoom/pan controls** — simple fit-to-container is sufficient; no crop, rotate, or annotation
- **Streaming video** — no HLS/DASH support; only direct file playback
- **Diff mode for binary files** — no visual diff for images or binary content

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/viewer | existing | **modify** | Add binary viewer components (ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder). Add `detectContentType()` utility alongside `detectLanguage()`. Expand barrel exports. |
| file-browser | existing | **modify** | Add raw file serving API route. Evolve `readFileAction` to return binary metadata instead of error. Update FileViewerPanel to route binary files to the correct viewer component. |
| _platform/file-ops | existing | **consume** | Use existing `IFileSystem` and `IPathResolver` contracts for raw file reading and path security. No changes needed. |
| _platform/workspace-url | existing | **consume** | Use existing deep-link infrastructure. No changes needed. |

---

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=0
  - Surface Area (1): Touches viewer domain components + file-browser viewer panel + new API route + readFileAction
  - Integration (0): No external dependencies — uses browser-native elements only
  - Data/State (0): No schema changes; `ReadFileResult` type extended with one new variant
  - Novelty (0): Well-specified by research; browser-native rendering is straightforward
  - Non-Functional (1): Security for raw file endpoint (path traversal, symlink escape); Content-Type header correctness
  - Testing/Rollout (0): Unit tests for content type detection + API route security; component tests for viewers
- **Confidence**: 0.90
- **Assumptions**:
  - Browser iframe renders PDFs acceptably (Chrome, Firefox, Safari all have built-in PDF viewers)
  - `<video>` and `<audio>` tags handle the target formats without transcoding
  - Raw file endpoint does not need authentication beyond workspace slug validation (single-user app)
- **Dependencies**: None external. Plan 041 (file browser) and Plan 044 (upload) are already complete.
- **Risks**:
  - PDF iframe may not work in all browser contexts (mitigated: fallback to download link)
  - Large video files may be slow to load without range request support (mitigated: acceptable for local network use)
- **Phases**: 2 suggested — (1) raw endpoint + content type detection + readFileAction evolution, (2) viewer components + FileViewerPanel routing

---

## Acceptance Criteria

### Raw File Serving
- **AC-01**: `GET /api/workspaces/[slug]/files/raw?worktree=<path>&file=<relativePath>` returns binary content with correct `Content-Type` header
- **AC-02**: Raw file endpoint rejects path traversal attempts (`../`) with 403
- **AC-03**: Raw file endpoint rejects symlink escapes (realpath outside workspace) with 403
- **AC-04**: Raw file endpoint returns 404 for non-existent files
- **AC-05**: Raw file endpoint returns 400 when worktree or file parameter is missing

### Content Type Detection
- **AC-06**: `detectContentType('photo.png')` returns `{ category: 'image', mimeType: 'image/png' }`
- **AC-07**: `detectContentType('doc.pdf')` returns `{ category: 'pdf', mimeType: 'application/pdf' }`
- **AC-08**: `detectContentType('clip.mp4')` returns `{ category: 'video', mimeType: 'video/mp4' }`
- **AC-09**: `detectContentType('song.mp3')` returns `{ category: 'audio', mimeType: 'audio/mpeg' }`
- **AC-10**: `detectContentType('program.exe')` returns `{ category: 'binary', mimeType: 'application/octet-stream' }`

### ReadFile Evolution
- **AC-11**: Selecting an image file in the file tree returns binary metadata (`isBinary: true`, `contentType`, `size`) instead of `error: 'binary-file'`
- **AC-12**: Selecting a text file continues to work as before (no regression)

### Image Viewing
- **AC-13**: Selecting a `.png` file shows the image rendered inline in the main panel
- **AC-14**: Image scales to fit the container without distortion
- **AC-15**: Image viewing works for: png, jpg, jpeg, gif, webp, svg, ico, avif, bmp

### PDF Viewing
- **AC-16**: Selecting a `.pdf` file shows the PDF rendered inline with scroll and zoom
- **AC-17**: PDF viewing works for uploaded PDFs (e.g., files in `scratch/paste/`)

### Video Viewing
- **AC-18**: Selecting a `.mp4` file shows a video player with play/pause, seek, and volume controls
- **AC-19**: Video viewing works for: mp4, webm

### Audio Viewing
- **AC-20**: Selecting a `.mp3` file shows an audio player with play/pause, seek, and volume controls
- **AC-21**: Audio viewing works for: mp3, wav, ogg

### Binary Fallback
- **AC-22**: Selecting an unsupported binary file (e.g., `.exe`) shows file size, detected type, and a download button
- **AC-23**: Download button triggers browser file download

### Viewer Panel Integration
- **AC-24**: Binary files show only Preview mode (Edit and Diff buttons hidden or disabled)
- **AC-25**: Refresh button reloads the binary content
- **AC-26**: Deep link to a binary file works: navigating to `?file=image.png&mode=preview` renders the image immediately

---

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PDF iframe blocked in some browser contexts | Low | Medium | Fallback to download link in BinaryPlaceholder |
| Large video files slow to load on local network | Low | Low | Acceptable for local use; no streaming protocol needed |
| SVG files could contain malicious scripts | Medium | Medium | Render SVG via `<img>` tag (sandboxed, no script execution) rather than inline |
| Content-Type sniffing mismatch | Low | Low | Extension-based detection is reliable for the target formats |
| Raw endpoint could serve sensitive files | Low | High | Reuse existing path security (realpath, traversal checks, workspace scoping) |

**Assumptions:**
- This is a single-user local application; no authentication beyond workspace slug validation
- Files are on local filesystem with low-latency access
- Target browsers (Chrome, Firefox, Safari) all support native image, video, audio, and PDF rendering
- The 5MB text file size limit does NOT apply to binary files served via the raw endpoint

---

## Open Questions

- [NEEDS CLARIFICATION: Should the raw file endpoint support HTTP Range requests for video seeking, or is full-file download acceptable?]
- [NEEDS CLARIFICATION: Should there be a maximum file size for binary viewing (e.g., skip rendering 2GB video files)?]

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| PDF Viewer Strategy | Integration Pattern | Browser iframe PDF rendering varies; may need react-pdf for consistent experience | Is iframe sufficient? Do we need page navigation? Dark mode? |

