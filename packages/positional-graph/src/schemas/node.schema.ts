import { z } from 'zod';
import { NodeOrchestratorSettingsSchema } from './orchestrator-settings.schema.js';
import { NodePropertiesSchema } from './properties.schema.js';

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
  description: z.string().optional(),
  created_at: z.string().datetime(),
  inputs: z.record(z.string(), InputResolutionSchema).optional(),
  properties: NodePropertiesSchema.prefault({}),
  orchestratorSettings: NodeOrchestratorSettingsSchema.prefault({}),
});
export type NodeConfig = z.infer<typeof NodeConfigSchema>;
