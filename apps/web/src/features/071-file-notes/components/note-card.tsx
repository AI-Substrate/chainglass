'use client';

/**
 * NoteCard — Renders an individual note with metadata, content, and actions.
 *
 * Displays author (human/agent), optional line number, relative time,
 * addressee tag, markdown content (via MarkdownInline), and action
 * buttons: Go to, Complete, Reply, Edit.
 *
 * Plan 071: PR View & File Notes — Phase 2, T003
 */

import { MarkdownInline } from '@/components/markdown-inline';
import { cn } from '@/lib/utils';
import { Check, ExternalLink, MessageSquare, Pencil } from 'lucide-react';

import type { Note } from '../types';

interface NoteCardProps {
  note: Note;
  /** Navigate to file+line (closes overlay first) */
  onGoTo: (target: string, line?: number) => void;
  /** Mark note as complete */
  onComplete: (noteId: string) => void;
  /** Open reply modal */
  onReply: (parentNoteId: string) => void;
  /** Open edit modal */
  onEdit: (note: Note) => void;
  /** Whether this card is a reply (indented rendering) */
  isReply?: boolean;
}

/** Format a timestamp as relative time (e.g., "2 min ago", "3 hours ago") */
function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function NoteCard({
  note,
  onGoTo,
  onComplete,
  onReply,
  onEdit,
  isReply = false,
}: NoteCardProps) {
  const line =
    note.linkType === 'file' && note.targetMeta
      ? (note.targetMeta as { line?: number }).line
      : undefined;

  return (
    <div
      className={cn(
        'border rounded-md',
        isReply ? 'ml-4 border-l-2 border-l-muted' : 'mx-3 mb-2',
        note.status === 'complete' && 'opacity-50'
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b bg-muted/30">
        <span>{note.author === 'human' ? '\u{1F9D1}' : '\u{1F916}'}</span>
        <span className="font-medium">{note.author === 'human' ? 'Human' : 'Agent'}</span>
        {line != null && (
          <>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">Line {line}</span>
          </>
        )}
        <span className="text-muted-foreground">&middot;</span>
        <span className="text-muted-foreground">{relativeTime(note.createdAt)}</span>

        {/* Addressee tag */}
        {note.to && (
          <span
            className={cn(
              'ml-auto px-1.5 py-0.5 rounded-full text-[10px] border',
              note.to === 'human'
                ? 'border-blue-300 text-blue-600 dark:text-blue-400'
                : 'border-purple-300 text-purple-600 dark:text-purple-400'
            )}
          >
            &rarr; {note.to === 'human' ? 'Human' : 'Agent'}
          </span>
        )}
      </div>

      {/* Card content — rendered markdown */}
      <div className="px-3 py-2">
        <MarkdownInline
          content={note.content}
          className="text-sm prose-p:my-0.5 prose-headings:my-1"
        />
      </div>

      {/* Card actions */}
      <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t">
        <button
          type="button"
          onClick={() => onGoTo(note.target, line)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          Go to <ExternalLink className="h-3 w-3" />
        </button>

        {note.status === 'open' && (
          <button
            type="button"
            onClick={() => onEdit(note)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}

        {!isReply && note.status === 'open' && (
          <button
            type="button"
            onClick={() => onReply(note.id)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <MessageSquare className="h-3 w-3" /> Reply
          </button>
        )}

        {note.status === 'open' ? (
          <button
            type="button"
            onClick={() => onComplete(note.id)}
            className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
          >
            <Check className="h-3 w-3" /> Complete
          </button>
        ) : (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Check className="h-3 w-3" /> {note.completedBy === 'agent' ? 'Agent' : 'Human'}
          </span>
        )}
      </div>
    </div>
  );
}
