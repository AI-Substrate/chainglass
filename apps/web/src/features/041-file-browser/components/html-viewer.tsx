'use client';

/**
 * HtmlViewer — Inline HTML rendering via blob URL in sandboxed iframe.
 *
 * Fetches the HTML file as a blob and renders it in an iframe.
 * Uses sandbox="allow-scripts" so interactive content (graph
 * visualizations, charts) works, but omits allow-same-origin
 * to prevent the iframe from accessing parent cookies/storage.
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface HtmlViewerProps {
  src: string;
}

export function HtmlViewer({ src }: HtmlViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let revoke: string | null = null;
    fetch(src, { signal: controller.signal })
      .then((res) => res.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(true);
      });
    return () => {
      controller.abort();
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src]);

  return (
    <div className="flex flex-col h-full w-full">
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
      {!blobUrl && !error && (
        <div className="flex items-center justify-center p-8">
          <AsciiSpinner active={true} />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Failed to load HTML file
        </div>
      )}
      {blobUrl && (
        <iframe
          src={blobUrl}
          sandbox="allow-scripts"
          className="flex-1 w-full border-0 min-h-0 bg-white"
          title="HTML viewer"
        />
      )}
    </div>
  );
}
