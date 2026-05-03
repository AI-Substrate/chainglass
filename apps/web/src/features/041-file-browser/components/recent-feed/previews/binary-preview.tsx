/**
 * BinaryPreview — feed-card preview slot for non-renderable / generic files.
 *
 * Workshop §2 binary state: file icon + size + the explanatory copy
 * `"Binary file — preview not available."` (AC D3).
 *
 * Plan recent-changes-feed T008.
 */

'use client';

import { FileIcon } from '@/features/_platform/themes';
import type { FeedItem } from '../types';
import { formatFileSize } from '../feed-card';

export interface BinaryPreviewProps {
  item: FeedItem;
}

export function BinaryPreview({ item }: BinaryPreviewProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-6 bg-muted/30">
      <FileIcon filename={item.name} className="h-10 w-10 shrink-0 opacity-60" />
      <div className="text-sm text-muted-foreground">
        <div className="font-medium text-card-foreground/80">
          {formatFileSize(item.size)}
        </div>
        <div className="text-xs">Binary file — preview not available.</div>
      </div>
    </div>
  );
}
