/**
 * AudioCard — Audio preview card with waveform visualization.
 *
 * Shows audio icon, animated waveform bars, and filename.
 * No content fetching — purely visual.
 *
 * Plan 077: Folder Content Preview (T007)
 */

'use client';

import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { Music } from 'lucide-react';
import { CardActions } from './card-actions';

export interface AudioCardProps {
  filePath: string;
  filename: string;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  onClick: (path: string) => void;
}

const WAVEFORM_HEIGHTS = [8, 14, 6, 18, 10, 16, 7, 12, 15, 9, 13, 5];

export function AudioCard({ filePath, filename, onCopyPath, onDownload, onClick }: AudioCardProps) {
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
      <div className="aspect-video bg-gradient-to-br from-muted to-accent flex flex-col items-center justify-center gap-2">
        <Music className="h-7 w-7 text-muted-foreground opacity-60" />
        <div className="flex items-end gap-0.5 h-6 opacity-40">
          {WAVEFORM_HEIGHTS.map((h, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static waveform bars
              key={i}
              className="w-[3px] rounded-sm bg-foreground"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>

      <CardActions filePath={filePath} onCopyPath={onCopyPath} onDownload={onDownload} />

      <div className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px]">
        <FileIcon filename={filename} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{filename}</span>
      </div>
    </div>
  );
}
