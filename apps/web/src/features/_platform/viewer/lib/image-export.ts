/**
 * image-export — canvas-export policy for the image editor (viewer domain).
 *
 * Two pure concerns:
 *  1. `canvasExportFormat` — filename → canvas.toBlob MIME + quality +
 *     alpha-flatten. This is the ENCODING policy (no filenames produced),
 *     intentionally distinct from file-browser's naming-focused
 *     `outputFormatForImage` so the viewer never imports file-browser
 *     (dependency direction, T019). The one shared fact — GIF cannot be
 *     canvas-encoded so it exports as PNG (finding 09) — is duplicated by
 *     design, not by accident.
 *  2. `exceedsCanvasLimit` — the iOS Safari canvas guard (finding 05): a canvas
 *     wider/taller than 4096px, or larger than ~16.7M px in area, silently
 *     fails on iOS. Oversized images are blocked from editing rather than
 *     downscaled (preserves AC-7 fidelity).
 *
 * Plan 086: In-browser Image Editor — T008
 * AC-6 (format), AC-14 (large-image guard)
 */

import type { Size } from './canvas-coords';

export interface CanvasExportFormat {
  /** MIME type for canvas.toBlob(). */
  mimeType: string;
  /** Encoder quality for lossy formats (JPEG). Omitted for lossless. */
  quality?: number;
  /** Whether transparency must be flattened to white before export (JPEG). */
  flattenAlpha: boolean;
}

/** Max canvas dimension per side before iOS Safari fails silently. */
export const MAX_CANVAS_DIMENSION = 4096;
/** Max canvas area (px) before iOS Safari fails silently (~16.7M = 2^24). */
export const MAX_CANVAS_AREA = 16_777_216;

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** Map a source filename to its canvas export encoding policy. */
export function canvasExportFormat(filename: string): CanvasExportFormat {
  switch (extensionOf(filename)) {
    case 'jpg':
    case 'jpeg':
      return { mimeType: 'image/jpeg', quality: 0.92, flattenAlpha: true };
    case 'webp':
      return { mimeType: 'image/webp', flattenAlpha: false };
    case 'gif':
      // canvas cannot encode GIF — export a PNG still (finding 09).
      return { mimeType: 'image/png', flattenAlpha: false };
    default:
      return { mimeType: 'image/png', flattenAlpha: false };
  }
}

/** True if the image is too large for a reliable canvas on iOS Safari. */
export function exceedsCanvasLimit(size: Size): boolean {
  return (
    size.width > MAX_CANVAS_DIMENSION ||
    size.height > MAX_CANVAS_DIMENSION ||
    size.width * size.height > MAX_CANVAS_AREA
  );
}
