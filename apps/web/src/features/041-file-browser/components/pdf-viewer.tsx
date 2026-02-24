'use client';

/**
 * PdfViewer — Inline PDF display via browser embed.
 *
 * Uses <embed> for desktop browsers and provides an "Open in new tab"
 * fallback for mobile (iOS Safari doesn't scroll iframes/embeds well).
 *
 * Plan 046: Binary File Viewers (T006)
 * DYK-03: Content-Disposition: inline on raw route.
 */

import { ExternalLink } from 'lucide-react';
import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { useEffect, useRef, useState } from 'react';

export interface PdfViewerProps {
  src: string;
}

export function PdfViewer({ src }: PdfViewerProps) {
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mark loaded after a short delay (embed doesn't fire onLoad reliably)
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, [src]);

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      <div className="flex items-center justify-end px-2 py-1 border-b shrink-0">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Open in new tab
        </a>
      </div>
      {loading && (
        <div className="flex items-center justify-center p-8">
          <AsciiSpinner active={true} />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <iframe
          src={src}
          className="w-full h-full border-0"
          title="PDF viewer"
          style={{ minHeight: '100%' }}
        />
      </div>
    </div>
  );
}
