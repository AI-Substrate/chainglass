import {
  type ContentTypeInfo,
  detectContentType,
  isBinaryExtension,
} from '@/lib/content-type-detection';
import { describe, expect, it } from 'vitest';

describe('detectContentType', () => {
  it('detects image types', () => {
    /*
    Test Doc:
    - Why: Core routing logic — images must map to 'image' category
    - Contract: detectContentType('file.png') → { category: 'image', mimeType: 'image/png' }
    - Usage Notes: Tests all 9 supported image extensions
    - Quality Contribution: Verifies AC-06, AC-15
    - Worked Example: 'photo.png' → image/png, 'photo.jpg' → image/jpeg
    */
    const cases: [string, string][] = [
      ['photo.png', 'image/png'],
      ['photo.jpg', 'image/jpeg'],
      ['photo.jpeg', 'image/jpeg'],
      ['anim.gif', 'image/gif'],
      ['pic.webp', 'image/webp'],
      ['icon.svg', 'image/svg+xml'],
      ['favicon.ico', 'image/x-icon'],
      ['modern.avif', 'image/avif'],
      ['legacy.bmp', 'image/bmp'],
    ];
    for (const [filename, expectedMime] of cases) {
      const result = detectContentType(filename);
      expect(result.category).toBe('image');
      expect(result.mimeType).toBe(expectedMime);
    }
  });

  it('detects PDF', () => {
    /*
    Test Doc:
    - Why: PDF routes to iframe viewer
    - Contract: detectContentType('doc.pdf') → { category: 'pdf', mimeType: 'application/pdf' }
    - Usage Notes: Single extension
    - Quality Contribution: Verifies AC-07
    - Worked Example: 'doc.pdf' → application/pdf
    */
    const result = detectContentType('doc.pdf');
    expect(result).toEqual({ category: 'pdf', mimeType: 'application/pdf' });
  });

  it('detects video types', () => {
    /*
    Test Doc:
    - Why: Video routes to <video> player
    - Contract: detectContentType('clip.mp4') → { category: 'video', mimeType: 'video/mp4' }
    - Usage Notes: mp4 and webm
    - Quality Contribution: Verifies AC-08
    - Worked Example: 'clip.mp4' → video/mp4
    */
    expect(detectContentType('clip.mp4')).toEqual({ category: 'video', mimeType: 'video/mp4' });
    expect(detectContentType('clip.webm')).toEqual({ category: 'video', mimeType: 'video/webm' });
  });

  it('detects audio types', () => {
    /*
    Test Doc:
    - Why: Audio routes to <audio> player
    - Contract: detectContentType('song.mp3') → { category: 'audio', mimeType: 'audio/mpeg' }
    - Usage Notes: mp3, wav, ogg
    - Quality Contribution: Verifies AC-09
    - Worked Example: 'song.mp3' → audio/mpeg
    */
    expect(detectContentType('song.mp3')).toEqual({ category: 'audio', mimeType: 'audio/mpeg' });
    expect(detectContentType('sound.wav')).toEqual({ category: 'audio', mimeType: 'audio/wav' });
    expect(detectContentType('track.ogg')).toEqual({ category: 'audio', mimeType: 'audio/ogg' });
  });

  it('returns binary fallback for unknown extensions', () => {
    /*
    Test Doc:
    - Why: Unknown binaries show BinaryPlaceholder with download button
    - Contract: detectContentType('program.exe') → { category: 'binary', mimeType: 'application/octet-stream' }
    - Usage Notes: Any extension not in the map
    - Quality Contribution: Verifies AC-10
    - Worked Example: 'program.exe' → application/octet-stream
    */
    expect(detectContentType('program.exe')).toEqual({
      category: 'binary',
      mimeType: 'application/octet-stream',
    });
    expect(detectContentType('data.bin')).toEqual({
      category: 'binary',
      mimeType: 'application/octet-stream',
    });
  });

  it('returns binary fallback for no extension', () => {
    expect(detectContentType('Makefile')).toEqual({
      category: 'binary',
      mimeType: 'application/octet-stream',
    });
  });

  it('is case-insensitive', () => {
    expect(detectContentType('Photo.PNG').category).toBe('image');
    expect(detectContentType('DOC.PDF').category).toBe('pdf');
  });
});

describe('isBinaryExtension', () => {
  it('returns true for known binary extensions', () => {
    expect(isBinaryExtension('photo.png')).toBe(true);
    expect(isBinaryExtension('doc.pdf')).toBe(true);
    expect(isBinaryExtension('clip.mp4')).toBe(true);
  });

  it('returns false for text extensions', () => {
    expect(isBinaryExtension('file.ts')).toBe(false);
    expect(isBinaryExtension('readme.md')).toBe(false);
  });

  it('returns false for no extension', () => {
    expect(isBinaryExtension('Makefile')).toBe(false);
  });
});
