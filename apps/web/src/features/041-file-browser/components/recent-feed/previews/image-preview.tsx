/**
 * ImagePreview — feed-card preview slot for images.
 *
 * Lazy-loaded via the existing `useLazyLoad` IntersectionObserver hook (no
 * fork — Finding 14). Bounded max-height per AC D3 (≤ 60vh).
 *
 * Plan recent-changes-feed T008.
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { FeedItem } from '../types';

export interface ImagePreviewProps {
  item: FeedItem;
  rawFileUrl: string;
}

export function ImagePreview({ item, rawFileUrl }: ImagePreviewProps) {
  const { ref, isVisible } = useLazyLoad();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center bg-muted/30 max-h-[60vh] overflow-hidden"
    >
      {isVisible && !error && (
        // biome-ignore lint/a11y/useAltText: alt is set dynamically below; pattern matches the rest of the codebase
        <img
          src={rawFileUrl}
          alt={item.name}
          className={cn(
            'max-w-full max-h-[60vh] object-contain transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {isVisible && !loaded && !error && (
        <div className="h-32 w-full animate-pulse bg-muted" />
      )}
      {!isVisible && <div className="h-32 w-full bg-muted/30" />}
      {error && (
        <div className="px-3 py-6 text-xs text-muted-foreground">Failed to load image</div>
      )}
    </div>
  );
}
