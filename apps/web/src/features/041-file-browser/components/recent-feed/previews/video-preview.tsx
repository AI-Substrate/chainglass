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

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import type { FeedItem } from '../types';

export interface VideoPreviewProps {
  item: FeedItem;
  rawFileUrl: string;
  /** Optional poster URL (e.g., a thumbnail extracted server-side). */
  posterUrl?: string;
}

export function VideoPreview({ item, rawFileUrl, posterUrl }: VideoPreviewProps) {
  const { ref, isVisible } = useLazyLoad();

  return (
    <div ref={ref} className="bg-black max-h-[60vh] overflow-hidden flex items-center justify-center">
      {isVisible ? (
        <video
          // biome-ignore lint/a11y/useMediaCaption: workspace-local user content; captions cannot be auto-derived
          className="max-w-full max-h-[60vh] object-contain"
          controls
          preload="metadata"
          poster={posterUrl}
          aria-label={`Video preview: ${item.name}`}
        >
          <source src={rawFileUrl} />
        </video>
      ) : (
        <div className="h-48 w-full bg-muted/30" />
      )}
    </div>
  );
}
