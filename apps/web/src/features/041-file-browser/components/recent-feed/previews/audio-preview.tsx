/**
 * AudioPreview — feed-card preview slot for audio.
 *
 * Native `<audio controls>` — minimal chrome, full-width.
 *
 * Plan recent-changes-feed T008.
 */

'use client';

import type { FeedItem } from '../types';

export interface AudioPreviewProps {
  item: FeedItem;
  rawFileUrl: string;
}

export function AudioPreview({ item, rawFileUrl }: AudioPreviewProps) {
  return (
    <div className="px-3 py-3 bg-muted/30">
      {/* biome-ignore lint/a11y/useMediaCaption: workspace-local user content; captions cannot be auto-derived */}
      <audio
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
