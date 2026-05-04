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

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
  'ico',
]);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);
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
