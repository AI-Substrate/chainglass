/**
 * Recent Feed Items Service
 *
 * Wraps `getRecentFiles` (git log → string[]) with `fs.stat` enrichment +
 * extension → FeedItemKind mapping. Returns the FeedItem[] shape consumed
 * by the Recent Changes Feed orchestrator (T012).
 *
 * Stat is run in parallel via `Promise.allSettled` so a single missing/
 * inaccessible file does not blank the seed; the offending entry is
 * dropped and the rest succeed.
 *
 * Plan recent-changes-feed T012.
 */

import { stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { getRecentFiles } from './recent-files';
import type {
  FeedEventType,
  FeedItem,
  FeedItemKind,
} from '../components/recent-feed/types';

export type RecentFeedItemsResult =
  | { ok: true; items: FeedItem[] }
  | { ok: false; error: 'not-git' };

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
  // No extension → could be a Dockerfile / Makefile / etc.
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

export async function getRecentFeedItems(
  worktreePath: string,
  limit = 50
): Promise<RecentFeedItemsResult> {
  const seed = await getRecentFiles(worktreePath, limit);
  if (!seed.ok) return { ok: false, error: 'not-git' };

  const stats = await Promise.allSettled(
    seed.files.map(async (relPath) => {
      const absPath = resolvePath(worktreePath, relPath);
      const s = await stat(absPath);
      const segs = relPath.split('/');
      const name = segs[segs.length - 1] ?? relPath;
      // git log already filtered to AMCR; we don't know which here, so all
      // seed entries are reported as 'changed'. Live updates from the SSE
      // channel will set 'added' / 'deleted' as appropriate (T015).
      const eventType: FeedEventType = 'changed';
      const item: FeedItem = {
        path: relPath,
        absolutePath: absPath,
        name,
        changedAt: s.mtimeMs,
        size: s.size,
        kind: detectFeedItemKind(name),
        eventType,
      };
      return item;
    })
  );

  // git log returns newest-first; we keep that ordering. Drop entries whose
  // stat failed (file deleted between the log read and the stat call).
  const items: FeedItem[] = stats
    .filter(
      (r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled'
    )
    .map((r) => r.value);

  return { ok: true, items };
}
