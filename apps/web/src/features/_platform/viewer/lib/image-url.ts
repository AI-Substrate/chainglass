/**
 * Shared image URL resolver for markdown surfaces (Preview + WYSIWYG).
 *
 * Extracted from `041-file-browser/components/markdown-preview.tsx` so both
 * the server-rendered preview and the Tiptap editor rewrite image `src`
 * attributes identically.
 *
 * Returns:
 *   - `null`  → caller keeps the original `src` (absolute URL, data URL,
 *               protocol-relative URL, or resolver lacks required context)
 *   - string  → the rewritten URL pointing at the raw-file API
 */

import type { ImageUrlResolver } from './wysiwyg-extensions';

export const resolveImageUrl: ImageUrlResolver = ({ src, currentFilePath, rawFileBaseUrl }) => {
  if (!src) return null;
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('//') ||
    src.startsWith('data:')
  ) {
    return null;
  }
  if (!rawFileBaseUrl || !currentFilePath) return null;

  const lastSlash = currentFilePath.lastIndexOf('/');
  const currentDir = lastSlash >= 0 ? currentFilePath.substring(0, lastSlash) : '';
  const parts = `${currentDir}/${src}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return `${rawFileBaseUrl}&file=${encodeURIComponent(resolved.join('/'))}`;
};
