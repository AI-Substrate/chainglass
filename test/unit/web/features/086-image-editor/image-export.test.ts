/**
 * image-export Tests (TDD — RED first)
 *
 * Pure canvas-export policy for the viewer:
 *  - canvasExportFormat(): filename → toBlob MIME + quality + alpha-flatten.
 *    Encoding-focused (no filenames) — deliberately separate from file-browser's
 *    naming-focused outputFormatForImage to keep the viewer ↛ file-browser
 *    dependency direction (T019). Shared fact: GIF cannot be canvas-encoded → PNG.
 *  - exceedsCanvasLimit(): iOS Safari guard (>4096 per side or >16.7M px area).
 *
 * Plan 086: In-browser Image Editor — T007
 * AC-6 (format), AC-14 (large-image guard)
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_CANVAS_AREA,
  MAX_CANVAS_DIMENSION,
  canvasExportFormat,
  exceedsCanvasLimit,
} from '@/features/_platform/viewer/lib/image-export';

describe('canvasExportFormat', () => {
  it('selects lossless image/png with alpha for PNG', () => {
    /*
    Test Doc:
    - Why: toBlob needs the right MIME/quality; PNG is lossless + keeps alpha — AC-6
    - Contract: canvasExportFormat('a.png') → { mimeType:'image/png', flattenAlpha:false }
    - Usage Notes: no quality param for lossless
    - Quality Contribution: AC-6
    - Worked Example: editing a transparent PNG keeps transparency
    */
    expect(canvasExportFormat('a.png')).toEqual({ mimeType: 'image/png', flattenAlpha: false });
  });

  it('selects image/jpeg at quality 0.92 with alpha flattened for JPEG', () => {
    expect(canvasExportFormat('a.jpg')).toEqual({
      mimeType: 'image/jpeg',
      quality: 0.92,
      flattenAlpha: true,
    });
    expect(canvasExportFormat('photo.jpeg')).toEqual({
      mimeType: 'image/jpeg',
      quality: 0.92,
      flattenAlpha: true,
    });
  });

  it('exports GIF as PNG (canvas has no GIF encoder — finding 09)', () => {
    expect(canvasExportFormat('a.gif')).toEqual({ mimeType: 'image/png', flattenAlpha: false });
  });

  it('selects image/webp keeping alpha', () => {
    expect(canvasExportFormat('a.webp')).toEqual({ mimeType: 'image/webp', flattenAlpha: false });
  });
});

describe('exceedsCanvasLimit', () => {
  it('exposes the iOS guard constants', () => {
    expect(MAX_CANVAS_DIMENSION).toBe(4096);
    expect(MAX_CANVAS_AREA).toBe(16_777_216);
  });

  it('allows images at or under the limit', () => {
    /*
    Test Doc:
    - Why: ordinary images must remain editable — AC-14
    - Contract: exceedsCanvasLimit(size) → false when within bounds
    - Usage Notes: 4096x4096 == area limit exactly → allowed
    - Quality Contribution: AC-14
    - Worked Example: 3000x3000 (9M px) → false
    */
    expect(exceedsCanvasLimit({ width: 100, height: 100 })).toBe(false);
    expect(exceedsCanvasLimit({ width: 3000, height: 3000 })).toBe(false);
    expect(exceedsCanvasLimit({ width: 4096, height: 4096 })).toBe(false);
  });

  it('blocks images over a per-side dimension or total area', () => {
    expect(exceedsCanvasLimit({ width: 4097, height: 10 })).toBe(true);
    expect(exceedsCanvasLimit({ width: 10, height: 5000 })).toBe(true);
    expect(exceedsCanvasLimit({ width: 4097, height: 4097 })).toBe(true);
    expect(exceedsCanvasLimit({ width: 20000, height: 1 })).toBe(true);
  });
});
