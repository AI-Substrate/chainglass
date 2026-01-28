/**
 * Agent Session Zod Schema
 *
 * Defines the shape of agent session JSON files for workspace-scoped storage.
 * Per Plan 018: Agent Workspace Data Model Migration
 *
 * Storage Structure:
 * <worktree>/.chainglass/data/agents/
 *   <session-id>.json     <- This schema (session metadata)
 *   <session-id>/
 *     events.ndjson       <- Event stream (Phase 2)
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 1)
 */
import { z } from 'zod';

import { AgentTypeSchema } from './session-metadata.schema.js';

// Re-export AgentType for convenience (avoid duplicate schema definition)
export { AgentTypeSchema };
export type { AgentType } from './session-metadata.schema.js';

// ============ Agent Session Status ============

/**
 * Agent session lifecycle status.
 *
 * Status transitions:
 * - active: Session is currently being used
 * - completed: Session ended normally (user or agent)
 * - terminated: Session was forcibly terminated
 */
export const AgentSessionStatusSchema = z.enum(['active', 'completed', 'terminated']);

export type AgentSessionStatus = z.infer<typeof AgentSessionStatusSchema>;

// ============ Agent Session JSON ============

/**
 * Serialized AgentSession for JSON storage and API responses.
 *
 * Per DYK-03:
 * - camelCase property names
 * - Date → ISO-8601 string
 */
export const AgentSessionJSONSchema = z.object({
  /** Unique session identifier (e.g., "1738123456789-abc123") */
  id: z.string().min(1),

  /** Agent type for this session */
  type: AgentTypeSchema,

  /** Current session status */
  status: AgentSessionStatusSchema,

  /** ISO timestamp when session was created */
  createdAt: z.string().datetime(),

  /** ISO timestamp when session was last updated */
  updatedAt: z.string().datetime(),
});

export type AgentSessionJSON = z.infer<typeof AgentSessionJSONSchema>;

// ============ Agent Session Input ============

/**
 * Input for creating a new AgentSession.
 *
 * When creating a new session:
 * - id, type, status are required
 * - timestamps can be provided or default to now
 *
 * When loading from storage:
 * - All fields are provided from JSON
 */
export const AgentSessionInputSchema = z.object({
  /** Unique session identifier */
  id: z.string().min(1),

  /** Agent type for this session */
  type: AgentTypeSchema,

  /** Current session status */
  status: AgentSessionStatusSchema,

  /** Optional creation timestamp (defaults to now) */
  createdAt: z.date().optional(),

  /** Optional update timestamp (defaults to createdAt) */
  updatedAt: z.date().optional(),
});

export type AgentSessionInput = z.infer<typeof AgentSessionInputSchema>;

// ============ Validation Utilities ============

/**
 * Session ID format validation.
 *
 * Per Discovery 05: Session IDs must be validated to prevent path traversal.
 * Valid format: [a-zA-Z0-9_-]{1,255}
 *
 * Invalid patterns:
 * - Contains path separators (/, \)
 * - Contains parent directory (..)
 * - Contains dots (.) at start
 * - Empty or too long
 */
export const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;

/**
 * Validate a session ID for safe filesystem operations.
 *
 * @param sessionId - Session ID to validate
 * @returns true if valid, false if invalid
 */
export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId || sessionId.length === 0 || sessionId.length > 255) {
    return false;
  }

  // Check for path traversal patterns
  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    return false;
  }

  // Check for dots at start (hidden files)
  if (sessionId.startsWith('.')) {
    return false;
  }

  return SESSION_ID_PATTERN.test(sessionId);
}

/**
 * Validate a session ID and throw if invalid.
 *
 * @param sessionId - Session ID to validate
 * @throws Error if session ID is invalid
 */
export function validateSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(
      `Invalid session ID: "${sessionId}". Must match pattern [a-zA-Z0-9_-]{1,255} and not contain path traversal sequences.`
    );
  }
}
