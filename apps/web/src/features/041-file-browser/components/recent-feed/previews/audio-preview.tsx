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

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import type { FeedItem } from '../types';

export interface AudioPreviewProps {
  item: FeedItem;
  rawFileUrl: string;
}

export function AudioPreview({ item, rawFileUrl }: AudioPreviewProps) {
  const { ref, isVisible } = useLazyLoad();

  return (
    <div ref={ref} className="px-3 py-3 bg-muted/30 min-h-[60px]">
      {isVisible ? (
        // biome-ignore lint/a11y/useMediaCaption: workspace-local user content; captions cannot be auto-derived
        <audio
          controls
          preload="metadata"
          className="w-full"
          aria-label={`Audio preview: ${item.name}`}
        >
          <source src={rawFileUrl} />
        </audio>
      ) : (
        <div className="h-10 w-full rounded bg-muted/40" />
      )}
    </div>
  );
}
