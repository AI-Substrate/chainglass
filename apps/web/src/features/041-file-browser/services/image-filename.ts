/**
 * Image Filename + Output-Format Policy (pure)
 *
 * Two concerns for the image editor's save path:
 *  1. `deriveEditedFilename` — idempotent `<base>-edited.<ext>` naming for
 *     "Save as new". Editing an already-`-edited` file is a no-op on the name
 *     (never `-edited-edited`). GIF is the one extension that legitimately
 *     changes: canvas has no GIF encoder, so a GIF exports as a PNG still
 *     (finding 09).
 *  2. `outputFormatForImage` — extension → canvas `toBlob` MIME + quality +
 *     alpha-flatten policy. JPEG is lossy and has no alpha (flatten to white);
 *     PNG / WebP keep transparency.
 *
 * Plan 086: In-browser Image Editor — T002
 * AC-5 (idempotent suffix), AC-6 (format preservation incl. GIF→PNG), AC-16 (raster gate)
 */

/** The explicit raster set the editor supports. Narrower than the
 * content-type 'image' category (which also includes svg/ico/avif/bmp). */
export const RASTER_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
export type RasterImageExt = (typeof RASTER_IMAGE_EXTENSIONS)[number];

const EDITED_SUFFIX = '-edited';

export interface ImageOutputFormat {
  /** Output file extension (lowercase, no dot). GIF → 'png'. */
  ext: string;
  /** MIME type to pass to canvas.toBlob(). */
  mimeType: string;
  /** Encoder quality for lossy formats (JPEG). Omitted for lossless. */
  quality?: number;
  /** Whether transparency must be flattened to white before export (JPEG). */
  flattenAlpha: boolean;
}

interface SplitName {
  dir: string;
  base: string;
  ext: string;
}

/** Split a path-ish filename into directory, base (no ext), and lowercased ext. */
function splitFilename(filename: string): SplitName {
  const slash = filename.lastIndexOf('/');
  const dir = slash >= 0 ? filename.slice(0, slash + 1) : '';
  const rest = slash >= 0 ? filename.slice(slash + 1) : filename;

  const dot = rest.lastIndexOf('.');
  if (dot <= 0) {
    return { dir, base: rest, ext: '' };
  }
  return { dir, base: rest.slice(0, dot), ext: rest.slice(dot + 1).toLowerCase() };
}

/** Map a source extension to its output format policy. */
export function outputFormatForImage(filename: string): ImageOutputFormat {
  const { ext } = splitFilename(filename);
  switch (ext) {
    case 'jpg':
      return { ext: 'jpg', mimeType: 'image/jpeg', quality: 0.92, flattenAlpha: true };
    case 'jpeg':
      return { ext: 'jpeg', mimeType: 'image/jpeg', quality: 0.92, flattenAlpha: true };
    case 'webp':
      return { ext: 'webp', mimeType: 'image/webp', flattenAlpha: false };
    case 'gif':
      // canvas cannot encode GIF — export a PNG still (finding 09).
      return { ext: 'png', mimeType: 'image/png', flattenAlpha: false };
    default:
      // png (and any unexpected ext) → lossless PNG.
      return { ext: 'png', mimeType: 'image/png', flattenAlpha: false };
  }
}

/**
 * Derive the "Save as new" filename: `<base>-edited.<outExt>`, idempotent in
 * the `-edited` suffix, with GIF mapped to PNG.
 */
export function deriveEditedFilename(filename: string): string {
  const { dir, base, ext } = splitFilename(filename);
  const outExt = outputFormatForImage(filename).ext;
  const editedBase = base.endsWith(EDITED_SUFFIX) ? base : `${base}${EDITED_SUFFIX}`;
  // No extension at all: just append the suffix (defensive — not a normal path).
  if (!ext) return `${dir}${editedBase}`;
  return `${dir}${editedBase}.${outExt}`;
}

/** True iff the filename's extension is in the explicit raster allow-list. */
export function isRasterImageFilename(filename: string): boolean {
  const { ext } = splitFilename(filename);
  return (RASTER_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}
