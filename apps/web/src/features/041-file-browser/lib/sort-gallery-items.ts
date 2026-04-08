/**
 * Sort Gallery Items — groups and sorts directory entries for folder preview grid.
 *
 * Groups: folders → media (image, video, audio) → documents → other
 * Within each group: alphabetical by name (case-insensitive)
 *
 * Plan 077: Folder Content Preview (T001)
 */

import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import { detectContentType, isBinaryExtension } from '@/lib/content-type-detection';

export type GalleryGroup = 'folder' | 'media' | 'document' | 'other';

export interface GalleryItem extends FileEntry {
  group: GalleryGroup;
  mediaCategory?: 'image' | 'video' | 'audio';
}

const MEDIA_CATEGORIES = new Set(['image', 'video', 'audio']);

function classifyEntry(entry: FileEntry): GalleryItem {
  if (entry.type === 'directory') {
    return { ...entry, group: 'folder' };
  }

  const contentType = detectContentType(entry.name);

  if (MEDIA_CATEGORIES.has(contentType.category)) {
    return {
      ...entry,
      group: 'media',
      mediaCategory: contentType.category as 'image' | 'video' | 'audio',
    };
  }

  // PDF and HTML go to 'other'
  if (contentType.category === 'pdf' || contentType.category === 'html') {
    return { ...entry, group: 'other' };
  }

  // If extension is known binary (css, js, json, fonts, etc.) → 'other'
  // If extension is unknown (text files like .ts, .py, .md, .txt) → 'document'
  if (isBinaryExtension(entry.name)) {
    return { ...entry, group: 'other' };
  }

  return { ...entry, group: 'document' };
}

const GROUP_ORDER: Record<GalleryGroup, number> = {
  folder: 0,
  media: 1,
  document: 2,
  other: 3,
};

export function sortGalleryItems(entries: FileEntry[]): GalleryItem[] {
  return entries.map(classifyEntry).sort((a, b) => {
    const groupDiff = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
    if (groupDiff !== 0) return groupDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function groupGalleryItems(items: GalleryItem[]): Map<GalleryGroup, GalleryItem[]> {
  const groups = new Map<GalleryGroup, GalleryItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return groups;
}
