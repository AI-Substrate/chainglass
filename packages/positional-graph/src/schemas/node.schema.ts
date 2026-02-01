import { z } from 'zod';
import { ExecutionSchema } from './graph.schema.js';

export const InputResolutionSchema = z.union([
  z.object({
    from_unit: z.string().min(1),
    from_output: z.string().min(1),
  }),
  z.object({
    from_node: z.string().min(1),
    from_output: z.string().min(1),
  }),
]);
export type InputResolution = z.infer<typeof InputResolutionSchema>;

export const NodeConfigSchema = z.object({
  id: z.string().min(1),
  unit_slug: z.string().min(1),
  execution: ExecutionSchema.default('serial'),
  description: z.string().optional(),
  created_at: z.string().datetime(),
  config: z.record(z.unknown()).optional(),
  inputs: z.record(InputResolutionSchema).optional(),
});
export type NodeConfig = z.infer<typeof NodeConfigSchema>;
