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

import { readdir, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import type { FeedItem, FeedItemKind } from '../components/recent-feed/types';
import { detectFeedItemKind } from '../lib/feed-item-kind';
import { isFilteredPath } from '../lib/recent-feed-filtering';

/**
 * Filter category — same enum the chip filter uses on the client. Server
 * accepts these strings as a hint when the user has narrowed the feed to
 * specific kinds; we then guarantee a per-category quota so e.g. clicking
 * "Video" surfaces actual videos even on a doc-heavy repo where the most
 * recent N paths are all markdown/code.
 */
export type SeedCategory = 'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other';

export interface RecentFeedItemsOptions {
  /** When set, ensure at least `minPerCategory` items per category in the result. */
  categories?: ReadonlyArray<SeedCategory>;
  /** Quota per category when `categories` set. Default 20. */
  minPerCategory?: number;
}

export type RecentFeedItemsResult =
  | { ok: true; items: FeedItem[] }
  | { ok: false; error: 'not-git' };

/** Map a FeedItemKind onto the SeedCategory bucket. */
function kindToCategory(kind: FeedItemKind): SeedCategory {
  switch (kind) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'markdown':
      return 'markdown';
    case 'code':
      return 'code';
    default:
      return 'other';
  }
}

// Re-export so existing test imports continue to work without churn.
export { detectFeedItemKind };

/**
 * Hard cap on filesystem-walked entries. Generated-artifact repos can have
 * thousands of files; we don't need to stat every one — just enough to find
 * what's been touched recently. This keeps the worktree-walk bounded on
 * pathological repos while still surfacing recent uncommitted activity.
 */
const WORKTREE_WALK_CAP = 5000;

/**
 * Walk the worktree filesystem and return FeedItem entries for every file
 * (up to WORKTREE_WALK_CAP) that survives `isFilteredPath`. Critical for
 * surfacing *uncommitted* generated artifacts — `git log --diff-filter=AMCR`
 * only sees committed paths, but creative repos (image/video pipelines)
 * routinely have brand-new mp4s sitting in the working tree that the user
 * absolutely expects to see at the top of "Recent Changes".
 *
 * Skips dot-folders and build-artifact directories at the directory level
 * so we don't recurse into `node_modules/` or `.git/`. That's both a
 * correctness measure (matches the same `isFilteredPath` policy applied
 * everywhere else) and a performance one — pruning early avoids walking
 * tens of thousands of entries we'd just discard.
 */
async function walkWorktreeForFeedItems(
  worktreePath: string,
  cap: number = WORKTREE_WALK_CAP
): Promise<FeedItem[]> {
  // Phase 1 — walk readdir BFS, collect candidate paths. Cheap: one
  // syscall per directory, no per-file work.
  type Candidate = { rel: string; abs: string; name: string };
  const candidates: Candidate[] = [];
  const queue: string[] = ['']; // relative paths; '' = worktree root
  while (queue.length > 0 && candidates.length < cap) {
    const relDir = queue.shift() as string;
    const absDir = relDir === '' ? worktreePath : resolvePath(worktreePath, relDir);
    let entries: import('node:fs').Dirent[];
    try {
      entries = (await readdir(absDir, { withFileTypes: true })) as import('node:fs').Dirent[];
    } catch {
      continue; // permission denied / vanished — skip this directory.
    }
    for (const entry of entries) {
      if (candidates.length >= cap) break;
      const childRel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (isFilteredPath(childRel)) continue;
      if (entry.isDirectory()) {
        queue.push(childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      candidates.push({
        rel: childRel,
        abs: resolvePath(worktreePath, childRel),
        name: entry.name,
      });
    }
  }

  // Phase 2 — fan out the stat() calls. Sequential awaiting (the previous
  // implementation) was the dominant cost: at ~1 ms per stat × 5000 files
  // ≈ 5 s wall time for a single feed seed. Promise.allSettled() pushes
  // all stats through the libuv pool concurrently, dropping wall time
  // by an order of magnitude on warm caches.
  const results = await Promise.allSettled(
    candidates.map(async (c) => {
      const s = await stat(c.abs);
      const item: FeedItem = {
        path: c.rel,
        absolutePath: c.abs,
        name: c.name,
        changedAt: s.mtimeMs,
        size: s.size,
        kind: detectFeedItemKind(c.name),
        eventType: 'changed',
      };
      return item;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export async function getRecentFeedItems(
  worktreePath: string,
  limit = 50,
  options: RecentFeedItemsOptions = {}
): Promise<RecentFeedItemsResult> {
  const { categories, minPerCategory = 20 } = options;

  // Walk the worktree filesystem directly — the source of truth is mtime on
  // disk, NOT git history. Generated artifacts (mp4, png, etc.) frequently
  // sit uncommitted in creative repos and the user expects them to surface
  // at the top of "Recent Changes". A `git log` seed missed them entirely.
  //
  // The walker returns every (non-noisy) file with its mtime; we sort newest-
  // first below. Tracked, untracked, modified, brand-new — all treated
  // identically.
  let allItems: FeedItem[];
  try {
    allItems = await walkWorktreeForFeedItems(worktreePath);
  } catch {
    return { ok: false, error: 'not-git' };
  }

  // Order by filesystem mtime (newest-first). The walker returns items in
  // readdir order (not recency), so we always need this sort.
  allItems.sort((a, b) => b.changedAt - a.changedAt);

  // No category hint — preserve the historical "newest N items" contract.
  if (!categories || categories.length === 0) {
    return { ok: true, items: allItems.slice(0, limit) };
  }

  // Category-aware selection: take up to `minPerCategory` newest items per
  // requested category, then top up with the newest remaining items
  // (regardless of category) until `limit` is reached. Result preserves
  // newest-first order without per-category clumping. Dedup is implicit
  // because each FeedItem has a unique path.
  const requestedSet = new Set<SeedCategory>(categories);
  const perCategoryCounts = new Map<SeedCategory, number>();
  const selected = new Set<string>();
  const result: FeedItem[] = [];

  // Pass 1 — quotas. Walk newest-first, picking each item that belongs to a
  // requested category until that category hits its quota.
  for (const item of allItems) {
    const cat = kindToCategory(item.kind);
    if (!requestedSet.has(cat)) continue;
    const count = perCategoryCounts.get(cat) ?? 0;
    if (count >= minPerCategory) continue;
    perCategoryCounts.set(cat, count + 1);
    selected.add(item.path);
    result.push(item);
    if (result.length >= limit) break;
  }

  // Pass 2 — top-up. If we have headroom in `limit`, fill with newest
  // remaining items (any category) so the user still has surrounding
  // context. Skip anything already selected.
  if (result.length < limit) {
    for (const item of allItems) {
      if (selected.has(item.path)) continue;
      result.push(item);
      if (result.length >= limit) break;
    }
  }

  // Re-sort newest-first — the quota walk preserves recency *within* each
  // category but a quota-driven pick may have skipped over newer items in
  // unrequested categories. Final ordering uses the original recency.
  const recencyIndex = new Map(allItems.map((it, i) => [it.path, i]));
  result.sort((a, b) => (recencyIndex.get(a.path) ?? 0) - (recencyIndex.get(b.path) ?? 0));

  return { ok: true, items: result };
}
