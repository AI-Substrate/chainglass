/**
 * File Notes Domain — Shared Types
 *
 * Types consumed by both web and CLI via @chainglass/shared.
 * Generic annotation system for files, workflow nodes, and agent runs.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

/**
 * Link types — what entity a note is attached to.
 * Extensible: add new values here without schema migration.
 */
export const NoteLinkType = {
  File: 'file',
  Workflow: 'workflow',
  AgentRun: 'agent-run',
} as const;

export type NoteLinkType = (typeof NoteLinkType)[keyof typeof NoteLinkType];

/** Per-link-type metadata — enforced by discriminated union */
export type FileNoteMeta = { line?: number };
export type WorkflowNoteMeta = { nodeId?: string };
export type AgentRunNoteMeta = { runId?: string };

/** Map from link type to its metadata shape */
export type TargetMetaFor<T extends NoteLinkType> = T extends 'file'
  ? FileNoteMeta
  : T extends 'workflow'
    ? WorkflowNoteMeta
    : T extends 'agent-run'
      ? AgentRunNoteMeta
      : never;

/** Who can be addressed by a note */
export type NoteAddressee = 'human' | 'agent';

/** Who authored a note */
export type NoteAuthor = 'human' | 'agent';

/** Note completion status */
export type NoteStatus = 'open' | 'complete';

/** Shared fields across all note link types */
interface BaseNote {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Target identifier — file path, workflow ID, or agent run ID */
  target: string;
  /** Markdown content */
  content: string;
  /** Optional addressee — who this note is for */
  to?: NoteAddressee;
  /** Current status */
  status: NoteStatus;
  /** Who completed it (only set when status is 'complete') */
  completedBy?: NoteAuthor;
  /** Who created this note */
  author: NoteAuthor;
  /** Author identifier (e.g., agent ID) — optional */
  authorId?: string;
  /** Thread parent ID — if this is a reply to another note */
  threadId?: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-updated timestamp */
  updatedAt: string;
}

/** File note — can target a specific line */
export interface FileNote extends BaseNote {
  linkType: 'file';
  targetMeta?: FileNoteMeta;
}

/** Workflow note — can target a specific node */
export interface WorkflowNote extends BaseNote {
  linkType: 'workflow';
  targetMeta?: WorkflowNoteMeta;
}

/** Agent run note — can target a specific run */
export interface AgentRunNote extends BaseNote {
  linkType: 'agent-run';
  targetMeta?: AgentRunNoteMeta;
}

/**
 * Discriminated union of all note types.
 * linkType determines the allowed targetMeta shape.
 */
export type Note = FileNote | WorkflowNote | AgentRunNote;

/**
 * Filter options for querying notes.
 */
export interface NoteFilter {
  linkType?: NoteLinkType;
  target?: string;
  status?: NoteStatus;
  to?: NoteAddressee;
  threadId?: string;
}

/**
 * Input for creating a new note — discriminated by linkType.
 */
export type CreateNoteInput =
  | {
      linkType: 'file';
      target: string;
      targetMeta?: FileNoteMeta;
      content: string;
      to?: NoteAddressee;
      author: NoteAuthor;
      authorId?: string;
      threadId?: string;
    }
  | {
      linkType: 'workflow';
      target: string;
      targetMeta?: WorkflowNoteMeta;
      content: string;
      to?: NoteAddressee;
      author: NoteAuthor;
      authorId?: string;
      threadId?: string;
    }
  | {
      linkType: 'agent-run';
      target: string;
      targetMeta?: AgentRunNoteMeta;
      content: string;
      to?: NoteAddressee;
      author: NoteAuthor;
      authorId?: string;
      threadId?: string;
    };

/**
 * Input for editing an existing note.
 */
export interface EditNoteInput {
  content?: string;
  to?: NoteAddressee;
}

/** Result type for note operations */
export type NoteResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Valid link type values for runtime validation */
export const VALID_LINK_TYPES: readonly NoteLinkType[] = ['file', 'workflow', 'agent-run'];

/** Valid author values for runtime validation */
export const VALID_AUTHORS: readonly NoteAuthor[] = ['human', 'agent'];

/** Valid addressee values for runtime validation */
export const VALID_ADDRESSEES: readonly NoteAddressee[] = ['human', 'agent'];

/** Runtime type guard for NoteLinkType */
export function isNoteLinkType(value: unknown): value is NoteLinkType {
  return VALID_LINK_TYPES.includes(value as NoteLinkType);
}

/** Runtime type guard for NoteAuthor */
export function isNoteAuthor(value: unknown): value is NoteAuthor {
  return VALID_AUTHORS.includes(value as NoteAuthor);
}

/** Runtime type guard for NoteAddressee */
export function isNoteAddressee(value: unknown): value is NoteAddressee {
  return VALID_ADDRESSEES.includes(value as NoteAddressee);
}

/** JSONL filename for per-worktree notes */
export const NOTES_FILE = 'notes.jsonl';

/** Directory within worktree: .chainglass/data/ */
export const NOTES_DIR = '.chainglass/data';
