/**
 * WorkUnit Zod Schemas
 *
 * Schema definitions for validating work unit YAML files.
 * Per ADR-0003: These schemas are the source of truth for types.
 *
 * Design Notes (from DYK Session 2026-02-04):
 * - DYK #1: data_type is optional at schema level, enforced via refine when type='data'
 * - DYK #2: This file is the source of truth; types derive from these schemas
 * - DYK #4: formatZodErrors transforms Zod issues to actionable messages
 *
 * @packageDocumentation
 */

import { type ZodError, z } from 'zod';

// ============================================
// Primitives
// ============================================

/**
 * Slug must start with a letter, contain only lowercase letters, numbers, and hyphens.
 * Note: User-defined input names use underscores (not hyphens) per reserved param design.
 */
export const SlugSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*$/,
    'Slug must start with a letter and contain only lowercase letters, numbers, and hyphens'
  );

/**
 * Input/output type discriminator.
 */
export const IOTypeSchema = z.enum(['data', 'file']);

/**
 * Data type for data inputs/outputs.
 */
export const DataTypeSchema = z.enum(['text', 'number', 'boolean', 'json']);

/**
 * Input name must be lowercase with underscores, starting with a letter.
 * This ensures no collision with reserved params (which use hyphens).
 */
export const InputNameSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Name must start with a letter and contain only lowercase letters, numbers, and underscores'
  );

// ============================================
// Input/Output Declarations
// ============================================

/**
 * Schema for work unit input declarations.
 *
 * Per DYK #1: data_type is optional at schema level but enforced via refine
 * when type='data' to maintain compatibility with NarrowWorkUnitInput.
 */
export const WorkUnitInputSchema = z
  .object({
    name: InputNameSchema,
    type: IOTypeSchema,
    data_type: DataTypeSchema.optional(),
    required: z.boolean(),
    description: z.string().optional(),
  })
  .refine((data) => data.type !== 'data' || data.data_type !== undefined, {
    message: "data_type is required when type is 'data'",
    path: ['data_type'],
  });

/**
 * Schema for work unit output declarations.
 * Same validation rules as inputs.
 */
export const WorkUnitOutputSchema = z
  .object({
    name: InputNameSchema,
    type: IOTypeSchema,
    data_type: DataTypeSchema.optional(),
    required: z.boolean(),
    description: z.string().optional(),
  })
  .refine((data) => data.type !== 'data' || data.data_type !== undefined, {
    message: "data_type is required when type is 'data'",
    path: ['data_type'],
  });

// ============================================
// Type-Specific Configs
// ============================================

/**
 * Agent configuration for agentic work units.
 */
export const AgentConfigSchema = z.object({
  prompt_template: z.string().min(1, 'prompt_template cannot be empty'),
  system_prompt: z.string().optional(),
  supported_agents: z.array(z.enum(['claude-code', 'copilot'])).optional(),
  estimated_tokens: z.number().int().min(0).optional(),
});

/**
 * Code configuration for code-based work units.
 */
export const CodeConfigSchema = z.object({
  script: z.string().min(1, 'script path cannot be empty'),
  timeout: z.number().int().min(1).max(3600).optional(),
});

/**
 * Option for single/multi choice questions.
 */
export const UserInputOptionSchema = z.object({
  key: z.string().min(1, 'option key cannot be empty'),
  label: z.string().min(1, 'option label cannot be empty'),
  description: z.string().optional(),
});

/**
 * User input configuration with conditional validation.
 * Options are required for single/multi question types.
 */
export const UserInputConfigSchema = z
  .object({
    question_type: z.enum(['text', 'single', 'multi', 'confirm']),
    prompt: z.string().min(1, 'prompt cannot be empty'),
    options: z.array(UserInputOptionSchema).min(2).optional(),
    default: z.union([z.string(), z.boolean()]).optional(),
  })
  .refine(
    (data) => {
      // Options required for single/multi, minimum 2
      if (data.question_type === 'single' || data.question_type === 'multi') {
        return data.options !== undefined && data.options.length >= 2;
      }
      return true;
    },
    {
      message: 'options with at least 2 items required for single/multi question types',
      path: ['options'],
    }
  );

// ============================================
// Work Unit Schemas (Discriminated Union)
// ============================================

/**
 * Common fields shared by all work unit types.
 */
const WorkUnitBaseSchema = z.object({
  slug: SlugSchema,
  version: z.string().min(1, 'version cannot be empty'),
  description: z.string().optional(),
  inputs: z.array(WorkUnitInputSchema).default([]),
  outputs: z.array(WorkUnitOutputSchema).min(1, 'at least one output is required'),
});

/**
 * Schema for agentic work units.
 */
export const AgenticWorkUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('agent'),
  agent: AgentConfigSchema,
});

/**
 * Schema for code-based work units.
 */
export const CodeUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('code'),
  code: CodeConfigSchema,
});

/**
 * Schema for user input work units.
 */
export const UserInputUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('user-input'),
  user_input: UserInputConfigSchema,
});

/**
 * Discriminated union schema for all work unit types.
 * Discriminates on the `type` field.
 */
export const WorkUnitSchema = z.discriminatedUnion('type', [
  AgenticWorkUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
]);

// ============================================
// Type Exports (derived from schemas per ADR-0003)
// ============================================

export type WorkUnit = z.infer<typeof WorkUnitSchema>;
export type AgenticWorkUnit = z.infer<typeof AgenticWorkUnitSchema>;
export type CodeUnit = z.infer<typeof CodeUnitSchema>;
export type UserInputUnit = z.infer<typeof UserInputUnitSchema>;
export type WorkUnitInput = z.infer<typeof WorkUnitInputSchema>;
export type WorkUnitOutput = z.infer<typeof WorkUnitOutputSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CodeConfig = z.infer<typeof CodeConfigSchema>;
export type UserInputConfig = z.infer<typeof UserInputConfigSchema>;
export type UserInputOption = z.infer<typeof UserInputOptionSchema>;

// ============================================
// Error Formatting Helper (per DYK #4)
// ============================================

/**
 * Transform Zod validation errors into actionable, user-friendly messages.
 *
 * Per DYK #4: Zod's default error messages are developer-hostile.
 * This helper creates human-readable messages for E182 errors.
 *
 * @param error - The ZodError from safeParse failure
 * @param slug - The unit slug for context in error messages
 * @returns Array of human-readable error strings
 */
export function formatZodErrors(error: ZodError, slug: string): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';

    // Provide more specific messages for common issues
    switch (issue.code) {
      case 'invalid_union_discriminator':
        return `Invalid unit type for '${slug}': type must be 'agent', 'code', or 'user-input'`;

      case 'invalid_type':
        return `Invalid value at '${path}' in '${slug}': expected ${issue.expected}, got ${issue.received}`;

      case 'invalid_string':
        if (issue.validation === 'regex') {
          return `Invalid format at '${path}' in '${slug}': ${issue.message}`;
        }
        return `Invalid string at '${path}' in '${slug}': ${issue.message}`;

      case 'too_small':
        if (issue.type === 'array') {
          return `Array at '${path}' in '${slug}' is too short: minimum ${issue.minimum} items required`;
        }
        if (issue.type === 'string') {
          return `String at '${path}' in '${slug}' is too short: minimum ${issue.minimum} characters required`;
        }
        return `Value at '${path}' in '${slug}' is too small: ${issue.message}`;

      case 'custom':
        return `Validation failed at '${path}' in '${slug}': ${issue.message}`;

      default:
        return `Error at '${path}' in '${slug}': ${issue.message}`;
    }
  });
}
