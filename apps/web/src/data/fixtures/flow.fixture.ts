/**
 * Flow Fixtures - Demo data for ReactFlow workflow tests and UI
 *
 * Shared fixtures ensure tests and demo pages use identical data shapes,
 * catching type mismatches early (per CF-09).
 *
 * Uses ReactFlow types directly for compatibility with useReactFlow() wrapper.
 */

import type { Edge, Node } from '@xyflow/react';

/** Custom node data for workflow visualization */
export interface WorkflowNodeData {
  label: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  description?: string;
  [key: string]: unknown;
}

/** Type alias for workflow nodes with our custom data */
export type WorkflowNode = Node<WorkflowNodeData>;

/** Type alias for workflow edges */
export type WorkflowEdge = Edge;

/**
 * Demo flow with 5 nodes and 4 edges representing a simple CI/CD pipeline.
 * Used in tests and Phase 6 demo pages.
 *
 * DYK-06: Node types updated from 'default' to custom types:
 * - 'workflow' for standard workflow steps
 * - 'phase' for workflow phases
 * - 'agent' for AI agent nodes
 */
export const DEMO_FLOW: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } = {
  nodes: [
    {
      id: 'node-1',
      type: 'workflow',
      position: { x: 0, y: 0 },
      data: {
        label: 'Source Code',
        status: 'completed',
        description: 'Git repository checkout',
      },
    },
    {
      id: 'node-2',
      type: 'phase',
      position: { x: 200, y: 0 },
      data: {
        label: 'Build',
        status: 'completed',
        description: 'Compile and bundle application',
      },
    },
    {
      id: 'node-3',
      type: 'agent',
      position: { x: 400, y: -50 },
      data: {
        label: 'Unit Tests',
        status: 'running',
        description: 'Run test suite',
      },
    },
    {
      id: 'node-4',
      type: 'agent',
      position: { x: 400, y: 50 },
      data: {
        label: 'Lint',
        status: 'running',
        description: 'Check code style',
      },
    },
    {
      id: 'node-5',
      type: 'workflow',
      position: { x: 600, y: 0 },
      data: {
        label: 'Deploy',
        status: 'pending',
        description: 'Deploy to production',
      },
    },
  ],
  edges: [
    { id: 'edge-1-2', source: 'node-1', target: 'node-2' },
    { id: 'edge-2-3', source: 'node-2', target: 'node-3' },
    { id: 'edge-2-4', source: 'node-2', target: 'node-4' },
    { id: 'edge-3-5', source: 'node-3', target: 'node-5' },
  ],
};

/**
 * Empty flow for testing initial state scenarios.
 */
export const EMPTY_FLOW: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } = {
  nodes: [],
  edges: [],
};

/**
 * Single node flow for minimal testing scenarios.
 */
export const SINGLE_NODE_FLOW: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } = {
  nodes: [
    {
      id: 'solo-node',
      type: 'default',
      position: { x: 100, y: 100 },
      data: {
        label: 'Solo Step',
        status: 'pending',
      },
    },
  ],
  edges: [],
};
