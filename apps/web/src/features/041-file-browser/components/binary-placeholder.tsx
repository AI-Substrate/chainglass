'use client';

/**
 * BinaryPlaceholder — Fallback for unsupported binary file types.
 *
 * Shows file metadata and a download button. When the app is being viewed on
 * the same machine that hosts the server (localhost), it also offers an "Open"
 * button that launches the file in the host OS's default app (e.g. PowerPoint
 * for a `.pptx`) via POST /api/workspaces/[slug]/files/open.
 *
 * Plan 046: Binary File Viewers (T008)
 */

import { FileIcon } from '@/features/_platform/themes';
import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface BinaryPlaceholderProps {
  src: string;
  size: number;
  mimeType: string;
  filename: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Loopback hostnames — the only place a server-side "open" makes sense. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export function BinaryPlaceholder({ src, size, mimeType, filename }: BinaryPlaceholderProps) {
  const downloadUrl = `${src}${src.includes('?') ? '&' : '?'}download=true`;
  // The open endpoint mirrors the raw route's worktree/file query string.
  const openUrl = src.replace('/files/raw', '/files/open');

  // Detect localhost on the client only (avoids SSR hydration mismatch).
  const [isLocal, setIsLocal] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    setIsLocal(LOCAL_HOSTNAMES.has(window.location.hostname));
  }, []);

  const handleOpen = async () => {
    setOpening(true);
    setOpenError(null);
    try {
      const res = await fetch(openUrl, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`open failed (${res.status})`);
      }
    } catch (err) {
      console.error('[binary-placeholder] open failed', err);
      setOpenError('Could not open on host');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full w-full p-8 text-muted-foreground">
      <FileIcon filename={filename} className="h-16 w-16" />
      <div className="text-center space-y-1">
        <p className="text-lg font-medium text-foreground">{filename}</p>
        <p className="text-sm">{mimeType}</p>
        <p className="text-sm">{formatFileSize(size)}</p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={downloadUrl}
          download={filename}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
        {isLocal && (
          <button
            type="button"
            onClick={handleOpen}
            disabled={opening}
            title="Open in the default app on this machine"
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {opening ? 'Opening…' : 'Open'}
          </button>
        )}
      </div>
      {openError && <p className="text-sm text-destructive">{openError}</p>}
    </div>
  );
}
