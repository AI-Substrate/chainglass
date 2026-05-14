/**
 * Browser-safe extension → FeedItemKind mapping.
 *
 * Lives in `lib/` so both server (services/recent-feed-items.ts — via
 * Node fs.stat) and client (components/recent-feed/hooks/use-recent-feed-state.ts
 * — pure reducer) can import it without the server module's `node:fs/promises`
 * dependency leaking into the client bundle.
 *
 * Plan recent-changes-feed — split out at T016 after Turbopack flagged
 * `node:fs/promises` as unsupported in the app-client chunk.
 */

import type { FeedItemKind } from '../components/recent-feed/types';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']);
const VIDEO_EXTS = new Set([
  'mp4',
  'm4v', // Apple H.264 / iTunes container — same MIME family as mp4
  'webm',
  'mov',
  'avi',
  'mkv',
  'mpg',
  'mpeg',
  'ogv',
  '3gp',
  '3g2',
  'wmv',
  'flv',
  // Note: NOT including 'ts' (MPEG-TS) — it conflicts with TypeScript
  // sources, which heavily dominate the population. Users with raw
  // transport streams in their feed are vanishingly rare; we'd rather
  // surface .ts files as code excerpts than break the common case.
]);
const AUDIO_EXTS = new Set([
  'mp3',
  'wav',
  'ogg',
  'oga',
  'opus',
  'flac',
  'aac',
  'm4a',
  'm4b',
  'wma',
  'aiff',
  'aif',
]);
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx']);
const CODE_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rs',
  'go',
  'rb',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'lua',
  'sql',
  'r',
  'pl',
  'yaml',
  'yml',
  'toml',
  'json',
  'jsonc',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'xml',
  'svg',
  'gradle',
  'cmake',
  'dockerfile',
  'makefile',
  'tf',
  'dart',
  'vue',
  'svelte',
]);

export function detectFeedItemKind(filename: string): FeedItemKind {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) {
    const lc = filename.toLowerCase();
    if (lc === 'dockerfile' || lc === 'makefile' || lc === 'rakefile') {
      return 'code';
    }
    return 'generic';
  }
  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (MARKDOWN_EXTS.has(ext)) return 'markdown';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'binary';
}
