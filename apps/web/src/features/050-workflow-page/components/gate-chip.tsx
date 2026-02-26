'use client';

/**
 * GateChip — Shows which readiness gate is blocking a node.
 *
 * Single chip on the card showing first blocking gate.
 * Click to expand inline list of all 5 gates with pass/fail status.
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';
import { useState } from 'react';

interface GateStatus {
  name: string;
  passing: boolean;
  color: string;
  message: string;
}

function computeGates(node: NodeStatusResult): GateStatus[] {
  const d = node.readyDetail;
  return [
    {
      name: 'Preceding Lines',
      passing: d.precedingLinesComplete,
      color: 'text-red-500',
      message: d.precedingLinesComplete ? 'Complete' : 'Earlier lines incomplete',
    },
    {
      name: 'Transition',
      passing: d.transitionOpen,
      color: 'text-amber-500',
      message: d.transitionOpen ? 'Open' : 'Awaiting manual transition',
    },
    {
      name: 'Serial Neighbor',
      passing: d.serialNeighborComplete,
      color: 'text-orange-500',
      message: d.serialNeighborComplete ? 'Complete' : 'Left neighbor not done',
    },
    {
      name: 'Context Source',
      passing: d.contextFromReady !== false,
      color: 'text-blue-500',
      message: d.contextFromReady !== false ? 'Ready' : 'Context source not ready',
    },
    {
      name: 'Inputs',
      passing: d.inputsAvailable,
      color: 'text-violet-500',
      message: d.inputsAvailable ? 'Available' : 'Inputs not resolved',
    },
  ];
}

export interface GateChipProps {
  node: NodeStatusResult;
}

export function GateChip({ node }: GateChipProps) {
  const [expanded, setExpanded] = useState(false);

  // Only show for pending/blocked nodes (not running or complete)
  if (
    node.ready ||
    node.status === 'complete' ||
    node.status === 'agent-accepted' ||
    node.status === 'starting'
  ) {
    return null;
  }

  const gates = computeGates(node);
  const firstBlocking = gates.find((g) => !g.passing);
  if (!firstBlocking) return null;

  return (
    <div data-testid={`gate-chip-${node.nodeId}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className={`text-xs px-1.5 py-0.5 rounded ${firstBlocking.color} bg-current/10 flex items-center gap-1`}
      >
        <span className={firstBlocking.color}>⛔</span>
        <span className="text-foreground">{firstBlocking.message}</span>
        <span className="text-muted-foreground">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div
          className="mt-1 text-xs border rounded p-2 space-y-1 bg-background"
          data-testid={`gate-list-${node.nodeId}`}
        >
          {gates.map((gate) => (
            <div key={gate.name} className="flex items-center gap-1.5">
              <span>{gate.passing ? '✅' : '⛔'}</span>
              <span className={gate.passing ? 'text-muted-foreground' : gate.color}>
                {gate.name}: {gate.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { computeGates };
