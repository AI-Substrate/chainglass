/**
 * SSE Event Schemas
 *
 * Zod schemas for Server-Sent Events with discriminated union for type safety.
 * Used by SSEManager for validation and type inference.
 */
import { z } from 'zod';

// Base event structure (all events share these fields)
const baseEventSchema = z.object({
  id: z.string().optional(), // Optional event ID for deduplication
  timestamp: z.string().datetime(), // ISO 8601 timestamp
});

// Workflow status update event
const workflowStatusEventSchema = baseEventSchema.extend({
  type: z.literal('workflow_status'),
  data: z.object({
    workflowId: z.string(),
    phase: z.enum(['pending', 'running', 'completed', 'failed']),
    progress: z.number().min(0).max(100).optional(),
  }),
});

// Task update event (Kanban board updates)
const taskUpdateEventSchema = baseEventSchema.extend({
  type: z.literal('task_update'),
  data: z.object({
    taskId: z.string(),
    columnId: z.string(),
    position: z.number(),
  }),
});

// Heartbeat event (keep-alive)
const heartbeatEventSchema = baseEventSchema.extend({
  type: z.literal('heartbeat'),
  data: z.object({}), // Empty data object
});

// Discriminated union of all event types
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
]);

// Export inferred types
export type SSEEvent = z.infer<typeof sseEventSchema>;
export type WorkflowStatusEvent = z.infer<typeof workflowStatusEventSchema>;
export type TaskUpdateEvent = z.infer<typeof taskUpdateEventSchema>;
export type HeartbeatEvent = z.infer<typeof heartbeatEventSchema>;
