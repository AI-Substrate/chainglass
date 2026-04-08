/**
 * FolderCard — Subfolder preview card for gallery navigation.
 *
 * Shows FolderIcon + folder name. Click navigates into the folder
 * by updating the dir URL param.
 *
 * Plan 077: Folder Content Preview (T010)
 */

'use client';

import { FolderIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { CardActions } from './card-actions';

export interface FolderCardProps {
  folderPath: string;
  folderName: string;
  onNavigate: (path: string) => void;
  onCopyPath: (path: string) => void;
}

export function FolderCard({ folderPath, folderName, onNavigate, onCopyPath }: FolderCardProps) {
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
      onClick={() => onNavigate(folderPath)}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(folderPath)}
    >
      <div className="aspect-video bg-muted flex flex-col items-center justify-center gap-2">
        <FolderIcon name={folderName} expanded={false} className="h-10 w-10" />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Open folder</span>
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>

      <CardActions
        filePath={folderPath}
        onCopyPath={onCopyPath}
        onDownload={() => {}}
        className="[&>button:last-child]:hidden"
      />

      <div className="p-2.5 border-t border-border flex items-center gap-2 min-h-[38px]">
        <FolderIcon name={folderName} expanded={false} className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium truncate text-card-foreground">{folderName}</span>
      </div>
    </div>
  );
}
