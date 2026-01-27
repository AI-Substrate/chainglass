/**
 * Schemas barrel export
 *
 * Per DYK-03: Single source of truth for Zod schemas.
 * Types are derived via z.infer<> from these schemas.
 */

// Agent Event Schemas (Plan 015: Phase 1)
export {
  // Schemas
  AgentEventBaseSchema,
  AgentStoredEventSchema,
  AgentThinkingEventSchema,
  AgentToolCallEventSchema,
  AgentToolResultEventSchema,
  agentStoredEventSchemas,
  // Types (derived via z.infer)
  type AgentStoredEvent,
  type AgentThinkingEvent,
  type AgentToolCallEvent,
  type AgentToolResultEvent,
} from './agent-event.schema.js';

// Session Metadata Schemas (Plan 015: Phase 3)
export {
  // Schemas
  AgentTypeSchema,
  SessionErrorSchema,
  SessionMetadataCreateSchema,
  SessionMetadataSchema,
  SessionMetadataUpdateSchema,
  SessionStatusSchema,
  // Types (derived via z.infer)
  type AgentType,
  type SessionError,
  type SessionMetadata,
  type SessionMetadataCreate,
  type SessionMetadataUpdate,
  type SessionStatus,
} from './session-metadata.schema.js';
