/**
 * Template directory validation schemas.
 *
 * A workflow template is saved from a working graph instance.
 * It contains: graph.yaml (topology), nodes/\/node.yaml (wiring),
 * and units/ (self-contained work unit directories).
 *
 * These schemas validate the manifest structure — NOT the graph content
 * itself (that's validated by PositionalGraphDefinitionSchema).
 *
 * Per ADR-0003: Zod schemas are source of truth; types derived via z.infer<>.
 * Per Workshop 002: Templates reuse existing graph.yaml + node.yaml format.
 */

import { z } from 'zod';

const slugPattern = /^[a-z][a-z0-9-]*$/;

/**
 * A node entry within the template manifest — describes one node's
 * unit reference as extracted from its node.yaml file.
 */
export const TemplateNodeEntrySchema = z.object({
  /** Node ID (e.g., "spec-writer-c3d") — preserved from original graph */
  nodeId: z.string().min(1),
  /** Work unit slug this node references */
  unitSlug: z.string().regex(slugPattern),
});

export type TemplateNodeEntry = z.infer<typeof TemplateNodeEntrySchema>;

/**
 * A unit entry within the template manifest — describes one bundled
 * work unit directory.
 */
export const TemplateUnitEntrySchema = z.object({
  /** Unit slug (directory name under units/) */
  slug: z.string().regex(slugPattern),
  /** Unit type from unit.yaml */
  type: z.enum(['agent', 'code', 'user-input']),
});

export type TemplateUnitEntry = z.infer<typeof TemplateUnitEntrySchema>;

/**
 * Template manifest — the validated summary of a template directory's contents.
 * Built by scanning the template directory, not authored by hand.
 */
export const TemplateManifestSchema = z.object({
  /** Template slug (directory name) */
  slug: z.string().regex(slugPattern),
  /** Graph slug from graph.yaml */
  graphSlug: z.string().regex(slugPattern),
  /** Graph version from graph.yaml */
  graphVersion: z.string().optional(),
  /** Graph description from graph.yaml */
  description: z.string().optional(),
  /** Number of lines in the graph */
  lineCount: z.number().int().nonnegative(),
  /** Nodes in the graph, with their unit references */
  nodes: z.array(TemplateNodeEntrySchema),
  /** Bundled work units */
  units: z.array(TemplateUnitEntrySchema),
  /** Created timestamp (when template was saved) */
  created_at: z.string().datetime().optional(),
});

export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
