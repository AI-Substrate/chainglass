'use client';

/**
 * VideoViewer — Inline video playback with native browser controls.
 *
 * Plan 046: Binary File Viewers (T007)
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { useState } from 'react';

export interface VideoViewerProps {
  src: string;
  mimeType: string;
}

export function VideoViewer({ src, mimeType }: VideoViewerProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      {loading && <AsciiSpinner active={true} />}
      {/* biome-ignore lint/a11y/useMediaCaption: local file viewer — no captions available */}
      <video
        src={src}
        controls
        className="max-w-full max-h-full"
        style={loading ? { display: 'none' } : undefined}
        onLoadedData={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
    </div>
  );
}
