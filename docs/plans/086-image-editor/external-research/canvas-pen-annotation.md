# Deep Research: Canvas Pen Annotation Approach

> Provenance: Perplexity Sonar Deep Research, 2026-06-07. Distilled from a ~108k-char source report into an implementation-focused brief.

A minimal in-browser image annotation editor for Next.js 15 / React 19 using `perfect-freehand` + raw HTML5 Canvas 2D. Loads a raster image, captures pressure-aware pointer strokes, composites them over the image, and exports a PNG Blob — all client-side, with a small bundle footprint.

## Recommended architecture (TL;DR)

- **Single canvas, sized to the image's intrinsic resolution.** Set `canvas.width/height = image.naturalWidth/naturalHeight`, draw the image at `0,0` (1:1), then draw strokes on top. CSS scales the element down for display. This preserves native export resolution and keeps stroke/pixel alignment exact.
- **Pointer Events as the only input model** (mouse + pen + touch unified), with `setPointerCapture` on pointerdown and `getCoalescedEvents()` for smooth high-fidelity strokes.
- **`perfect-freehand`'s `getStroke()` → `Path2D` → `ctx.fill()`.** Thickness is baked into the polygon; you just fill a shape (no `lineWidth`/`strokeStyle`). Pass real `pressure` and set `simulatePressure: false`.
- **Immediate-mode rendering.** The canvas is a pure render target; the canonical state is your own array of `Stroke` objects in *image-space coordinates*. Redraw the whole scene (image + strokes) on any state change.
- **Drawing happens in refs + direct canvas ops, never React state.** High-frequency pointer-move data lives in `useRef`; React state is only touched at coarse granularity (stroke commit / undo / redo) to drive history.
- **Client-only via `next/dynamic({ ssr: false })`** behind a `'use client'` boundary. All `window`/`document`/canvas/pointer code stays in the browser.
- **Export via `canvas.toBlob()` (PNG default)**, uploaded through `FormData`. Mind CORS-tainted canvases and iOS Safari canvas-size limits.
- **`touch-action: none`** on the canvas to suppress scroll/zoom; ignore `pointerType === 'touch'` for basic palm rejection.

---

## 1. perfect-freehand + Canvas 2D pattern

### Pointer Events as the input backbone

- Pointer Events unify mouse/pen/touch behind one `PointerEvent`, carrying `clientX/clientY` (CSS px), `pointerType` (`"mouse"|"pen"|"touch"`), and `pressure` (0–1). A plain mouse reports `pressure = 0.5` while a button is down, `0` otherwise.
- Listen for `pointerdown` (start stroke), `pointermove` / `pointerrawupdate` (extend), `pointerup` / `pointercancel` (finish/abort).
- Call `setPointerCapture(pointerId)` on `pointerdown` and `releasePointerCapture(pointerId)` on up/cancel so a stroke continues even when the pointer drifts outside the canvas, and the lifecycle terminates cleanly.
- `getCoalescedEvents()` returns the un-throttled inner samples merged into a dispatched `pointermove`; replaying them produces visibly smoother curves. `pointerrawupdate` (Pointer Events L3) fires per hardware sample (closer to device rate) — treat it as an *optional* optimization with `pointermove` fallback.
- Attach listeners via `addEventListener` in a `useEffect` (not React synthetic events) for full access to coalesced events and `passive: false` control.

### Stroke model

```ts
type InputPoint = [x: number, y: number, pressure: number];

type Stroke = {
  id: string;
  points: InputPoint[];      // In image pixel coordinates
  color: string;             // CSS color
  size: number;              // Base stroke width in pixels
};
```

### Accumulating points with coalesced events + coordinate transform

```ts
function addPointerPoints(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  currentStroke: Stroke,
) {
  const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];

  const rect = canvas.getBoundingClientRect(); // CSS pixels
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  for (const e of events) {
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const pressure = e.pressure ?? 0.5;
    currentStroke.points.push([x, y, pressure]);
  }
}
```

Three ideas: (1) use coalesced events when available; (2) convert CSS px → canvas px via the `canvas.width / rect.width` ratio so the backing store can differ in resolution from the CSS size; (3) default pressure when hardware doesn't supply it.

### getStroke outline → filled Path2D

`getStroke(points, options)` returns an ordered array of `[x, y]` outline points forming a closed, non-self-intersecting polygon. Render by filling it — the thickness is already encoded.

```ts
import getStroke from 'perfect-freehand';

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
) {
  if (stroke.points.length < 2) return;

  // Map our [x, y, pressure] tuples back into the format perfect-freehand expects.
  const input = stroke.points.map(([x, y, pressure]) => ({ x, y, pressure }));

  const outlinePoints = getStroke(input, {
    size: stroke.size,
    thinning: 0.7,
    smoothing: 0.5,
    streamline: 0.3,
    simulatePressure: false,     // We are providing real pressure
  });

  if (!outlinePoints.length) return;

  const path = new Path2D();
  const [firstX, firstY] = outlinePoints[0];
  path.moveTo(firstX, firstY);

  for (let i = 1; i < outlinePoints.length; i++) {
    const [x, y] = outlinePoints[i];
    path.lineTo(x, y);
  }

  path.closePath();

  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}
```

Used both for the live in-progress stroke and for redrawing committed strokes. `perfect-freehand` is purely computational (DOM/Canvas-agnostic), so the same output can later target SVG/WebGL.

### touch-action

Set `touch-action: none` on the canvas so finger/pen input draws instead of scrolling/zooming the page. (If you later need pinch-zoom, scope this carefully or add explicit zoom controls.)

### High-frequency update decoupling (optional)

For many strokes, decouple input sampling from drawing: `updateFromInput()` mutates stroke data on each event; `drawAll()` rasterizes; a `requestAnimationFrame` loop calls `drawAll()` only when a dirty flag is set and a frame-rate limiter permits (e.g. cap redraws at 30fps under load). Not needed for a minimal editor but worth structuring for.

---

## 2. Compositing & export

### One canvas vs two layers

- **Single canvas (recommended for this scope):** draw image, then strokes on top. On any change (new stroke / undo / redo) clear, `drawImage`, re-render all strokes. Treats the canvas as a pure render target for your scene graph — matches immediate-mode philosophy, smallest code surface, simplest Next.js integration. Drawback: destructive per-pixel ops (eraser via `globalCompositeOperation = "destination-out"`) require full-scene recompute, but with additive-only pen strokes that never arises.
- **Two layers:** static background (`<img>` or background canvas) + transparent foreground ink canvas, composited at export into an offscreen canvas at the image's intrinsic resolution. Better for erasers / independent ink clearing / multiple overlay types, but complicates coordinate alignment and export compositing. Refactor to this later only if needed — the stroke model and `perfect-freehand` usage are unchanged; only the draw pipeline and transforms grow.

### Export via canvas.toBlob

`toBlob(callback, type?, encoderOptions?)` is async and defaults to `image/png` (lossless, alpha). Prefer it over `toDataURL` (synchronous, base64, memory-heavy, can block the main thread).

```ts
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty or toBlob failed'));
        } else {
          resolve(blob);
        }
      },
      'image/png',  // Explicit for clarity; PNG is default
    );
  });
}
```

Upload via `FormData` (a Blob can be appended directly; an explicit `File` is rarely necessary):

```ts
async function uploadAnnotatedImage(canvas: HTMLCanvasElement) {
  const blob = await canvasToPngBlob(canvas);
  const fileName = 'annotated.png';

  const formData = new FormData();
  formData.append('file', blob, fileName);

  await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });
}
```

### Preserving native resolution

- On load, read `image.naturalWidth/naturalHeight`; set `canvas.width/height` to those values; `ctx.drawImage(image, 0, 0)` (no scaling). Each canvas pixel = one image pixel.
- Scale for display purely via CSS (`width: 100%; height: auto;`) — never via the backing store, and avoid `transform: scale()` / `object-fit` on the canvas itself (breaks linear CSS↔canvas coordinate mapping).
- PNG encoding can be CPU-heavy on large/constrained devices; show a spinner or offer JPEG/WebP for smaller, faster output.
- Animated GIF/WebP: `drawImage` only captures one frame; export is a static raster. Reconstructing animation needs a frame-parsing library (e.g. `gifler`).

---

## 3. High-DPI / devicePixelRatio + coordinate mapping

### Backing store vs CSS size

The generic high-DPI pattern multiplies the backing store by `devicePixelRatio` and `ctx.scale(dpr, dpr)`. **But for an annotation editor that must preserve original resolution, ignore DPR for the backing store** and make the image's intrinsic resolution the authoritative coordinate system: `canvas.width/height = naturalWidth/naturalHeight`, context scale = 1, CSS size separate. The browser handles hardware-pixel presentation when it resamples the CSS-scaled canvas. (Adopting a DPR-scaled backing store would export at "retina display" resolution rather than the original — undesirable here.)

### CSS px → canvas/image px transform

With `clientX/clientY` (CSS px, viewport-relative) and `getBoundingClientRect()` (`L,T,W,H` in CSS px) and backing-store size `C_w, C_h`:

```
u = (x_client - L) / W            v = (y_client - T) / H
x_canvas = u * C_w = (x_client - L) * C_w / W
y_canvas = v * C_h = (y_client - T) * C_h / H
```

```ts
function getCanvasPointFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  return { x, y };
}
```

Scrolling needs no special handling — both `clientX/Y` and `getBoundingClientRect` are viewport-relative, so scroll offset cancels out. Keep coordinates as floats (perfect-freehand and Canvas 2D handle sub-pixel positions). Preserve aspect ratio (`height: auto`) so the uniform-scale assumption holds.

### Mapping under object-contain / letterboxing

If you instead overlay a canvas on an `<img object-fit: contain>`, account for the contain scale and centering offsets:

```
s  = min(W/w, H/h)
Δx = (W - s*w) / 2          Δy = (H - s*h) / 2
x_image = (x_c - Δx) / s    y_image = (y_c - Δy) / s
```

Reject pointer positions outside `Δx ≤ x_c ≤ Δx + s*w` and `Δy ≤ y_c ≤ Δy + s*h` (letterbox area). The single-canvas (image drawn at 0,0) approach avoids all this — only CSS scaling applies, so the simple `getBoundingClientRect` mapping suffices.

### Future-proofing zoom/pan

Anchor `Stroke.points` in image-space from the start. A future zoom `z` / pan `(p_x, p_y)` only changes the draw-time mapping, not the stored data:

```
x_canvas = z * x_image + p_x      y_canvas = z * y_image + p_y
```

(map pointer events back via the inverse). No re-encoding of stroke data needed later.

---

## 4. Undo/redo & stroke-array state + redraw performance

- Canvas owns no authoritative content. State = an ordered array of immutable `Stroke` objects; rendering = draw image then iterate strokes. Pure immediate-mode.
- Append on pointerup, pop on undo, reinsert on redo. For branch-aware redo (discard "future" after drawing post-undo), model history as **snapshots array + index**, not a plain stack.
- Trade-off: each snapshot copies the stroke array. Mitigate by only snapshotting on stroke completion (never mid-stroke), capping history depth (e.g. 50–100), and optionally structural sharing.

### Redraw cost & optimizations

- Cost scales with stroke count × path complexity (`getStroke` + `Path2D` fill per stroke per redraw).
- **Precompute `Path2D` at commit time** and store it on the stroke — shifts work off the redraw path (costs memory + flexibility).
- **Freeze old strokes into an offscreen buffer**: render rarely-changed strokes once to an offscreen canvas, then each frame `drawImage` that buffer + render only active strokes individually.
- For a minimal editor (tens to low hundreds of strokes), plain immediate-mode redraw + a frame-rate limiter is sufficient. Isolate "draw all strokes" into one function so caching can be swapped in later.

### useStrokeHistory hook

```ts
function useStrokeHistory(initial: Stroke[] = []) {
  const [history, setHistory] = React.useState<Stroke[][]>([initial]);
  const [index, setIndex] = React.useState(0);

  const current = history[index];

  const set = React.useCallback((next: Stroke[], overwrite = false) => {
    setHistory((prev) => {
      const historyCopy = overwrite ? [...prev] : prev.slice(0, index + 1);
      if (overwrite) {
        historyCopy[index] = next;
        return historyCopy;
      }
      return [...historyCopy, next];
    });
    setIndex((prevIndex) => (overwrite ? prevIndex : prevIndex + 1));
  }, [index]);

  const undo = React.useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const redo = React.useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

  return { strokes: current, setStrokes: set, undo, redo, canUndo: index > 0, canRedo: index < history.length - 1 };
}
```

Call `setStrokes` on stroke completion; a `useEffect` watching `strokes` triggers the redraw. **Never** drive per-pointer-move points through React state — that re-renders the tree on every move and can't keep up with input rate.

### Memory / perf for many strokes

- Thousands of points = heavy heap → GC jank. `perfect-freehand`'s `smoothing`/`streamline` discard micro-movements, reducing the need for manual point thinning. Can also skip points below a movement threshold (balance against angularity).
- For very large drawings (thousands of strokes): dirty-rectangle partial redraws, or migrate to a framework with shape caching/layer redraw (Konva).

---

## 5. Output format decisions

- **PNG** — mandatory, lossless, alpha-capable; the `toBlob` default when type is omitted/unsupported. Best for line art/text fidelity and re-export of lossless sources. Larger files for photographic backgrounds. **Default choice.**
- **JPEG** — lossy, no transparency, much smaller for photos; pass quality 0–1 (e.g. `0.95`). Re-encoding a JPEG source adds compounded artifacts. Alpha is flattened to an implementation-dependent background (often black/white).
- **WebP** — lossy or lossless, supports alpha, smaller at equal quality; widely but not universally supported. Offer with PNG fallback if you control client + server.
- **GIF** — Canvas can't export animated GIF; `image/gif` isn't standardized for export; poor palette/compression. Treat GIF inputs as static frames → export PNG/JPEG.

### Transparency / background color

- Canvas default = transparent black. PNG preserves alpha; JPEG flattens it.
- To force a known flat background (and avoid surprise JPEG fills): before drawing the image/strokes, `ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);`.
- A transparent-background source PNG drawn onto a transparent canvas keeps its transparency in PNG export.

### Large-image / memory guards

- iOS Safari caps canvases near 4096×4096 and ~16,777,216 total pixels; exceeding it makes Safari refuse to draw ("canvas area exceeds the maximum limit"). Most desktops allow >10,000×10,000.
- Apply a `limitSize`-style guard: if `width*height > maximumPixels`, scale by `s = sqrt(maximumPixels / requiredPixels)` and floor. Use `maximumPixels ≈ 16,000,000` to stay safely under the iOS cap; optionally also cap max dimension at ~4096.
- Memory: each canvas pixel ≈ 4 bytes (RGBA), so 4000×3000 ≈ 48 MB just for the buffer; offscreen buffers/layers multiply this. Limit sizes and be sparing with offscreen canvases on mobile.

---

## 6. React 19 / Next 15 integration

### Client-only component + dynamic loading

App Router uses RSC by default; `window`/`document`/`HTMLCanvasElement`/listeners are unavailable on the server. Mark the canvas component `'use client'` and load it with `next/dynamic({ ssr: false })`.

```ts
// app/(routes)/annotate/page.tsx – server component
import dynamic from 'next/dynamic';

const AnnotatorCanvas = dynamic(() => import('./AnnotatorCanvas'), {
  ssr: false,
});

export default function AnnotatePage() {
  const imageUrl = 'https://example.com/path/to/image.png';

  return (
    <main>
      <AnnotatorCanvas imageUrl={imageUrl} />
    </main>
  );
}
```

Known Next.js 15 gotcha: `ssr: false` on a dynamic import *from a server component* can break the build in some configs. Workaround: put the dynamic import inside a thin `'use client'` wrapper file and consume that from the server component. Test both dev and production builds.

### Refs + useEffect, no re-renders while drawing

```tsx
'use client';

import React from 'react';
import getStroke from 'perfect-freehand';

type AnnotatorCanvasProps = {
  imageUrl: string;
};

export default function AnnotatorCanvas({ imageUrl }: AnnotatorCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);

  const strokesRef = React.useRef<Stroke[]>([]);
  const currentStrokeRef = React.useRef<Stroke | null>(null);
  const isDrawingRef = React.useRef(false);

  // React-managed history state (optional, see §4)
  const [strokeHistory, setStrokeHistory] = React.useState<Stroke[][]>([]);
  const [historyIndex, setHistoryIndex] = React.useState(0);

  // useEffect hooks for image loading, event listeners, etc. go here.

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 'auto', touchAction: 'none' }}
      aria-label="Image annotation canvas"
      role="img"
    />
  );
}
```

High-frequency stroke data lives in refs; pointer handlers mutate refs and draw directly. React state changes only on meaningful actions (stroke commit / undo / redo).

### Pointer listener setup + cleanup

```ts
React.useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return; // left button only
    event.preventDefault();         // prevent text selection, etc.

    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;

    const { x, y } = getCanvasPointFromEvent(event, canvas);

    currentStrokeRef.current = {
      id: crypto.randomUUID(),
      points: [[x, y, event.pressure ?? 0.5]],
      color: '#ff0000',
      size: 8,
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    event.preventDefault();
    addPointerPoints(event, canvas, currentStrokeRef.current);
    redrawAll(ctx, canvas, imageRef.current, strokesRef.current, currentStrokeRef.current);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    event.preventDefault();
    canvas.releasePointerCapture(event.pointerId);
    isDrawingRef.current = false;

    strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
    currentStrokeRef.current = null;
    redrawAll(ctx, canvas, imageRef.current, strokesRef.current, null);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    canvas.releasePointerCapture(event.pointerId);
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    redrawAll(ctx, canvas, imageRef.current, strokesRef.current, null);
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', handlePointerCancel);
  };
}, []);
```

Empty deps → handlers bind once and capture refs (not stale React state). Cleanup removes listeners on unmount; under React 19 concurrent mode effects may mount/clean up more than once, so keep cleanup deterministic and idempotent.

### Component assembly (sketch)

1. One `useEffect`: create `HTMLImageElement`, `crossOrigin = 'anonymous'`, set `src`, on load set `canvas.width/height` to natural dims, `drawImage`, store in `imageRef`.
2. Another `useEffect`: pointer listeners (above) using `getCanvasPointFromEvent`, `addPointerPoints`, `drawStroke`, `redrawAll`. `redrawAll` clears, draws image, iterates `strokesRef`, then draws the in-progress stroke if any.
3. An `exportToBlob` function calling `canvas.toBlob`, triggered by a button/prop callback.

Bundle stays small: only React + `perfect-freehand` + types.

---

## 7. Mobile/touch & accessibility

### Palm rejection / pointerType

- True palm rejection is OS/hardware-level, but simple heuristics help: prioritize pen over touch, ignore touch while a pen is active, or disable touch drawing entirely.
- Simplest: in `handlePointerDown`, return early if `event.pointerType === 'touch'` (accept only `"pen"`/`"mouse"`). Later, repurpose touch for pan/zoom gestures.
- Pointer Events L3 also exposes `tiltX/tiltY`, `twist`, `altitudeAngle`, `azimuthAngle` for advanced stylus features — ignore for now but keep the stroke model extensible (e.g. optional tilt).

### Gesture interference

- `touch-action: none` tells the browser the canvas manages its own touch input (no scroll/zoom/double-tap-zoom). It also inhibits pinch-zoom over the canvas — provide alternate zoom controls if needed.
- Pointer capture (above) is especially important on mobile: users start near an edge and drift out; without capture the `pointerup` may not reach the canvas, leaving stroke state inconsistent.
- `event.preventDefault()` on down/move suppresses selection/context menus; with `touch-action: none` the browser typically treats pointer events as non-passive so `preventDefault` works. `touch-action` is the primary mechanism; `preventDefault` is the fallback.

### Minimal accessibility

- Canvas pixels aren't in the DOM → invisible to screen readers. Give the canvas `role="img"` + a descriptive `aria-label` (e.g. "Image annotation canvas showing the selected image with hand-drawn pen annotations.").
- Provide real HTML `<button>` controls (undo / redo / export) outside the canvas for keyboard + SR support.
- Optionally add fallback text between `<canvas>...</canvas>` tags (exposed to SRs, not rendered) and `aria-describedby` for richer description. Consider a download/open link to the exported image as an accessible alternative to the drawn content.

---

## 8. Growth path to text/shapes; threshold to migrate to Konva

- Generalize `Stroke[]` into an `Annotation[]` discriminated union: `PenStroke | TextLabel | Shape`. `TextLabel` = content/position/font/color; `Shape` = type + geometry (center/radius/bbox).
- Rendering stays immediate-mode: per type, dispatch a renderer — `drawStroke` for pen, `ctx.font`/`fillText` for text, `rect`/`ellipse` + fill/stroke for shapes. Coordinates stay in image space.
- Complexity arrives with **selection / hit-testing / editing**: point-in-rect for shapes, distance-to-path for strokes, selection overlays + handles, drag-to-transform, and drawing-mode vs selection-mode state. Manageable for modest object counts.
- **Migrate to Konva / react-konva when** you need multi-object selection, transform handles, grouping, hit-testing across hundreds of objects, animations, drag-and-drop with snapping/constraints, and cross-object performance tuning — i.e. when you'd be reinventing a retained-mode framework.
- **Stay on raw Canvas + perfect-freehand while** annotations are simple, few, and mostly one-shot (draw / delete, no complex transforms).
- SVG/vector export is a separate axis: `getStroke` output can be serialized to an SVG path string (`M x y L x y … Z`); only worth it if you need infinite zoom, resolution-independent reuse, or embedding in SVG reports. The default (raster PNG) fits raster sources + single composited output.

---

## 9. Library reality check

### perfect-freehand

- By Steve Ruiz; core export `getStroke(points, options?)` → outline polygon. Options: `size`, `thinning`, `smoothing`, `streamline`, pressure simulation.
- Small, dependency-light, rendering-agnostic (Canvas/SVG/WebGL) — attractive for bundle size. Historically MIT-licensed (verify current license before shipping). Narrow, stable scope → modest maintenance burden. Used in drawing/whiteboard tools.
- Gotchas: (1) set `simulatePressure: false` when passing real pressure, or it stacks simulated pressure on top → exaggerated thickness; (2) output quality depends on point density/ordering — feed coalesced events, avoid large gaps; (3) `smoothing`/`streamline` strongly affect look + perf — tune them, consider exposing to power users.

### react-konva

- Official React binding for Konva.js; declarative `<Stage>/<Layer>/<Rect>/<Circle>/<Text>` scene graph reconciled into Konva canvas ops. Stage → Layer (each its own `<canvas>`) → Shape hierarchy enables per-layer redraw.
- Retained-mode: shapes carry position/scale/rotation/fill; built-in hit-testing, shape events, transformers, filters, caching, drag boundaries, batch draws, and PNG/JPEG/dataURL export.
- Heavier bundle + learning curve. Worth it once the interaction/object complexity is high; not justified for simple pen + a few labels. You can migrate incrementally (e.g. Konva for shapes/text, raw Canvas for strokes) since the stroke model is independent.

---

## Key pitfalls

- **Tainted canvas (CORS):** drawing a cross-origin image without CORS permission makes `getImageData`/`toDataURL`/`toBlob` throw `SecurityError`. The server must send `Access-Control-Allow-Origin` and you must set `image.crossOrigin = "anonymous"` *before* assigning `src`.
- **Sizing the backing store to display size** downscales the export and loses detail. Always size to `naturalWidth/naturalHeight`.
- **Letting `simulatePressure` default to true** while passing real pressure → doubled/exaggerated thickness. Set it `false`.
- **Driving per-pointer-move points through React state** → re-render storm that can't keep up with input. Use refs + direct canvas draws; commit to state only on stroke completion.
- **Next.js 15 `ssr: false` build break** when used directly from a server component → wrap the dynamic import in a `'use client'` wrapper; test prod build.
- **Forgetting pointer capture** → strokes cut off when the pointer leaves the canvas, and missing `pointerup` leaves stroke state stuck. `setPointerCapture` on down, release on up/cancel.
- **Missing `touch-action: none`** → finger/pen scrolls or zooms the page instead of drawing.
- **iOS Safari canvas limits (~4096² / ~16.7M px)** → Safari silently refuses to draw oversized canvases. Apply a pixel-area guard (`maximumPixels ≈ 16M`).
- **Memory blowup** from large canvases (RGBA = 4 B/px; 4000×3000 ≈ 48 MB) multiplied by offscreen buffers/layers → mobile tab crashes.
- **Not cleaning up listeners in `useEffect`** → leaks + stale refs, worsened by React 19 concurrent double-invocation. Remove listeners in cleanup; keep it idempotent.
- **CSS `transform: scale()` / `object-fit` on the canvas** breaks linear CSS↔canvas coordinate mapping. Scale only via CSS width/height and preserve aspect ratio.
- **Re-encoding lossy sources (JPEG)** compounds artifacts; JPEG also flattens alpha to an implementation-dependent color — pre-fill a known background.
- **Assuming animated GIF/WebP survive** — `drawImage` captures one frame only; export is static.
- **Sparse/erratic input points** produce ugly perfect-freehand output — always process `getCoalescedEvents()`.

---

## Sources

1. https://github.com/steveruizok/perfect-freehand
2. https://natto.dev/@paul/4feb2b946b264479b266e0fec1a77e02
3. https://www.w3.org/TR/pointerevents3/
4. https://www.youtube.com/watch?v=QVz-tt1Qpmc
5. https://github.com/mdn/content/blob/main/files/en-us/web/api/pointerevent/getcoalescedevents/index.md?plain=1
6. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
7. https://www.youtube.com/watch?v=-HEZuF0QZig
8. https://gist.github.com/callumlocke/cc258a193839691f60dd
9. https://github.com/whatwg/html/issues/5387
10. https://discussions.unity.com/t/input-mouseposition-to-scaled-canvas-space-coordinates/878173
11. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit
12. https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientX
13. https://gsap.com/community/forums/topic/20492-scaled-canvas-to-fit-and-match-an-svg-container/
14. https://www.youtube.com/watch?v=KHdNJb54_pQ
15. https://www.fallingcanbedeadly.com/posts/surprising-useeffect-behavior
16. https://github.com/vercel/next.js/discussions/72236
17. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
18. https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
19. https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth
20. https://github.com/aseprite/aseprite/issues/5489
21. https://developer.android.com/develop/ui/compose/touch-input/stylus-input/advanced-stylus-features
22. https://news.ycombinator.com/item?id=47120980
23. https://www.canva.com/features/png-converter/
24. https://www.youtube.com/watch?v=MS3vSR93ADU
25. https://www.youtube.com/watch?v=WbPhV1dyva4
26. https://www.youtube.com/watch?v=19L5DbC2Ye4
27. https://konvajs.org/api/Konva.Text.html
28. https://forum.obsidian.md/t/add-svg-export-feature-to-canvas/54379
29. https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
30. https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/
31. https://react.dev/blog/2024/12/05/react-19
32. https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure
33. https://konvajs.org/docs/performance/All_Performance_Tips.html
34. https://konvajs.org/docs/faq.html
35. https://fabricjs.com/docs/old-docs/using-transformations/
36. https://w3c.github.io/pointerevents/
37. https://helpx.adobe.com/animate/using/optimization-options-for-images-and-animated-gifs.html
38. https://www.youtube.com/watch?v=407nDlwdRwg
39. https://forum.babylonjs.com/t/react-ui-babylon-js-how-to-avoid-usestate-re-rendering-canvas/35154
40. https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
41. https://gist.github.com/jaredwilli/5469626
42. https://learn.microsoft.com/en-us/archive/msdn-magazine/2012/june/web-dev-report-working-with-graphics-on-the-web-canvas-vs-svg
43. https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction
44. https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
45. https://www.youtube.com/watch?v=50EJWAnVQtM
46. https://github.com/whatwg/html/issues/11639
47. https://blog.s-schoener.com/2026-02-09-gui/
48. https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image
49. https://qubitsandbytes.co.uk/javascript/control-the-frame-rate-of-requestanimationframe-callbacks/
50. https://konvajs.org/docs/sandbox/GIF_On_Canvas.html
