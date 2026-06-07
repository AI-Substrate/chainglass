# Execution Log — Plan 086 In-browser Image Editor (Simple, single phase)

**Implementer**: `/plan-6-v2-implement-phase-companion`
**Companion**: `code-review-companion` (minih) — run `2026-06-08T07-32-46-663Z-5da5`
**Started**: 2026-06-08
**Branch**: `084-random-enhancements-3` (shared random-enhancements branch; Plan 085 also landed here)

---

## Pre-Phase Agent Harness Validation

Governance: `docs/project-rules/harness.md` (browser-capable; Playwright + CDP→Chromium).

| Stage | Check | Result | Detail |
|-------|-------|--------|--------|
| Boot | `just harness-health` | ✅ HEALTHY | app up (200), mcp up (406), terminal up |
| Interact | CDP reachable | ✅ | cdp up — Chrome/136.0.7103.25 |
| Observe | console/screenshot via harness CLI | ✅ available | `just harness check-route/screenshot/console-logs` |

**Verdict**: ✅ HEALTHY — the browser sensor (T016) can genuinely run. Dev app already serving on :3000.

---

## Reuse Anchors Verified (in this worktree, before coding)

| Anchor | Path | Use |
|--------|------|-----|
| `uploadFileService` | `apps/web/src/features/041-file-browser/services/upload-file.ts` | Buffer + atomic tmp→rename precedent for `saveImageService` |
| `saveFileAction` (service) | `apps/web/src/features/041-file-browser/services/file-actions.ts` | mtime-conflict (`expectedMtime && !force` → `serverMtime`); `SaveFileResult` shape |
| Secure slug→worktree | `apps/web/app/actions/file-actions.ts` (`fileExists`/`pathExists`) | `workspaceService.getInfo(slug)` → trusted root + realpath containment |
| `detectContentType` | `apps/web/src/lib/content-type-detection.ts` | raster predicate (`category==='image'`) |
| DI | `getContainer()` + `SHARED_DI_TOKENS.FILESYSTEM/PATH_RESOLVER`, `WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE` | server action wiring |
| Fakes | `@chainglass/shared` re-exports `FakeFileSystem`/`FakePathResolver` | unit tests (no `vi.mock`) |
| Lazy/toolbar precedent | `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor{,-lazy}.tsx`, `wysiwyg-toolbar.tsx` | T009/T010 patterns |
| Smoke precedent | `harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` | T016 |

**Refinement logged**: the plan's shorthand Edit predicate `category==='image' && ext!=='svg'` would also admit `ico/avif/bmp` (all `category==='image'` in `content-type-detection.ts`). AC-16 + T005 enumerate the explicit raster set `{png,jpg,jpeg,gif,webp}`. Resolution: `image-filename.ts` exports `RASTER_IMAGE_EXTENSIONS` + `isRasterImageFilename()`; both the affordance (T013) and the action (T005) intersect `category==='image'` with that explicit set. Matches AC-16 precisely.

---

## Task Log

<!-- per-task entries appended below as they land -->

### T001 + T002 — `image-filename` helper (TDD) ✅

- **RED**: wrote `test/unit/web/features/086-image-editor/image-filename.test.ts` (11 tests) — failed on missing module.
- **GREEN**: implemented `apps/web/src/features/041-file-browser/services/image-filename.ts` — `deriveEditedFilename` (idempotent `-edited`, dir-preserving, GIF→PNG), `outputFormatForImage` (PNG/WebP lossless+alpha; JPEG q0.92+flatten; GIF→PNG), `isRasterImageFilename` + `RASTER_IMAGE_EXTENSIONS`.
- **Evidence**: `vitest run image-filename.test.ts` → 11 passed.
- **Decision**: explicit raster allow-list (not just `category==='image'`) so `ico/avif/bmp` are excluded per AC-16. Covers AC-5, AC-6 (incl. finding 09 GIF→PNG).
- **Commit**: `665ab108` · 📡 companion pinged.

### T003 + T004 — `saveImageService` (TDD) ✅

- **RED**: `test/unit/web/features/086-image-editor/save-image.test.ts` (7 tests) — failed on missing module.
- **GREEN**: `apps/web/src/features/041-file-browser/services/save-image.ts` — Buffer write, atomic tmp→rename, mtime-conflict (overwrite + `expectedMtime` only → `serverMtime`), edited-copy unconditional, `security`/`write-failed` typed results. Modelled on `upload-file.ts` + `saveFileAction`.
- **Evidence**: 7 passed. Buffer round-trip verified (`getFile(ABS)` deep-equals input bytes); `.tmp` cleaned via rename; conflict leaves original bytes untouched.
- **Decision**: dropped the `force` flag from the contract — "overwrite anyway" is simply omitting `expectedMtime` (simpler than `saveFileAction`'s `force`). Covers AC-3, AC-4, AC-8, AC-9, AC-13.
- **Commit**: `b8e656bd` · 📡 companion pinged.

### T005 + T006 — `saveEditedImage` action + `perfect-freehand` dep ✅

- **T005**: `apps/web/app/actions/image-actions.ts` (`'use server'`) — `requireAuth`, server-side raster gate (`isRasterImageFilename` → `unsupported-type`), DI via `getContainer()`, trusted root from `workspaceService.getInfo(slug)`, server-owned naming (`deriveEditedFilename` for edited-copy), base64→Buffer, delegate to `saveImageService`. `SaveEditedImageResult` extends the service union with `unsupported-type`.
- **Decision**: binary payload crosses the action boundary as **base64 string** (decoded to Buffer server-side) — universally serializable, testable. Naming derivation lives server-side (single source of truth); client sends original `filePath` + `mode`.
- **T006**: `perfect-freehand@^1.2.3` added to `@chainglass/web` deps (lazy-chunk only).
- **Evidence**: `tsc --noEmit -p apps/web` → no errors in new files; dep present in `package.json`.
- **Commit**: `58b9f21c` · 📡 companion pinged. **Task group "Save backend" complete.**

### T007 + T008 — `canvas-coords` + `image-export` pure helpers (TDD) ✅

- **RED**: `canvas-coords.test.ts` (4) + `image-export.test.ts` (7) — failed on missing modules.
- **GREEN**: `viewer/lib/canvas-coords.ts` (`cssToImagePoint` — object-contain scale+offset+clamp) and `viewer/lib/image-export.ts` (`canvasExportFormat`, `exceedsCanvasLimit`, `MAX_CANVAS_DIMENSION=4096`, `MAX_CANVAS_AREA=16_777_216`).
- **Boundary decision**: viewer's `canvasExportFormat` (encoding) is deliberately separate from file-browser's `outputFormatForImage` (naming) so the viewer never imports file-browser (T019/G3). Shared GIF→PNG fact duplicated by design; documented in both files.
- **Evidence**: 11 passed.
- **Commit**: `602ee52b` · 📡 companion pinged.

### T009 + T010 + T011 — ImageEditor + toolbar + lazy + barrel + error/load states ✅

- **T009** `viewer/components/image-editor.tsx`: single canvas at intrinsic res; Pointer Events + `setPointerCapture` + `getCoalescedEvents`; `perfect-freehand` `getStroke`→Path2D→fill (`simulatePressure:false`, pressure `e.pressure || 0.5`); image-space stroke array + **undo** (no redo); `touch-action:none`; captures `imageMtime` (prop) → passed to `onSaveOver`; `data-testid` affordances for T016.
- **T010** `image-editor-toolbar.tsx` (pen color presets + 3 widths + Undo + Save over/Save as new/Cancel), `image-editor-lazy.tsx` (`dynamic ssr:false`, type-only props import so the chunk stays lazy), barrel exports `ImageEditorLazy` + `ImageEditorProps` + `ImageSaveOutcome`.
- **T011** error boundary (mirrors `EditorErrorBoundary`) + **load-failure** state (decode/0-dim/oversize → error UI, Save disabled, no canvas) + **export-failure** surfacing (`toBlob` `SecurityError`/null → inline error, strokes retained).
- **Boundary**: save flows DOWN as `onSaveOver`/`onSaveAsNew`/`onCancel` callbacks returning a viewer-owned `ImageSaveOutcome`; the conflict dialog lives in the parent (file-browser, T015) — the editor only reports the terminal outcome. Viewer imports nothing from file-browser. ✅
- **DI seam**: `saveImpl?(canvas, format) → base64` overrides the real `toBlob` exporter (jsdom has no `toBlob`).
- **Evidence**: `tsc --noEmit -p apps/web` → **0 errors in any image-editor file**. (Runtime/visual proof deferred to T016 browser smoke + manual.)

> **Discovery (pre-existing debt, NOT this plan)**: `apps/web` has **12 pre-existing `tsc` errors** in unrelated files — `app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` (ReadFileResult.content), `useAgentInstance.ts`, `workflow-execution-manager.ts`, `mobile-search-overlay.tsx`, `flowspace-mcp-client.ts`. None are in Plan-086 files. Flagged because they could affect the T017 `just build` gate (will assess at T017). Note: the route-level `(dashboard)/.../browser/browser-client.tsx` is **distinct** from the Domain-Manifest target `features/041-file-browser/components/browser-client.tsx` — T014/T015 must target the right file.

- **Commit**: `b6bcb378` · 📡 companion pinged. **Task group "Canvas helpers + editor" complete.**






### T012 — Binary round-trip integration test ✅

- `test/integration/web/image-editor-save.test.ts` (3 tests): builds a real PNG (signature + IHDR + IEND with valid CRC32), saves via `deriveEditedFilename`→`saveImageService` (the action's composition), reads back → **byte-identical** Buffer, valid PNG signature, IHDR dims preserved (120×80). Plus: edited-copy replaces existing sibling despite stale mtime; overwrite vs edited-copy path selection.
- **Note**: "decodable" = PNG signature + parseable IHDR (no pixel-decoder lib in the unit env; honest scope). Byte-equality is the real binary-fidelity proof. Covers AC-7, AC-9, AC-4.
- **Commit**: `002475ca` · 📡 companion pinged.

### T013 + T014 + T015 — Edit affordance + inline toggle + save UX wiring ✅

- **T013/T014** `file-viewer-panel.tsx` (`BinaryFileView`): raster-only **Edit** button (`category==='image' && isRasterImageFilename && onSaveImage` present); pre-measures natural size via a probe `Image` → **disables Edit with a message when oversized** (AC-14); Edit toggles the view area into `ImageEditorLazy` in place; success busts the `<img>` cache key.
- **T015** route `browser-client.tsx`: `handleSaveImage(payload, mode, expectedMtime)` → `saveEditedImage` action → on ok `handleRefreshFile()`; relays typed `{ok}|{ok:false,error}` (incl. `conflict`) back to the editor. Wired `onSaveImage` into BOTH FileViewerPanel render sites.
- **Evidence**: `tsc -p apps/web` → **0 new errors** (total stays 12 pre-existing); 32/32 086 unit+integration tests green. Runtime proof = T016 browser smoke + manual.

> **Deviation D1 (plan-vs-reality)**: the Domain Manifest named `apps/web/src/features/041-file-browser/components/browser-client.tsx` — **that file does not exist**. The real owner of `FileViewerPanel` + save wiring is the route `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`. Wired there instead. (That file also carries 2 of the 12 pre-existing `ReadFileResult.content` tsc errors — untouched by this work.)

> **Deviation D2 (conflict-dialog placement)**: plan T015 put the 3-way conflict dialog (Reload/Save-as-new/Overwrite-anyway) in browser-client. I placed it in the **editor (viewer)** instead — the editor holds the exported bytes + strokes, so it can re-issue overwrite-anyway / save-as-new without re-plumbing bytes through the parent, and it keeps the viewer↛file-browser boundary clean (the editor only calls its existing callbacks differently). browser-client stays a thin action+refresh relay. Functionally equivalent to AC-3.

- **Commit**: `18bd61bd` · 📡 companion pinged. **Task group "Integration + wiring" complete.**

### T016 — Playwright + CDP browser smoke ✅ (the runtime sensor)

- `harness/tests/smoke/image-editor-smoke.spec.ts`: writes a real (zlib-IDAT) PNG to the seeded workspace, opens it, dismisses the bootstrap gate, clicks **Edit**, asserts the canvas editor mounts (no `ssr:false` break), draws via pointer events, **Save as new → `sample-image-edited.png` appears on disk**, asserts **no `SecurityError`** (AC-17), editor exits on success, Cancel returns to view (AC-11).
- **Result**: ✅ **desktop + tablet PASS**, mobile skipped (out of scope). End-to-end proof of the whole stack: lazy editor (finding 03), pen, canvas export/CORS (AC-17), the `saveEditedImage` action + DI + **slug→`getInfo` trusted-root** + Buffer `saveImageService` + `deriveEditedFilename` — all verified in a real browser.
- **Run command**: `cd harness && npx playwright test tests/smoke/image-editor-smoke.spec.ts` (a.k.a. `just playwright`). **Done-when correction**: the plan said `just test-harness`, but that runs *vitest*; Playwright `.spec.ts` smokes run via `just playwright`.

> **Discovery (harness gotcha, HIGH value)**: the dev container uses a **named volume `cg_node_modules`** separate from the host. A host `pnpm add` does NOT reach it → the route 500'd with `Module not found: 'perfect-freehand'`. Fix: `docker exec chainglass-<worktree> sh -lc "cd /app && pnpm install --frozen-lockfile"` after adding a dep. Any future plan adding a dependency must re-install inside the container before the browser sensor will pass.
> **Discovery**: harness app port is slot-derived (this worktree = `:3107`, cdp `:9229`); get it via `cd harness && pnpm exec tsx src/cli/index.ts ports`. Workspaces are gated by a bootstrap code (`.chainglass/bootstrap-code.json`) — dismiss via `[data-testid="bootstrap-popup"]` (pattern from single-xterm smoke).

- **Commit**: `948ccfaf` · 📡 companion pinged.
