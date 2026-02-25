/**
 * Instance metadata schema for instance.yaml files.
 *
 * Each workflow instance has an instance.yaml that tracks:
 * - Which template it was created from
 * - When it was created
 * - Which work units were copied and when they were last refreshed
 *
 * Per ADR-0003: Zod schemas are source of truth; types derived via z.infer<>.
 * Per Workshop 001 §Instance Schema.
 */

import { z } from 'zod';

const slugPattern = /^[a-z][a-z0-9-]*$/;

/**
 * A unit entry within instance metadata — tracks one copied work unit
 * and its refresh history.
 */
export const InstanceUnitEntrySchema = z.object({
  /** Unit slug (directory name under instance's units/) */
  slug: z.string().regex(slugPattern),
  /** Where this unit was sourced from (template = workflow template's bundled units) */
  source: z.enum(['template']),
  /** ISO-8601 timestamp of last refresh from template */
  refreshed_at: z.string().datetime(),
});

export type InstanceUnitEntry = z.infer<typeof InstanceUnitEntrySchema>;

/**
 * Instance metadata — written to instance.yaml when an instance is created.
 * Updated when units are refreshed.
 */
export const InstanceMetadataSchema = z.object({
  /** Instance ID (user-provided kebab-case slug) */
  slug: z.string().regex(slugPattern),
  /** Slug of the workflow template this instance was created from */
  template_source: z.string().regex(slugPattern),
  /** ISO-8601 timestamp of instance creation */
  created_at: z.string().datetime(),
  /** Work units copied into this instance */
  units: z.array(InstanceUnitEntrySchema),
});

export type InstanceMetadata = z.infer<typeof InstanceMetadataSchema>;
