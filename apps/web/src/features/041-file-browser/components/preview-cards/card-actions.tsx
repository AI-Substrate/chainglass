/**
 * CardActions — Hover-revealed copy-path and download buttons for preview cards.
 *
 * Glassmorphism backdrop on desktop, always visible on mobile.
 * Uses Lucide icons for consistent styling.
 *
 * Plan 077: Folder Content Preview (T003) — initial: copy + download.
 * Plan recent-changes-feed T005: extended additively with onCopyAbsolutePath,
 * onOpen, and overflowMenu. Existing callers (gallery cards) supply only
 * onCopyPath + onDownload and render the original 2-button strip; the feed
 * supplies the new optionals to surface the workshop §3 action set.
 */

'use client';

import { cn } from '@/lib/utils';
import { Copy, Download, ExternalLink, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

export interface CardActionsProps {
  filePath: string;
  /** Copy relative path. Tooltip becomes "Copy relative path" when onCopyAbsolutePath is also supplied. */
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  /** Plan recent-changes-feed T005 — optional copy-absolute action for media cards in the feed. */
  onCopyAbsolutePath?: (path: string) => void;
  /** Plan recent-changes-feed T005 — optional open-in-viewer action. */
  onOpen?: (path: string) => void;
  /**
   * Plan recent-changes-feed T005 — optional overflow slot. Render a kebab/menu
   * trigger here; CardActions does not own the menu's content (caller-supplied).
   */
  overflowMenu?: ReactNode;
  className?: string;
}

export function CardActions({
  filePath,
  onCopyPath,
  onDownload,
  onCopyAbsolutePath,
  onOpen,
  overflowMenu,
  className,
}: CardActionsProps) {
  const [copiedKind, setCopiedKind] = useState<'rel' | 'abs' | null>(null);

  const handleCopyRel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCopyPath(filePath);
      setCopiedKind('rel');
      setTimeout(() => setCopiedKind(null), 1200);
    },
    [filePath, onCopyPath]
  );

  const handleCopyAbs = useCallback(
    (e: React.MouseEvent) => {
      if (!onCopyAbsolutePath) return;
      e.stopPropagation();
      onCopyAbsolutePath(filePath);
      setCopiedKind('abs');
      setTimeout(() => setCopiedKind(null), 1200);
    },
    [filePath, onCopyAbsolutePath]
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload(filePath);
    },
    [filePath, onDownload]
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      if (!onOpen) return;
      e.stopPropagation();
      onOpen(filePath);
    },
    [filePath, onOpen]
  );

  const hasAbs = !!onCopyAbsolutePath;
  const buttonClass = cn(
    'h-7 w-7 rounded-md flex items-center justify-center',
    'bg-background/85 backdrop-blur-sm border border-border/50',
    'text-muted-foreground shadow-sm',
    'hover:bg-primary hover:text-primary-foreground hover:scale-105',
    'transition-all duration-100'
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
      {onOpen && (
        <button type="button" onClick={handleOpen} className={buttonClass} title="Open">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={handleCopyRel}
        className={cn(buttonClass, copiedKind === 'rel' && 'bg-primary text-primary-foreground')}
        title={hasAbs ? 'Copy relative path' : 'Copy path'}
      >
        {copiedKind === 'rel' ? (
          <span className="text-xs font-medium">✓</span>
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      {onCopyAbsolutePath && (
        <button
          type="button"
          onClick={handleCopyAbs}
          className={cn(buttonClass, copiedKind === 'abs' && 'bg-primary text-primary-foreground')}
          title="Copy absolute path"
        >
          {copiedKind === 'abs' ? (
            <span className="text-xs font-medium">✓</span>
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <button type="button" onClick={handleDownload} className={buttonClass} title="Download">
        <Download className="h-3.5 w-3.5" />
      </button>
      {overflowMenu}
    </div>
  );
}
