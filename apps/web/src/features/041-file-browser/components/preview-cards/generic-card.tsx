/**
 * GenericCard — Fallback preview card for non-media file types.
 *
 * Shows FileIcon + filename + file size. Used for text, markdown,
 * PDF, binary, and all types not handled by specific cards.
 *
 * Plan 077: Folder Content Preview (T011)
 */

'use client';

import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { CardActions } from './card-actions';

export interface GenericCardProps {
  filePath: string;
  filename: string;
  size?: number;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  onClick: (path: string) => void;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GenericCard({
  filePath,
  filename,
  size,
  onCopyPath,
  onDownload,
  onClick,
}: GenericCardProps) {
  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: complex interactive card with images/overlays
      role="button"
      tabIndex={0}
      className={cn(
        'group relative rounded-xl border border-border bg-card overflow-hidden cursor-pointer',
        'shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md hover:border-ring',
        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
      )}
      onClick={() => onClick(filePath)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(filePath)}
    >
      <div className="aspect-video bg-muted flex flex-col items-center justify-center gap-2 opacity-60">
        <FileText className="h-8 w-8 text-muted-foreground" />
        {size != null && (
          <span className="text-[10px] text-muted-foreground">{formatSize(size)}</span>
        )}
      </div>

      <CardActions filePath={filePath} onCopyPath={onCopyPath} onDownload={onDownload} />

      <div className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px]">
        <FileIcon filename={filename} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{filename}</span>
        {size != null && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
            {formatSize(size)}
          </span>
        )}
      </div>
    </div>
  );
}
