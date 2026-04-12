/**
 * ImageCard — Image thumbnail preview card with lazy loading.
 *
 * Renders image via raw file API URL. Uses IntersectionObserver to
 * defer loading until the card scrolls into viewport.
 *
 * Plan 077: Folder Content Preview (T005)
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { CardActions } from './card-actions';

export interface ImageCardProps {
  filePath: string;
  filename: string;
  rawFileUrl: string;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  onClick: (path: string) => void;
}

export function ImageCard({
  filePath,
  filename,
  rawFileUrl,
  onCopyPath,
  onDownload,
  onClick,
}: ImageCardProps) {
  const { ref, isVisible } = useLazyLoad();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div
      ref={ref}
      // biome-ignore lint/a11y/useSemanticElements: complex interactive card with images/overlays
      role="button"
      tabIndex={0}
      className={cn(
        'group relative rounded-xl border border-border bg-card overflow-hidden cursor-pointer',
        'shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md hover:border-ring',
        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
      )}
      onClick={() => onClick(filePath)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(filePath)}
    >
      <div className="aspect-video bg-muted overflow-hidden flex items-center justify-center">
        {isVisible && !error && (
          <img
            src={rawFileUrl}
            alt={filename}
            className={cn(
              'w-full h-full object-cover transition-all duration-300',
              'group-hover:scale-[1.03]',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}
        {isVisible && !loaded && !error && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        {error && <div className="text-xs text-muted-foreground">Failed to load</div>}
      </div>

      <CardActions filePath={filePath} onCopyPath={onCopyPath} onDownload={onDownload} />

      <div className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px]">
        <FileIcon filename={filename} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{filename}</span>
      </div>
    </div>
  );
}
