'use client';

/**
 * ImageViewer — Inline image display with fit-to-container scaling.
 *
 * Renders images via <img> tag (safe for SVG — no script execution).
 * Shows AsciiSpinner while loading.
 *
 * Plan 046: Binary File Viewers (T005)
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { useState } from 'react';

export interface ImageViewerProps {
  src: string;
  alt: string;
}

export function ImageViewer({ src, alt }: ImageViewerProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      {loading && <AsciiSpinner active={true} />}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        style={loading ? { display: 'none' } : undefined}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
    </div>
  );
}
