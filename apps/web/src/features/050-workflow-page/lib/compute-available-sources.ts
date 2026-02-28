/**
 * computeAvailableSources — Compute valid upstream nodes for input wiring.
 *
 * Pure function that takes line/node data from GraphStatusResult and returns
 * nodes positionally upstream of the given node (same line earlier positions
 * + all preceding lines). Mirrors the scope rules in input-resolution.ts.
 *
 * Phase 5: Q&A + Node Properties Modal + Undo/Redo — Plan 050
 */

import type { GraphStatusResult, NodeStatusResult } from '@chainglass/positional-graph';

export interface AvailableSource {
  nodeId: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  lineId: string;
  position: number;
}

/**
 * Returns all nodes positionally upstream of the target node.
 * Scope rules: same line at earlier positions, then all preceding lines.
 */
export function computeAvailableSources(
  targetNodeId: string,
  graphStatus: GraphStatusResult
): AvailableSource[] {
  const sources: AvailableSource[] = [];

  // Find the target node's location
  let targetLineIndex = -1;
  let targetPosition = -1;
  for (let li = 0; li < graphStatus.lines.length; li++) {
    const line = graphStatus.lines[li];
    for (let ni = 0; ni < line.nodes.length; ni++) {
      if (line.nodes[ni].nodeId === targetNodeId) {
        targetLineIndex = li;
        targetPosition = ni;
        break;
      }
    }
    if (targetLineIndex >= 0) break;
  }

  if (targetLineIndex === -1) return sources;

  // Collect upstream nodes: preceding lines (all positions) + same line (earlier positions)
  for (let li = 0; li <= targetLineIndex; li++) {
    const line = graphStatus.lines[li];
    const maxPosition = li === targetLineIndex ? targetPosition : line.nodes.length;

    for (let ni = 0; ni < maxPosition; ni++) {
      const node = line.nodes[ni];
      sources.push({
        nodeId: node.nodeId,
        unitSlug: node.unitSlug,
        unitType: node.unitType,
        lineId: node.lineId,
        position: node.position,
      });
    }
  }

  return sources;
}
