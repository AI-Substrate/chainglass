/**
 * ImagePreview — feed-card preview slot for images.
 *
 * Lazy-loaded via the existing `useLazyLoad` IntersectionObserver hook (no
 * fork — Finding 14). Bounded max-height per AC D3 (≤ 60vh).
 *
 * Plan recent-changes-feed T008.
 */

'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { FeedItem } from '../types';

export interface ImagePreviewProps {
  item: FeedItem;
  rawFileUrl: string;
}

export function ImagePreview({ item, rawFileUrl }: ImagePreviewProps) {
  // Browser-native `loading="lazy"` + the parent's `content-visibility:auto`
  // wrapper already defer off-screen image cost. A custom IntersectionObserver
  // gate on top of that was redundant and stuck cards on a gray placeholder
  // when the observer never fired through the content-visibility boundary.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    // No flexbox on the wrapper — `min-width: auto` on flex items defaults
    // to the intrinsic content size, which fights max-w/max-h when the
    // image is taller than wide and produces visible letterboxing or
    // stretching. A plain block wrapper with `text-align: center` (Tailwind
    // `text-center`) lets the inline image size itself by `max-w-full`/
    // `max-h-[60vh]` cleanly while preserving aspect ratio.
    <div className="bg-muted/30 max-h-[60vh] overflow-hidden text-center">
      {!error && (
        // biome-ignore lint/a11y/useAltText: alt is set dynamically below; pattern matches the rest of the codebase
        <img
          src={rawFileUrl}
          alt={item.name}
          className={cn(
            'inline-block w-auto h-auto max-w-full max-h-[60vh] object-contain align-middle',
            'transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {!loaded && !error && <div className="h-32 w-full animate-pulse bg-muted" />}
      {error && (
        <div className="px-3 py-6 text-xs text-muted-foreground">Failed to load image</div>
      )}
    </div>
  );
}
