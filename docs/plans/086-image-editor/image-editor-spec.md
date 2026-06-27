# In-browser Image Editor (pen / annotation)

**Mode**: Simple
**Status**: Specified
**Slug**: image-editor
**Created**: 2026-06-07

> 📚 Specification incorporates findings from [research-dossier.md](./research-dossier.md) and [external-research/canvas-pen-annotation.md](./external-research/canvas-pen-annotation.md).

## Research Context

- Images are **view-only** today: selecting an image renders `BinaryFileView → ImageViewer` (an `<img>` pointing at the raw-file route `/api/workspaces/[slug]/files/raw`). No edit affordance exists.
- The **markdown WYSIWYG editor (Plan 083)** is a near-exact structural precedent: lazy-loaded (`next/dynamic {ssr:false}`), mode-toggled in `FileViewerPanel`, saved via a server action, testable via DI injection.
- **Save gotcha**: `saveFile` is string-only and would corrupt image bytes; the correct precedent is the **Buffer-based `uploadFileService`** (atomic tmp→rename + `IPathResolver` security).
- **No canvas library exists** in the repo. Recommended minimal stack: **`perfect-freehand` + raw Canvas 2D**. Master architecture decision: one canvas sized to the image's **intrinsic resolution**, CSS-scaled for display; ignore `devicePixelRatio` for the backing store. Pointer Events + `setPointerCapture` + `getCoalescedEvents`; `getStroke()`→`Path2D`→`ctx.fill()` with `simulatePressure:false`.
- **Cross-cutting risks to honor**: CORS-tainted canvas makes `toBlob` throw; iOS Safari ~4096²/16.7M-px canvas limit; `touch-action:none` mandatory; Next 15 `ssr:false`-from-server-component build break (wrap in a thin client component).

## Summary

Add an **Edit** affordance to the image viewer. Clicking it toggles the image-view area **inline** into a lazy-loaded canvas editor where the user draws **freehand pen** annotations over the image (pen + a small color picker + a few stroke widths). On save, the user chooses **Save over** (overwrite the original) or **Save as new** (write `<name>-edited.<ext>` beside it, replacing any existing `-edited`). The edited file **preserves the original format/extension**. Pen is the only drawing primitive for now; text/shapes are explicitly later.

## Goals

- An **Edit** button on the full image view for raster image files.
- A client-only, lazy-loaded **inline** canvas editor with a **freehand pen** tool, a small **color picker**, and a few **stroke widths**.
- **Save over** the original, or **Save as new** → `<name>-edited.<ext>` (replacing any existing `-edited` sibling).
- Exported bytes preserve the image's native resolution.
- Reuse the markdown-editor precedents (lazy mount, toolbar pattern, DI-injectable save, error boundary).

## Non-Goals

- Text, shapes, fill, selection, layers, zoom/pan (future).
- Editing **SVG** as a vector (raster-only feature for now; SVG excluded — see Open Questions).
- Animated GIF frame editing (flattens to a single frame if ever supported).
- Collaborative / multi-user editing.
- A general media library or non-image binary editing.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `_platform/viewer` | existing | **modify** | Add `ImageEditor` + `ImageEditorLazy` client components (canvas + pen toolbar), mirroring the WYSIWYG editor. Export from barrel. |
| `file-browser` | existing | **modify** | Add `saveImageService` + `saveEditedImage` server action; add the Edit affordance + save UX wiring in `FileViewerPanel`/`browser-client`. |
| `_platform/file-ops` | existing | **consume** | Use `IFileSystem` (Buffer `writeFile`, `rename`, `exists`, `stat`), `IPathResolver` (security), atomic tmp→rename. No changes. |

No new domains. Flow stays one-directional (`file-browser → viewer`, `file-browser → file-ops`); viewer never imports file-browser. Boundary risk: do **not** reuse string-only `saveFile` — model on `uploadFileService`.

## Testing Strategy

- **Approach**: Hybrid — TDD the deterministic units; manual/visual for the canvas drawing experience.
- **Rationale**: Save backend (filename derivation, overwrite-vs-new, `-edited` replacement, path security, format handling) is pure and high-value to test; pen rendering/feel is inherently visual.
- **Focus Areas (automated)**: `saveImageService` (overwrite path, save-as-new path, **`-edited` idempotency** — `foo-edited.png` saved-as-new stays `foo-edited.png`, never `foo-edited-edited.png`, mtime-conflict on overwrite, unconditional replace on save-as-new, `PathSecurityError` on traversal, `write-failed`/error result shape, format/extension + JPEG-alpha-flatten handling); filename-derivation helper; coordinate-mapping pure function (CSS px → image px under object-contain); large-image guard predicate (≥16.7M px or dim >4096 → blocked).
- **Excluded (manual / visual)**: actual pen stroke rendering quality, pointer smoothing, toolbar look/feel, mobile drawing, `touch-action:none` (no page-scroll while drawing), and **CORS/canvas-export** sanity (load a large same-origin image and confirm `toBlob` produces a file with no `SecurityError` in dev + a production build).
- **Mock Usage**: Avoid mocks for business logic — use the existing `FakeFileSystem` / `FakePathResolver` injected via DI; an injectable `saveImageImpl?`/fake for component integration tests (no `vi.mock`).

## Documentation Strategy

- **Location**: `docs/how/image-editor.md` (sibling to `docs/how/markdown-wysiwyg.md`), plus refresh the `_platform/viewer` and `file-browser` `domain.md` contracts when the editor lands (Plan 083 learning).
- **Rationale**: Matches the existing editor's documentation precedent.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=2, F=1, T=1 → P=9 → CS-4
- **Confidence**: 0.70
- **Note**: CS lands at CS-4 (multi-domain + first canvas lib + cross-cutting risks), but the user has chosen **Simple mode** deliberately — the feature scope is intentionally minimal and can be escalated to Full later if phasing demands it.
- **Assumptions**: raw-file route can serve images canvas-safely (same-origin, no taint); perfect-freehand is added as a new dependency; binary save mirrors `uploadFileService`.
- **Dependencies**: `perfect-freehand` (new); existing viewer + file-ops + file-browser contracts.
- **Risks**: see Risks & Assumptions.
- **Suggested phases (informal, Simple mode)**: (1) Save backend — Buffer-based `saveImageService` + server action + filename logic (TDD); (2) Canvas editor component — `ImageEditor`/`ImageEditorLazy` + pen toolbar; (3) Integration — Edit affordance, save UX, wiring, refresh-on-save, docs + domain.md refresh.

## Acceptance Criteria

1. **Edit affordance**: When a **raster** image (png/jpg/jpeg/gif/webp; not svg) is shown full in the browser, an **Edit** control is visible; activating it toggles the image-view area **inline** into the canvas editor with the current image as the background. Non-raster/binary files show no Edit control.
2. **Pen drawing**: The user can draw freehand pen strokes over the image with pointer/mouse/touch; strokes are pressure-aware where the device supplies pressure, and fall back to a **constant effective pressure** (≈0.5) on mouse / non-pressure hardware so lines still render smoothly. The editor exposes a **color picker** (a few presets) and **2–3 stroke widths**.
3. **Save over**: Choosing **Save over** prompts a brief **destructive-action confirmation**, then writes the composited result back to the **original** file path; the viewer refreshes to show the edited image. If the original was **externally modified** since the editor opened (mtime conflict), the save is **halted** and a dialog offers Reload / Save-as-new / Overwrite-anyway — it never silently clobbers.
4. **Save as new**: Choosing **Save as new** writes `<name>-edited.<ext>` in the same directory. If a `<name>-edited.<ext>` already exists it is **replaced** (overwritten), not duplicated — and because `-edited` is a *derived* name (not the authoritative original), this replacement is **unconditional** (no mtime conflict prompt).
5. **`-edited` collision rule (re-edit in place)**: When the file being edited is **already** `<base>-edited.<ext>`, "Save as new" overwrites that **same** `<base>-edited.<ext>` — it never produces `<base>-edited-edited.<ext>`. (Derivation: the `-edited` suffix is idempotent — strip an existing trailing `-edited` from the base before appending, so the target is always a single-`-edited` sibling.)
6. **Output format (preserve original)**: The edited image is written in the **original file's format/extension** (`foo.jpg → foo-edited.jpg`, `foo.png → foo-edited.png`). The canvas exports via `toBlob` with the MIME matching the original extension. PNG/WebP-lossless preserve transparency; JPEG (no alpha) flattens transparency onto a **white** background and is encoded at **quality ≈ 0.92**. JPEG/WebP re-encode is accepted as slightly lossy; PNG is lossless. GIF sources flatten to a single still frame in their static form (animation is a non-goal).
7. **Resolution fidelity**: The saved image preserves the original's native pixel dimensions (no downscale to the displayed size).
8. **Security**: Save paths are validated via `IPathResolver`; a traversal attempt yields `PathSecurityError` and no write.
9. **Binary integrity**: Saved bytes are valid image bytes (the save path uses a Buffer write, not the string `saveFile`).
10. **Client-only**: The editor + canvas library are lazy-loaded (`next/dynamic {ssr:false}`); they do not appear in the initial bundle and the production build succeeds.
11. **Cancel / discard**: The user can exit the editor without saving and return to the plain image view; unsaved strokes are discarded (with confirmation if there are unsaved changes).
12. **Save UX**: The editor toolbar exposes **two explicit actions** — **Save over** and **Save as new** (per AC-3/AC-4). (Resolves Open Question #6; "Save over" is the confirmation-guarded destructive path.)
13. **Save failure handling**: If a save fails (permission denied, disk/I-O error, security rejection, or mtime conflict), an **error is surfaced** in the editor, the user's **strokes are retained** (not lost), and the action can be **retried**. The `saveEditedImage` action returns a typed result mirroring `SaveFileResult` plus a `write-failed` case.
14. **Large-image guard**: Images whose pixel area exceeds a safe canvas limit (~16.7M px) **or** any dimension exceeds **4096 px** cannot be edited; the **Edit control is disabled** with an explanatory message ("image too large to edit on this device"). (Protects iOS Safari; scaling support is a future enhancement and is deliberately excluded so AC-7 resolution fidelity holds.)
15. **Image-load failure**: If the background image fails to load (0-byte, corrupt, or raw-route error), the editor shows an **error state** and the Save actions are **disabled**; the canvas is not initialized.
16. **Non-raster exclusion enforced**: The Edit control is **shown only** for raster image files (png/jpg/jpeg/gif/webp). **SVG** and all non-image/binary files show **no** Edit control; a direct edit attempt on an unsupported type is rejected gracefully.
17. **Canvas export succeeds (no CORS taint)**: The background image is loaded from the **same-origin** raw-file route such that `canvas.toBlob()` succeeds (no `SecurityError`). If export ever fails due to a tainted canvas, the editor surfaces an error rather than silently producing no file.

## Risks & Assumptions

- **CORS taint**: if the background image is loaded cross-origin without proper headers, `canvas.toBlob` throws `SecurityError`. The raw-file route is same-origin, so expected to be safe — confirm during build.
- **iOS canvas limits**: very large images (> ~16.7M px or any dimension > ~4096) can silently break canvas on iOS Safari — needs a pixel-area guard / max-dimension handling.
- **Next 15 `ssr:false`**: dynamic import with `ssr:false` from a server component breaks the build — wrap in a thin client component (Plan 083 lazy pattern handles this).
- **Format loss**: re-encoding JPEG/WebP loses quality; PNG avoids loss but grows file size for photos (drives AC-6 decision).
- **Bundle**: perfect-freehand is ~2–5 KB; the canvas component must stay lazy so it never hits the initial bundle.
- **Assumption**: pen-only is acceptable for v1 (annotation use case), per the original ask.

## Open Questions

1. ✅ Editor UX → **inline mode toggle** in the viewer panel (resolved, Round 2).
2. ✅ `-edited` collision → **re-edit in place** (idempotent suffix; AC-5 resolved).
3. ✅ Output format → **preserve original format/extension** (AC-6 resolved).
4. ✅ Tool scope v1 → **pen + color picker + stroke widths** (no eraser; undo covers mistakes).
5. SVG: confirmed **excluded** for now (raster-only) — vector editing needs the shape/text tools planned for a later phase; enforced by AC-16.
6. ✅ "Save over" confirmation → **yes**, confirm on overwrite of the original (AC-3, AC-12); save-as-new is unconfirmed (AC-4); cancel/discard with unsaved strokes confirms (AC-11).

_Note: AC-12 through AC-17 and several AC refinements were added during the `validate-v2` pass (edge cases the architect would otherwise have to invent). The format-quality (JPEG ≈0.92 / flatten-to-white) and large-image-guard-blocks-rather-than-scales decisions are reasonable defaults applied during validation — flag them if you'd prefer different behavior._

## Contract Sketch (reference for the architect — not final API)

Lightweight shape so the architect/implementer doesn't have to reinvent it; final names/signatures are the architect's call. Mirrors the markdown-editor precedent.

- **Component** (`_platform/viewer`): `ImageEditorLazy = dynamic(() => import('./image-editor'), { ssr:false, loading: <spinner> })`. Approx props:
  `ImageEditorProps { imageSrc: string; filename: string; onSaveOver?: (blob: Blob) => Promise<void>; onSaveAsNew?: (blob: Blob) => Promise<void>; onCancel?: () => void; saveImpl?: ... /* DI seam for tests */ }`.
  Internal: stroke array in image-space coords, undo/redo, pen + color + width toolbar, error boundary with "view image only" fallback.
- **Service** (`file-browser`): `saveImageService({ worktreePath, filePath, content: Buffer, mode: 'overwrite' | 'edited-copy', expectedMtime?, fileSystem, pathResolver }) → Promise<SaveImageResult>` where `SaveImageResult = { ok: true; savedPath; newMtime } | { ok: false; error: 'conflict' | 'security' | 'write-failed' }`. Modeled on `uploadFileService` (Buffer + atomic tmp→rename), **not** the string `saveFile`.
- **Server action** (`file-browser`): `saveEditedImage(slug, worktreePath, filePath, FormData|base64, mode, expectedMtime?)` → resolves DI, delegates to `saveImageService`.

## Reuse Map (markdown-editor → image-editor)

| Markdown-editor precedent | Image-editor equivalent |
|---|---|
| `MarkdownWysiwygEditorLazy` (`dynamic {ssr:false}`) | `ImageEditorLazy` |
| `wysiwyg-toolbar(-config)` | pen/color/width toolbar |
| `saveFileImpl?` DI prop | `saveImpl?` DI prop (no `vi.mock`) |
| editor error boundary + "Switch to Source" | error boundary + "View image only" |
| `uploadFileService` (Buffer, atomic) | `saveImageService` |

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Editor UX & save flow | State Machine | The view↔edit↔save-choice flow and unsaved-changes handling have several reasonable shapes | Overlay vs inline? How is overwrite-vs-new presented? Confirmation on destructive overwrite? Cancel/discard UX? |
| Canvas coordinate & export model | Storage Design | Resolution fidelity + DPR + object-contain mapping is fiddly and central to correctness | Single canvas at intrinsic res? Coordinate transform? toBlob format? iOS size guard? |

(Both are optional — the deep-research dossier already answers most of the canvas/export questions; a workshop is only worth it if the UX flow feels unsettled.)

## Clarifications

### Session 2026-06-07

**Round 1 (front-loaded):**
- **Workflow Mode** → **Simple** (chosen deliberately despite CS-4; escalate to Full later if phasing demands).
- **Testing Strategy** → **Hybrid** (TDD deterministic save/derivation/coordinate units; manual for canvas feel).
- **Mock Usage** → **Avoid mocks** — use injected `FakeFileSystem`/`FakePathResolver`; no `vi.mock` for business logic.
- **Documentation Strategy** → **docs/how/ guide** (`docs/how/image-editor.md`) + refresh domain.md contracts.

**Round 2 (product decisions):**
- **Editor UX** → **Inline mode toggle** — Edit swaps the image-view area into the editor in place (markdown Source/Rich precedent), keeping the file browser visible. (Not a full-screen overlay.)
- **`-edited` collision** → **Re-edit in place** — editing a `…-edited.<ext>` and saving as new overwrites that same file; the `-edited` suffix is idempotent (never `-edited-edited`).
- **Output format** → **Preserve original format/extension** (`foo.jpg → foo-edited.jpg`); JPEG/WebP re-encode accepted as slightly lossy.
- **Tool scope v1** → **Pen + color picker (presets) + 2–3 stroke widths**; no eraser (undo covers mistakes).

_No `[NEEDS CLARIFICATION]` markers remain. No NEW domains (modifying `_platform/viewer` + `file-browser`, consuming `_platform/file-ops`); agent harness exists (`docs/project-rules/harness.md`) and is sufficient for this UI feature._

---

## Validation Record (2026-06-07)

### Validation Thesis

**Raison d'être**: De-risk and scope an in-browser image pen-annotation feature so `/plan-3` can produce a buildable plan; resolve ambiguities (editor UX, `-edited` semantics, output format, tool scope) up front.
**Value claim**: Downstream architect + implementer build with minimal clarification; the binary-save gotcha and canvas pitfalls (CORS, iOS limit, `ssr:false`, DPR) are surfaced before code.
**Artifact promise**: A clarified spec with testable acceptance criteria, research-grounded domain placement, and known risks; no `[NEEDS CLARIFICATION]` remaining.
**Intended beneficiaries**: `/plan-2d`, `/plan-3` architect, implementing agent, reviewer.
**Proof target**: Decision/Contract.
**Evidence standard**: Testable ACs, domain mapping grounded in the dossier, resolved clarifications, risks tied to real findings.
**Thesis source**: original-ask.md + research-dossier.md (grounded).
**Thesis verdict**: Advanced.
**Main thesis risk**: Edge-case ACs (save failure, large-image guard, load failure) were initially under-specified; added during validation.

| Agent | Lenses Covered | Thesis Axes | Issues | Verdict |
|-------|---------------|-------------|--------|---------|
| Clarity | UX, System Behavior, Hidden Assumptions, Proof-Level Fit | User Value Preservation | 1 CRIT*, 4 HIGH, 4 MED — fixed/accepted | ⚠️→✅ |
| Completeness | Edge Cases, Integration & Ripple, Domain Boundaries, Concept Docs, Evidence Sufficiency | Implementation Readiness | 4 HIGH, 4 MED, 2 LOW — fixed/accepted | ⚠️→✅ |
| Thesis Alignment | Thesis Alignment, Proof-Level Fit, Evidence Sufficiency | Thesis, Downstream Usefulness | 1 LOW (iOS guard AC) — fixed | ✅ |
| Forward-Compatibility | Forward-Compatibility, Technical Constraints, Deployment/Ops | Agent Readiness | 3 MED, 1 LOW — fixed (contract sketch + bundle/format ACs) | ⚠️→✅ |

\* The Clarity agent's "CRITICAL output-format contradiction" was a **non-issue**: preserving original format is a deliberate, user-chosen product decision (Round 2), not a contradiction — the lossy caveat is now explicit in AC-6.

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-2d` backpressure | Testable ACs + Target Domains + Risks to map sensors | encapsulation lockout | ✅ | ACs split deterministic vs visual; Testing Strategy + Risks name sensors |
| `/plan-3` architect | All decisions resolved, domains create/modify/consume, no `[NEEDS CLARIFICATION]` | shape mismatch | ✅ | Clarifications Rounds 1–2; Target Domains non-circular; markers cleared |
| Implementing agent | Enough contract to build save service + canvas editor | contract drift | ✅ (after fix) | Added Contract Sketch + Reuse Map + AC-12..17 |

**Thesis alignment**: Value claim **advanced** at Decision/Contract proof level with strong evidence; main residual risk (edge-case ACs) was closed during validation.
**Outcome alignment**: The spec advances the outcome — "turns the viewer into a quick annotation tool — circle the bug, mark up the screenshot — without leaving the app" — with a clean, non-circular domain contract and a now-complete edge-case surface.
**Standalone?**: No — downstream consumers `/plan-2d` and `/plan-3` exist.

Overall: ⚠️ **VALIDATED WITH FIXES**
