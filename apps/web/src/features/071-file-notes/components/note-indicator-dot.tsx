'use client';

/**
 * NoteIndicatorDot — 6px blue dot indicating a file has notes.
 *
 * Cross-domain contract: consumed by file-browser FileTree and PR View file list.
 * Positioned next to the file name in tree/list items.
 *
 * Plan 071: PR View & File Notes — Phase 2, T008
 */

export function NoteIndicatorDot({ hasNotes }: { hasNotes: boolean }) {
  if (!hasNotes) return null;
  return (
    <span
      className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500"
      title="Has notes"
      aria-label="File has notes"
    />
  );
}
