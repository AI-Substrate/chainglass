/**
 * WorkNode Zod Schema.
 *
 * Validates node.yaml and data.json files.
 * Per workgraph-data-model.md: Node config and runtime data.
 * Per Insight 4: Uses Zod for TypeScript DX, exports JSON Schema via zod-to-json-schema.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// Input Mapping Schema
// ============================================

/**
 * Input mapping schema.
 */
export const InputMappingSchema = z.object({
  from: z.string().min(1, 'from is required'),
  output: z.string().min(1, 'output is required'),
});

export type InputMappingType = z.infer<typeof InputMappingSchema>;

// ============================================
// WorkNode Config Schema (node.yaml)
// ============================================

/**
 * WorkNode config schema.
 */
export const WorkNodeConfigSchema = z.object({
  id: z.string().min(1, 'id is required'),
  type: z.literal('start').optional(),
  unit: z.string().optional(),
  created_at: z.string().datetime({ message: 'created_at must be ISO datetime' }),
  config: z.record(z.string(), z.unknown()).optional(),
  inputs: z.record(z.string(), InputMappingSchema).optional(),
});

export type WorkNodeConfigType = z.infer<typeof WorkNodeConfigSchema>;

// ============================================
// Handover Schemas
// ============================================

/**
 * Question option schema.
 */
export const QuestionOptionSchema = z.object({
  key: z.string().regex(/^[A-Z]$/, 'Key must be a single uppercase letter'),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
});

export type QuestionOptionType = z.infer<typeof QuestionOptionSchema>;

/**
 * Answer schema.
 */
export const AnswerSchema = z.object({
  selection: z.union([z.string(), z.array(z.string())]).optional(),
  text: z.string().optional(),
  confirmed: z.boolean().optional(),
});

export type AnswerType = z.infer<typeof AnswerSchema>;

/**
 * Question schema.
 */
export const QuestionSchema = z.object({
  type: z.enum(['text', 'single', 'multi', 'confirm']),
  prompt: z.string().min(1, 'Prompt is required'),
  options: z.array(QuestionOptionSchema).optional(),
  answer: AnswerSchema.nullable().optional(),
});

export type QuestionType = z.infer<typeof QuestionSchema>;

/**
 * Handover error schema.
 */
export const HandoverErrorSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO datetime' }),
});

export type HandoverErrorType = z.infer<typeof HandoverErrorSchema>;

/**
 * Handover schema.
 */
export const HandoverSchema = z.object({
  reason: z.enum(['question', 'error', 'complete']),
  question: QuestionSchema.optional(),
  error: HandoverErrorSchema.optional(),
});

export type HandoverType = z.infer<typeof HandoverSchema>;

// ============================================
// WorkNode Data Schema (data.json)
// ============================================

/**
 * WorkNode data schema.
 */
export const WorkNodeDataSchema = z.object({
  outputs: z.record(z.string(), z.unknown()),
  handover: HandoverSchema.nullable().optional(),
});

export type WorkNodeDataType = z.infer<typeof WorkNodeDataSchema>;

// ============================================
// JSON Schema Exports
// ============================================

/**
 * JSON Schema for WorkNode config validation.
 */
export const WORK_NODE_CONFIG_JSON_SCHEMA = zodToJsonSchema(WorkNodeConfigSchema, {
  name: 'WorkNodeConfig',
  $refStrategy: 'none',
});

/**
 * JSON Schema for WorkNode data validation.
 */
export const WORK_NODE_DATA_JSON_SCHEMA = zodToJsonSchema(WorkNodeDataSchema, {
  name: 'WorkNodeData',
  $refStrategy: 'none',
});
