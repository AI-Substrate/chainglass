'use client';

/**
 * ChangesView — Flat file list showing working changes + recent activity.
 *
 * Two sections: "Working Changes" at top with status badges (M/A/D/?/R),
 * "Recent (committed)" below with muted styling. Recent files are deduplicated
 * against working changes.
 *
 * Phase 2: Git Services — Plan 043
 */

import { Check, File } from 'lucide-react';
import { useCallback } from 'react';
import type { ChangedFile } from '../services/working-changes';

export interface ChangesViewProps {
  workingChanges: ChangedFile[];
  recentFiles: string[];
  selectedFile?: string;
  onSelect: (filePath: string) => void;
}

const STATUS_BADGE: Record<ChangedFile['status'], { letter: string; className: string }> = {
  modified: { letter: 'M', className: 'text-amber-500' },
  added: { letter: 'A', className: 'text-green-500' },
  deleted: { letter: 'D', className: 'text-red-500' },
  untracked: { letter: '?', className: 'text-muted-foreground' },
  renamed: { letter: 'R', className: 'text-blue-500' },
};

export function ChangesView({
  workingChanges,
  recentFiles,
  selectedFile,
  onSelect,
}: ChangesViewProps) {
  // Deduplicate recent against working changes
  const workingPaths = new Set(workingChanges.map((f) => f.path));
  const dedupedRecent = recentFiles.filter((f) => !workingPaths.has(f));

  return (
    <div className="flex flex-col text-sm">
      {/* Working Changes section */}
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase">
        Working Changes
      </div>
      {workingChanges.length === 0 ? (
        <div className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-green-500" />
          <span>Working tree clean</span>
        </div>
      ) : (
        workingChanges.map((file) => (
          <ChangeFileItem
            key={`${file.area}-${file.path}`}
            filePath={file.path}
            badge={STATUS_BADGE[file.status]}
            isSelected={selectedFile === file.path}
            onSelect={onSelect}
          />
        ))
      )}

      {/* Recent section — only show if there are deduplicated entries */}
      {dedupedRecent.length > 0 && (
        <>
          <div className="border-t mx-3 my-1" />
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase">
            Recent
          </div>
          {dedupedRecent.map((filePath) => (
            <ChangeFileItem
              key={`recent-${filePath}`}
              filePath={filePath}
              isSelected={selectedFile === filePath}
              onSelect={onSelect}
              muted
            />
          ))}
        </>
      )}
    </div>
  );
}

function ChangeFileItem({
  filePath,
  badge,
  isSelected,
  onSelect,
  muted,
}: {
  filePath: string;
  badge?: { letter: string; className: string };
  isSelected: boolean;
  onSelect: (path: string) => void;
  muted?: boolean;
}) {
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
  const name = filePath.split('/').pop() ?? filePath;

  const handleClick = useCallback(() => onSelect(filePath), [onSelect, filePath]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-accent ${
        isSelected ? 'bg-accent font-medium' : ''
      } ${muted ? 'opacity-60' : ''}`}
    >
      {isSelected && <span className="absolute left-0.5 text-amber-500 font-black text-sm">▶</span>}
      {badge ? (
        <span className={`shrink-0 w-4 text-center font-mono text-xs font-bold ${badge.className}`}>
          {badge.letter}
        </span>
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">
        <span className="text-muted-foreground">{dir}</span>
        <span className={isSelected ? 'text-base' : ''}>{name}</span>
      </span>
    </button>
  );
}
