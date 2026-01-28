/**
 * WorkUnit Zod Schema.
 *
 * Validates unit.yaml files for AgentUnit, CodeUnit, and UserInputUnit.
 * Per Insight 4: Uses Zod for TypeScript DX, exports JSON Schema via zod-to-json-schema.
 * Per workunit-data-model.md: Discriminated union on type field.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// Shared Schemas
// ============================================

/**
 * IO type: data or file.
 */
export const IOTypeSchema = z.enum(['data', 'file']);
export type IOType = z.infer<typeof IOTypeSchema>;

/**
 * Data type for data I/O.
 */
export const DataTypeSchema = z.enum(['text', 'number', 'boolean', 'json']);
export type DataType = z.infer<typeof DataTypeSchema>;

/**
 * Input/Output declaration schema.
 * data_type is required when type='data'.
 */
export const IODeclarationSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Name must be lowercase with underscores'),
    type: IOTypeSchema,
    data_type: DataTypeSchema.optional(),
    required: z.boolean(),
    description: z.string().optional(),
  })
  .refine(
    (data) => {
      // data_type required when type='data'
      if (data.type === 'data') {
        return data.data_type !== undefined;
      }
      return true;
    },
    {
      message: "data_type is required when type is 'data'",
      path: ['data_type'],
    }
  );

export type IODeclaration = z.infer<typeof IODeclarationSchema>;

// ============================================
// Agent Unit Schemas
// ============================================

/**
 * Agent configuration schema.
 */
export const AgentConfigSchema = z.object({
  prompt_template: z.string().min(1, 'prompt_template is required'),
  system_prompt: z.string().optional(),
  supported_agents: z.array(z.enum(['claude-code', 'copilot'])).optional(),
  estimated_tokens: z.number().int().min(0).optional(),
});

export type AgentConfigType = z.infer<typeof AgentConfigSchema>;

// ============================================
// Code Unit Schemas
// ============================================

/**
 * Code configuration schema.
 */
export const CodeConfigSchema = z.object({
  timeout: z.number().int().min(1).max(3600).default(60).optional(),
});

export type CodeConfigType = z.infer<typeof CodeConfigSchema>;

// ============================================
// User Input Unit Schemas
// ============================================

/**
 * User input option schema.
 */
export const UserInputOptionSchema = z.object({
  key: z.string().regex(/^[A-Z]$/, 'Key must be a single uppercase letter'),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
});

export type UserInputOptionType = z.infer<typeof UserInputOptionSchema>;

/**
 * User input configuration schema.
 */
export const UserInputConfigSchema = z
  .object({
    question_type: z.enum(['text', 'single', 'multi', 'confirm']),
    prompt: z.string().min(1, 'Prompt is required'),
    options: z
      .union([
        z.array(UserInputOptionSchema).min(2),
        z.string().regex(/^\{\{config\./, 'Must be a config placeholder'),
      ])
      .optional(),
  })
  .refine(
    (data) => {
      // options required for single/multi
      if (data.question_type === 'single' || data.question_type === 'multi') {
        return data.options !== undefined;
      }
      return true;
    },
    {
      message: "options is required when question_type is 'single' or 'multi'",
      path: ['options'],
    }
  );

export type UserInputConfigType = z.infer<typeof UserInputConfigSchema>;

// ============================================
// Base WorkUnit Schema
// ============================================

/**
 * Base fields shared by all unit types.
 */
const WorkUnitBaseSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (X.Y.Z)'),
  description: z.string().optional(),
  inputs: z.array(IODeclarationSchema).default([]),
  outputs: z.array(IODeclarationSchema).min(1, 'At least one output required'),
});

// ============================================
// Discriminated Union
// ============================================

/**
 * AgentUnit schema.
 */
export const AgentUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('agent'),
  agent: AgentConfigSchema,
  code: z.undefined().optional(),
  user_input: z.undefined().optional(),
});

export type AgentUnitType = z.infer<typeof AgentUnitSchema>;

/**
 * CodeUnit schema.
 */
export const CodeUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('code'),
  code: CodeConfigSchema.optional(),
  agent: z.undefined().optional(),
  user_input: z.undefined().optional(),
});

export type CodeUnitType = z.infer<typeof CodeUnitSchema>;

/**
 * UserInputUnit schema.
 */
export const UserInputUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('user-input'),
  user_input: UserInputConfigSchema,
  agent: z.undefined().optional(),
  code: z.undefined().optional(),
});

export type UserInputUnitType = z.infer<typeof UserInputUnitSchema>;

/**
 * Complete WorkUnit schema (discriminated union).
 */
export const WorkUnitSchema = z.discriminatedUnion('type', [
  AgentUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
]);

export type WorkUnitType = z.infer<typeof WorkUnitSchema>;

// ============================================
// JSON Schema Export
// ============================================

/**
 * JSON Schema for WorkUnit validation.
 * Used for CLI validation and external tools.
 */
export const WORK_UNIT_JSON_SCHEMA = zodToJsonSchema(WorkUnitSchema, {
  name: 'WorkUnit',
  $refStrategy: 'none',
});
