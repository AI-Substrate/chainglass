/**
 * DeletedPreview — strikethrough mini-card with auto-removal timer.
 *
 * Used when `item.eventType === 'deleted'`. After `deletedWindowMs`
 * milliseconds, fires the supplied `onClearDeleted` callback so the
 * orchestrator can dispatch `CLEAR_DELETED` to the reducer (T015).
 *
 * Workshop §9 settings: deletedWindow defaults to 5000ms; configurable
 * via `fileBrowser.recentFeed.deletedWindow` (T028). Setting it to
 * `Infinity` keeps the card until manually dismissed.
 *
 * Plan recent-changes-feed T023.
 */

'use client';

import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import type { FeedItem } from '../types';

export interface DeletedPreviewProps {
  item: FeedItem;
  /** ms before auto-removal fires. Default 5000 (5s). Pass `Infinity` to disable. */
  deletedWindowMs?: number;
  /** Fired when the auto-removal timer elapses. Orchestrator dispatches CLEAR_DELETED. */
  onClearDeleted?: (path: string) => void;
}

export function DeletedPreview({
  item,
  deletedWindowMs = 5000,
  onClearDeleted,
}: DeletedPreviewProps) {
  useEffect(() => {
    if (!Number.isFinite(deletedWindowMs)) return; // 'Until dismissed' option
    const handle = setTimeout(() => {
      onClearDeleted?.(item.path);
    }, deletedWindowMs);
    return () => clearTimeout(handle);
  }, [deletedWindowMs, item.path, onClearDeleted]);

  return (
    <div className="flex items-center gap-3 px-4 py-4 bg-muted/30">
      <Trash2 className="h-6 w-6 shrink-0 opacity-50" aria-hidden="true" />
      <div className="text-sm text-muted-foreground line-through">{item.name}</div>
      <div className="ml-auto text-[11px] text-muted-foreground/70">deleted</div>
    </div>
  );
}
