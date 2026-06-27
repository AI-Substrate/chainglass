# Research Report: In-browser Image Editor (pen/annotation)

**Generated**: 2026-06-07T01:49:56Z
**Research Query**: "image editing: edit a full-screen selected image in the browser with basic pen/annotation tools; save-over or save-as-new (-edited suffix, replacing any existing -edited)"
**Mode**: Pre-Plan
**Location**: docs/plans/086-image-editor/research-dossier.md
**FlowSpace**: Standard tools (4 parallel subagents)
**Findings**: 4 research streams (display path, save path, UI patterns + prior learnings, domain fit + libraries)

## Executive Summary

### What It Does (today)
Images are **view-only**. When a user selects an image file in the file browser, the app renders it full-size via `ImageViewer` (an `<img>` pointing at a raw-file API route). There is no edit affordance for binary/image files.

### What We're Adding
An "Edit" button on the image view that opens a lazy-loaded **canvas pen-annotation editor**, and a **save flow** that either overwrites the original or writes a `<name>-edited.<ext>` sibling (replacing any existing `-edited` copy).

### Key Insights
1. **A near-perfect precedent already exists**: the Tiptap markdown WYSIWYG editor (Plan 083). It is lazy-loaded (`next/dynamic {ssr:false}`), mode-toggled inside `FileViewerPanel`, saves via `Cmd+S` → server action, and is testable via DI injection. The image editor is structurally identical and should mirror it.
2. **The save path has a sharp gotcha**: `saveFile` is **string-only** (UTF-8) and would corrupt image bytes. The correct precedent is `uploadFile`/`uploadFileService`, which is **Buffer-based** with the same atomic tmp→rename + path-security plumbing.
3. **No canvas/drawing library exists in the repo** — this feature introduces the first one. The minimal, best-fit choice is **`perfect-freehand` + raw Canvas 2D** (~2–5 KB gzip, MIT, SSR-safe when client-only, trivial `drawImage` background + `canvas.toBlob('image/png')` export).

### Quick Stats
- **Display entry point**: `BinaryFileView` → `ImageViewer` (file-browser)
- **Save precedent**: `uploadFileService` (Buffer-based, file-browser)
- **New canvas dependency**: 1 (perfect-freehand recommended)
- **Domains touched**: `_platform/viewer` (editor component), `file-browser` (save action), `_platform/file-ops` (consumed)
- **Prior learnings**: 9 relevant discoveries from Plan 083 (md-editor)

---

## How It Currently Works — Select Image → Render Full Image

```
User clicks image file in tree
   ↓ URL updates: ?file=image.png  (useQueryStates(fileBrowserParams))
   ↓ useFileNavigation → readFileAction()
   ↓ detectContentType('image.png').category === 'image' → { ok, isBinary:true, contentType, mtime, size } (NO content for binary)
   ↓ FileViewerPanel receives isBinary=true → renders BinaryFileView
   ↓ BinaryFileView: category==='image' → <ImageViewer src={rawFileUrl} alt=... />
   ↓ ImageViewer mounts <img src=/api/workspaces/{slug}/files/raw?worktree=...&file=image.png>
   ↓ raw-file route streams bytes with Content-Type (range-request aware)
```

### Key files (display)
| Concern | File | Notes |
|---|---|---|
| Image render | `apps/web/src/features/041-file-browser/components/image-viewer.tsx` | `<img className="max-w-full max-h-full object-contain">` with loading spinner |
| Binary view host | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx:619-691` (`BinaryFileView`) | Minimal toolbar (lines ~645-657): "Preview" label + Refresh button |
| Raw bytes route | `apps/web/app/api/workspaces/[slug]/files/raw/route.ts` | Path-validated, `detectContentType`, range support, `Content-Disposition: inline` |
| URL construction | `apps/web/src/features/041-file-browser/components/browser-client.tsx:1088-1091` | `rawFileUrl` built from slug + worktree + selectedFile |
| Selection state | `browser-client.tsx:219` `selectedFile = params.file`; `:145` `useQueryStates(fileBrowserParams)` | Source of truth is the `?file=` URL param |
| Content-type map | `apps/web/src/lib/content-type-detection.ts:19-27` | Image: png, jpg, jpeg, gif, webp, svg, ico, avif, bmp |

### 🎯 Best insertion point for the "Edit" button
`BinaryFileView` toolbar in `file-viewer-panel.tsx` (~lines 645-657), gated by `category === 'image'`, beside the Refresh button. `BinaryFileView` already has `filePath`, `contentType`, `rawFileUrl`. Add an `onEditImage?: () => void` prop threaded from `browser-client.tsx`. (SVG is a special case — it's text-ish; Phase 1 may want to restrict editing to raster formats.)

---

## How Saving Works — and the binary gotcha

### Two write precedents
| Action | File | Content type | Use for image editor? |
|---|---|---|---|
| `saveFile` / `saveFileAction` | `app/actions/file-actions.ts:47-69` → `services/file-actions.ts:225-260` | **`string` only** | ❌ would corrupt image bytes |
| `uploadFile` / `uploadFileService` | `app/actions/file-actions.ts:90-118` → `services/upload-file.ts:48-107` | **`Buffer`** | ✅ correct precedent |

### The proven binary write pipeline (from `uploadFile`)
1. Browser sends `FormData` with a `File`/`Blob`.
2. Action: `const buf = Buffer.from(await file.arrayBuffer())`.
3. DI resolve: `getContainer()` → `container.resolve(SHARED_DI_TOKENS.FILESYSTEM)` + `SHARED_DI_TOKENS.PATH_RESOLVER`.
4. Security: `pathResolver.resolvePath(worktreePath, filePath)` (throws `PathSecurityError` on traversal).
5. Atomic write: `writeFile(tmpPath, buf)` → `rename(tmpPath, target)` (both on `IFileSystem`; `writeFile` accepts `string | Buffer`).
6. Return relative path + mtime.

### Filename derivation for `<name>-edited.<ext>`
- Use `path.dirname` / `path.basename` (or `IPathResolver.dirname`/`.basename`) + manual extension split at `lastIndexOf('.')`.
- "Replace existing `-edited`": if saving as new, the target is always `<name>-edited.<ext>` — the atomic write naturally overwrites any existing `-edited`. (Decide: if the *selected* file is already `…-edited.png`, does "save as new" re-edit in place or make `…-edited-edited.png`? → spec question.)
- Overwrite path should carry mtime-conflict detection (mirror `saveFile`'s `expectedMtime`/`force`).

### Base directory
`worktreePath` is the write base, resolved from the workspace service via slug — **not** trusted from the client. `IPathResolver` confines all writes under it.

---

## UI Patterns to Mirror (the markdown WYSIWYG precedent — Plan 083)

| Pattern | Source | Reuse for image editor |
|---|---|---|
| Lazy heavy component | `markdown-wysiwyg-editor-lazy.tsx` (`dynamic(import, {ssr:false, loading})`) | `image-editor-lazy.tsx` — copy verbatim; keeps canvas + perfect-freehand out of initial bundle |
| Mount inline in panel | `file-viewer-panel.tsx:499-529` (Rich branch mounts editor+toolbar as siblings) | Mount the editor in an `mode==='annotate'` (or overlay) branch; OR a Dialog/Sheet overlay |
| Toolbar = config + render | `wysiwyg-toolbar.tsx`, `wysiwyg-toolbar-config.ts` (groups of actions, lucide icons, memoized state) | Pen / eraser / color / stroke-width groups; lucide (Paintbrush, Eraser, Palette) |
| Save via Cmd+S | `handleEditModeKeyDownCapture` + `performSave` | Widen guard to include annotate mode |
| Dirty state | parent `editContent` vs `content` diff (no separate flag) | Compare original vs annotated |
| DI test injection | `saveFileImpl?` optional prop (no `vi.mock`) | `saveImageImpl?` optional prop |
| Error boundary + fallback | editor wrapped, "Switch to Source" fallback | "View image only" fallback |
| Overlay primitives | `components/ui/dialog.tsx`, `sheet.tsx` (Radix) | If a full overlay editor is preferred over inline |

### Icons / buttons
lucide-react throughout; shadcn `Button` (`ghost` default, `secondary` active); toolbar icon size `h-3.5 w-3.5`.

---

## Prior Learnings (Plan 083 — md-editor)

| ID | Type | Insight | Action here |
|---|---|---|---|
| PL-01 | decision | Extract shared logic to `_platform/viewer` rather than duplicate | Put `ImageEditor` in viewer |
| PL-02 | pattern | Interface-first: define types before impl | Define `ImageEditorProps`, tool/stroke types first |
| PL-03 | gotcha | Tiptap + React 19 needs `immediatelyRender:false`; mount heavy state after hydration | Canvas init in `useEffect`, client-only `{ssr:false}` |
| PL-04 | pattern | `onChange` fires only on real change, not mount | Emit annotation change on stroke-end (debounced), not on image load |
| PL-05 | budget | Lazy-load to keep initial bundle small; measure chunk | Lazy-load canvas lib; assert bundle in phase AC |
| PL-06 | critical | Save pipeline unchanged — editor emits, existing backend handles | But image needs the **Buffer** action, not the string one |
| PL-07 | constitution | No `vi.mock`/`vi.fn` for business logic — use injected fakes | `FakeSaveImage` via DI prop |
| PL-08 | compat | Legacy `?mode=` params need coercion for a release | If adding `?mode=annotate`, coerce old values |
| PL-09 | hygiene | Refresh `domain.md` when a new editor lands | Update `_platform/viewer/domain.md` at the end |

---

## Domain Fit

**Recommendation: mirror the markdown WYSIWYG split — NOT a new domain.**
- **`ImageEditor` + `ImageEditorLazy` component → `_platform/viewer`** (`apps/web/src/features/_platform/viewer/components/image-editor.tsx` + `image-editor-lazy.tsx`). Viewer already owns generic image concerns (`resolveImageUrl`, `detectContentType`, `isBinaryExtension`) and the lazy WYSIWYG editor. Client-only.
- **`saveImageService` + `saveEditedImage` server action → `file-browser`** (`services/save-image.ts` + entry in `app/actions/file-actions.ts`). file-browser owns file mutations + security wiring.
- **Consumes**: `resolveImageUrl` / raw-file route (background image), `IFileSystem` + `IPathResolver` + `PathSecurityError` + atomic write (file-ops).
- **Exposes**: `ImageEditor` component; `saveImageService`/`saveEditedImage` action.
- **Boundary risk**: none new — flow stays `file-browser → viewer` and `file-browser → file-ops` (viewer never imports file-browser). Just don't reuse the string-only `saveFile`.

---

## Library Recommendation (pen-over-image, minimal now, room to grow)

| Rank | Option | ~gzip | SSR/lazy | Load bg + export PNG | License | Notes |
|---|---|---|---|---|---|---|
| **1 ✅** | **perfect-freehand + Canvas 2D** | ~2–5 KB | client-only `{ssr:false}` | `drawImage` + `canvas.toBlob` | MIT | Best ink, near-zero footprint, grows via shape array |
| 2 | Plain Canvas 2D + pointer events | ~0 KB | client-only | same | native | Lightest; rougher strokes, hand-roll everything |
| 3 | Konva / react-konva | ~55–65 KB | client-only | `Konva.Image` + `toDataURL` | MIT | Pick only if shapes/text/selection are near-certain |
| 4 | Fabric.js | ~80–100 KB | imperative init | built-in brush | MIT | Heavier, non-React API |
| 5 | Excalidraw | several hundred KB | React lazy | native PNG | MIT | Overkill (full whiteboard) |
| 6 | tldraw | ~484 KB | React | native PNG | **non-commercial** | Overkill + license risk |

**Top pick: `perfect-freehand` + raw Canvas 2D.** Composite the original image as the canvas background, capture pen strokes with pointer events + `getStroke()`, export with `canvas.toBlob('image/png')` → send as FormData to the Buffer-based save action. Growth path (text/shapes later) = maintain a shape array + immediate-mode redraw.

---

## Critical Discoveries (must carry into spec/plan)

1. 🚨 **String-vs-Buffer write**: `saveFile` is string-only and corrupts binary. Model the save on `uploadFileService` (Buffer + atomic tmp→rename). [HIGH]
2. 🚨 **Binary read returns no content**: `readFileAction` returns `isBinary:true` with no `content`; the editor must load its background from the **raw-file route**, not `readFile`. [HIGH]
3. ⚠️ **Canvas must be client-only**: lazy-load behind `next/dynamic {ssr:false}`, init canvas in `useEffect`. [MED]
4. ⚠️ **`-edited` semantics need a spec decision**: behavior when the selected file is already `…-edited.<ext>` (re-edit in place vs `-edited-edited`); SVG (text format) handling; format of saved bytes (always PNG vs preserve original format). [MED]

---

## Open Questions for the Spec (`/plan-1b`)
1. **Edit affordance UX**: inline mode toggle in `BinaryFileView` toolbar, or a full overlay (Dialog/Sheet)? Full-screen editing experience implied by the ask.
2. **Save dialog**: how does the user choose "save over" vs "save as new"? (two buttons in editor toolbar?)
3. **`-edited` collision**: if editing `foo-edited.png`, does "save as new" overwrite `foo-edited.png` or create `foo-edited-edited.png`?
4. **Output format**: always export PNG, or preserve the original extension/format? (PNG is simplest; lossy re-encode of JPEG is a consideration.)
5. **SVG**: edit raster only for now, or rasterize SVG into the canvas?
6. **Tools scope for Phase 1**: pen only confirmed; color + stroke-width included? eraser?

---

## Next Steps
- **Recommended**: `/plan-1b` to write the spec (the open questions above become the clarification batch).
- Optional: `/plan-2c` workshop the editor UX (overlay vs inline) or the `-edited` save semantics if they feel unsettled.

**Research Complete** — read-only. No code changed.
