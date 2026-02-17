import { z } from 'zod';
import { ExecutionSchema, TransitionModeSchema } from './enums.schema.js';

// --- Base (common fields shared by all three) ---

export const BaseOrchestratorSettingsSchema = z.object({}).strict();
export type BaseOrchestratorSettings = z.infer<typeof BaseOrchestratorSettingsSchema>;

// --- Entity-specific overrides ---

export const GraphOrchestratorSettingsSchema = BaseOrchestratorSettingsSchema.extend({
  agentType: z.enum(['claude-code', 'copilot']).default('copilot'),
}).strict();
export type GraphOrchestratorSettings = z.infer<typeof GraphOrchestratorSettingsSchema>;

export const LineOrchestratorSettingsSchema = BaseOrchestratorSettingsSchema.extend({
  transition: TransitionModeSchema.default('auto'),
  autoStartLine: z.boolean().default(true),
}).strict();
export type LineOrchestratorSettings = z.infer<typeof LineOrchestratorSettingsSchema>;

export const NodeOrchestratorSettingsSchema = BaseOrchestratorSettingsSchema.extend({
  execution: ExecutionSchema.default('serial'),
  waitForPrevious: z.boolean().default(true),
}).strict();
export type NodeOrchestratorSettings = z.infer<typeof NodeOrchestratorSettingsSchema>;
