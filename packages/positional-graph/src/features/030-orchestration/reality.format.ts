/**
 * formatGraphStatus — Compact visual rendering of graph progress.
 *
 * Pure function: PositionalGraphReality in, string out.
 * Graph-domain only — no event, agent, or pod concepts (ADR-0012).
 * Log-friendly — no ANSI codes (glyphs carry the meaning).
 *
 * @see Workshop 01 Part 3, Workshop 03 (Visual Gallery)
 * @packageDocumentation
 */

import type { ExecutionStatus, NodeReality, PositionalGraphReality } from './reality.types.js';

// ── Glyph Mapping ───────────────────────────────────────

const SEPARATOR = '─────────────────────────────';

function getGlyph(node: NodeReality): string {
  switch (node.status) {
    case 'complete':
      return '✅';
    case 'blocked-error':
      return '❌';
    case 'starting':
    case 'agent-accepted':
      return '🔶';
    case 'waiting-question':
    case 'restart-pending':
      return '⏸️';
    case 'ready':
      return '⬜';
    case 'pending':
      return node.ready ? '⬜' : '⚪';
    default:
      return '❓';
  }
}

// ── Format Function ─────────────────────────────────────

export function formatGraphStatus(reality: PositionalGraphReality): string {
  const lines: string[] = [];

  // Header
  lines.push(`Graph: ${reality.graphSlug} (${reality.graphStatus})`);
  lines.push(SEPARATOR);

  // Lines
  for (const line of reality.lines) {
    const nodeParts: string[] = [];
    const separators: string[] = [];

    for (let i = 0; i < line.nodeIds.length; i++) {
      const nodeId = line.nodeIds[i];
      const node = reality.nodes.get(nodeId);

      if (!node) {
        nodeParts.push(`❓ ${nodeId}`);
      } else {
        nodeParts.push(`${getGlyph(node)} ${node.nodeId}`);
      }

      // Separator before this node (skip first)
      if (i > 0) {
        const rightNode = reality.nodes.get(nodeId);
        const sep = rightNode?.execution === 'parallel' ? '│' : '→';
        separators.push(sep);
      }
    }

    // Interleave: node sep node sep node
    let lineStr = '';
    for (let i = 0; i < nodeParts.length; i++) {
      if (i > 0) {
        lineStr += ` ${separators[i - 1]} `;
      }
      lineStr += nodeParts[i];
    }

    lines.push(`  Line ${line.index}: ${lineStr}`);
  }

  // Footer
  lines.push(SEPARATOR);

  const failedCount = reality.blockedNodeIds.length;
  let progress = `  Progress: ${reality.completedCount}/${reality.totalNodes} complete`;
  if (failedCount > 0) {
    progress += ` (${failedCount} failed)`;
  }
  lines.push(progress);

  return lines.join('\n');
}
