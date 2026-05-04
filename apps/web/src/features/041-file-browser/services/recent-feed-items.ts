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
import { detectFeedItemKind } from '../lib/feed-item-kind';
import { getRecentFiles } from './recent-files';
import type {
  FeedEventType,
  FeedItem,
} from '../components/recent-feed/types';

export type RecentFeedItemsResult =
  | { ok: true; items: FeedItem[] }
  | { ok: false; error: 'not-git' };

// Re-export so existing test imports continue to work without churn.
export { detectFeedItemKind };

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
