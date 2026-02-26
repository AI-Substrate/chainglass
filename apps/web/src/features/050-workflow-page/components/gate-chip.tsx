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
    <div data-testid={`gate-chip-${node.nodeId}`} className="mt-3">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="text-xs px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 flex items-center gap-1.5 hover:bg-red-100/80 dark:hover:bg-red-900/40 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        <span className="text-red-600/80 dark:text-red-400/80 font-medium truncate">{firstBlocking.message}</span>
        <span className="text-red-400/60 text-[10px]">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div
          className="mt-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 bg-white dark:bg-gray-900 shadow-sm"
          data-testid={`gate-list-${node.nodeId}`}
        >
          {gates.map((gate) => (
            <div key={gate.name} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${gate.passing ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`${gate.passing ? 'text-muted-foreground/60' : 'text-foreground/80'} font-medium`}>
                {gate.name}
              </span>
              <span className="text-muted-foreground/50 ml-auto">{gate.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { computeGates };
