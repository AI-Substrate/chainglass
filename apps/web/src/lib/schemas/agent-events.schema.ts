/**
 * Agent Event Schemas
 *
 * Zod schemas for agent-specific SSE events. These extend the main SSE schema
 * (sse-events.schema.ts) with agent streaming events.
 *
 * Per Critical Finding CF-03: These are ADDITIVE to existing SSE events.
 * They will be imported into sse-events.schema.ts and appended to the union.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 1: Foundation)
 *
 * Plan 015 Phase 1 (T007): Extended with SSE broadcast schemas for tool visibility.
 * Per ADR-0007: SSE events include sessionId for single-channel routing.
 * Per DYK-03: Storage schemas are in @chainglass/shared; these are SSE-specific wrappers.
 */
import { z } from 'zod';

// ============ Base Event Structure ============

// Reuse same base structure as other SSE events
const agentBaseEventSchema = z.object({
  id: z.string().optional(), // Optional event ID for deduplication
  timestamp: z.string().datetime(), // ISO 8601 timestamp
});

// ============ Session Status for SSE Events ============

/**
 * Session status values for SSE events.
 * Note: 'error' is used in SSE events (different from 'archived' in storage schema)
 */
export const AgentSessionStatusTypeSchema = z.enum([
  'idle',
  'running',
  'waiting_input',
  'completed',
  'error',
]);

// ============ Agent Event Schemas ============

/**
 * Text delta event - carries incremental streaming response text.
 * Used by StreamingMessage component to append text in real-time.
 */
export const AgentTextDeltaEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_text_delta'),
  data: z.object({
    sessionId: z.string(),
    delta: z.string(),
  }),
});

/**
 * Session status change event - triggers UI status indicator updates.
 */
export const AgentSessionStatusEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_session_status'),
  data: z.object({
    sessionId: z.string(),
    status: AgentSessionStatusTypeSchema,
  }),
});

/**
 * Usage update event - carries token usage for context window display.
 * tokensLimit is optional because not all agents provide it (e.g., Copilot).
 */
export const AgentUsageUpdateEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_usage_update'),
  data: z.object({
    sessionId: z.string(),
    tokensUsed: z.number(),
    tokensTotal: z.number(),
    tokensLimit: z.number().optional(),
  }),
});

/**
 * Error event - carries error details for display in chat.
 * code is optional for unstructured errors.
 */
export const AgentErrorEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_error'),
  data: z.object({
    sessionId: z.string(),
    message: z.string(),
    code: z.string().optional(),
  }),
});

// ============ Agent Event Union ============

/**
 * Union of all agent-specific SSE events.
 * This is also exported individually for type-specific handling.
 */
export const AgentEventSchema = z.discriminatedUnion('type', [
  AgentTextDeltaEventSchema,
  AgentSessionStatusEventSchema,
  AgentUsageUpdateEventSchema,
  AgentErrorEventSchema,
]);

// ============ Type Exports ============

export type AgentSessionStatusType = z.infer<typeof AgentSessionStatusTypeSchema>;
export type AgentTextDeltaEvent = z.infer<typeof AgentTextDeltaEventSchema>;
export type AgentSessionStatusEvent = z.infer<typeof AgentSessionStatusEventSchema>;
export type AgentUsageUpdateEvent = z.infer<typeof AgentUsageUpdateEventSchema>;
export type AgentErrorEvent = z.infer<typeof AgentErrorEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;

// ============ Re-export Individual Schemas for Union Extension ============

/**
 * Array of agent event schemas for extending sse-events.schema.ts union.
 * Usage in sse-events.schema.ts:
 *   import { agentEventSchemas } from './agent-events.schema';
 *   export const sseEventSchema = z.discriminatedUnion('type', [
 *     ...existingSchemas,
 *     ...agentEventSchemas,
 *   ]);
 */
export const agentEventSchemas = [
  AgentTextDeltaEventSchema,
  AgentSessionStatusEventSchema,
  AgentUsageUpdateEventSchema,
  AgentErrorEventSchema,
] as const;

// ============ Plan 015 Phase 1: Tool Visibility SSE Events ============

/**
 * SSE broadcast event for tool calls.
 * Per ADR-0007: Includes sessionId for single-channel routing.
 *
 * This wraps tool_call data with SSE-specific fields (sessionId for routing).
 */
export const AgentToolCallBroadcastEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_tool_call'),
  data: z.object({
    sessionId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    toolCallId: z.string(),
  }),
});

/**
 * SSE broadcast event for tool results.
 * Per ADR-0007: Includes sessionId for single-channel routing.
 */
export const AgentToolResultBroadcastEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_tool_result'),
  data: z.object({
    sessionId: z.string(),
    toolCallId: z.string(),
    output: z.string(),
    isError: z.boolean(),
  }),
});

/**
 * SSE broadcast event for thinking/reasoning blocks.
 * Per ADR-0007: Includes sessionId for single-channel routing.
 */
export const AgentThinkingBroadcastEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_thinking'),
  data: z.object({
    sessionId: z.string(),
    content: z.string(),
    signature: z.string().optional(),
  }),
});

// Type exports for new SSE events
export type AgentToolCallBroadcastEvent = z.infer<typeof AgentToolCallBroadcastEventSchema>;
export type AgentToolResultBroadcastEvent = z.infer<typeof AgentToolResultBroadcastEventSchema>;
export type AgentThinkingBroadcastEvent = z.infer<typeof AgentThinkingBroadcastEventSchema>;

/**
 * Extended array including new tool visibility events.
 * Use this for the complete SSE event union.
 */
export const agentEventSchemasExtended = [
  ...agentEventSchemas,
  AgentToolCallBroadcastEventSchema,
  AgentToolResultBroadcastEventSchema,
  AgentThinkingBroadcastEventSchema,
] as const;
