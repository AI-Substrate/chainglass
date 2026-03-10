/**
 * File Notes Domain — Barrel Exports (client-safe)
 *
 * Server-only filesystem helpers (note-writer, note-reader) are NOT
 * exported here — import them directly from their lib/ paths in
 * server components/actions only.
 *
 * Plan 071: PR View & File Notes
 */

export { NOTES_DIR, NOTES_FILE, NoteLinkType } from './types';
export type {
  CreateNoteInput,
  EditNoteInput,
  Note,
  NoteAddressee,
  NoteAuthor,
  NoteFilter,
  NoteResult,
  NoteStatus,
  TargetMetaFor,
} from './types';

// Phase 2: Hooks
export { useNotes } from './hooks/use-notes';
export type { NoteThread, NoteFilterOption, UseNotesResult } from './hooks/use-notes';
export { NotesOverlayProvider, useNotesOverlay } from './hooks/use-notes-overlay';
export type { NoteModalTarget } from './hooks/use-notes-overlay';

// Phase 2: Components
export { NoteCard } from './components/note-card';
export { NoteFileGroup } from './components/note-file-group';
export { NoteIndicatorDot } from './components/note-indicator-dot';
export { NoteModal } from './components/note-modal';
export { NotesOverlayPanel } from './components/notes-overlay-panel';
export { BulkDeleteDialog } from './components/bulk-delete-dialog';

// Phase 2: SDK
export { registerFileNotesSDK } from './sdk/register';
export { fileNotesContribution } from './sdk/contribution';
