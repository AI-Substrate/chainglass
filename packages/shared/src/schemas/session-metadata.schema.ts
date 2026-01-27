/**
 * Session Metadata Zod Schema
 *
 * Defines the shape of metadata.json for agent sessions.
 * Per Phase 3 workshop: notification-fetch pattern with server-side storage.
 *
 * Storage Structure:
 * .chainglass/workspaces/default/sessions/
 *   sess-123/
 *     metadata.json     <- This schema
 *     events.ndjson     <- Event stream (AgentStoredEvent[])
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 3)
 */
import { z } from 'zod';

// ============ Session Status ============

/**
 * Session lifecycle status.
 * Status transitions: idle → running → (waiting_input | completed | error)
 */
export const SessionStatusSchema = z.enum([
  'idle', // Session created, no activity yet
  'running', // Agent actively processing
  'waiting_input', // Agent waiting for user input
  'completed', // Session finished successfully
  'error', // Session ended with error
  'archived', // Session moved to archive
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// ============ Agent Type ============

/**
 * Supported agent types.
 */
export const AgentTypeSchema = z.enum(['claude-code', 'copilot']);

export type AgentType = z.infer<typeof AgentTypeSchema>;

// ============ Session Error ============

/**
 * Error information when session status is 'error'.
 */
export const SessionErrorSchema = z.object({
  /** Human-readable error message */
  message: z.string(),
  /** Optional error code for programmatic handling */
  code: z.string().optional(),
});

export type SessionError = z.infer<typeof SessionErrorSchema>;

// ============ Session Metadata ============

/**
 * Session metadata schema for metadata.json.
 *
 * Per workshop decisions:
 * - Q1: Hybrid storage (metadata.json + events.ndjson)
 * - Q2: Minimal metadata (id, name, agentType, status, timestamps, contextUsage, error)
 * - Q5: Status lives in metadata only, not as events
 */
export const SessionMetadataSchema = z.object({
  /** Unique session identifier (e.g., "sess-1738123456-abc123") */
  id: z.string(),

  /** User-visible session name */
  name: z.string(),

  /** Agent type for this session */
  agentType: AgentTypeSchema,

  /** Agent's internal session ID for resume capability */
  agentSessionId: z.string().optional(),

  /** Current session status */
  status: SessionStatusSchema,

  /** ISO timestamp when session was created */
  createdAt: z.string().datetime(),

  /** ISO timestamp when session was last updated */
  updatedAt: z.string().datetime(),

  /** Context window usage percentage (0-100) */
  contextUsage: z.number().min(0).max(100).optional(),

  /** Total tokens used in this session */
  tokensUsed: z.number().int().nonnegative().optional(),

  /** Error information when status is 'error' */
  error: SessionErrorSchema.optional(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// ============ Partial Updates ============

/**
 * Schema for partial updates to session metadata.
 * Used by PATCH /api/agents/sessions/:id
 */
export const SessionMetadataUpdateSchema = SessionMetadataSchema.partial().omit({
  id: true, // ID cannot be updated
  createdAt: true, // Creation timestamp is immutable
});

export type SessionMetadataUpdate = z.infer<typeof SessionMetadataUpdateSchema>;

// ============ Create Schema ============

/**
 * Schema for creating new session metadata.
 * Defaults are applied by the service.
 */
export const SessionMetadataCreateSchema = z.object({
  name: z.string(),
  agentType: AgentTypeSchema,
  agentSessionId: z.string().optional(),
});

export type SessionMetadataCreate = z.infer<typeof SessionMetadataCreateSchema>;
