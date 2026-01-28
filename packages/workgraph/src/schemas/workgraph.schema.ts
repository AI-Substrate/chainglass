/**
 * WorkGraph Zod Schema.
 *
 * Validates work-graph.yaml files.
 * Per workgraph-data-model.md: Graph structure with nodes and edges.
 * Per Insight 4: Uses Zod for TypeScript DX, exports JSON Schema via zod-to-json-schema.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// Edge Schema
// ============================================

/**
 * Graph edge schema.
 */
export const GraphEdgeSchema = z.object({
  from: z.string().min(1, 'from is required'),
  to: z.string().min(1, 'to is required'),
});

export type GraphEdgeType = z.infer<typeof GraphEdgeSchema>;

// ============================================
// WorkGraph Definition Schema
// ============================================

/**
 * WorkGraph definition schema (work-graph.yaml).
 */
export const WorkGraphDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (X.Y.Z)'),
  description: z.string().optional(),
  created_at: z.string().datetime({ message: 'created_at must be ISO datetime' }),
  nodes: z.array(z.string()).min(1, 'At least one node required'),
  edges: z.array(GraphEdgeSchema),
});

export type WorkGraphDefinitionType = z.infer<typeof WorkGraphDefinitionSchema>;

// ============================================
// WorkGraph State Schema
// ============================================

/**
 * Graph status values.
 */
export const GraphStatusSchema = z.enum(['pending', 'in_progress', 'complete', 'failed']);
export type GraphStatusType = z.infer<typeof GraphStatusSchema>;

/**
 * Node status values (stored only - pending/ready are computed).
 */
export const StoredNodeStatusSchema = z.enum([
  'running',
  'waiting-question',
  'blocked-error',
  'complete',
]);
export type StoredNodeStatusType = z.infer<typeof StoredNodeStatusSchema>;

/**
 * Node state schema.
 */
export const NodeStateSchema = z.object({
  status: StoredNodeStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

export type NodeStateType = z.infer<typeof NodeStateSchema>;

/**
 * WorkGraph state schema (state.json).
 */
export const WorkGraphStateSchema = z.object({
  graph_status: GraphStatusSchema,
  updated_at: z.string().datetime({ message: 'updated_at must be ISO datetime' }),
  nodes: z.record(z.string(), NodeStateSchema),
});

export type WorkGraphStateType = z.infer<typeof WorkGraphStateSchema>;

// ============================================
// JSON Schema Exports
// ============================================

/**
 * JSON Schema for WorkGraph definition validation.
 */
export const WORK_GRAPH_DEFINITION_JSON_SCHEMA = zodToJsonSchema(WorkGraphDefinitionSchema, {
  name: 'WorkGraphDefinition',
  $refStrategy: 'none',
});

/**
 * JSON Schema for WorkGraph state validation.
 */
export const WORK_GRAPH_STATE_JSON_SCHEMA = zodToJsonSchema(WorkGraphStateSchema, {
  name: 'WorkGraphState',
  $refStrategy: 'none',
});
