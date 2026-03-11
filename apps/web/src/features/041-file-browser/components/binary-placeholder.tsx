'use client';

/**
 * BinaryPlaceholder — Fallback for unsupported binary file types.
 *
 * Shows file metadata and a download button.
 *
 * Plan 046: Binary File Viewers (T008)
 */

import { FileIcon } from '@/features/_platform/themes';
import { Download } from 'lucide-react';

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

export function BinaryPlaceholder({ src, size, mimeType, filename }: BinaryPlaceholderProps) {
  const downloadUrl = `${src}${src.includes('?') ? '&' : '?'}download=true`;

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full w-full p-8 text-muted-foreground">
      <FileIcon filename={filename} className="h-16 w-16" />
      <div className="text-center space-y-1">
        <p className="text-lg font-medium text-foreground">{filename}</p>
        <p className="text-sm">{mimeType}</p>
        <p className="text-sm">{formatFileSize(size)}</p>
      </div>
      <a
        href={downloadUrl}
        download={filename}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
