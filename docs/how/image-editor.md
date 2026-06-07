# Image Editor (pen annotation)

Annotate raster images right in the file browser — circle a bug, mark up a
screenshot — without leaving the app. Pen only for now (color + a few stroke
widths); text and shapes may come later.

## Using it

1. Open a raster image (`.png`, `.jpg`/`.jpeg`, `.gif`, `.webp`) in the file
   browser. SVGs and non-images are view-only — no Edit button appears.
2. Click **Edit** in the preview toolbar. The image area flips into a drawing
   canvas with the image as the background.
3. Draw with the pen. Pick a **color** and a **stroke width** from the toolbar.
   Pressure-sensitive pens are honoured; a mouse draws at a constant weight.
   **Undo** reverts the last stroke.
4. Save:
   - **Save over** — writes back to the original file.
   - **Save as new** — writes a `<name>-edited.<ext>` sibling. Editing an
     already-`-edited` file saves back to the *same* name (no `-edited-edited`).
5. **Cancel** leaves edit mode (you'll be asked to confirm if you have unsaved
   strokes).

## Behaviour notes

- **Format is preserved.** PNG and WebP stay lossless and keep transparency;
  JPEG is re-encoded at ~0.92 quality with transparency flattened to white.
  **GIF is the one exception** — the canvas can't encode GIF, so a GIF exports
  as a PNG still (`photo.gif` → `photo-edited.png`).
- **Native resolution.** Saved images keep their original pixel dimensions.
- **Save over is conflict-aware.** If the file changed on disk since you opened
  it, the editor stops and offers **Save as new**, **Overwrite anyway**, or
  **Discard & reload**. (Save as new always writes unconditionally.)
- **Very large images can't be edited.** Images over ~16.7M pixels or wider/
  taller than 4096px are blocked (an iOS Safari canvas limit) — the Edit button
  is disabled with a message.
- **Drawing failures are surfaced, not swallowed.** If the image can't load or
  the export fails, you get an error and your strokes are preserved so you can
  retry.

## How it works (for contributors)

- The editor is a lazy-loaded client component (`ImageEditorLazy`,
  `dynamic(ssr:false)`) in the **viewer** domain — `perfect-freehand` + the
  canvas code stay out of the initial bundle.
- The viewer is generic: it never imports `file-browser`. Saving flows **down**
  as `onSaveOver` / `onSaveAsNew` / `onCancel` callbacks. The file-browser side
  owns the `saveEditedImage` server action.
- Saves are **binary-safe**: `saveImageService` writes a `Buffer` atomically
  (tmp→rename) via `IFileSystem`/`IPathResolver`, modelled on
  `uploadFileService` — never the string-only save path (which corrupts bytes).
- The background loads same-origin from the raw-file route so `canvas.toBlob`
  is never CORS-tainted.

See the implementation plan: `docs/plans/086-image-editor/image-editor-plan.md`.
