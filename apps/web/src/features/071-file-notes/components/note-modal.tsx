'use client';

/**
 * NoteModal — Dialog for adding/editing a note.
 *
 * Supports three modes:
 * 1. Add: target pre-filled from context (Ctrl+Shift+N, tree context menu)
 * 2. Add (empty): target typed by user (overlay "+" button)
 * 3. Edit: content/addressee pre-filled from existing note
 * 4. Reply: threadId set from parent note
 *
 * Plan 071: PR View & File Notes — Phase 2, T006
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { addNote, editNote } from '../../../../app/actions/notes-actions';
import type { NoteModalTarget } from '../hooks/use-notes-overlay';
import type { NoteAddressee } from '../types';

interface NoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target context — null means user must type file path */
  target: NoteModalTarget | null;
  /** Worktree path for server action calls */
  worktreePath: string;
  /** Callback after successful save */
  onSaved: () => void;
}

type ToOption = 'anyone' | 'human' | 'agent';

export function NoteModal({ open, onOpenChange, target, worktreePath, onSaved }: NoteModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const [to, setTo] = useState<NoteAddressee | undefined>(undefined);
  const [targetPath, setTargetPath] = useState('');
  const [line, setLine] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const isEditing = !!target?.editNoteId;
  const isReplying = !!target?.threadId;

  // Pre-fill when target changes
  useEffect(() => {
    if (!open) return;
    if (target) {
      setTargetPath(target.target);
      setLine(target.line != null ? String(target.line) : '');
      setContent(target.editContent ?? '');
      setTo(target.editTo);
    } else {
      setTargetPath('');
      setLine('');
      setContent('');
      setTo(undefined);
    }
  }, [open, target]);

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !targetPath.trim()) return;

    setSaving(true);
    try {
      if (isEditing && target?.editNoteId) {
        const result = await editNote(worktreePath, target.editNoteId, {
          content: trimmedContent,
          to,
        });
        if (result.ok) {
          toast.success('Note updated');
        } else {
          toast.error(result.error);
          return;
        }
      } else {
        const parsedLine = line ? Number.parseInt(line, 10) : undefined;
        const result = await addNote(worktreePath, {
          linkType: 'file',
          target: targetPath.trim(),
          targetMeta: parsedLine ? { line: parsedLine } : undefined,
          content: trimmedContent,
          to,
          author: 'human',
          threadId: target?.threadId,
        });
        if (result.ok) {
          toast.success(
            isReplying ? 'Reply added' : `Note added to ${targetPath.split('/').pop()}`
          );
        } else {
          toast.error(result.error);
          return;
        }
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(`Failed: ${err}`);
    } finally {
      setSaving(false);
    }
  }, [
    content,
    targetPath,
    line,
    to,
    worktreePath,
    target,
    isEditing,
    isReplying,
    onOpenChange,
    onSaved,
  ]);

  const handleToClick = (option: ToOption) => {
    setTo(option === 'anyone' ? undefined : option);
  };

  const title = isEditing ? 'Edit Note' : isReplying ? 'Reply' : 'Add Note';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target?.target ? (
              <>
                <span className="font-mono text-xs">{targetPath}</span>
                {target.line != null && (
                  <span className="text-muted-foreground"> &middot; Line {target.line}</span>
                )}
              </>
            ) : (
              'Add a note to a file'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* File path input — shown when target is not pre-filled */}
          {!target?.target && !isEditing && (
            <div className="space-y-1">
              <label htmlFor="note-target" className="text-sm font-medium">
                File path
              </label>
              <input
                id="note-target"
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="src/features/..."
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono
                           placeholder:text-muted-foreground
                           focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Optional line number — shown for new notes (not edits) */}
          {!isEditing && !target?.line && (
            <div className="space-y-1">
              <label htmlFor="note-line" className="text-sm text-muted-foreground">
                Line number (optional)
              </label>
              <input
                id="note-line"
                type="number"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder="e.g., 42"
                min={1}
                className="w-32 rounded-md border bg-transparent px-3 py-2 text-sm font-mono
                           placeholder:text-muted-foreground
                           focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Content editor */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Leave a note... (markdown supported)"
            className="w-full min-h-[120px] rounded-md border bg-transparent px-3 py-2
                       text-sm placeholder:text-muted-foreground resize-y
                       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          {/* "To" selector */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">To:</span>
            <div className="flex gap-1">
              {(['anyone', 'human', 'agent'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleToClick(option)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs border',
                    to === (option === 'anyone' ? undefined : option)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground border-muted hover:border-foreground/30'
                  )}
                >
                  {option === 'anyone' ? 'Anyone' : option === 'human' ? 'Human' : 'Agent'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!content.trim() || !targetPath.trim() || saving}>
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
