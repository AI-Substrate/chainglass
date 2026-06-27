/**
 * Image Filename Helper Tests (TDD — RED first)
 *
 * Pure functions for the image editor's save-as-new naming + output-format
 * policy:
 *  - deriveEditedFilename(): idempotent `-edited` suffix; GIF→PNG (finding 09)
 *  - outputFormatForImage(): extension → MIME + quality + alpha-flatten policy
 *  - isRasterImageFilename(): the explicit raster gate {png,jpg,jpeg,gif,webp}
 *
 * Plan 086: In-browser Image Editor — T001
 * AC-5 (idempotent suffix), AC-6 (format preservation incl. GIF→PNG), AC-16 (raster gate)
 */

import { describe, expect, it } from 'vitest';

import {
  RASTER_IMAGE_EXTENSIONS,
  deriveEditedFilename,
  isRasterImageFilename,
  outputFormatForImage,
} from '@/features/041-file-browser/services/image-filename';

describe('deriveEditedFilename', () => {
  it('appends -edited before the extension', () => {
    /*
    Test Doc:
    - Why: Save-as-new must write a sibling `<base>-edited.<ext>` (AC-4)
    - Contract: deriveEditedFilename('foo.png') → 'foo-edited.png'
    - Usage Notes: operates on the basename; preserves the original extension
    - Quality Contribution: AC-4, AC-5
    - Worked Example: 'diagram.webp' → 'diagram-edited.webp'
    */
    expect(deriveEditedFilename('foo.png')).toBe('foo-edited.png');
    expect(deriveEditedFilename('screenshot.jpeg')).toBe('screenshot-edited.jpeg');
    expect(deriveEditedFilename('diagram.webp')).toBe('diagram-edited.webp');
    expect(deriveEditedFilename('photo.jpg')).toBe('photo-edited.jpg');
  });

  it('is idempotent — never produces -edited-edited', () => {
    /*
    Test Doc:
    - Why: Editing an already-edited file saves back to the same name (AC-5)
    - Contract: deriveEditedFilename('foo-edited.png') → 'foo-edited.png'
    - Usage Notes: a trailing `-edited` on the base is detected and reused
    - Quality Contribution: AC-5
    - Worked Example: 'foo-edited.png' → 'foo-edited.png' (stable)
    */
    expect(deriveEditedFilename('foo-edited.png')).toBe('foo-edited.png');
    expect(deriveEditedFilename(deriveEditedFilename('foo.png'))).toBe('foo-edited.png');
    expect(deriveEditedFilename('a/b/foo-edited.jpg')).toBe('a/b/foo-edited.jpg');
  });

  it('preserves a directory prefix', () => {
    expect(deriveEditedFilename('a/b/photo.webp')).toBe('a/b/photo-edited.webp');
    expect(deriveEditedFilename('nested/dir/img.png')).toBe('nested/dir/img-edited.png');
  });

  it('maps GIF source to a PNG output (canvas cannot encode GIF — finding 09)', () => {
    /*
    Test Doc:
    - Why: canvas.toBlob has no GIF encoder; GIF must export as a PNG still
    - Contract: deriveEditedFilename('foo.gif') → 'foo-edited.png'
    - Usage Notes: GIF is the one extension that legitimately changes on save
    - Quality Contribution: AC-6 (finding 09)
    - Worked Example: 'anim.gif' → 'anim-edited.png'; 'foo-edited.gif' → 'foo-edited.png'
    */
    expect(deriveEditedFilename('foo.gif')).toBe('foo-edited.png');
    expect(deriveEditedFilename('anim.gif')).toBe('anim-edited.png');
    expect(deriveEditedFilename('foo-edited.gif')).toBe('foo-edited.png');
    expect(deriveEditedFilename('dir/loop.gif')).toBe('dir/loop-edited.png');
  });

  it('normalizes the output extension to lowercase', () => {
    expect(deriveEditedFilename('IMG.PNG')).toBe('IMG-edited.png');
    expect(deriveEditedFilename('Photo.JPG')).toBe('Photo-edited.jpg');
  });
});

describe('outputFormatForImage', () => {
  it('maps PNG → lossless image/png, alpha preserved', () => {
    /*
    Test Doc:
    - Why: PNG path is lossless and keeps transparency (AC-6)
    - Contract: outputFormatForImage('a.png') → { ext:'png', mimeType:'image/png', flattenAlpha:false }
    - Usage Notes: no quality param for PNG (lossless)
    - Quality Contribution: AC-6
    - Worked Example: drawing on a transparent PNG retains alpha
    */
    expect(outputFormatForImage('a.png')).toEqual({
      ext: 'png',
      mimeType: 'image/png',
      flattenAlpha: false,
    });
  });

  it('maps JPEG → image/jpeg at quality 0.92, alpha flattened to white', () => {
    expect(outputFormatForImage('a.jpg')).toEqual({
      ext: 'jpg',
      mimeType: 'image/jpeg',
      quality: 0.92,
      flattenAlpha: true,
    });
    expect(outputFormatForImage('a.jpeg')).toEqual({
      ext: 'jpeg',
      mimeType: 'image/jpeg',
      quality: 0.92,
      flattenAlpha: true,
    });
  });

  it('maps GIF → PNG output (finding 09)', () => {
    expect(outputFormatForImage('a.gif')).toEqual({
      ext: 'png',
      mimeType: 'image/png',
      flattenAlpha: false,
    });
  });

  it('maps WebP → image/webp, alpha preserved', () => {
    expect(outputFormatForImage('a.webp')).toEqual({
      ext: 'webp',
      mimeType: 'image/webp',
      flattenAlpha: false,
    });
  });
});

describe('isRasterImageFilename', () => {
  it('accepts only the explicit raster set', () => {
    /*
    Test Doc:
    - Why: Edit is offered only for raster images; SVG/non-image rejected (AC-16)
    - Contract: isRasterImageFilename('x.png') → true; 'x.svg' → false
    - Usage Notes: explicit allow-list — narrower than content-type 'image' category
    - Quality Contribution: AC-16
    - Worked Example: 'logo.svg' → false (vector); 'icon.ico' → false (not in set)
    */
    for (const ext of RASTER_IMAGE_EXTENSIONS) {
      expect(isRasterImageFilename(`file.${ext}`)).toBe(true);
    }
    expect(isRasterImageFilename('logo.svg')).toBe(false);
    expect(isRasterImageFilename('icon.ico')).toBe(false);
    expect(isRasterImageFilename('photo.avif')).toBe(false);
    expect(isRasterImageFilename('notes.txt')).toBe(false);
    expect(isRasterImageFilename('noext')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRasterImageFilename('FILE.PNG')).toBe(true);
    expect(isRasterImageFilename('Photo.JPEG')).toBe(true);
  });
});
