/**
 * SSE Event Schemas
 *
 * Zod schemas for Server-Sent Events with discriminated union for type safety.
 * Used by SSEManager for validation and type inference.
 *
 * Extended for Plan 011 with run/phase/question event types.
 */
import { z } from 'zod';

// Base event structure (all events share these fields)
const baseEventSchema = z.object({
  id: z.string().optional(), // Optional event ID for deduplication
  timestamp: z.string().datetime(), // ISO 8601 timestamp
});

// ============ Original Event Types ============

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

// ============ Plan 011: Run/Phase Event Types ============

// Phase run status enum (7 values)
const phaseRunStatusSchema = z.enum([
  'pending',
  'ready',
  'active',
  'blocked',
  'accepted',
  'complete',
  'failed',
]);

// Run status enum (4 values)
const runStatusSchema = z.enum(['pending', 'active', 'complete', 'failed']);

// Question type enum
const questionTypeSchema = z.enum(['single_choice', 'multi_choice', 'free_text', 'confirm']);

// Run status update event
const runStatusEventSchema = baseEventSchema.extend({
  type: z.literal('run_status'),
  data: z.object({
    runId: z.string(),
    workflowSlug: z.string(),
    status: runStatusSchema,
    currentPhase: z.string().nullable(),
    completedPhases: z.number(),
    totalPhases: z.number(),
  }),
});

// Phase status update event
const phaseStatusEventSchema = baseEventSchema.extend({
  type: z.literal('phase_status'),
  data: z.object({
    runId: z.string(),
    phaseName: z.string(),
    status: phaseRunStatusSchema,
    previousStatus: phaseRunStatusSchema.optional(),
    duration: z.number().nullable().optional(),
  }),
});

// Question event (phase is blocked and needs input)
const questionEventSchema = baseEventSchema.extend({
  type: z.literal('question'),
  data: z.object({
    runId: z.string(),
    phaseName: z.string(),
    questionId: z.string(),
    questionType: questionTypeSchema,
    prompt: z.string(),
    choices: z.array(z.string()).optional(),
    required: z.boolean().optional(),
  }),
});

// Answer event (response to a question)
const answerEventSchema = baseEventSchema.extend({
  type: z.literal('answer'),
  data: z.object({
    runId: z.string(),
    phaseName: z.string(),
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string()), z.boolean()]),
    answeredBy: z.string().optional(),
  }),
});

// ============ Discriminated Union ============

// Discriminated union of all event types
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
  runStatusEventSchema,
  phaseStatusEventSchema,
  questionEventSchema,
  answerEventSchema,
]);

// ============ Export Types ============

export type SSEEvent = z.infer<typeof sseEventSchema>;
export type WorkflowStatusEvent = z.infer<typeof workflowStatusEventSchema>;
export type TaskUpdateEvent = z.infer<typeof taskUpdateEventSchema>;
export type HeartbeatEvent = z.infer<typeof heartbeatEventSchema>;
export type RunStatusEvent = z.infer<typeof runStatusEventSchema>;
export type PhaseStatusEvent = z.infer<typeof phaseStatusEventSchema>;
export type QuestionEvent = z.infer<typeof questionEventSchema>;
export type AnswerEvent = z.infer<typeof answerEventSchema>;
export type PhaseRunStatus = z.infer<typeof phaseRunStatusSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;
