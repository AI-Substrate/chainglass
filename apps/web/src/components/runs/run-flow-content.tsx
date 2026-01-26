'use client';

/**
 * RunFlowContent - Vertical ReactFlow layout for run execution views
 *
 * Displays workflow phases in a top-to-bottom layout using Dagre auto-layout.
 * Designed for both run execution views and template inspection.
 *
 * Key features:
 * - Vertical (TB) layout with Dagre auto-positioning
 * - Smoothstep edges for clear flow direction
 * - Phase selection for detail panel
 * - Responsive container sizing
 *
 * @see Plan 011: UI Mockups
 */

import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  VERTICAL_NODE_TYPES,
  type VerticalPhaseNodeData,
} from '@/components/workflow/vertical-phase-node';
import type { PhaseJSON } from '@/data/fixtures/workflows.fixture';

// ============ Types ============

export interface RunFlowContentProps {
  /** Phases to display */
  phases: PhaseJSON[];
  /** Callback when a phase node is selected */
  onPhaseSelect?: (phase: PhaseJSON | null) => void;
  /** Currently selected phase name */
  selectedPhase?: string | null;
  /** Whether this is a template view (no run status) */
  isTemplate?: boolean;
  /** Additional class names for the container */
  className?: string;
}

// ============ Layout Configuration ============

const NODE_WIDTH = 250;
const NODE_HEIGHT = 100;
const NODE_SPACING_Y = 40;

/**
 * Convert phases to ReactFlow nodes
 */
function phasesToNodes(phases: PhaseJSON[]): Node<VerticalPhaseNodeData>[] {
  return phases.map((phase) => ({
    id: phase.name,
    type: 'vertical-phase',
    position: { x: 0, y: 0 }, // Will be set by Dagre
    data: {
      label: phase.name,
      description: phase.description,
      status: phase.status,
      facilitator: phase.facilitator,
      hasQuestion: !!phase.question,
      order: phase.order,
    },
  }));
}

/**
 * Create edges between consecutive phases
 */
function phasesToEdges(phases: PhaseJSON[]): Edge[] {
  const edges: Edge[] = [];
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sortedPhases.length - 1; i++) {
    const source = sortedPhases[i];
    const target = sortedPhases[i + 1];

    edges.push({
      id: `${source.name}-${target.name}`,
      source: source.name,
      target: target.name,
      type: 'smoothstep',
      animated: source.status === 'active',
      style: {
        strokeWidth: 2,
        stroke: source.status === 'active' ? '#3b82f6' : undefined,
      },
    });
  }

  return edges;
}

/**
 * Apply Dagre layout to nodes (top-to-bottom)
 */
function applyDagreLayout(
  nodes: Node<VerticalPhaseNodeData>[],
  edges: Edge[]
): Node<VerticalPhaseNodeData>[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: 50,
    ranksep: NODE_SPACING_Y,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes to graph
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges to graph
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run layout algorithm
  Dagre.layout(g);

  // Apply positions to nodes (center the node on Dagre's position)
  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ============ Inner Component with ReactFlow hooks ============

function RunFlowContentInner({
  phases,
  onPhaseSelect,
  selectedPhase,
  isTemplate = false,
  className,
}: RunFlowContentProps) {
  const { fitView } = useReactFlow();
  const [isLayoutReady, setIsLayoutReady] = useState(false);

  // Convert phases to nodes and edges with memoization
  const initialNodes = useMemo(() => phasesToNodes(phases), [phases]);
  const edges = useMemo(() => phasesToEdges(phases), [phases]);

  // Apply layout
  const nodes = useMemo(() => {
    const layoutedNodes = applyDagreLayout(initialNodes, edges);
    return layoutedNodes;
  }, [initialNodes, edges]);

  // Fit view after layout is ready
  useEffect(() => {
    if (nodes.length > 0 && !isLayoutReady) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
        setIsLayoutReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView, isLayoutReady]);

  // Re-fit when phases change
  useEffect(() => {
    setIsLayoutReady(false);
  }, [phases]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!onPhaseSelect) return;
      const phase = phases.find((p) => p.name === node.id);
      onPhaseSelect(phase ?? null);
    },
    [phases, onPhaseSelect]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    if (onPhaseSelect) {
      onPhaseSelect(null);
    }
  }, [onPhaseSelect]);

  return (
    <div className={`h-full w-full min-h-[400px] ${className ?? ''}`}>
      <ReactFlow
        nodes={nodes.map((n) => ({
          ...n,
          selected: n.id === selectedPhase,
        }))}
        edges={edges}
        nodeTypes={VERTICAL_NODE_TYPES}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}

// ============ Exported Component with Provider ============

/**
 * RunFlowContent displays workflow phases in a vertical ReactFlow layout.
 *
 * @example
 * // Run execution view
 * <RunFlowContent
 *   phases={run.phases}
 *   onPhaseSelect={setSelectedPhase}
 *   selectedPhase={selectedPhase?.name}
 * />
 *
 * // Template inspection view
 * <RunFlowContent
 *   phases={workflow.phases}
 *   isTemplate
 * />
 */
export function RunFlowContent(props: RunFlowContentProps) {
  return (
    <ReactFlowProvider>
      <RunFlowContentInner {...props} />
    </ReactFlowProvider>
  );
}
