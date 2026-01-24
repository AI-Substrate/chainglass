/**
 * Workflow Components - Custom ReactFlow node components
 *
 * Exports node components and nodeTypes object for ReactFlow registration.
 * DYK-06: nodeTypes must be exported and passed to ReactFlow component.
 */

import type { NodeTypes } from '@xyflow/react';

import { AgentNode } from './agent-node';
import { PhaseNode } from './phase-node';
import { WorkflowNode } from './workflow-node';

// Re-export components
export { AgentNode } from './agent-node';
export { NodeDetailPanel } from './node-detail-panel';
export { PhaseNode } from './phase-node';
export { WorkflowContent } from './workflow-content';
export { WorkflowNode } from './workflow-node';

// Node types mapping for ReactFlow registration
// This object is passed to <ReactFlow nodeTypes={nodeTypes} />
export const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  agent: AgentNode,
};
