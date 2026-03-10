'use client';

/**
 * NotesOverlayPanel — Fixed-position overlay showing all worktree notes.
 *
 * Mirrors activity-log-overlay-panel.tsx pattern:
 * - Anchor measurement via ResizeObserver on [data-terminal-overlay-anchor]
 * - Escape key close
 * - Lazy loading (hasOpened guard)
 * - z-index 44 (same as terminal/activity-log)
 * - 10s cache via useNotes hook (DYK-04)
 *
 * Renders notes grouped by file with filter dropdown, "Add Note" button,
 * clear-all button, and per-file delete support.
 *
 * Plan 071: PR View & File Notes — Phase 2, T005
 */

import { Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { workspaceHref } from '@/lib/workspace-url';
import {
  completeNote,
  deleteNotes,
  fetchFilesWithNotesDetailed,
} from '../../../../app/actions/notes-actions';
import { type NoteFilterOption, useNotes } from '../hooks/use-notes';
import { useNotesOverlay } from '../hooks/use-notes-overlay';
import type { Note } from '../types';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { NoteFileGroup } from './note-file-group';
import { NoteModal } from './note-modal';

export function NotesOverlayPanel() {
  const { isOpen, worktreePath, closeNotes, modalTarget, isModalOpen, openModal, closeModal } =
    useNotesOverlay();

  const { groupedByFile, loading, error, refresh, filter, setFilter, openCount, completeCount } =
    useNotes(worktreePath);

  // Phase 7 DYK-02: Notify other consumers (BrowserClient, PR View) when notes change
  const refreshAndNotify = useCallback(() => {
    refresh();
    window.dispatchEvent(new CustomEvent('notes:changed'));
  }, [refresh]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [hasOpened, setHasOpened] = useState(false);
  // Phase 7 T006: Deleted file detection (DYK-05)
  const [deletedFiles, setDeletedFiles] = useState<Set<string>>(new Set());

  // Bulk delete state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<'file' | 'all'>('all');
  const [bulkDeleteFileName, setBulkDeleteFileName] = useState<string>('');
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);

  useEffect(() => {
    if (isOpen || isModalOpen) setHasOpened(true);
  }, [isOpen, isModalOpen]);

  // Phase 7 T006: Fetch deleted file status when notes are grouped (DYK-05)
  useEffect(() => {
    if (!worktreePath || groupedByFile.size === 0) {
      setDeletedFiles(new Set());
      return;
    }
    fetchFilesWithNotesDetailed(worktreePath).then((result) => {
      if (result.ok) {
        const deleted = new Set<string>();
        for (const f of result.data) {
          if (!f.exists) deleted.add(f.path);
        }
        setDeletedFiles(deleted);
      }
    });
  }, [worktreePath, groupedByFile.size]);

  // Measure anchor element
  const measureRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const anchor = document.querySelector('[data-terminal-overlay-anchor]');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
    };
    measureRef.current = measure;
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector('[data-terminal-overlay-anchor]');
    if (anchor) observer.observe(anchor);
    const timer = setTimeout(measure, 200);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Re-measure when overlay opens
  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNotes();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeNotes]);

  // Resolve workspace slug from URL for navigation
  const getSlug = useCallback(() => {
    const match = window.location.pathname.match(/\/workspaces\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }, []);

  // "Go to" — close overlay, navigate to file+line
  const handleGoTo = useCallback(
    (target: string, line?: number) => {
      closeNotes();
      const slug = getSlug();
      if (!slug || !worktreePath) return;
      const href = workspaceHref(slug, '/browser', {
        worktree: worktreePath,
        file: target,
        mode: 'edit',
        ...(line != null ? { line: String(line) } : {}),
      });
      window.location.href = href;
    },
    [closeNotes, getSlug, worktreePath]
  );

  // Complete a note
  const handleComplete = useCallback(
    async (noteId: string) => {
      if (!worktreePath) return;
      const result = await completeNote(worktreePath, noteId, 'human');
      if (result.ok) {
        toast.success('Note completed');
        refreshAndNotify();
      } else {
        toast.error(result.error);
      }
    },
    [worktreePath, refreshAndNotify]
  );

  // Reply to a note
  const handleReply = useCallback(
    (parentNoteId: string) => {
      // Find the parent note's target so modal knows which file
      for (const [filePath, threads] of groupedByFile) {
        for (const thread of threads) {
          if (thread.root.id === parentNoteId) {
            openModal({ target: filePath, threadId: parentNoteId });
            return;
          }
        }
      }
    },
    [groupedByFile, openModal]
  );

  // Edit a note
  const handleEdit = useCallback(
    (note: Note) => {
      openModal({
        target: note.target,
        editNoteId: note.id,
        editContent: note.content,
        editTo: note.to,
        line:
          note.linkType === 'file' && note.targetMeta
            ? (note.targetMeta as { line?: number }).line
            : undefined,
      });
    },
    [openModal]
  );

  // Per-file delete
  const handleDeleteFile = useCallback((filePath: string, noteCount: number) => {
    setBulkDeleteScope('file');
    setBulkDeleteFileName(filePath);
    setBulkDeleteCount(noteCount);
    setBulkDeleteOpen(true);
  }, []);

  // All delete
  const handleDeleteAll = useCallback(() => {
    const total = openCount + completeCount;
    setBulkDeleteScope('all');
    setBulkDeleteFileName('');
    setBulkDeleteCount(total);
    setBulkDeleteOpen(true);
  }, [openCount, completeCount]);

  // Execute bulk delete
  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!worktreePath) return;
    const options =
      bulkDeleteScope === 'all' ? { scope: 'all' as const } : { target: bulkDeleteFileName };
    const result = await deleteNotes(worktreePath, options);
    if (result.ok) {
      toast.success(`${result.data.deleted} note${result.data.deleted !== 1 ? 's' : ''} deleted`);
      refreshAndNotify();
    } else {
      toast.error(result.error);
    }
  }, [worktreePath, bulkDeleteScope, bulkDeleteFileName, refreshAndNotify]);

  // "Add Note" from overlay header
  const handleAddNote = useCallback(() => {
    openModal({ target: '' });
  }, [openModal]);

  if (!hasOpened) return null;

  const fileGroups = Array.from(groupedByFile.entries());

  return (
    <>
      <div
        ref={panelRef}
        className="fixed flex flex-col border-l bg-background shadow-2xl"
        style={{
          zIndex: 44,
          top: `${anchorRect.top}px`,
          left: `${anchorRect.left}px`,
          width: `${anchorRect.width}px`,
          height: `${anchorRect.height}px`,
          display: isOpen ? 'flex' : 'none',
        }}
        data-testid="notes-overlay-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Notes</span>
            <span className="text-xs text-muted-foreground">
              {openCount} open &middot; {completeCount} complete
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Add Note button */}
            <button
              type="button"
              onClick={handleAddNote}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Add Note"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {/* Filter dropdown */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as NoteFilterOption)}
              className="text-xs bg-transparent border rounded px-1.5 py-0.5"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="complete">Complete</option>
              <option value="to-human">To Human</option>
              <option value="to-agent">To Agent</option>
              <option value="type-file">Type: File</option>
              <option value="type-workflow">Type: Workflow</option>
              <option value="type-agent-run">Type: Agent Run</option>
            </select>

            {/* Clear all button */}
            <button
              type="button"
              onClick={handleDeleteAll}
              className="rounded-sm p-1 text-muted-foreground hover:text-red-500 hover:bg-accent"
              title="Clear all notes..."
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={closeNotes}
              className="rounded-sm p-1 hover:bg-accent"
              aria-label="Close notes"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500 text-sm px-4 text-center">
              {error}
            </div>
          ) : fileGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <StickyNote className="h-8 w-8 opacity-30" />
              <span>No notes in this worktree</span>
              <button
                type="button"
                onClick={handleAddNote}
                className="text-xs text-primary hover:underline"
              >
                Add a note
              </button>
            </div>
          ) : (
            fileGroups.map(([filePath, threads]) => (
              <NoteFileGroup
                key={filePath}
                filePath={filePath}
                threads={threads}
                isDeleted={deletedFiles.has(filePath)}
                onGoTo={handleGoTo}
                onComplete={handleComplete}
                onReply={handleReply}
                onEdit={handleEdit}
                onDeleteFile={handleDeleteFile}
              />
            ))
          )}
        </div>
      </div>

      {/* Note Modal */}
      <NoteModal
        open={isModalOpen}
        onOpenChange={(v) => {
          if (!v) closeModal();
        }}
        target={modalTarget}
        worktreePath={worktreePath ?? ''}
        onSaved={refreshAndNotify}
      />

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        scope={bulkDeleteScope}
        fileName={bulkDeleteFileName}
        noteCount={bulkDeleteCount}
        onConfirm={handleBulkDeleteConfirm}
      />
    </>
  );
}
