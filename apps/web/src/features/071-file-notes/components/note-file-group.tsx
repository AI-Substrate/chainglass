'use client';

/**
 * NoteFileGroup — Collapsible section grouping notes by file target.
 *
 * Shows file path header with note count, collapse/expand toggle,
 * per-file delete button. Renders NoteCard for each root note with
 * thread replies indented below.
 *
 * Plan 071: PR View & File Notes — Phase 2, T004
 */

import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { NoteThread } from '../hooks/use-notes';
import type { Note } from '../types';
import { NoteCard } from './note-card';

interface NoteFileGroupProps {
  /** File path (target) for this group */
  filePath: string;
  /** Thread-grouped notes for this file */
  threads: NoteThread[];
  /** Whether the underlying file has been deleted from the worktree (Phase 7 T006) */
  isDeleted?: boolean;
  /** Navigate to file+line */
  onGoTo: (target: string, line?: number) => void;
  /** Mark note as complete */
  onComplete: (noteId: string) => void;
  /** Open reply modal */
  onReply: (parentNoteId: string) => void;
  /** Open edit modal */
  onEdit: (note: Note) => void;
  /** Open bulk delete dialog for this file */
  onDeleteFile: (filePath: string, noteCount: number) => void;
}

export function NoteFileGroup({
  filePath,
  threads,
  isDeleted,
  onGoTo,
  onComplete,
  onReply,
  onEdit,
  onDeleteFile,
}: NoteFileGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const totalNotes = threads.reduce((sum, t) => sum + 1 + t.replies.length, 0);

  return (
    <div className="border-b last:border-b-0">
      {/* File header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center w-full gap-2 px-3 py-2 text-sm hover:bg-accent/30"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="truncate flex-1 text-left font-mono text-xs">{filePath}</span>

        {isDeleted && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            Deleted
          </span>
        )}

        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
          {totalNotes}
        </span>

        {/* Per-file delete */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFile(filePath, totalNotes);
          }}
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-red-500 hover:bg-accent"
          title={`Delete all notes for ${filePath.split('/').pop()}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </button>

      {/* Note cards */}
      {!collapsed && (
        <div className="pb-2">
          {threads.map((thread) => (
            <div key={thread.root.id}>
              <NoteCard
                note={thread.root}
                onGoTo={onGoTo}
                onComplete={onComplete}
                onReply={onReply}
                onEdit={onEdit}
              />
              {thread.replies.map((reply) => (
                <div key={reply.id} className="mx-3 mb-1">
                  <NoteCard
                    note={reply}
                    onGoTo={onGoTo}
                    onComplete={onComplete}
                    onReply={onReply}
                    onEdit={onEdit}
                    isReply
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
