'use client';

/**
 * PdfViewer — Inline PDF display via browser iframe.
 *
 * Uses the browser's built-in PDF viewer. DYK-03: Content-Disposition: inline
 * on the raw route ensures the browser renders instead of downloading.
 *
 * Plan 046: Binary File Viewers (T006)
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { useState } from 'react';

export interface PdfViewerProps {
  src: string;
}

export function PdfViewer({ src }: PdfViewerProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="flex flex-col h-full w-full">
      {loading && (
        <div className="flex items-center justify-center p-8">
          <AsciiSpinner active={true} />
        </div>
      )}
      <iframe
        src={src}
        className="flex-1 w-full border-0"
        title="PDF viewer"
        style={loading ? { height: 0, overflow: 'hidden' } : undefined}
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
