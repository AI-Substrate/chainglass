import { z } from 'zod';

export const GraphStatusSchema = z.enum(['pending', 'in_progress', 'complete', 'failed']);
export type GraphStatus = z.infer<typeof GraphStatusSchema>;

export const NodeExecutionStatusSchema = z.enum([
  'running',
  'waiting-question',
  'blocked-error',
  'complete',
]);
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusSchema>;

export const NodeStateEntrySchema = z.object({
  status: NodeExecutionStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});
export type NodeStateEntry = z.infer<typeof NodeStateEntrySchema>;

export const TransitionEntrySchema = z.object({
  triggered: z.boolean(),
  triggered_at: z.string().datetime().optional(),
});
export type TransitionEntry = z.infer<typeof TransitionEntrySchema>;

export const StateSchema = z.object({
  graph_status: GraphStatusSchema,
  updated_at: z.string().datetime(),
  nodes: z.record(NodeStateEntrySchema).optional(),
  transitions: z.record(TransitionEntrySchema).optional(),
});
export type State = z.infer<typeof StateSchema>;
