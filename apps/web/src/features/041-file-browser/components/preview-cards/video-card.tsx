/**
 * VideoCard — Video preview with autoplay, loop, and click-to-pause.
 *
 * Videos autoplay muted and looped as soon as they load. Click the
 * video area to pause/resume. The filename row navigates to the file viewer.
 *
 * Plan 077: Folder Content Preview (T006)
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { Pause, Play } from 'lucide-react';
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
  const [playing, setPlaying] = useState(false);

  const handlePlay = useCallback(() => setPlaying(true), []);
  const handlePause = useCallback(() => setPlaying(false), []);

  // Trigger play once video data is loaded — more reliable than autoPlay
  const handleLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const p = video.play();
    if (p) p.catch(() => {});
  }, []);

  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'group relative rounded-xl border border-border bg-card overflow-hidden',
        'shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md hover:border-ring',
        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
      )}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: video area toggles playback, keyboard handled below */}
      <div
        className="aspect-video bg-muted overflow-hidden relative flex items-center justify-center cursor-pointer"
        onClick={handleVideoClick}
      >
        {isVisible && (
          <video
            ref={videoRef}
            src={rawFileUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlay={handlePlay}
            onPause={handlePause}
            onLoadedData={handleLoadedData}
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

        {playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
            <div className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Pause className="h-5 w-5 text-white fill-white" />
            </div>
          </div>
        )}

        {!playing && (
          <div className="absolute bottom-2 left-2 z-[3] bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
            <Play className="h-2.5 w-2.5 fill-white" />
            Click to play
          </div>
        )}
      </div>

      <CardActions filePath={filePath} onCopyPath={onCopyPath} onDownload={onDownload} />

      {/* biome-ignore lint/a11y/useSemanticElements: filename row navigates to file viewer */}
      <div
        role="button"
        tabIndex={0}
        className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px] cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onClick(filePath)}
        onKeyDown={(e) => e.key === 'Enter' && onClick(filePath)}
      >
        <FileIcon filename={filename} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{filename}</span>
      </div>
    </div>
  );
}
