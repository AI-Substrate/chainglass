import { z } from 'zod';

import { NodeEventSchema } from '../features/032-node-event-system/node-event.schema.js';

export const GraphStatusSchema = z.enum(['pending', 'in_progress', 'complete', 'failed']);
export type GraphStatus = z.infer<typeof GraphStatusSchema>;

/**
 * Node execution status enum.
 *
 * Note: There is no 'pending' status - a node without an entry in state.json
 * is implicitly pending. This keeps state.json compact.
 *
 * Two-phase handshake (Plan 032):
 * - 'starting': orchestrator reserved the node — agent should accept
 * - 'agent-accepted': agent acknowledged — work in progress
 */
export const NodeExecutionStatusSchema = z.enum([
  'starting',
  'agent-accepted',
  'waiting-question',
  'blocked-error',
  'restart-pending',
  'interrupted',
  'complete',
]);
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusSchema>;

// ============================================
// Question Schema (Plan 028)
// ============================================

/**
 * Question types for orchestrator handoff protocol.
 */
export const QuestionTypeSchema = z.enum(['text', 'single', 'multi', 'confirm']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * Question schema for question/answer protocol.
 * Stored in state.json `questions` array.
 * @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. Human input is a web-layer concern (Plan 054).
 */
export const QuestionSchema = z.object({
  question_id: z.string().min(1),
  node_id: z.string().min(1),
  type: QuestionTypeSchema,
  text: z.string().min(1),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
  asked_at: z.string().datetime(),
  surfaced_at: z.string().datetime().optional(),
  answer: z.unknown().optional(),
  answered_at: z.string().datetime().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ============================================
// NodeStateEntry Error Schema (Plan 028)
// ============================================

/**
 * Error details stored in NodeStateEntry when status is 'blocked-error'.
 */
export const NodeStateEntryErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type NodeStateEntryError = z.infer<typeof NodeStateEntryErrorSchema>;

// ============================================
// Extended NodeStateEntry Schema (Plan 028)
// ============================================

/**
 * Node state entry with optional fields for Q&A protocol and error tracking.
 * All new fields are optional to maintain backward compatibility.
 */
export const NodeStateEntrySchema = z.object({
  status: NodeExecutionStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  // Plan 028 extensions - optional for backward compatibility
  pending_question_id: z.string().optional(),
  error: NodeStateEntryErrorSchema.optional(),
  // Plan 032 extension - optional event log for backward compatibility
  events: z.array(NodeEventSchema).optional(),
});
export type NodeStateEntry = z.infer<typeof NodeStateEntrySchema>;

export const TransitionEntrySchema = z.object({
  triggered: z.boolean(),
  triggered_at: z.string().datetime().optional(),
});
export type TransitionEntry = z.infer<typeof TransitionEntrySchema>;

// ============================================
// Extended StateSchema (Plan 028)
// ============================================

/**
 * Runtime state stored in state.json.
 * Extended with questions array for Q&A protocol.
 */
export const StateSchema = z.object({
  graph_status: GraphStatusSchema,
  updated_at: z.string().datetime(),
  nodes: z.record(NodeStateEntrySchema).optional(),
  transitions: z.record(TransitionEntrySchema).optional(),
  // Plan 028 extension - optional for backward compatibility
  questions: z.array(QuestionSchema).optional(),
});
export type State = z.infer<typeof StateSchema>;
