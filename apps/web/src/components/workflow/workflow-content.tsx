'use client';

/**
 * WorkflowContent - Client component wrapper for ReactFlow
 *
 * DYK-02: Page components are server components, but ReactFlow needs client.
 * This wrapper provides ReactFlowProvider context and handles state.
 *
 * Uses useFlowState hook from Phase 4 for state management.
 * T008: Integrates with SSE for real-time updates.
 */

import {
  Background,
  Controls,
  MiniMap,
  type OnNodesChange,
  ReactFlow,
  type ReactFlowProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FlowState } from '@/hooks/useFlowState';
import { useFlowState } from '@/hooks/useFlowState';
import { useSSE } from '@/hooks/useSSE';
import { type SSEEvent, sseEventSchema } from '@/lib/schemas/sse-events.schema';

import type { WorkflowNode as WorkflowNodeType } from '@/data/fixtures/flow.fixture';

import { AgentNode } from './agent-node';
import { NodeDetailPanel } from './node-detail-panel';
import { PhaseNode } from './phase-node';
import { WorkflowNode } from './workflow-node';

// Move nodeTypes outside component to prevent recreation on each render (FIX-006)
const NODE_TYPES = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  agent: AgentNode,
} as const;

export interface WorkflowContentProps {
  /** Initial flow state with nodes and edges */
  initialFlow: FlowState;
  /** Callback when a node is clicked */
  onNodeClick?: (node: WorkflowNodeType) => void;
  /** Additional ReactFlow props */
  reactFlowProps?: Partial<ReactFlowProps>;
  /** SSE channel to subscribe to (optional) */
  sseChannel?: string;
}

/**
 * WorkflowContent renders an interactive ReactFlow graph with custom nodes.
 *
 * @example
 * <WorkflowContent
 *   initialFlow={DEMO_FLOW}
 *   onNodeClick={(node) => setSelectedNode(node)}
 *   sseChannel="workflow-demo"
 * />
 */
export function WorkflowContent({
  initialFlow,
  onNodeClick,
  reactFlowProps,
  sseChannel,
}: WorkflowContentProps) {
  const { nodes, edges, updateNode, onNodesChange } = useFlowState(initialFlow);
  const [selectedNode, setSelectedNode] = useState<WorkflowNodeType | null>(null);

  // FIX-003: Validate sseChannel matches server-side pattern
  const validChannel = useMemo(() => {
    if (!sseChannel) return false;
    return /^[a-zA-Z0-9_-]+$/.test(sseChannel);
  }, [sseChannel]);

  if (sseChannel && !validChannel) {
    console.warn('WorkflowContent: Invalid sseChannel format:', sseChannel);
  }

  // SSE integration for real-time updates (with schema validation - FIX-002)
  const { messages, isConnected } = useSSE<SSEEvent>(
    validChannel ? `/api/events/${sseChannel}` : '',
    undefined,
    { autoConnect: validChannel, messageSchema: sseEventSchema }
  );

  // Process SSE messages to update workflow nodes
  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.type === 'workflow_status') {
      // Find node by workflowId and update its status
      const { workflowId, phase } = latestMessage.data;
      const statusMap: Record<string, 'pending' | 'running' | 'completed' | 'failed'> = {
        pending: 'pending',
        running: 'running',
        completed: 'completed',
        failed: 'failed',
      };
      updateNode(workflowId, {
        data: { status: statusMap[phase] ?? 'pending' },
      });
    }
  }, [messages, updateNode]);

  // FIX-006: Memoize handleNodeClick
  const handleNodeClick = useCallback<NonNullable<ReactFlowProps['onNodeClick']>>(
    (_event, node) => {
      const workflowNode = node as WorkflowNodeType;
      setSelectedNode(workflowNode);
      onNodeClick?.(workflowNode);
    },
    [onNodeClick]
  );

  // FIX-006: Memoize minimap color callbacks
  const nodeStrokeColor = useCallback((node: { type?: string }) => {
    if (node.type === 'workflow') return '#6366f1';
    if (node.type === 'phase') return '#a855f7';
    if (node.type === 'agent') return '#f59e0b';
    return '#999';
  }, []);

  const nodeColor = useCallback((node: { type?: string }) => {
    if (node.type === 'workflow') return '#e0e7ff';
    if (node.type === 'phase') return '#f3e8ff';
    if (node.type === 'agent') return '#fef3c7';
    return '#f5f5f5';
  }, []);

  return (
    <>
      {/* SSE status indicator */}
      {sseChannel && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-muted-foreground">
            {isConnected ? 'SSE Connected' : 'SSE Disconnected'}
          </span>
        </div>
      )}

      <div className="h-[500px] w-full rounded-lg border bg-background relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange as OnNodesChange}
          nodesDraggable
          fitView
          minZoom={0.1}
          maxZoom={2}
          {...reactFlowProps}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeStrokeColor={nodeStrokeColor}
            nodeColor={nodeColor}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </>
  );
}
