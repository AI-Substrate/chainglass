/**
 * File Notes Domain — Types (re-exported from @chainglass/shared)
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

// Re-export all shared types
export {
  NOTES_DIR,
  NOTES_FILE,
  NoteLinkType,
  VALID_ADDRESSEES,
  VALID_AUTHORS,
  VALID_LINK_TYPES,
  isNoteAddressee,
  isNoteAuthor,
  isNoteLinkType,
} from '@chainglass/shared/file-notes';
export type {
  AgentRunNoteMeta,
  AgentRunNote,
  CreateNoteInput,
  EditNoteInput,
  FileNote,
  FileNoteMeta,
  Note,
  NoteAddressee,
  NoteAuthor,
  NoteFilter,
  NoteResult,
  NoteStatus,
  TargetMetaFor,
  WorkflowNote,
  WorkflowNoteMeta,
} from '@chainglass/shared/file-notes';
