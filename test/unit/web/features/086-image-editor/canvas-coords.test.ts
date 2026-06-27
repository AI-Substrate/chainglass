/**
 * canvas-coords Tests (TDD — RED first)
 *
 * Pure CSS-px → image-px transform for a canvas displayed under `object-contain`
 * (uniform scale + centered letterbox). Pointer positions relative to the
 * display element map to backing-store (intrinsic image) pixels.
 *
 * Plan 086: In-browser Image Editor — T007
 * AC-7 (coordinate fidelity)
 */

import { describe, expect, it } from 'vitest';

import { cssToImagePoint } from '@/features/_platform/viewer/lib/canvas-coords';

describe('cssToImagePoint', () => {
  it('is identity when the element matches the image size', () => {
    /*
    Test Doc:
    - Why: 1:1 display must not distort stroke coordinates — AC-7
    - Contract: cssToImagePoint(p, element, image) → image-space point
    - Usage Notes: element + image are {width,height}; css is relative to element
    - Quality Contribution: AC-7
    - Worked Example: 200x200 box, 200x200 image → css(50,75) maps to (50,75)
    */
    const el = { width: 200, height: 200 };
    const img = { width: 200, height: 200 };
    expect(cssToImagePoint({ x: 50, y: 75 }, el, img)).toEqual({ x: 50, y: 75 });
  });

  it('accounts for vertical letterboxing (wide image in square box)', () => {
    /*
    Test Doc:
    - Why: object-contain centers a wide image with top/bottom bars — AC-7
    - Contract: offset + scale removed so image origin maps correctly
    - Usage Notes: image 100x50 in 200x200 → scale 2, displayed 200x100, offsetY 50
    - Quality Contribution: AC-7
    - Worked Example: css(0,50) → (0,0); css(200,150) → (100,50); css(100,100) → (50,25)
    */
    const el = { width: 200, height: 200 };
    const img = { width: 100, height: 50 };
    expect(cssToImagePoint({ x: 0, y: 50 }, el, img)).toEqual({ x: 0, y: 0 });
    expect(cssToImagePoint({ x: 200, y: 150 }, el, img)).toEqual({ x: 100, y: 50 });
    expect(cssToImagePoint({ x: 100, y: 100 }, el, img)).toEqual({ x: 50, y: 25 });
  });

  it('accounts for horizontal letterboxing (tall image in square box)', () => {
    const el = { width: 200, height: 200 };
    const img = { width: 50, height: 100 };
    expect(cssToImagePoint({ x: 50, y: 0 }, el, img)).toEqual({ x: 0, y: 0 });
    expect(cssToImagePoint({ x: 150, y: 200 }, el, img)).toEqual({ x: 50, y: 100 });
  });

  it('clamps points outside the image area to the image bounds', () => {
    /*
    Test Doc:
    - Why: a pointer in the letterbox bar must not produce out-of-bounds strokes
    - Contract: results clamped to [0,width] x [0,height]
    - Usage Notes: protects the stroke array from negative / overflow coords
    - Quality Contribution: AC-7
    - Worked Example: css(0,0) over a top bar → (0,0); css beyond → (w,h)
    */
    const el = { width: 200, height: 200 };
    const img = { width: 100, height: 50 };
    expect(cssToImagePoint({ x: 0, y: 0 }, el, img)).toEqual({ x: 0, y: 0 });
    expect(cssToImagePoint({ x: 200, y: 200 }, el, img)).toEqual({ x: 100, y: 50 });
  });
});
