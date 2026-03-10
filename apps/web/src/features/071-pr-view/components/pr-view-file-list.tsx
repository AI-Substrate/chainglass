'use client';

/**
 * PRViewFileList — Left column file list with status badges, +/- counts,
 * viewed checkboxes, and click-to-scroll.
 *
 * Per workshop section 3.3. Status colors match existing ChangesView.
 *
 * Plan 071: PR View & File Notes — Phase 5, T005
 */

import { cn } from '@/lib/utils';
import type { DiffFileStatus, PRViewFile } from '../types';

const STATUS_COLORS: Record<DiffFileStatus, string> = {
  modified: 'text-amber-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-muted-foreground',
};

const STATUS_LETTERS: Record<DiffFileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
};

interface PRViewFileListProps {
  files: PRViewFile[];
  activeFile: string | null;
  onFileClick: (filePath: string) => void;
  onToggleReviewed: (filePath: string) => void;
}

export function PRViewFileList({
  files,
  activeFile,
  onFileClick,
  onToggleReviewed,
}: PRViewFileListProps) {
  return (
    <div className="w-[220px] shrink-0 border-r flex flex-col overflow-y-auto">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => onFileClick(file.path)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-accent/50',
            activeFile === file.path && 'bg-accent font-medium',
            file.reviewed && 'opacity-50'
          )}
        >
          {/* Status badge */}
          <span
            className={cn(
              'shrink-0 w-4 text-center font-mono text-xs font-bold',
              STATUS_COLORS[file.status]
            )}
          >
            {STATUS_LETTERS[file.status]}
          </span>

          {/* File path (dir in muted, name in normal) */}
          <span className="truncate flex-1 text-xs">
            {file.dir && <span className="text-muted-foreground">{file.dir}</span>}
            <span>{file.name}</span>
          </span>

          {/* +/- counts (compact) */}
          {(file.insertions > 0 || file.deletions > 0) && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px]">
              {file.insertions > 0 && <span className="text-green-500">+{file.insertions}</span>}
              {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
            </span>
          )}

          {/* Viewed checkbox */}
          <input
            type="checkbox"
            checked={file.reviewed}
            onChange={(e) => {
              e.stopPropagation();
              onToggleReviewed(file.path);
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-3.5 w-3.5 rounded border-muted-foreground/50 cursor-pointer"
            title="Mark as viewed"
          />
        </button>
      ))}
    </div>
  );
}
