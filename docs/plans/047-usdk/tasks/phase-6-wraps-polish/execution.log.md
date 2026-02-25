# Phase 6: SDK Wraps, Go-to-Line & Polish — Execution Log

**Phase**: 6 of 6
**Started**: 2026-02-25
**Baseline**: 4450 tests passing, `just fft` clean

---

## Task Log

### T001: file-browser SDK contribution ✅

**Files created**:
- `apps/web/src/features/041-file-browser/sdk/contribution.ts` — Static SDKContribution manifest: openFileAtLine + copyPath commands, showHiddenFiles + previewOnClick settings
- `apps/web/src/features/041-file-browser/sdk/register.ts` — registerFileBrowserSDK(): contributes settings, registers copyPath (bootstrap-safe)

**Files modified**:
- `browser-client.tsx` — Added openFileAtLine registration in useEffect (needs setParams ref). Imported fileBrowserContribution.

**Decisions**: openFileAtLine handler initially navigates to file only (line param wired in T003/T004). copyPath reads current file from URL searchParams.

### T002: events/toast SDK contribution ✅

**Files created**:
- `apps/web/src/features/027-central-notify-events/sdk/contribution.ts` — Static SDKContribution: toast.show + toast.dismiss
- `apps/web/src/features/027-central-notify-events/sdk/register.ts` — registerEventsSDK(): registers both commands with sonner handlers

**Decisions**: DYK-P6-01 honoured — dual path kept. toast.show calls sonner directly, independent of IUSDK.toast.

### T003: Go-to-line URL param + path parsing ✅

**Files modified**:
- `file-browser.params.ts` — Added `line: parseAsInteger` URL param
- `file-path-handler.ts` — Rewrote with `parseLineSuffix()` for `:42` and `#L42` syntax. DYK-P6-04: path-first resolution (try full string before parsing suffix).
- `browser-client.tsx` — Wired `onLineDetected` callback from file-path-handler to `setParams({ line })`. Updated filePathHandler memo to include `setParams` dependency.

**Decisions**: `parseLineSuffix` only matches if suffix is purely numeric (avoids timestamp collisions like `2024-01-15T10:30:00.log`).

### T004: CodeMirror scroll-to-line ✅

**Files modified**:
- `code-editor.tsx` — Added `scrollToLine?: number | null` prop. Captures `EditorView` via `onCreateEditor` into internal ref. `scrollViewToLine()` helper dispatches `EditorView.scrollIntoView` with `y: 'center'`. Handles both mount-time and prop-change scrolling.
- `file-viewer-panel.tsx` — Added `scrollToLine` prop, passed through to `CodeEditor`.
- `browser-client.tsx` — Extracted `scrollToLine` from URL params, passed to `FileViewerPanel`.

**Decisions**: DYK-P6-03 honoured — prop-driven approach, no forwardRef through dynamic import. EditorView captured via onCreateEditor callback.

### T005: Wire domain registrations into bootstrap ✅

**Files modified**:
- `sdk-bootstrap.ts` — Imported and called `registerFileBrowserSDK(sdk)` and `registerEventsSDK(sdk)`. Moved editor demo settings (fontSize, wordWrap, tabSize) to file-browser contribution. Kept appearance.theme as platform demo.
- `contribution.ts` (file-browser) — Added editor.fontSize, editor.wordWrap, editor.tabSize settings.

**Decisions**: Editor settings naturally belong to file-browser domain (they configure the code editor). appearance.theme kept as platform demo since it's cross-cutting.

### T006: SDK developer documentation ✅

**Files created**:
- `docs/how/sdk/publishing-to-sdk.md` — Publisher guide with worked example: contribution manifest, register function, bootstrap wiring. Covers bootstrap-safe vs ref-dependent commands, settings types, key format.
- `docs/how/sdk/consuming-sdk.md` — Consumer guide: useSDK, useSDKSetting, useSDKContext hooks. Command palette usage. Toast API. Listing commands/shortcuts.

**Decisions**: Per DYK-P6-05 — guides are short and example-heavy. Reference workshops for deep detail.

