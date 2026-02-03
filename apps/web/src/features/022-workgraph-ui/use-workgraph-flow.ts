/**
 * useWorkGraphFlow Hook - Phase 2 (T002)
 *
 * Transforms serialized WorkGraph data into React Flow format.
 *
 * Per DYK#2: Accepts serialized JSON data {nodes, edges}, not IWorkGraphUIInstanceCore.
 * Phase 4 will evolve to accept IWorkGraphUIInstanceCore with live subscriptions.
 *
 * @module features/022-workgraph-ui/use-workgraph-flow
 */

import type { Edge, Node } from '@xyflow/react';
import { useMemo } from 'react';
import type { NodeStatus } from './workgraph-ui.types';

/**
 * Serializable port declaration for node inputs/outputs.
 * Subset of OutputDeclaration/InputDeclaration from @chainglass/workgraph.
 */
export interface NodePortDeclaration {
  /** Port name */
  name: string;
  /** Port type: data or file */
  type: 'data' | 'file';
  /** Data type (when type='data') */
  dataType?: 'text' | 'number' | 'boolean' | 'json';
}

/**
 * Serialized node data from API response.
 */
export interface WorkGraphFlowNode {
  /** Node identifier */
  id: string;
  /** Computed status */
  status: NodeStatus;
  /** Position for rendering */
  position: { x: number; y: number };
  /** Unit slug (undefined for start node) */
  unit?: string;
  /** Node type (only 'start' for start node) */
  type?: 'start';
  /** Unit type (agent, code, user-input) */
  unitType?: 'agent' | 'code' | 'user-input';
  /** Unit description */
  unitDescription?: string;
  /** Output port declarations from the unit */
  outputs?: NodePortDeclaration[];
  /** Input port declarations from the unit */
  inputs?: NodePortDeclaration[];
  /** Question ID if waiting-question status */
  questionId?: string;
  /** Error message if blocked-error status */
  errorMessage?: string;
}

/**
 * Serialized edge data from API response.
 */
export interface WorkGraphFlowEdge {
  /** Edge identifier */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
}

/**
 * Input data for the hook.
 */
export interface WorkGraphFlowData {
  nodes: WorkGraphFlowNode[];
  edges: WorkGraphFlowEdge[];
}

/**
 * Data passed to custom WorkGraphNode component.
 * Extends Record for React Flow compatibility.
 */
export interface WorkGraphNodeData extends Record<string, unknown> {
  id: string;
  status: NodeStatus;
  unit?: string;
  type?: 'start';
  unitType?: 'agent' | 'code' | 'user-input';
  unitDescription?: string;
  outputs?: NodePortDeclaration[];
  inputs?: NodePortDeclaration[];
  questionId?: string;
  errorMessage?: string;
}

/**
 * Output type for React Flow nodes.
 */
export type WorkGraphRFNode = Node<WorkGraphNodeData>;

/**
 * Output type for React Flow edges.
 */
export type WorkGraphRFEdge = Edge;

/**
 * Hook return type.
 */
export interface UseWorkGraphFlowResult {
  nodes: WorkGraphRFNode[];
  edges: WorkGraphRFEdge[];
}

/**
 * Transform serialized WorkGraph data into React Flow format.
 *
 * This hook memoizes the transformation to prevent unnecessary re-renders.
 * The output is stable (same reference) when input is unchanged.
 *
 * @param data - Serialized nodes and edges from API
 * @returns React Flow compatible nodes and edges
 *
 * @example
 * ```tsx
 * const { nodes, edges } = useWorkGraphFlow(apiData);
 * return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />;
 * ```
 */
export function useWorkGraphFlow(data: WorkGraphFlowData): UseWorkGraphFlowResult {
  // Transform nodes to React Flow format
  const nodes = useMemo<WorkGraphRFNode[]>(() => {
    return data.nodes.map((node) => ({
      id: node.id,
      type: 'workGraphNode', // Custom node type for WorkGraphNode component
      position: node.position,
      data: {
        id: node.id,
        status: node.status,
        unit: node.unit,
        type: node.type,
        unitType: node.unitType,
        unitDescription: node.unitDescription,
        outputs: node.outputs,
        inputs: node.inputs,
        questionId: node.questionId,
        errorMessage: node.errorMessage,
      },
    }));
  }, [data.nodes]);

  // Transform edges to React Flow format
  const edges = useMemo<WorkGraphRFEdge[]>(() => {
    return data.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'default',
    }));
  }, [data.edges]);

  return { nodes, edges };
}
