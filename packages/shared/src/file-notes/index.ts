/**
 * File Notes — Shared Barrel Exports
 *
 * Plan 071: PR View & File Notes
 */

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
} from './types.js';
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
} from './types.js';

export {
  appendNote,
  editNote,
  completeNote,
  deleteNote,
  deleteAllForTarget,
  deleteAll,
} from './note-writer.js';
export { readNotes, listFilesWithNotes } from './note-reader.js';
export { JsonlNoteService } from './jsonl-note-service.js';
