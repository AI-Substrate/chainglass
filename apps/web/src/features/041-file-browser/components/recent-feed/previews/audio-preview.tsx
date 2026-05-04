/**
 * AudioPreview — feed-card preview slot for audio.
 *
 * Native `<audio controls preload="metadata">` — minimal chrome, full-width.
 * F003 fix: deferred via the existing `useLazyLoad` hook (Finding 14, no
 * fork) so a feed with many audio files doesn't trigger N simultaneous
 * metadata fetches at mount. Mirrors `VideoPreview`'s pattern; keeps the
 * AC G2 in-flight-media bound consistent across audio and video.
 *
 * Plan recent-changes-feed T008 (+ T011/F003 fix from companion review).
 */

'use client';

import type { FeedItem } from '../types';

export interface AudioPreviewProps {
  item: FeedItem;
  rawFileUrl: string;
}

export function AudioPreview({ item, rawFileUrl }: AudioPreviewProps) {
  // `preload="metadata"` bounds N audio elements' upfront cost; the parent
  // `content-visibility:auto` already skips off-screen render. The previous
  // IntersectionObserver gate stuck audio cards on a placeholder forever
  // because the observer never fired through the content-visibility boundary.
  return (
    <div className="px-3 py-3 bg-muted/30 min-h-[60px]">
      {/* biome-ignore lint/a11y/useMediaCaption: workspace-local user content; captions cannot be auto-derived */}
      {/* key={rawFileUrl} forces a remount when the cache-busted URL flips (in-place replace) so the audio element actually reloads. */}
      <audio
        key={rawFileUrl}
        controls
        preload="metadata"
        className="w-full"
        aria-label={`Audio preview: ${item.name}`}
      >
        <source src={rawFileUrl} />
      </audio>
    </div>
  );
}
