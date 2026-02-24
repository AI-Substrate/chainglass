# Binary File Viewers Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [binary-file-viewers-spec.md](./binary-file-viewers-spec.md)
**Status**: DRAFT

## Summary

The file browser rejects binary files with "Binary files cannot be displayed." This plan adds inline rendering for images, PDFs, video, and audio using browser-native elements (`<img>`, `<iframe>`, `<video>`, `<audio>`) — zero NPM dependencies. A new raw file serving API route streams binary content with proper Content-Type headers and HTTP Range request support. The `readFileAction` evolves to return binary metadata instead of an error, and FileViewerPanel routes binary files to the correct viewer component.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/viewer | existing | **modify** | Add `detectContentType()` utility. Add ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder components. |
| file-browser | existing | **modify** | Add raw file API route with Range support. Evolve `readFileAction` to return binary metadata. Update FileViewerPanel routing. Guard `useFileNavigation` content access. |
| _platform/file-ops | existing | consume | `IPathResolver` for raw route security. No changes. |
| _platform/workspace-url | existing | consume | Deep-link infrastructure. No changes. |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/lib/content-type-detection.ts` | viewer | contract | `detectContentType(filename)` — shared utility alongside `detectLanguage()` |
| `apps/web/src/features/041-file-browser/components/image-viewer.tsx` | viewer | contract | `<img>` wrapper with fit-to-container |
| `apps/web/src/features/041-file-browser/components/pdf-viewer.tsx` | viewer | contract | `<iframe>` wrapper for browser PDF rendering |
| `apps/web/src/features/041-file-browser/components/video-viewer.tsx` | viewer | contract | `<video>` wrapper with native controls |
| `apps/web/src/features/041-file-browser/components/audio-viewer.tsx` | viewer | contract | `<audio>` wrapper with native controls |
| `apps/web/src/features/041-file-browser/components/binary-placeholder.tsx` | viewer | contract | Download button + file metadata for unsupported types |
| `apps/web/app/api/workspaces/[slug]/files/raw/route.ts` | file-browser | internal | GET handler streaming raw binary with Content-Type + Range |
| `apps/web/src/features/041-file-browser/services/file-actions.ts` | file-browser | internal | Extend `ReadFileResult` with binary variant |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | file-browser | internal | Add binary content routing |
| `apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` | file-browser | internal | Guard `.content` access for binary files |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Pass binary metadata + raw URL to FileViewerPanel |
| `test/unit/web/lib/content-type-detection.test.ts` | viewer | internal | Unit tests for extension → content type mapping |
| `test/unit/web/features/041-file-browser/raw-file-route.test.ts` | file-browser | internal | Security + Range + Content-Type tests |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `ReadFileResult` consumers (`useFileNavigation`, `FileViewerPanel`, `BrowserClient`) all assume `.content` exists when `ok: true`. Changing binary from error to success requires guarding every `.content` access. | Extend type with discriminated `isBinary` flag. Guard all content access with `!result.isBinary` checks. Tasks T004, T008. |
| 02 | Critical | `IFileSystem.readFile()` returns `Promise<string>` (UTF-8). Raw route needs binary Buffer. | Raw API route uses Node `fs.promises.readFile(path)` directly (bypasses IFileSystem). Security via `IPathResolver.resolvePath()`. Task T003. |
| 03 | High | Next.js App Router has no built-in Range request handling. Must manually parse `Range` header, validate, slice buffer, return 206 with `Content-Range`. | Implement Range parsing in raw route handler. Return 200 for full file, 206 for partial, 416 for invalid range. Task T003. |
| 04 | High | Upload service (`upload-file.ts`) has partial MIME→extension map (`MIME_TO_EXT`). Content type detection should be a separate utility that both upload and viewer can use. | Create `detectContentType()` as shared utility in `apps/web/src/lib/`. Task T001. |
| 05 | Medium | SVG files can contain JavaScript. Rendering via `<img>` tag is safe (sandboxed, no script execution). Inline SVG via `dangerouslySetInnerHTML` would be an XSS vector. | ImageViewer uses `<img>` tag exclusively for SVG. No inline SVG rendering. Task T005. |
| 06 | Medium | `readFileAction` currently reads entire file content to detect binary (null-byte scan of first 8KB). For binary files, this is wasteful — stat() + extension check is sufficient. | Detect binary from extension FIRST via `detectContentType()`. If binary, return metadata without reading content. Fallback to null-byte scan for unknown extensions. Task T004. |

## Implementation

**Objective**: Enable inline viewing of images, PDFs, video, and audio in the file browser using browser-native rendering elements and a new raw file serving endpoint.
**Testing Approach**: Lightweight — unit tests for `detectContentType()` and raw route security/Range handling. No component tests for viewer wrappers. Fakes over mocks.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `detectContentType()` utility + tests | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/lib/content-type-detection.ts`, `/home/jak/substrate/041-file-browser/test/unit/web/lib/content-type-detection.test.ts` | Function maps extensions to `{ category, mimeType }` for image (9 exts), pdf, video (2), audio (3), binary fallback. All AC-06 through AC-10 pass. | Per finding 04. Companion to `detectLanguage()`. |
| [ ] | T002 | Create `ContentTypeInfo` type | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/lib/content-type-detection.ts` | Type exported: `{ category: 'image' \| 'pdf' \| 'video' \| 'audio' \| 'binary'; mimeType: string }` | Part of T001 file. |
| [ ] | T003 | Create raw file API route with Range support + tests | file-browser | `/home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts`, `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/raw-file-route.test.ts` | GET returns binary content with correct Content-Type. Range requests return 206 + Content-Range. Path traversal → 403. Symlink escape → 403. Missing params → 400. Not found → 404. Invalid range → 416. AC-01 through AC-05, AC-27, AC-28 pass. | Per findings 02, 03. Uses Node fs directly for binary read, IPathResolver for security. |
| [ ] | T004 | Evolve `readFileAction` to return binary metadata | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-actions.ts`, `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-actions.test.ts` | Binary files return `{ ok: true, isBinary: true, contentType: 'image/png', mtime, size }` instead of `error: 'binary-file'`. Text files unchanged. Extension-based detection first, null-byte fallback for unknown. AC-11, AC-12 pass. | Per findings 01, 06. Update existing tests. |
| [ ] | T005 | Create ImageViewer component | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/image-viewer.tsx` | Renders `<img>` with `object-fit: contain`, centered in container. Props: `{ src: string, alt: string }`. Works for png, jpg, gif, webp, svg, ico, avif, bmp. AC-13, AC-14, AC-15 pass. | Per finding 05. SVG via img tag only (no inline). |
| [ ] | T006 | Create PdfViewer component | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/pdf-viewer.tsx` | Renders `<iframe>` with `src={rawUrl}`, full-height. Props: `{ src: string }`. Browser native PDF viewer handles scroll/zoom. AC-16, AC-17 pass. | iframe approach — zero deps. |
| [ ] | T007 | Create VideoViewer + AudioViewer components | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/video-viewer.tsx`, `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/audio-viewer.tsx` | Video: `<video>` with controls, centered. Audio: `<audio>` with controls, centered. Props: `{ src: string, mimeType: string }`. AC-18 through AC-21 pass. | Browser-native controls. |
| [ ] | T008 | Create BinaryPlaceholder component | viewer | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/binary-placeholder.tsx` | Shows file icon, file size (formatted), detected MIME type, and download `<a>` button. Props: `{ src: string, size: number, mimeType: string, filename: string }`. AC-22, AC-23 pass. | Download via `<a href={src} download>`. |
| [ ] | T009 | Update FileViewerPanel for binary routing | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Binary files route to correct viewer by content type category. Edit/Diff buttons hidden for binary. Refresh works. AC-24, AC-25 pass. | Per finding 01. Replace `errorType === 'binary-file'` branch. |
| [ ] | T010 | Wire binary metadata + raw URL in BrowserClient | file-browser | `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`, `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` | Guard `.content` access with `!result.isBinary`. Compute raw URL from slug + worktree + file path. Pass binary props to FileViewerPanel. AC-26 (deep link) passes. | Per finding 01. Guard every `.content` and `.editContent` access. |
| [ ] | T011 | Run full test suite | file-browser | — | `just fft` passes. No regressions. | Final validation. |

### Acceptance Criteria

- [ ] AC-01: Raw endpoint returns binary with correct Content-Type
- [ ] AC-02: Path traversal → 403
- [ ] AC-03: Symlink escape → 403
- [ ] AC-04: Non-existent file → 404
- [ ] AC-05: Missing params → 400
- [ ] AC-06: detectContentType('photo.png') → image/png
- [ ] AC-07: detectContentType('doc.pdf') → application/pdf
- [ ] AC-08: detectContentType('clip.mp4') → video/mp4
- [ ] AC-09: detectContentType('song.mp3') → audio/mpeg
- [ ] AC-10: detectContentType('program.exe') → application/octet-stream
- [ ] AC-11: Binary file → metadata (isBinary, contentType, size), not error
- [ ] AC-12: Text file → no regression
- [ ] AC-13: PNG renders inline
- [ ] AC-14: Image scales to fit without distortion
- [ ] AC-15: All image formats work (png, jpg, gif, webp, svg, ico, avif, bmp)
- [ ] AC-16: PDF renders inline with scroll/zoom
- [ ] AC-17: Uploaded PDFs viewable
- [ ] AC-18: MP4 plays with controls
- [ ] AC-19: Video works for mp4, webm
- [ ] AC-20: MP3 plays with controls
- [ ] AC-21: Audio works for mp3, wav, ogg
- [ ] AC-22: Unsupported binary shows metadata + download button
- [ ] AC-23: Download button triggers browser download
- [ ] AC-24: Binary files → Preview mode only (Edit/Diff hidden)
- [ ] AC-25: Refresh reloads binary content
- [ ] AC-26: Deep link to binary file works
- [ ] AC-27: Range requests → 206 Partial Content
- [ ] AC-28: Invalid range → 416

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ReadFileResult type change breaks existing consumers | High | High | Discriminated union with `isBinary` flag; guard all `.content` access before changing type. T004+T010 coordinated. |
| Range request edge cases (multi-range, malformed headers) | Medium | Low | Only support single-range requests; return 416 for multi-range or malformed. |
| PDF iframe blocked in embedded contexts | Low | Medium | BinaryPlaceholder fallback with download button. |
| SVG XSS if rendered inline | Low | High | Strictly use `<img>` tag — never `dangerouslySetInnerHTML` for SVG. Finding 05. |
| Raw route bypasses IFileSystem abstraction | Low | Low | Acceptable — raw route is file-browser domain infrastructure. Uses IPathResolver for security. |

### Constitution Deviations

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Principle 3: TDD for all work | Viewer components are thin wrappers around `<img>`, `<video>`, `<audio>`, `<iframe>` — no logic to test | Full component tests would test browser-native element rendering, not our code | Unit tests cover all logic (detectContentType, raw route security, Range handling). Visual verification via browser. |
| Principle 2: Interface-First (raw route bypasses IFileSystem) | IFileSystem.readFile() returns string; binary needs Buffer. Adding readFileBuffer() to a shared interface for one consumer is over-engineering. | Extend IFileSystem with readFileBuffer() — rejected: only one consumer (raw route), and the route needs Node fs directly for Range/streaming | Raw route uses IPathResolver for security validation. Node fs read is implementation detail of one API route. |
