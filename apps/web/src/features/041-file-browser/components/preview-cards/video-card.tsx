/**
 * VideoCard — Video preview with hover-to-play on desktop, tap-to-play on mobile.
 *
 * Shows poster frame by default. On desktop, hovering starts muted playback
 * after 300ms delay. On mobile, tapping toggles play/pause.
 *
 * Plan 077: Folder Content Preview (T006)
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { Play } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { CardActions } from './card-actions';

export interface VideoCardProps {
  filePath: string;
  filename: string;
  rawFileUrl: string;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  onClick: (path: string) => void;
}

export function VideoCard({
  filePath,
  filename,
  rawFileUrl,
  onCopyPath,
  onDownload,
  onClick,
}: VideoCardProps) {
  const { ref, isVisible } = useLazyLoad();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [isTouchDevice] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);

  const startPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
    setPlaying(true);
  }, []);

  const stopPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setPlaying(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) return;
    hoverTimerRef.current = setTimeout(startPlay, 300);
  }, [isTouchDevice, startPlay]);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) return;
    clearTimeout(hoverTimerRef.current);
    stopPlay();
  }, [isTouchDevice, stopPlay]);

  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      if (!isTouchDevice) return;
      e.stopPropagation();
      if (playing) {
        stopPlay();
      } else {
        startPlay();
      }
    },
    [isTouchDevice, playing, startPlay, stopPlay]
  );

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
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: hover area for video preview, keyboard handled by parent */}
      <div
        className="aspect-video bg-muted overflow-hidden relative flex items-center justify-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleTap}
      >
        {isVisible && (
          <video
            ref={videoRef}
            src={rawFileUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}

        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        <div className="absolute bottom-2 left-2 z-[3] bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
          <Play className="h-2.5 w-2.5 fill-white" />
          {isTouchDevice ? 'Tap to preview' : 'Hover to preview'}
        </div>
      </div>

      <CardActions filePath={filePath} onCopyPath={onCopyPath} onDownload={onDownload} />

      <div className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px]">
        <FileIcon filename={filename} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{filename}</span>
      </div>
    </div>
  );
}
