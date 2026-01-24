/**
 * WorkflowMetadata Zod schema.
 *
 * Per Phase 1 T006: Schema for workflow.json metadata files.
 * Contains 7 fields per spec: slug, name, description, created_at, updated_at, tags[], author
 *
 * This schema follows the SampleConfigSchema pattern.
 */

import { z } from 'zod';

/**
 * Slug validation pattern: lowercase letters, digits, hyphens.
 * Must start with a letter.
 */
const slugPattern = /^[a-z][a-z0-9-]*$/;

/**
 * WorkflowMetadata Zod schema.
 *
 * Fields:
 * - slug: workflow identifier (required, validated pattern)
 * - name: human-readable name (required)
 * - description: workflow description (optional)
 * - created_at: ISO8601 timestamp when workflow was created (required)
 * - updated_at: ISO8601 timestamp of last update (optional)
 * - tags: array of string tags for categorization (optional, defaults to [])
 * - author: workflow author name (optional)
 */
export const WorkflowMetadataSchema = z.object({
  slug: z
    .string()
    .regex(slugPattern, 'Slug must start with a letter and contain only lowercase letters, digits, and hyphens'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }).optional(),
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),
});

/**
 * Derived TypeScript type from the Zod schema.
 * Single source of truth - no separate interface definition.
 */
export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;
