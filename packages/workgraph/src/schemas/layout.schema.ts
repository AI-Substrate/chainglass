/**
 * Layout Schema - Phase 1 (T013)
 *
 * Zod schema for layout.json files.
 *
 * Per High Impact Discovery 06: Layout persistence in separate file
 * Layout is stored separately from work-graph.yaml for:
 * - Clean git diffs (structure changes separate from layout changes)
 * - User-specific layouts (could be gitignored)
 * - Auto-arrange can reset layout without modifying definition
 *
 * Layout file location: <worktree>/.chainglass/data/work-graphs/<slug>/layout.json
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// Position Schema
// ============================================

/**
 * Node position in the graph canvas.
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type PositionType = z.infer<typeof PositionSchema>;

// ============================================
// Node Layout Schema
// ============================================

/**
 * Layout data for a single node.
 */
export const NodeLayoutSchema = z.object({
  /** Node position on canvas */
  position: PositionSchema,
  /** Optional: node dimensions if resizable */
  width: z.number().optional(),
  height: z.number().optional(),
  /** Optional: collapsed state for complex nodes */
  collapsed: z.boolean().optional(),
});

export type NodeLayoutType = z.infer<typeof NodeLayoutSchema>;

// ============================================
// Viewport Schema
// ============================================

/**
 * Canvas viewport state.
 */
export const ViewportSchema = z.object({
  /** Horizontal pan offset */
  x: z.number(),
  /** Vertical pan offset */
  y: z.number(),
  /** Zoom level (1.0 = 100%) */
  zoom: z.number().min(0.1).max(4.0),
});

export type ViewportType = z.infer<typeof ViewportSchema>;

// ============================================
// Layout File Schema
// ============================================

/**
 * Complete layout file schema.
 *
 * Versioned for future compatibility.
 */
export const LayoutSchema = z.object({
  /** Schema version for future migrations */
  version: z.literal('1.0.0'),

  /** Graph slug this layout belongs to */
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),

  /** Last modified timestamp */
  updatedAt: z.string().datetime(),

  /** Node layouts keyed by node ID */
  nodes: z.record(z.string(), NodeLayoutSchema),

  /** Canvas viewport state */
  viewport: ViewportSchema.optional(),
});

export type LayoutType = z.infer<typeof LayoutSchema>;

// ============================================
// Default Layout Factory
// ============================================

/**
 * Create a default layout for a graph.
 *
 * Per DYK#1: Uses vertical cascade positioning {x: 100, y: index * 150}
 *
 * @param graphSlug - Graph identifier
 * @param nodeIds - Node IDs to generate layout for
 * @returns Default layout
 */
export function createDefaultLayout(graphSlug: string, nodeIds: string[]): LayoutType {
  const nodes: Record<string, NodeLayoutType> = {};

  nodeIds.forEach((nodeId, index) => {
    nodes[nodeId] = {
      position: { x: 100, y: index * 150 },
    };
  });

  return {
    version: '1.0.0',
    graphSlug,
    updatedAt: new Date().toISOString(),
    nodes,
    viewport: { x: 0, y: 0, zoom: 1.0 },
  };
}

// ============================================
// JSON Schema Export
// ============================================

/**
 * JSON Schema for layout.json validation.
 *
 * Can be used with JSON Schema validators or IDE integration.
 */
export const LAYOUT_JSON_SCHEMA = zodToJsonSchema(LayoutSchema, {
  name: 'WorkGraphLayout',
  $refStrategy: 'none',
});
