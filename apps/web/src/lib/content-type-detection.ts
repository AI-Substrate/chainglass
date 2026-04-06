/**
 * Content Type Detection Utility
 *
 * Maps file extensions to content type categories and MIME types.
 * Companion to language-detection.ts — that maps extensions to
 * Shiki language IDs for syntax highlighting; this maps to MIME
 * types for binary file rendering.
 *
 * Plan 046: Binary File Viewers
 */

export interface ContentTypeInfo {
  category: 'image' | 'pdf' | 'video' | 'audio' | 'html' | 'binary';
  mimeType: string;
}

const EXTENSION_MAP: Record<string, ContentTypeInfo> = {
  // Images
  png: { category: 'image', mimeType: 'image/png' },
  jpg: { category: 'image', mimeType: 'image/jpeg' },
  jpeg: { category: 'image', mimeType: 'image/jpeg' },
  gif: { category: 'image', mimeType: 'image/gif' },
  webp: { category: 'image', mimeType: 'image/webp' },
  svg: { category: 'image', mimeType: 'image/svg+xml' },
  ico: { category: 'image', mimeType: 'image/x-icon' },
  avif: { category: 'image', mimeType: 'image/avif' },
  bmp: { category: 'image', mimeType: 'image/bmp' },

  // PDF
  pdf: { category: 'pdf', mimeType: 'application/pdf' },

  // Video
  mp4: { category: 'video', mimeType: 'video/mp4' },
  webm: { category: 'video', mimeType: 'video/webm' },
  mov: { category: 'video', mimeType: 'video/quicktime' },
  avi: { category: 'video', mimeType: 'video/x-msvideo' },
  mkv: { category: 'video', mimeType: 'video/x-matroska' },

  // Audio
  mp3: { category: 'audio', mimeType: 'audio/mpeg' },
  wav: { category: 'audio', mimeType: 'audio/wav' },
  ogg: { category: 'audio', mimeType: 'audio/ogg' },
  flac: { category: 'audio', mimeType: 'audio/flac' },
  aac: { category: 'audio', mimeType: 'audio/aac' },
  m4a: { category: 'audio', mimeType: 'audio/mp4' },

  // HTML (rendered in sandboxed iframe)
  html: { category: 'html', mimeType: 'text/html' },
  htm: { category: 'html', mimeType: 'text/html' },

  // Web assets (served with correct MIME type for HTML sub-resources)
  css: { category: 'binary', mimeType: 'text/css' },
  js: { category: 'binary', mimeType: 'text/javascript' },
  mjs: { category: 'binary', mimeType: 'text/javascript' },
  json: { category: 'binary', mimeType: 'application/json' },
  woff: { category: 'binary', mimeType: 'font/woff' },
  woff2: { category: 'binary', mimeType: 'font/woff2' },
  ttf: { category: 'binary', mimeType: 'font/ttf' },
  otf: { category: 'binary', mimeType: 'font/otf' },
};

const BINARY_FALLBACK: ContentTypeInfo = {
  category: 'binary',
  mimeType: 'application/octet-stream',
};

/**
 * Detect content type from filename extension.
 *
 * Returns the category (image, pdf, video, audio) and MIME type
 * for known binary formats. Unknown extensions return 'binary'
 * with application/octet-stream.
 */
export function detectContentType(filename: string): ContentTypeInfo {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return BINARY_FALLBACK;
  return EXTENSION_MAP[ext] ?? BINARY_FALLBACK;
}

/**
 * Check if a filename has a known binary content type.
 * Returns false for unknown extensions (they might be text).
 */
export function isBinaryExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return ext in EXTENSION_MAP;
}
