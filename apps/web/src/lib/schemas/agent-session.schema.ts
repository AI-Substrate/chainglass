/**
 * Agent Session Schema
 *
 * Zod schemas for validating agent session data persisted in localStorage.
 * Used by AgentSessionStore for two-pass hydration (JSON.parse → Zod validate → hydrate state).
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 1: Foundation)
 */
import { z } from 'zod';

// ============ Enum Schemas ============

/**
 * Supported agent types.
 * Extend this enum when adding new agent adapters.
 */
export const AgentTypeSchema = z.enum(['claude-code', 'copilot']);

/**
 * Session status values for the state machine.
 * - idle: No agent running, ready for input
 * - running: Agent is processing, streaming response
 * - waiting_input: Agent is blocked waiting for user input
 * - completed: Session finished successfully
 * - archived: Session moved to archive (hidden from main list)
 */
export const SessionStatusSchema = z.enum([
  'idle',
  'running',
  'waiting_input',
  'completed',
  'archived',
]);

/**
 * Message role - only user and assistant roles are supported.
 * System messages are not exposed in the UI.
 */
export const MessageRoleSchema = z.enum(['user', 'assistant']);

// ============ Object Schemas ============

/**
 * A single message in an agent conversation.
 * Timestamps are epoch milliseconds (Date.now()).
 */
export const AgentMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.number(),
});

/**
 * Complete agent session state.
 * Validated during hydration from localStorage.
 */
export const AgentSessionSchema = z.object({
  /** Unique session identifier (UUID) */
  id: z.string(),

  /** User-provided session name */
  name: z.string(),

  /** Agent type for this session */
  agentType: AgentTypeSchema,

  /** Current session status */
  status: SessionStatusSchema,

  /** Message history */
  messages: z.array(AgentMessageSchema),

  /** Session creation timestamp (epoch ms) */
  createdAt: z.number(),

  /** Last activity timestamp (epoch ms) - used for sorting */
  lastActiveAt: z.number(),

  /** Optional: context window usage percentage (0-100) */
  contextUsage: z.number().min(0).max(100).optional(),

  /** Optional: agent-provided session ID for resume */
  agentSessionId: z.string().optional(),
});

/**
 * Schema for the entire sessions data structure persisted to localStorage.
 * Maps session IDs to session objects.
 */
export const SessionsDataSchema = z.record(z.string(), AgentSessionSchema);

// ============ Type Exports ============

export type AgentType = z.infer<typeof AgentTypeSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
export type SessionsData = z.infer<typeof SessionsDataSchema>;
