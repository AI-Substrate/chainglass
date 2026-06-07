# Flight Plan: In-browser Image Editor (pen / annotation)

**Spec**: [image-editor-spec.md](./image-editor-spec.md)
**Plan**: [image-editor-plan.md](./image-editor-plan.md)
**Generated**: 2026-06-07
**Status**: Ready

---

## The Mission

**What we're building**: An **Edit** button on the image viewer. Click it and the image-view area flips inline into a drawing canvas where you scribble freehand **pen** annotations (with a color picker and a couple of stroke widths) right on top of the picture. When you're done you either **Save over** the original or **Save as new** — which writes a `<name>-edited.<ext>` file next to it, replacing any existing `-edited`.

**Why it matters**: Today images are view-only. This turns the viewer into a quick annotation tool — circle the bug, mark up the screenshot — without leaving the app.

---

## Where We Are → Where We're Headed

```
TODAY:                                 AFTER this plan:
Images are view-only                   Images are annotatable

🔵 Select image → ImageViewer (<img>)  🔵 Select image → ImageViewer (same)
❌ No edit affordance                   🔴 "Edit" button (raster images)
❌ No canvas / drawing                  🔴 Inline canvas editor (pen + color + width)
❌ No binary save path from browser     🔴 saveEditedImage action (Buffer, atomic)
🔵 Raw-file route serves bytes         🟢 Raw-file route = canvas background source
```

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Current["Current State"]
        FB1[file-browser: FileViewerPanel]:::existing
        IV1[viewer: ImageViewer]:::existing
        RAW1[raw-file route]:::existing
        FO1[file-ops: IFileSystem]:::existing
        FB1 --> IV1
        IV1 --> RAW1
    end

    subgraph Target["After All Phases"]
        FB2[file-browser: FileViewerPanel + Edit toggle]:::changed
        IV2[viewer: ImageViewer]:::existing
        IE[viewer: ImageEditor + pen toolbar]:::new
        RAW2[raw-file route = bg source]:::existing
        SVC[file-browser: saveImageService + action]:::new
        FO2[file-ops: IFileSystem/IPathResolver]:::existing
        FB2 --> IV2
        FB2 --> IE
        IE --> RAW2
        IE --> SVC
        SVC --> FO2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Scope

**Goals**:
- An **Edit** button on the full image view for raster image files (png/jpg/jpeg/gif/webp).
- A client-only, lazy-loaded **inline** canvas editor: freehand pen + color picker + stroke widths.
- **Save over** the original, or **Save as new** → `<name>-edited.<ext>` (replacing existing `-edited`; idempotent suffix).
- Edited file **preserves original format/extension**; saved bytes preserve native resolution.
- Reuse the markdown-editor precedents (lazy mount, toolbar, DI-injectable save, error boundary).

**Non-Goals**:
- Text, shapes, fill, selection, layers, zoom/pan (future).
- Editing SVG as vector (raster-only for now); animated-GIF frames; collaboration.

---

## Journey Map

```mermaid
flowchart LR
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef ready fill:#9E9E9E,stroke:#757575,color:#fff

    S[Specify]:::done --> BP[Backpressure survey]:::done
    BP --> P[Plan]:::done
    P --> PH[Implement — single phase]:::ready
    PH --> D[Done]:::ready
```

**Legend**: green = done | yellow = active | grey = not started

---

## Phases Overview

| Phase | Title | Tasks | CS | Status |
|-------|-------|-------|----|--------|
| 1 | Implementation (Simple — single phase) | 19 | CS-4 | Pending |

_Plan is **READY** (all 7 gates pass). Simple mode → one phase with a 19-task table grouped as: save backend (T001–T006, TDD), canvas editor (T007–T012), integration (T013–T015), browser smoke + bundle verify (T016–T017), docs + domain refresh (T018), optional dep-direction guard (T019). Next: `/plan-6` (no `/plan-5` expansion needed in Simple mode)._

---

## Acceptance Criteria

- [ ] Edit control appears for raster images; toggles inline into the canvas editor with the image as background.
- [ ] Freehand pen drawing with color picker + stroke widths; smooth pointer/touch input.
- [ ] Save over writes back to the original (with mtime-conflict detection).
- [ ] Save as new writes `<name>-edited.<ext>`, replacing any existing `-edited` (no `-edited-edited`).
- [ ] Edited image preserves the original format/extension and native pixel dimensions.
- [ ] Save paths validated via `IPathResolver`; traversal → `PathSecurityError`, no write.
- [ ] Saved bytes are valid image bytes (Buffer write, not string `saveFile`).
- [ ] Editor + canvas lib are lazy-loaded (`ssr:false`); production build succeeds.

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| CORS-tainted canvas → `toBlob` throws | Background loads same-origin from raw-file route; verify in build |
| iOS Safari canvas size limit (~4096²/16.7M px) | Pixel-area guard / max-dimension handling |
| Next 15 `ssr:false` from server component breaks build | Wrap dynamic import in a thin client component (Plan 083 pattern) |
| Using string `saveFile` corrupts image bytes | Model save on Buffer-based `uploadFileService` |
| JPEG/WebP re-encode is lossy | Accepted; annotations stay sharp; PNG path lossless |

---

## Flight Log

<!-- Updated by /plan-6 and /plan-6a after each phase completes -->

_No phases completed yet._
