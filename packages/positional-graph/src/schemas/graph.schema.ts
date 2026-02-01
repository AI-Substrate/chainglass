import { z } from 'zod';

export const ExecutionSchema = z.enum(['serial', 'parallel']);
export type Execution = z.infer<typeof ExecutionSchema>;

export const TransitionModeSchema = z.enum(['auto', 'manual']);
export type TransitionMode = z.infer<typeof TransitionModeSchema>;

export const LineDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  transition: TransitionModeSchema.default('auto'),
  nodes: z.array(z.string()),
});
export type LineDefinition = z.infer<typeof LineDefinitionSchema>;

export const PositionalGraphDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  created_at: z.string().datetime(),
  lines: z.array(LineDefinitionSchema).min(1),
});
export type PositionalGraphDefinition = z.infer<typeof PositionalGraphDefinitionSchema>;
