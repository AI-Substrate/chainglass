'use client';

/**
 * WorkflowFlowContent - Unified data flow graph for workflows
 *
 * Renders the same visualization for both workflow templates and runs.
 * A run is just a workflow with execution state - same structure, different data.
 *
 * Layout:
 * - Commands (prompts) - amber, on the LEFT of each phase
 * - External inputs - colored by author, on the RIGHT of each phase
 * - Phase node - centered, shows status badge if running
 * - Outputs - below the phase, linked to next phase if consumed
 *
 * Color scheme:
 * - Amber: Workflow template files (main.md prompts)
 * - Purple: User-provided inputs (request.md)
 * - Cyan: Agent-generated outputs (response.md)
 *
 * @see Plan 010: Entity Upgrade - Unified Workflow/Run model
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
import { Handle, Position } from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArtifactNode, type ArtifactNodeData } from '@/components/workflow/artifact-node';
import { CommandNode, type CommandNodeData } from '@/components/workflow/command-node';
import type { PhaseJSON, PhaseRunStatus } from '@/data/fixtures/workflows.fixture';
import { cn } from '@/lib/utils';

// ============ Types ============

export interface WorkflowFlowContentProps {
  /** Phases to display */
  phases: PhaseJSON[];
  /** Callback when a node is clicked (for showing details panel) */
  onNodeClick?: (node: Node) => void;
  /** Additional class names for the container */
  className?: string;
}

// ============ Phase Node ============

interface PhaseNodeData {
  label: string;
  description?: string;
  facilitator: string;
  order: number;
  status: PhaseRunStatus | 'defined';
  hasQuestion?: boolean;
  inputCount: number;
  outputCount: number;
  [key: string]: unknown;
}

type PhaseNode = Node<PhaseNodeData, 'workflow-phase'>;

const facilitatorIcons: Record<string, string> = {
  agent: '🤖',
  orchestrator: '👤',
};

function PhaseNodeComponent({
  data,
  selected,
}: {
  data: PhaseNodeData;
  selected?: boolean;
}) {
  const isRunning = data.status === 'active';
  const isBlocked = data.status === 'blocked';
  const isComplete = data.status === 'complete' || data.status === 'accepted';
  const isFailed = data.status === 'failed';
  const isTemplate = data.status === 'defined';

  return (
    <Card
      className={cn(
        'min-w-[200px] max-w-[280px] border-2',
        'bg-slate-50 dark:bg-slate-900/50',
        // Status-based border colors
        isTemplate && 'border-slate-300 dark:border-slate-600',
        isRunning && 'border-blue-400 dark:border-blue-500',
        isBlocked && 'border-orange-400 dark:border-orange-500',
        isComplete && 'border-green-400 dark:border-green-500',
        isFailed && 'border-red-400 dark:border-red-500',
        !isTemplate &&
          !isRunning &&
          !isBlocked &&
          !isComplete &&
          !isFailed &&
          'border-slate-300 dark:border-slate-600',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {facilitatorIcons[data.facilitator] ?? '🤖'}
            </span>
            {data.label}
          </div>
          {!isTemplate && <StatusBadge status={data.status as PhaseRunStatus} size="sm" />}
        </CardTitle>
      </CardHeader>
      {(data.description || data.hasQuestion) && (
        <CardContent className="p-3 pt-0">
          {data.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{data.description}</p>
          )}
          {data.hasQuestion && (
            <div className="mt-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
              ⚠️ Awaiting input
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const PhaseNodeMemo = memo(function PhaseNodeWrapper(props: {
  data: PhaseNodeData;
  selected?: boolean;
}) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background"
      />
      <PhaseNodeComponent {...props} />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background"
      />
    </>
  );
});

// ============ Layout Configuration ============

const PHASE_WIDTH = 220;
const PHASE_HEIGHT = 120;
const ARTIFACT_WIDTH = 130;
const ARTIFACT_HEIGHT = 36;
const COMMAND_WIDTH = 130;
const COMMAND_HEIGHT = 36;
const VERTICAL_GAP = 80;
const HORIZONTAL_GAP = 60;

/**
 * Build nodes and edges for the workflow data flow graph.
 * Works for both templates (status='defined') and runs (actual status).
 */
function buildFlowGraph(phases: PhaseJSON[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  let currentY = 0;

  for (const [phaseIndex, phase] of sortedPhases.entries()) {
    const phaseId = `phase-${phase.name}`;
    const inputs = phase.inputs ?? [];
    const outputs = phase.outputs ?? [];
    const commands = phase.commands ?? [];
    const prevPhase = phaseIndex > 0 ? sortedPhases[phaseIndex - 1] : null;
    const prevOutputs = prevPhase?.outputs ?? [];
    const prevOutputNames = new Set(prevOutputs.map((o) => o.name));

    // Split inputs: external (new) vs linked (from previous phase)
    const externalInputs = inputs.filter((i) => !prevOutputNames.has(i.name));

    // Place commands and external inputs above this phase (side by side)
    const hasCommands = commands.length > 0;
    const hasExternalInputs = externalInputs.length > 0;

    if (hasCommands || hasExternalInputs) {
      // Commands go on the LEFT, inputs go on the RIGHT
      if (hasCommands) {
        const commandStartX = -(
          PHASE_WIDTH / 2 +
          HORIZONTAL_GAP +
          (commands.length - 1) * (COMMAND_WIDTH + 20)
        );
        for (const [idx, cmd] of commands.entries()) {
          const commandId = `command-${phase.name}-${cmd.name}`;
          nodes.push({
            id: commandId,
            type: 'command',
            position: {
              x: commandStartX + idx * (COMMAND_WIDTH + 20),
              y: currentY,
            },
            data: {
              ...cmd,
              phaseId: phase.name,
            } as CommandNodeData,
          });

          edges.push({
            id: `${commandId}-to-${phaseId}`,
            source: commandId,
            target: phaseId,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2 },
          });
        }
      }

      if (hasExternalInputs) {
        const inputStartX = PHASE_WIDTH / 2 + HORIZONTAL_GAP;
        for (const [idx, input] of externalInputs.entries()) {
          const artifactId = `artifact-${phase.name}-input-${input.name}`;
          nodes.push({
            id: artifactId,
            type: 'artifact',
            position: {
              x: inputStartX + idx * (ARTIFACT_WIDTH + 20),
              y: currentY,
            },
            data: {
              ...input,
              phaseId: phase.name,
              direction: 'input',
            } as ArtifactNodeData,
          });

          edges.push({
            id: `${artifactId}-to-${phaseId}`,
            source: artifactId,
            target: phaseId,
            type: 'smoothstep',
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          });
        }
      }

      currentY += Math.max(ARTIFACT_HEIGHT, COMMAND_HEIGHT) + VERTICAL_GAP;
    }

    // Place the phase
    const phaseY = currentY;
    const isActive = phase.status === 'active';

    nodes.push({
      id: phaseId,
      type: 'workflow-phase',
      position: { x: -PHASE_WIDTH / 2, y: phaseY },
      data: {
        label: phase.name,
        description: phase.description,
        facilitator: phase.facilitator,
        order: phase.order,
        status: phase.status,
        hasQuestion: !!phase.question,
        inputCount: inputs.length,
        outputCount: outputs.length,
      } as PhaseNodeData,
    });
    currentY += PHASE_HEIGHT + VERTICAL_GAP;

    // Place outputs below this phase
    if (outputs.length > 0) {
      const outputStartX = (-(outputs.length - 1) * (ARTIFACT_WIDTH + HORIZONTAL_GAP)) / 2;
      for (const [idx, output] of outputs.entries()) {
        const artifactId = `artifact-${phase.name}-output-${output.name}`;
        nodes.push({
          id: artifactId,
          type: 'artifact',
          position: {
            x: outputStartX + idx * (ARTIFACT_WIDTH + HORIZONTAL_GAP),
            y: currentY,
          },
          data: {
            ...output,
            phaseId: phase.name,
            direction: 'output',
          } as ArtifactNodeData,
        });

        // Edge from phase to output
        edges.push({
          id: `${phaseId}-to-${artifactId}`,
          source: phaseId,
          target: artifactId,
          type: 'smoothstep',
          animated: isActive,
          style: { stroke: '#10b981', strokeWidth: 2 },
        });

        // Check if next phase consumes this output
        const nextPhase =
          phaseIndex < sortedPhases.length - 1 ? sortedPhases[phaseIndex + 1] : null;
        if (nextPhase) {
          const nextInputs = nextPhase.inputs ?? [];
          const matchingInput = nextInputs.find((i) => i.name === output.name);
          if (matchingInput) {
            edges.push({
              id: `${artifactId}-to-phase-${nextPhase.name}`,
              source: artifactId,
              target: `phase-${nextPhase.name}`,
              type: 'smoothstep',
              style: { stroke: '#3b82f6', strokeWidth: 2 },
            });
          }
        }
      }
      currentY += ARTIFACT_HEIGHT + VERTICAL_GAP;
    }
  }

  return { nodes, edges };
}

// ============ Node Types ============

const nodeTypes = {
  'workflow-phase': PhaseNodeMemo,
  artifact: ArtifactNode,
  command: CommandNode,
};

// ============ Inner Component with ReactFlow hooks ============

function WorkflowFlowContentInner({ phases, onNodeClick, className }: WorkflowFlowContentProps) {
  const { fitView } = useReactFlow();
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const prevPhasesLength = useRef(phases.length);

  // Build graph from phases
  const { nodes, edges } = useMemo(() => buildFlowGraph(phases), [phases]);

  // Fit view after layout
  useEffect(() => {
    if (nodes.length > 0 && !isLayoutReady) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 200 });
        setIsLayoutReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView, isLayoutReady]);

  // Re-fit when phases change
  useEffect(() => {
    if (prevPhasesLength.current !== phases.length) {
      setIsLayoutReady(false);
      prevPhasesLength.current = phases.length;
    }
  });

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node);
      }
    },
    [onNodeClick]
  );

  return (
    <div className={`h-full w-full min-h-[500px] ${className ?? ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
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
 * WorkflowFlowContent displays a workflow as a data flow graph.
 * Works for both templates (phases with status='defined') and runs (actual execution status).
 *
 * @example
 * // Template view - phases show as 'defined'
 * <WorkflowFlowContent phases={workflow.phases} onNodeClick={handleClick} />
 *
 * // Run view - phases show actual status (active/blocked/complete)
 * <WorkflowFlowContent phases={run.phases} onNodeClick={handleClick} />
 */
export function WorkflowFlowContent(props: WorkflowFlowContentProps) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowContentInner {...props} />
    </ReactFlowProvider>
  );
}
