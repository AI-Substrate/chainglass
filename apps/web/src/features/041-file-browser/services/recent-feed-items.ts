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
import { isFilteredPath } from '../components/recent-feed/hooks/use-recent-feed-state';
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

/**
 * Multiplier on the requested limit when scanning git history. The feed user
 * wants `limit` interesting files, but git history typically has lots of
 * noise (docs, configs, test files, dot-folders). Scanning N× ensures the
 * post-filter result has a fighting chance of including media even if the
 * most-recent commits were all docs. 4× is a sweet spot: enough headroom for
 * busy repos without making the scan dominate response time.
 */
const SEED_SCAN_MULTIPLIER = 4;

export async function getRecentFeedItems(
  worktreePath: string,
  limit = 50
): Promise<RecentFeedItemsResult> {
  // Scan a wider window so that after dropping dot-files / build artifacts /
  // generated cache extensions, we still have a chance of returning `limit`
  // interesting paths.
  const seed = await getRecentFiles(worktreePath, limit * SEED_SCAN_MULTIPLIER);
  if (!seed.ok) return { ok: false, error: 'not-git' };

  // Drop noise BEFORE the stat round-trip — saves N stat calls per ignored
  // path. Same rules the live-merge reducer applies at intake.
  const filteredPaths = seed.files.filter((p) => !isFilteredPath(p));

  const stats = await Promise.allSettled(
    filteredPaths.map(async (relPath) => {
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
    .map((r) => r.value)
    // Truncate post-filter to the user-requested limit.
    .slice(0, limit);

  return { ok: true, items };
}
