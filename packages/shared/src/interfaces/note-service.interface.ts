/**
 * File Notes Service Interface
 *
 * Generic annotation service for attaching markdown notes to files,
 * workflow nodes, agent runs, or any future linkable entity.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import type {
  CreateNoteInput,
  EditNoteInput,
  Note,
  NoteFilter,
  NoteResult,
} from '../file-notes/types.js';

/**
 * Service interface for note CRUD and querying.
 *
 * Implementations:
 * - Real: JSONL persistence in .chainglass/data/notes.jsonl
 * - Fake: In-memory Map for tests
 */
export interface INoteService {
  /** Create a new note. Returns the created note with generated ID. */
  addNote(worktreePath: string, input: CreateNoteInput): Promise<NoteResult<Note>>;

  /** Edit an existing note's content or addressee. */
  editNote(worktreePath: string, noteId: string, input: EditNoteInput): Promise<NoteResult<Note>>;

  /** Mark a note as complete. */
  completeNote(
    worktreePath: string,
    noteId: string,
    completedBy: 'human' | 'agent'
  ): Promise<NoteResult<Note>>;

  /** Delete a single note by ID. */
  deleteNote(worktreePath: string, noteId: string): Promise<NoteResult>;

  /** List notes with optional filtering. */
  listNotes(worktreePath: string, filter?: NoteFilter): Promise<NoteResult<Note[]>>;

  /** List unique file paths (or targets) that have notes. */
  listFilesWithNotes(worktreePath: string): Promise<NoteResult<string[]>>;

  /** Delete all notes for a specific target (e.g., a file path). */
  deleteAllForTarget(worktreePath: string, target: string): Promise<NoteResult>;

  /** Delete all notes in the worktree. */
  deleteAll(worktreePath: string): Promise<NoteResult>;
}
