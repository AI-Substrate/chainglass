/**
 * canvas-coords — CSS-pixel → image-pixel transform under `object-contain`.
 *
 * The editor uses a single canvas whose backing store is the image's intrinsic
 * resolution, displayed (CSS-scaled) inside a box with `object-contain`
 * semantics: uniform scale to fit, centered, with letterbox bars on the
 * over-sized axis. Pointer events arrive in CSS pixels relative to the display
 * box; strokes are stored in image space so they render at native resolution.
 *
 * Pure + framework-free so it is unit-testable without a DOM.
 *
 * Plan 086: In-browser Image Editor — T008
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convert a pointer position (CSS px, relative to the display element's
 * top-left) to image-space px, accounting for object-contain letterboxing.
 * Result is clamped to the image bounds so letterbox-bar pointers don't
 * produce out-of-range strokes.
 */
export function cssToImagePoint(css: Point, element: Size, image: Size): Point {
  const scale = Math.min(element.width / image.width, element.height / image.height);
  const displayedWidth = image.width * scale;
  const displayedHeight = image.height * scale;
  const offsetX = (element.width - displayedWidth) / 2;
  const offsetY = (element.height - displayedHeight) / 2;

  const imageX = (css.x - offsetX) / scale;
  const imageY = (css.y - offsetY) / scale;

  return {
    x: clamp(imageX, 0, image.width),
    y: clamp(imageY, 0, image.height),
  };
}
