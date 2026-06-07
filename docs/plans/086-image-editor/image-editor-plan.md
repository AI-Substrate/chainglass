# In-browser Image Editor (pen / annotation) Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-07
**Spec**: [image-editor-spec.md](./image-editor-spec.md)
**Status**: READY

## Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain; all 6 Open Questions resolved in spec. |
| G2 | Constitution | PASS | TDD + fakes-over-mocks + `useFactory` DI honored. No new constitution violation; no Deviation Ledger needed. |
| G3 | Architecture | PASS | Dependency direction preserved: `_platform/viewer` never imports `file-browser` (save passed down as props); services consume `IFileSystem`/`IPathResolver` interfaces only. |
| G4 | ADR Compliance | PASS | ADR-0004 (DI via `getContainer()`+`SHARED_DI_TOKENS`), ADR-0008 (slug→worktree→`resolvePath`), ADR-0009 (registration pattern) all satisfied by modelling on `uploadFileService`. |
| G5 | Structure | PASS | All required sections present and populated. |
| G6 | Testing Alignment | PASS | Hybrid: deterministic units are TDD (test tasks precede impl); canvas feel is manual/visual; ACs are measurable. |
| G7 | Domain Completeness | PASS | All 3 spec domains present (modify viewer + file-browser, consume file-ops); no NEW domains; Domain Manifest covers every file in the task table. |

## Summary

Add an inline **Edit** affordance to the image viewer that swaps the image-view area into a lazy-loaded canvas editor (`perfect-freehand` + raw Canvas 2D) for freehand pen annotation, mirroring the markdown WYSIWYG editor precedent (Plan 083). On save, the user chooses **Save over** (mtime-guarded overwrite of the original) or **Save as new** (unconditional write of an idempotent `<base>-edited.<ext>` sibling). The save backend is a Buffer-based `saveImageService` modelled on `uploadFileService` (atomic tmp→rename, `IPathResolver` security) — **never** the string-only `saveFileAction` that would corrupt bytes. Output preserves the original format at native resolution; oversized images (iOS canvas limit) are blocked from editing. Pen is the only primitive for v1.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/viewer` | existing | **modify** | Add `ImageEditor` + `ImageEditorLazy` client components + pen/color/width toolbar + canvas coord/export helpers; export `ImageEditorLazy` from the barrel. Never imports `file-browser`. |
| `file-browser` | existing | **modify** | Add `saveImageService` + `image-filename` helper + `saveEditedImage` server action; add the raster-only Edit affordance, inline toggle, and save UX in `file-viewer-panel`/`browser-client`. |
| `_platform/file-ops` | existing | **consume** | Use `IFileSystem` (Buffer `writeFile`, `rename`, `exists`, `stat`→mtime), `IPathResolver` (security), `PathSecurityError`, `FakeFileSystem`/`FakePathResolver`. No changes. |

Flow is one-directional: `file-browser → viewer`, `file-browser → file-ops`. The editor receives `onSaveOver`/`onSaveAsNew`/`onCancel` callbacks as props (file-browser owns the save wiring) so the viewer never depends on file-browser.

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/041-file-browser/services/save-image.ts` | file-browser | internal | Buffer-based `saveImageService` (atomic tmp→rename), modelled on `upload-file.ts`. |
| `apps/web/src/features/041-file-browser/services/image-filename.ts` | file-browser | internal | Pure `-edited` derivation (idempotent) + format→MIME/extension mapping. |
| `apps/web/app/actions/image-actions.ts` | file-browser | contract | `saveEditedImage` server action; resolves DI, delegates to `saveImageService`. Public boundary. |
| `apps/web/src/features/_platform/viewer/components/image-editor.tsx` | _platform/viewer | internal | Heavy client component: canvas, pen drawing, undo, export, error/load states. |
| `apps/web/src/features/_platform/viewer/components/image-editor-lazy.tsx` | _platform/viewer | contract | `dynamic(() => import('./image-editor'), { ssr:false })` thin wrapper; barrel-exported. |
| `apps/web/src/features/_platform/viewer/components/image-editor-toolbar.tsx` | _platform/viewer | internal | Pen + color presets + 2–3 stroke widths + Save over / Save as new / Cancel. |
| `apps/web/src/features/_platform/viewer/lib/canvas-coords.ts` | _platform/viewer | internal | Pure CSS-px→image-px transform under `object-contain`. |
| `apps/web/src/features/_platform/viewer/lib/image-export.ts` | _platform/viewer | internal | `toBlob` format/quality/JPEG-flatten policy + large-image guard predicate. |
| `apps/web/src/features/_platform/viewer/index.ts` | _platform/viewer | contract | Barrel: export `ImageEditorLazy` + `ImageEditorProps`. |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | file-browser | internal | Add raster-only Edit control + inline edit-mode toggle + save UX dialogs. |
| `apps/web/src/features/041-file-browser/components/browser-client.tsx` | file-browser | internal | Wire `saveEditedImage` callbacks + refresh-on-save. |
| `apps/web/package.json` | file-browser | config | Add `perfect-freehand` dependency. |
| `test/unit/web/features/086-image-editor/image-filename.test.ts` | file-browser | internal | Pure-fn: `-edited` idempotency, format→MIME mapping. |
| `test/unit/web/features/086-image-editor/save-image.test.ts` | file-browser | internal | `saveImageService` with `FakeFileSystem`/`FakePathResolver`. |
| `test/unit/web/features/086-image-editor/canvas-coords.test.ts` | _platform/viewer | internal | Pure coordinate transform. |
| `test/unit/web/features/086-image-editor/image-export.test.ts` | _platform/viewer | internal | Large-image guard predicate + format/quality selection. |
| `test/integration/web/image-editor-save.test.ts` | file-browser | internal | Binary round-trip + action wiring with fakes. |
| `harness/tests/smoke/image-editor-smoke.spec.ts` | file-browser | internal | Playwright+CDP browser smoke (render, draw, `toBlob`, no `SecurityError`). |
| `docs/how/image-editor.md` | file-browser | internal | User guide (sibling to `markdown-wysiwyg.md`). |
| `docs/domains/_platform/viewer/domain.md` | _platform/viewer | contract | Refresh contracts with the new editor exports. |
| `docs/domains/file-browser/domain.md` | file-browser | contract | Refresh contracts with `saveImageService` + `saveEditedImage`. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Binary save**: `saveFileAction` is string-only and corrupts image bytes. `uploadFileService` (`services/upload-file.ts`) is the Buffer + atomic tmp→rename precedent. | Model `saveImageService` on `upload-file.ts`; take `content: Buffer`, `fileSystem`, `pathResolver` as injected deps (no new DI token). |
| 02 | Critical | **mtime-conflict already exists**: `saveFileAction` checks `expectedMtime !== stats.mtime` (with `force`) and returns `{ ok:false, error:'conflict', serverMtime }`. `FileStat.mtime` is an ISO string. | Reuse this exact pattern for AC-3 **Save over**. **Save as new** (`-edited`) is a derived name → **unconditional** write, no mtime check (AC-4). |
| 03 | Medium | **Lazy `ssr:false`**: repo is on **Next 16.2.6** (spec said "Next 15"). Next 16 has **fixed** the Next-15 `ssr:false`-from-server-component build break, so this is now **low risk** — but mirror the proven `markdown-wysiwyg-editor-lazy.tsx` thin-wrapper anyway. | `image-editor-lazy.tsx` mirrors it exactly; heavy logic in `image-editor.tsx`. `just build` (T017) + T016 smoke catch any regression at build/runtime. |
| 04 | High | **CORS taint**: `toBlob` throws `SecurityError` on a tainted canvas. The raw-file route (`/api/workspaces/[slug]/files/raw`) is same-origin → safe. | Load bg via the raw route; AC-17 proven by the harness smoke spec (draw→save→assert Blob + no `SecurityError`) + `just build`. |
| 05 | High | **iOS canvas limit**: images >~16.7M px or any dim >4096 silently break canvas on iOS Safari. | Pure guard predicate disables the Edit control with an explanatory message (AC-14); blocks rather than scales so AC-7 fidelity holds. |
| 06 | Medium | **`perfect-freehand` is a NEW dep** (~8KB gz); **no bundle-size CI guard** exists (`@next/bundle-analyzer` is a devDep but unscripted). | Keep it inside the lazy chunk; verify AC-10 via `just build` (production build succeeds) + manual analyzer note. Optional future CI gate. |
| 07 | Medium | **Edit predicate**: `content-type-detection.ts` `detectContentType()` classifies images incl. `svg`. | Edit shown iff `category==='image' && ext!=='svg'` (raster-only, AC-1/AC-16); reuse `detectContentType`. |
| 08 | Medium | **DI in the action**: server actions resolve `SHARED_DI_TOKENS.FILESYSTEM`/`PATH_RESOLVER` via `getContainer()` (`bootstrap-singleton.ts`); ADR-0004/0008 satisfied by the `uploadFileService` pattern. | `saveEditedImage` resolves DI, validates slug→worktree, delegates to the pure `saveImageService`. |
| 09 | Medium | **GIF export**: `canvas.toBlob` has **no GIF encoder** — preserving the `.gif` extension via canvas is impossible. AC-6 ("GIF flattens to a single still frame") therefore means GIF must export as a **PNG** still. | `image-filename`/`image-export` map a `.gif` source → `<name>-edited.png` (lossless still). Document this as the one extension that legitimately changes. |

> **Assumptions** (must hold for the thesis): (a) the raw-file route `/api/workspaces/[slug]/files/raw` stays **same-origin** so `toBlob` is untainted (AC-17) — verified by T016 smoke; if it ever moves cross-origin the editor cannot export and AC-17 fails (blocker). (b) `saveImageService` can mirror `uploadFileService` (confirmed). (c) the harness CDP browser can drive the canvas (markdown-wysiwyg precedent confirms).
>
> **Scope boundary**: v1 is **pen-only by deliberate decision** — **no eraser** (undo covers mistakes), no text/shapes/fill/layers/zoom (spec Non-Goals). Don't add tools beyond pen + color presets + 2–3 widths.

## Implementation

**Objective**: Ship an inline pen-annotation image editor with a Buffer-safe, mtime-guarded save backend, reusing the markdown-editor precedents.
**Testing Approach**: Hybrid (per spec) — TDD the deterministic units (filename derivation, save service, coordinate map, format/guard); manual/visual for pen feel + a Playwright smoke for canvas export/CORS. Use `FakeFileSystem`/`FakePathResolver` + a `saveImpl?` DI prop; **no `vi.mock`**.

> The backpressure survey (`backpressure-coverage.md`, Certainty: Partial) recommended a Phase 0 of deterministic sensors. In Simple mode these are folded in as the **test-first tasks below** (T001–T004 units, T011 integration round-trip, T016 browser smoke) — they precede the implementation they prove.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | **(TDD)** Write failing unit tests for `image-filename`: `-edited` idempotency (`foo.png`→`foo-edited.png`; `foo-edited.png`→`foo-edited.png`, never `-edited-edited`), and format→MIME/extension mapping incl. JPEG/WebP/PNG **and the GIF→PNG case** (`foo.gif`→`foo-edited.png`). | file-browser | `test/unit/web/features/086-image-editor/image-filename.test.ts` | Tests exist and fail (no impl); cover AC-5, AC-6 (incl. GIF→PNG, finding 09). | Per finding 07,09; Test Doc 5-field format. |
| [x] | T002 | Implement `image-filename` helper (pure): strip a trailing `-edited` from base before appending; map extension→MIME + JPEG-quality/flatten policy; **GIF source → PNG output** (canvas can't encode GIF). | file-browser | `apps/web/src/features/041-file-browser/services/image-filename.ts` | T001 passes (green). | Idempotent suffix (AC-5); preserve original ext except GIF→PNG (AC-6, finding 09). |
| [x] | T003 | **(TDD)** Write failing unit tests for `saveImageService` with `FakeFileSystem`/`FakePathResolver`: overwrite mtime-conflict halt + `serverMtime`; save-as-new unconditional replace; `PathSecurityError`→`{ok:false,error:'security'}`; `write-failed` on FS error. | file-browser | `test/unit/web/features/086-image-editor/save-image.test.ts` | Tests exist and fail; cover AC-3, AC-4, AC-8, AC-13. | Per findings 01,02; fakes injected, no `vi.mock`. |
| [x] | T004 | Implement `saveImageService({ worktreePath, filePath, content:Buffer, mode:'overwrite'\|'edited-copy', expectedMtime?, fileSystem, pathResolver })` modelled on `upload-file.ts` (atomic tmp→rename). Returns `{ok:true,savedPath,newMtime} \| {ok:false,error:'conflict'\|'security'\|'write-failed', serverMtime?}`. | file-browser | `apps/web/src/features/041-file-browser/services/save-image.ts` | T003 passes; mtime check only on `overwrite` mode. | Per finding 01,02; Buffer write (AC-9), security (AC-8). |
| [x] | T005 | Add `saveEditedImage` server action: resolve `FILESYSTEM`/`PATH_RESOLVER` via `getContainer()`, validate slug→worktree, **reject non-raster types** (ext not in png/jpg/jpeg/gif/webp → typed `unsupported-type` error, defense-in-depth for AC-16), decode payload to Buffer, delegate to `saveImageService`; return typed result. | file-browser | `apps/web/app/actions/image-actions.ts` | Action compiles; typecheck passes; rejects svg/binary path; wired to service. | Per finding 08; ADR-0004/0008; AC-16 enforced server-side too. |
| [x] | T006 | Add `perfect-freehand` dependency. | file-browser | `apps/web/package.json` | `pnpm install` succeeds; dep present. | Per finding 06; lazy-chunk only. |
| [x] | T007 | **(TDD)** Write failing unit tests for `canvas-coords` (CSS-px→image-px under `object-contain`) and `image-export` (large-image guard predicate ≥16.7M px or dim>4096; format/quality selection + JPEG flatten-to-white). | _platform/viewer | `test/unit/web/features/086-image-editor/canvas-coords.test.ts`, `image-export.test.ts` | Tests exist and fail; cover AC-7(map), AC-14, AC-6. | Pure functions. |
| [x] | T008 | Implement `canvas-coords` + `image-export` pure helpers. | _platform/viewer | `apps/web/src/features/_platform/viewer/lib/canvas-coords.ts`, `lib/image-export.ts` | T007 passes. | Single canvas at intrinsic res; ignore DPR for backing store. |
| [x] | T009 | Implement `ImageEditor` client component: single canvas at image intrinsic resolution, Pointer Events + `setPointerCapture` + `getCoalescedEvents`, `perfect-freehand` `getStroke`→`Path2D`→`fill` (`simulatePressure:false`; pressure = `event.pressure \|\| 0.5` so mouse falls back to constant ≈0.5), image-space stroke array + **undo stack** (revert last stroke; no redo in v1), `touch-action:none`. Capture `imageMtime` (ISO, from file metadata) on load → pass to `onSaveOver`. Props: `{ imageSrc, filename, imageMtime?, onSaveOver?, onSaveAsNew?, onCancel?, saveImpl? }` + `data-testid` affordances for the smoke spec (T016). | _platform/viewer | `apps/web/src/features/_platform/viewer/components/image-editor.tsx` | Renders canvas over image; pen draws; undo reverts last stroke (manual/visual + T016). | AC-2; mtime captured here (finding 02); DI seam `saveImpl?`. |
| [x] | T010 | Implement `image-editor-toolbar` (pen + color presets + 2–3 stroke widths + Save over / Save as new / Cancel) and `ImageEditorLazy` (`dynamic {ssr:false}` wrapper); export `ImageEditorLazy` + `ImageEditorProps` from the viewer barrel. | _platform/viewer | `apps/web/src/features/_platform/viewer/components/image-editor-toolbar.tsx`, `image-editor-lazy.tsx`, `index.ts` | Toolbar renders; lazy wrapper imports without SSR; barrel exports. | Per finding 03; AC-2, AC-10, AC-12. |
| [x] | T011 | Add error boundary + **image-load-failure** state (raw-route error/0-byte → error UI, Save disabled, canvas not initialized) + **canvas-export-failure** surfacing (toBlob `SecurityError` → error, not silent). | _platform/viewer | `apps/web/src/features/_platform/viewer/components/image-editor.tsx` | Bad image src shows error state, Save disabled (manual). | AC-15, AC-17; mirror `EditorErrorBoundary`. |
| [x] | T012 | **(integration)** Binary round-trip + action-wiring test: write a known PNG Buffer via the service path → read back → assert dimensions + decodable; assert save-as-new replaces existing `-edited` unconditionally. | file-browser | `test/integration/web/image-editor-save.test.ts` | Test passes against fakes. | AC-7, AC-9; no `vi.mock`. |
| [x] | T013 | Add raster-only **Edit affordance** in the viewer: predicate `detectContentType(filename).category==='image' && ext!=='svg'`; control disabled with message when the large-image guard trips. | file-browser | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Edit shown for png/jpg/jpeg/gif/webp only; hidden for svg/binary; disabled+message when oversized. | AC-1, AC-14, AC-16; per finding 07. |
| [x] | T014 | Wire **inline edit-mode toggle**: Edit swaps the image-view area into `ImageEditorLazy` in place (markdown Source/Rich precedent), keeping the file browser visible; Cancel returns to plain image view (confirm if unsaved strokes). | file-browser | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Toggle enters/exits editor inline; cancel/discard confirm works (manual). | AC-1, AC-11. |
| [x] | T015 | Wire **save UX + callbacks**: two actions → `saveEditedImage`; **Save over** prompts destructive confirm + sends `expectedMtime` (from `imageMtime` captured in T009), on `conflict` shows a dialog with **Reload** (refetch + discard strokes), **Save-as-new** (switch to `edited-copy` mode), **Overwrite-anyway** (resend with `force`/no `expectedMtime`); **Save as new** unconditional; on any failure surface error + **retain strokes** + allow retry; on success refresh via `handleRefreshFile`. | file-browser | `apps/web/src/features/041-file-browser/components/browser-client.tsx`, `file-viewer-panel.tsx` | Save over/new both persist + viewer refreshes; conflict dialog branches + failure-retain behave per ACs (manual + T016). | AC-3, AC-4, AC-12, AC-13; refresh per finding (use-file-navigation). |
| [ ] | T016 | **(browser sensor)** Add Playwright+CDP smoke spec modelled on `markdown-wysiwyg-smoke.spec.ts`: navigate to a raster image in edit mode (assert editor mounts, no `ssr:false` runtime break), draw via pointer events, Save as new, assert a Blob is produced with **no `SecurityError`** in console + the `-edited` file appears, exit via Cancel. Drives AC-1/16 (render), AC-11/12 (save/cancel UX), AC-17 (export/CORS). **Does NOT prove AC-2 pen feel/pressure** — that stays manual/visual (human-judgement, per backpressure survey). | file-browser | `harness/tests/smoke/image-editor-smoke.spec.ts` | Spec runs green under `just test-harness` (container up). | Closes the canvas/CORS eyeball-gap; also the runtime sensor for finding 03. |
| [ ] | T017 | **(sensor)** Verify **AC-10**: `just build` succeeds, then a build-output assertion parses the `.next` build manifest to confirm the editor chunk + `perfect-freehand` are **not** in the initial/shared bundle (lazy chunk only). | file-browser | `test/unit/web/features/086-image-editor/bundle-ac10.test.ts` (or a `just` check), build output | `just build` green; manifest assertion passes (editor not in initial bundle). | Per finding 06; backpressure marked this BUILDABLE — make it deterministic, not a manual eyeball. |
| [ ] | T018 | Docs + domain refresh: write `docs/how/image-editor.md`; refresh `_platform/viewer` and `file-browser` `domain.md` contracts with the new exports/services. | both | `docs/how/image-editor.md`, `docs/domains/_platform/viewer/domain.md`, `docs/domains/file-browser/domain.md` | Guide written; domain.md contracts list the new symbols. | Plan 083 documentation precedent. |
| [ ] | T019 | Add a lightweight dependency-direction guard test asserting `_platform/viewer` does not import `file-browser` (grep/AST over viewer sources). | _platform/viewer | `test/unit/web/architecture/viewer-no-file-browser.test.ts` | Guard test passes. | Closes the one genuine ABSENT sensor from the backpressure survey; integration import sites are `file-viewer-panel.tsx`/`browser-client.tsx` (file-browser→viewer only). |

### Acceptance Criteria

- [ ] AC-1 — Raster image shows an inline Edit control; activating it toggles the view area into the canvas editor; non-raster/binary show none.
- [ ] AC-2 — Freehand pen draws (pointer/mouse/touch), pressure-aware with ≈0.5 fallback; color presets + 2–3 stroke widths.
- [ ] AC-3 — Save over prompts destructive confirm, writes to original, refreshes; external mtime change halts with Reload/Save-as-new/Overwrite-anyway.
- [ ] AC-4 — Save as new writes `<name>-edited.<ext>`; existing `-edited` replaced unconditionally (no mtime prompt).
- [ ] AC-5 — Editing a `<base>-edited.<ext>` saves back to the same file (idempotent suffix; never `-edited-edited`).
- [ ] AC-6 — Output preserves original format/extension; JPEG flattens alpha→white at quality ≈0.92; PNG/WebP-lossless keep transparency.
- [ ] AC-7 — Saved image preserves native pixel dimensions.
- [ ] AC-8 — Save paths validated via `IPathResolver`; traversal → `PathSecurityError`, no write.
- [ ] AC-9 — Saved bytes are valid image bytes (Buffer write, not string `saveFile`).
- [ ] AC-10 — Editor + canvas lib lazy-loaded (`ssr:false`); not in initial bundle; production build succeeds.
- [ ] AC-11 — Cancel/discard exits to plain image view; unsaved strokes discarded with confirmation.
- [ ] AC-12 — Toolbar exposes two explicit actions: Save over + Save as new.
- [ ] AC-13 — Save failure surfaces an error, retains strokes, allows retry; typed result incl. `write-failed`.
- [ ] AC-14 — Images >~16.7M px or dim >4096 cannot be edited; Edit disabled with explanatory message.
- [ ] AC-15 — Image-load failure shows an error state; Save disabled; canvas not initialized.
- [ ] AC-16 — Edit shown only for raster (png/jpg/jpeg/gif/webp); SVG + non-image rejected gracefully.
- [ ] AC-17 — Background loaded same-origin so `toBlob` succeeds (no CORS taint); export failure surfaces an error.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CORS-tainted canvas → `toBlob` throws | Low | High | Load bg from same-origin raw route; harness smoke asserts no `SecurityError` (T016); editor surfaces export errors (T011). |
| iOS Safari canvas size limit | Medium | High | Pure guard predicate blocks editing >16.7M px / >4096 (T007/T013); scaling deferred to preserve AC-7. |
| Next 16 `ssr:false` build break | Low | Medium | Thin client wrapper exemplar (`markdown-wysiwyg-editor-lazy.tsx`) replicated (T010). |
| `perfect-freehand` leaks into initial bundle | Low | Medium | Lazy chunk only; `just build` + analyzer check (T017); no CI guard today. |
| Re-encode quality loss (JPEG/WebP) | Medium | Low | Accepted per AC-6; PNG stays lossless; quality ≈0.92. |
| Binary corruption via wrong save path | Low | Critical | `saveImageService` uses Buffer write modelled on `uploadFileService`; round-trip test (T012). |

## Agent Harness Strategy

- **Current Maturity**: Browser-capable harness present (`harness/` — Playwright + CDP→Chromium, `harness/tests/{smoke,features,responsive}`). Legacy governance doc at `docs/project-rules/harness.md`.
- **Boot Command**: `just harness dev` (container) / `just dev` (app).
- **Health Check**: `just harness-health`.
- **Interaction Model**: Browser (CDP) + harness CLI (`check-route`, `screenshot`, `console-logs`).
- **Evidence Capture**: Playwright screenshots/trace on failure; console-log capture for `SecurityError`.
- **Pre-Phase Validation**: T016 smoke spec is the canvas/CORS sensor (modelled on `markdown-wysiwyg-smoke.spec.ts`). No new harness build required — sufficient for this UI feature.

---

## Validation Record (2026-06-07)

### Validation Thesis

**Raison d'être**: Turn the clarified spec into a buildable, gate-checked implementation plan so `/plan-6` can build the in-browser pen-annotation image editor with minimal clarification; resolve domain placement, the save-backend choice, and TDD task ordering before code.
**Value claim**: Implementation is faster/safer — the binary-save gotcha, canvas pitfalls (CORS/iOS/`ssr:false`/DPR), exact reuse anchors, and test-first ordering are pinned down; rework avoided.
**Artifact promise**: `/plan-6` implements directly from the task table; every spec AC maps to a task; every file has a domain classification; tests precede impl.
**Intended beneficiaries**: `/plan-6` implementer, `/plan-7` reviewer, future maintainers.
**Proof target**: Implementation.
**Evidence standard**: Real source anchors (scout-verified), AC↔task coverage, TDD ordering, domain-manifest completeness, measurable done-when.
**Thesis source**: image-editor-spec.md + research-dossier.md + original-ask.md (grounded).
**Thesis verdict**: Advanced.
**Main thesis risk**: A few edge behaviours were under-surfaced in the first draft (GIF→PNG encoding limit, server-side SVG rejection, mtime-capture site, manual AC-10) — all fixed in this pass.

| Agent | Lenses Covered | Thesis Axes | Issues | Verdict |
|-------|---------------|-------------|--------|---------|
| Coherence & Completeness | System Behavior, Edge Cases, Integration & Ripple, Proof-Level Fit, Evidence Sufficiency | Implementation Readiness | All 17 ACs covered; TDD ordering correct; 3 MED (GIF, SVG-at-action, manual done-whens), 2 LOW — fixed/clarified | ⚠️→✅ |
| Source-Truth & Risk | Technical Constraints, Hidden Assumptions, Security, Evidence Sufficiency, Domain Boundaries | Contract Integrity | All 7 code anchors VERIFIED against source; 1 HIGH (Next 15→16 drift), 1 MED (bundle manual) — fixed | ⚠️→✅ |
| Thesis Alignment | Thesis Alignment, Proof-Level Fit, Evidence Sufficiency | Thesis, Downstream Usefulness | 2 HIGH (T016 scope, raw-route assumption), 4 MED, 2 LOW — fixed/clarified | ⚠️→✅ |
| Forward-Compatibility | Forward-Compatibility, Deployment & Ops, Domain Boundaries | Agent Readiness | No blocking issues; all 4 consumers ✅ | ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6` implement | 7-col task table, TDD ordering, measurable Done-When, real paths | shape mismatch | ✅ | 19 tasks; T001→T002 / T003→T004 / T007→T008 test-first; absolute paths; contract matches spec sketch (T004/T009) |
| `/plan-7` review | Domain Manifest + 17-AC list | contract drift | ✅ | Manifest covers every task file; AC-1..17 measurable; Gate Matrix all PASS |
| harness smoke (T016) | `data-*` affordances to select/drive the editor | test boundary | ✅ | T009 + T016 mandate `data-testid` affordances (markdown-wysiwyg precedent) |
| domain docs (T018) | New exports declared for contract refresh | contract drift | ✅ | T018 refreshes both domain.md; manifest pre-identifies `ImageEditorLazy`/`saveImageService`/`saveEditedImage` |

**Thesis alignment**: Value claim **advanced** at the Implementation proof level with adequate-now-strong evidence (source anchors verified, ACs fully mapped); the residual edge-case gaps surfaced by validation were fixed in this pass.
**Outcome alignment**: The plan "turns the viewer into a quick annotation tool — circle the bug, mark up the screenshot — without leaving the app" by adding an inline Edit affordance that swaps the image-view area into a lazy pen editor with Save-over/Save-as-new callbacks wired from file-browser, preserving format and domain boundaries (viewer never imports file-browser) — **the plan advances the outcome.**
**Standalone?**: No — downstream consumers `/plan-6`, `/plan-7`, the harness smoke, and the domain docs all depend on this plan's shape.

Overall: ⚠️ **VALIDATED WITH FIXES**
