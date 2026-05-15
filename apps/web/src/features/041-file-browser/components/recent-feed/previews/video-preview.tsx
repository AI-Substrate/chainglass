/**
 * VideoPreview — feed-card preview slot for videos.
 *
 * Native `<video controls preload="metadata">` with poster — workshop §6
 * decision: NO autoplay-loop in the feed. `preload="metadata"` keeps memory
 * bounded until the user pulls the card into focus (Finding 05).
 *
 * Plan recent-changes-feed T008.
 */

'use client';

import type { FeedItem } from '../types';

export interface VideoPreviewProps {
  item: FeedItem;
  rawFileUrl: string;
  /** Optional poster URL (e.g., a thumbnail extracted server-side). */
  posterUrl?: string;
}

export function VideoPreview({ item, rawFileUrl, posterUrl }: VideoPreviewProps) {
  // `preload="metadata"` keeps memory bounded until the user actually plays
  // the video; the parent `content-visibility:auto` wrapper skips render
  // entirely for off-screen cards. An IntersectionObserver gate on top of
  // those two doesn't add value and was actively breaking playback (the
  // observer never fired through the content-visibility boundary).
  // `key={rawFileUrl}` forces a remount when the cache-busted URL changes
  // (in-place file replacement → new `?v=<mtime>`). Without it, React keeps
  // the same DOM node and `<source src>` mutation alone doesn't tell the
  // media element to reload — the user sees the old video until a manual
  // page refresh.
  return (
    <div className="bg-black max-h-[60vh] overflow-hidden flex items-center justify-center">
      {/* biome-ignore lint/a11y/useMediaCaption: workspace-local user content; captions cannot be auto-derived */}
      <video
        key={rawFileUrl}
        className="max-w-full max-h-[60vh] object-contain"
        controls
        preload="metadata"
        poster={posterUrl}
        aria-label={`Video preview: ${item.name}`}
      >
        <source src={rawFileUrl} />
      </video>
    </div>
  );
}
