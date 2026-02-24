# Execution Log — Phase 1: Binary File Viewers

**Plan**: 046-binary-file-viewers
**Started**: 2026-02-24T11:05:00Z
**Completed**: 2026-02-24T11:56:00Z

---

## Summary

All 11 tasks completed (T010 merged into T004). 28/28 acceptance criteria satisfied. 4342 tests passing, zero regressions.

## Commits

| Hash | Description |
|------|-------------|
| `25fdfd8` | Implement Plan 046: Binary file viewers (main implementation) |
| `4269827` | Fix import path in raw file route to use @ alias |
| `8e94c76` | Fix binary files hitting 5MB text limit (move extension check before size check, add mov/avi/mkv/flac/aac/m4a) |
| `dfbc3f5` | Fix binary viewer height: use flex column with min-h-0 |
| `2d2d1b8` | Fix MainPanel height propagation for binary viewers |
| `60388e3` | Fix PDF viewer for iPad: add scrollable wrapper and open-in-tab link |
| `148de52` | Fix iPad PDF scrolling: use blob URL instead of direct iframe src |

## Post-Implementation Fixes

1. **Import path**: Raw route used relative path instead of `@/` alias — fixed in `4269827`
2. **5MB text limit blocking binary files**: Extension-based binary detection was AFTER the 5MB check. Moved it before. Added mov, avi, mkv, flac, aac, m4a extensions — fixed in `8e94c76`
3. **Height chain for binary viewers**: MainPanel and BinaryFileView content area needed `flex flex-col` for height propagation — fixed in `dfbc3f5`, `2d2d1b8`
4. **iPad PDF scrolling**: iOS Safari doesn't scroll iframes with direct PDF URLs. Changed to blob URL approach (fetch → createObjectURL → iframe src). Added "Open in new tab" fallback — fixed in `148de52`

## Domain Changes

| Domain | Changes |
|--------|---------|
| `_platform/viewer` | Added `detectContentType()` + `isBinaryExtension()` + `ContentTypeInfo` type in `apps/web/src/lib/content-type-detection.ts` |
| `_platform/panel-layout` | Extracted `AsciiSpinner` component. Added to barrel export. Refactored ExplorerPanel to use it. Fixed MainPanel height propagation. |
| `file-browser` | Added raw file API route with streaming + Range support. Evolved `ReadFileResult` with `isBinary` variant. Added 5 viewer components (ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder). Updated FileViewerPanel with binary routing. Guarded all `.content` access in useFileNavigation. |
