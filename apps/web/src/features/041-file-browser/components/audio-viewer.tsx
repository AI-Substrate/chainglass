'use client';

/**
 * AudioViewer — Inline audio playback with native browser controls.
 *
 * Plan 046: Binary File Viewers (T007)
 */

import { Music } from 'lucide-react';

export interface AudioViewerProps {
  src: string;
  mimeType: string;
  filename: string;
}

export function AudioViewer({ src, mimeType, filename }: AudioViewerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full w-full p-8">
      <Music className="h-12 w-12 text-muted-foreground" />
      <p className="text-sm text-muted-foreground font-mono">{filename}</p>
      {/* biome-ignore lint/a11y/useMediaCaption: local file viewer — no captions available */}
      <audio controls className="w-full max-w-md">
        <source src={src} type={mimeType} />
      </audio>
    </div>
  );
}
