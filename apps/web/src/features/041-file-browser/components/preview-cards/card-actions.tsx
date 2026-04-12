/**
 * CardActions — Hover-revealed copy-path and download buttons for preview cards.
 *
 * Glassmorphism backdrop on desktop, always visible on mobile.
 * Uses Lucide icons for consistent styling.
 *
 * Plan 077: Folder Content Preview (T003)
 */

'use client';

import { cn } from '@/lib/utils';
import { Copy, Download } from 'lucide-react';
import { useCallback, useState } from 'react';

export interface CardActionsProps {
  filePath: string;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  className?: string;
}

export function CardActions({ filePath, onCopyPath, onDownload, className }: CardActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCopyPath(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    },
    [filePath, onCopyPath]
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload(filePath);
    },
    [filePath, onDownload]
  );

  return (
    <div
      className={cn(
        'absolute top-2 right-2 flex gap-1 z-10',
        'opacity-0 -translate-y-1 transition-all duration-150',
        'group-hover:opacity-100 group-hover:translate-y-0',
        'md:opacity-0 max-md:opacity-100 max-md:translate-y-0',
        className
      )}
    >
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'h-7 w-7 rounded-md flex items-center justify-center',
          'bg-background/85 backdrop-blur-sm border border-border/50',
          'text-muted-foreground shadow-sm',
          'hover:bg-primary hover:text-primary-foreground hover:scale-105',
          'transition-all duration-100',
          copied && 'bg-primary text-primary-foreground'
        )}
        title="Copy path"
      >
        {copied ? <span className="text-xs font-medium">✓</span> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className={cn(
          'h-7 w-7 rounded-md flex items-center justify-center',
          'bg-background/85 backdrop-blur-sm border border-border/50',
          'text-muted-foreground shadow-sm',
          'hover:bg-primary hover:text-primary-foreground hover:scale-105',
          'transition-all duration-100'
        )}
        title="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
