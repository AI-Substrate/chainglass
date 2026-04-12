/**
 * FolderPreviewGrid — Responsive grid of preview cards grouped by type.
 *
 * Renders section labels (Folders, Media, Documents, Other) when items
 * exist in that group. Maps sorted entries to appropriate card components
 * via content type detection. Staggered card entrance animation.
 *
 * Plan 077: Folder Content Preview (T012)
 */

'use client';

import type { GalleryGroup, GalleryItem } from '@/features/041-file-browser/lib/sort-gallery-items';
import { groupGalleryItems } from '@/features/041-file-browser/lib/sort-gallery-items';
import { AudioCard } from './preview-cards/audio-card';
import { FolderCard } from './preview-cards/folder-card';
import { GenericCard } from './preview-cards/generic-card';
import { ImageCard } from './preview-cards/image-card';
import { VideoCard } from './preview-cards/video-card';

interface FolderPreviewGridProps {
  items: GalleryItem[];
  slug: string;
  worktreePath: string;
  onFileClick: (path: string) => void;
  onFolderNavigate: (path: string) => void;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
}

const GROUP_LABELS: Record<GalleryGroup, { icon: string; label: string }> = {
  folder: { icon: '📁', label: 'Folders' },
  media: { icon: '🖼️', label: 'Media' },
  document: { icon: '📄', label: 'Documents' },
  other: { icon: '📦', label: 'Other' },
};

const GROUP_ORDER: GalleryGroup[] = ['folder', 'media', 'document', 'other'];

function buildRawFileUrl(slug: string, worktreePath: string, filePath: string): string {
  return `/api/workspaces/${encodeURIComponent(slug)}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(filePath)}`;
}

export function FolderPreviewGrid({
  items,
  slug,
  worktreePath,
  onFileClick,
  onFolderNavigate,
  onCopyPath,
  onDownload,
}: FolderPreviewGridProps) {
  const groups = groupGalleryItems(items);
  let cardIndex = 0;

  return (
    <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {GROUP_ORDER.map((groupKey) => {
        const groupItems = groups.get(groupKey);
        if (!groupItems?.length) return null;

        const { icon, label } = GROUP_LABELS[groupKey];

        return (
          <div key={groupKey} className="contents">
            <div className="col-span-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2 border-b border-border mt-2 first:mt-0">
              {icon} {label} · {groupItems.length}
            </div>
            {groupItems.map((item) => {
              const delay = `${Math.min(cardIndex++, 20) * 30}ms`;
              const style = { animationDelay: delay } as React.CSSProperties;

              return (
                <div
                  key={item.path}
                  className="animate-in fade-in-0 slide-in-from-bottom-2"
                  style={style}
                >
                  {renderCard(
                    item,
                    slug,
                    worktreePath,
                    onFileClick,
                    onFolderNavigate,
                    onCopyPath,
                    onDownload
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderCard(
  item: GalleryItem,
  slug: string,
  worktreePath: string,
  onFileClick: (path: string) => void,
  onFolderNavigate: (path: string) => void,
  onCopyPath: (path: string) => void,
  onDownload: (path: string) => void
) {
  if (item.group === 'folder') {
    return (
      <FolderCard
        folderPath={item.path}
        folderName={item.name}
        onNavigate={onFolderNavigate}
        onCopyPath={onCopyPath}
      />
    );
  }

  const rawFileUrl = buildRawFileUrl(slug, worktreePath, item.path);

  if (item.mediaCategory === 'image') {
    return (
      <ImageCard
        filePath={item.path}
        filename={item.name}
        rawFileUrl={rawFileUrl}
        onCopyPath={onCopyPath}
        onDownload={onDownload}
        onClick={onFileClick}
      />
    );
  }

  if (item.mediaCategory === 'video') {
    return (
      <VideoCard
        filePath={item.path}
        filename={item.name}
        rawFileUrl={rawFileUrl}
        onCopyPath={onCopyPath}
        onDownload={onDownload}
        onClick={onFileClick}
      />
    );
  }

  if (item.mediaCategory === 'audio') {
    return (
      <AudioCard
        filePath={item.path}
        filename={item.name}
        onCopyPath={onCopyPath}
        onDownload={onDownload}
        onClick={onFileClick}
      />
    );
  }

  return (
    <GenericCard
      filePath={item.path}
      filename={item.name}
      size={item.size}
      onCopyPath={onCopyPath}
      onDownload={onDownload}
      onClick={onFileClick}
    />
  );
}
