'use client';

/**
 * PdfViewer — Inline PDF display via blob URL in iframe.
 *
 * Fetches PDF binary and creates a blob: URL for the iframe src.
 * This approach works reliably across desktop and iPad Safari —
 * direct URL iframes don't scroll on iOS.
 *
 * Plan 046: Binary File Viewers (T006)
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { ExternalLink } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export interface PdfViewerProps {
  src: string;
  /** Extra controls at the left of the toolbar (an Office preview's open / download). */
  actions?: ReactNode;
}

export function PdfViewer({ src, actions }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // The server's reason when it has one (an Office preview's conversion can fail with a cause).
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let revoke: string | null = null;
    setError(null);
    // The previous document stays on screen until the new one arrives (a re-converted Office
    // preview can take a few seconds), so a live refresh does not flash a spinner.
    fetch(src, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error && e.message ? e.message : 'Failed to load PDF');
      });
    return () => {
      controller.abort();
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-end gap-1 px-2 py-1 border-b shrink-0">
        {actions ? <div className="mr-auto flex items-center gap-1">{actions}</div> : null}
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
        <div className="flex items-center justify-center p-8 text-muted-foreground">{error}</div>
      )}
      {blobUrl && !error && (
        <iframe src={blobUrl} className="flex-1 w-full border-0 min-h-0" title="PDF viewer" />
      )}
    </div>
  );
}
