import { z } from 'zod';
import { ExecutionSchema, TransitionModeSchema } from './enums.schema.js';
import {
  GraphOrchestratorSettingsSchema,
  LineOrchestratorSettingsSchema,
} from './orchestrator-settings.schema.js';
import { GraphPropertiesSchema, LinePropertiesSchema } from './properties.schema.js';

// Re-export enums for backward compatibility (consumers import from graph.schema)
export { ExecutionSchema, TransitionModeSchema } from './enums.schema.js';
export type { Execution, TransitionMode } from './enums.schema.js';

export const LineDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(z.string()),
  properties: LinePropertiesSchema.default({}),
  orchestratorSettings: LineOrchestratorSettingsSchema.default({}),
});
export type LineDefinition = z.infer<typeof LineDefinitionSchema>;

export const PositionalGraphDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  created_at: z.string().datetime(),
  lines: z.array(LineDefinitionSchema).min(1),
  properties: GraphPropertiesSchema.default({}),
  orchestratorSettings: GraphOrchestratorSettingsSchema.default({}),
});
export type PositionalGraphDefinition = z.infer<typeof PositionalGraphDefinitionSchema>;
