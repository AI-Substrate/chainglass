/**
 * Plan 040: Graph Inspect CLI — Formatters
 *
 * Pure functions: InspectResult → string. No side effects, no ANSI codes.
 * Consumed by CLI handler (Phase 3) and tests.
 *
 * @packageDocumentation
 */

import { isFileOutput } from './inspect.types.js';
import type { InspectFileMetadata, InspectNodeResult, InspectResult } from './inspect.types.js';

// ── Helpers ─────────────────────────────────────────────

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (sec === 0) return `${min}m`;
  return `${min}m ${sec}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getGlyph(node: InspectNodeResult): string {
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
      return '⚪';
    default:
      return '❓';
  }
}

function formatOutputValue(
  name: string,
  value: unknown,
  fileMeta: InspectFileMetadata | undefined,
  maxLen: number
): string {
  if (fileMeta) {
    const sizeStr = formatFileSize(fileMeta.sizeBytes);
    const lines = [`    ${name} → ${fileMeta.filename} (${sizeStr})`];
    if (!fileMeta.isBinary && fileMeta.extract) {
      for (const extractLine of fileMeta.extract.split('\n').slice(0, 2)) {
        lines.push(`               ${truncate(extractLine, maxLen)}`);
      }
    } else if (fileMeta.isBinary) {
      lines.push('               [binary]');
    }
    return lines.join('\n');
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `    ${name} = ${value}`;
  }
  const strVal = String(value);
  if (strVal.length > maxLen) {
    return `    ${name} = "${truncate(strVal, maxLen)}" (${strVal.length} chars)`;
  }
  return `    ${name} = "${strVal}"`;
}

// ── formatInspect (default mode) ────────────────────────

export function formatInspect(result: InspectResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`Graph: ${result.graphSlug}`);
  lines.push(`Status: ${result.graphStatus}`);
  lines.push(`Updated: ${result.updatedAt}`);
  lines.push('');

  // Topology
  lines.push('─────────────────────────────');
  const byLine = new Map<number, InspectNodeResult[]>();
  for (const node of result.nodes) {
    const group = byLine.get(node.lineIndex) ?? [];
    group.push(node);
    byLine.set(node.lineIndex, group);
  }
  for (const [lineIdx, nodes] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const nodeStrs = nodes.map((n) => `${getGlyph(n)} ${n.nodeId}`);
    lines.push(`  Line ${lineIdx}: ${nodeStrs.join(' │ ')}`);
  }
  lines.push(`  Progress: ${result.completedNodes}/${result.totalNodes} complete`);
  lines.push('─────────────────────────────');
  lines.push('');

  // Per-node sections
  for (const node of result.nodes) {
    lines.push(`━━━ ${node.nodeId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  Unit:     ${node.unitSlug} (${node.unitType})`);
    lines.push(`  Status:   ${node.status}`);

    if (node.startedAt) {
      lines.push(`  Started:  ${node.startedAt}`);
    }
    if (node.completedAt && node.durationMs != null) {
      lines.push(`  Ended:    ${node.completedAt}  (${formatDuration(node.durationMs)})`);
    }

    if (node.error) {
      lines.push(`  Error:    ${node.error.code} — ${node.error.message}`);
    }

    // Inputs
    const inputEntries = Object.entries(node.inputs);
    if (inputEntries.length === 0) {
      lines.push('  Inputs:   (none)');
    } else {
      lines.push('  Inputs:');
      for (const [inputName, input] of inputEntries) {
        const mark = input.available ? '✓' : '✗';
        lines.push(`    ${inputName} ← ${input.fromNode}/${input.fromOutput}  ${mark}`);
      }
    }

    // Outputs
    if (node.outputCount > 0) {
      lines.push('  Outputs:');
      for (const [name, value] of Object.entries(node.outputs)) {
        const fileMeta = node.fileMetadata[name];
        lines.push(formatOutputValue(name, value, fileMeta, 60));
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── formatInspectNode (deep dive) ───────────────────────

export function formatInspectNode(result: InspectResult, nodeId: string): string {
  const node = result.nodes.find((n) => n.nodeId === nodeId);
  if (!node) return `Node not found: ${nodeId}`;

  const lines: string[] = [];

  lines.push(`━━━ ${node.nodeId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`  Unit:     ${node.unitSlug} (${node.unitType})`);
  lines.push(`  Status:   ${node.status}`);

  if (node.startedAt) {
    lines.push(`  Started:  ${node.startedAt}`);
  }
  if (node.completedAt && node.durationMs != null) {
    lines.push(`  Ended:    ${node.completedAt}  (${formatDuration(node.durationMs)})`);
  }

  if (node.error) {
    lines.push(`  Error:    ${node.error.code} — ${node.error.message}`);
  }

  // Inputs
  const inputEntries = Object.entries(node.inputs);
  if (inputEntries.length === 0) {
    lines.push('  Inputs:   (none)');
  } else {
    lines.push('  Inputs:');
    for (const [inputName, input] of inputEntries) {
      const mark = input.available ? '✓' : '✗';
      lines.push(`    ${inputName} ← ${input.fromNode}/${input.fromOutput}  ${mark}`);
    }
  }

  // Outputs — full (untruncated)
  if (node.outputCount > 0) {
    lines.push(`\n  Outputs (${node.outputCount}):`);
    for (const [name, value] of Object.entries(node.outputs)) {
      const fileMeta = node.fileMetadata[name];
      if (fileMeta) {
        const sizeStr = formatFileSize(fileMeta.sizeBytes);
        lines.push(`    ${name} → ${fileMeta.filename} (${sizeStr})`);
        if (!fileMeta.isBinary && fileMeta.extract) {
          for (const extractLine of fileMeta.extract.split('\n')) {
            lines.push(`               ${extractLine}`);
          }
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`    ${name} = ${value}`);
      } else {
        lines.push(`    ${name} = "${String(value)}"`);
      }
    }
  }

  // Events
  if (node.events.length > 0) {
    lines.push(`\n  Events (${node.events.length}):`);
    for (let i = 0; i < node.events.length; i++) {
      const ev = node.events[i];
      const stampKeys = Object.keys(ev.stamps);
      const stampStr = stampKeys.map((k) => `${k}✓`).join(' ');
      lines.push(
        `    ${i + 1}. ${ev.type.padEnd(16)} ${ev.actor.padEnd(14)} ${ev.timestamp}  ${stampStr}`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── formatInspectOutputs (outputs-only) ─────────────────

export function formatInspectOutputs(result: InspectResult): string {
  const lines: string[] = [];

  lines.push(`Graph: ${result.graphSlug} (${result.graphStatus})`);
  lines.push('');

  for (const node of result.nodes) {
    if (node.outputCount === 0) continue;

    lines.push(`${node.nodeId}:`);
    for (const [name, value] of Object.entries(node.outputs)) {
      const fileMeta = node.fileMetadata[name];
      if (fileMeta) {
        lines.push(`  ${name} → ${fileMeta.filename} (${formatFileSize(fileMeta.sizeBytes)})`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`  ${name} = ${value}`);
      } else {
        const strVal = String(value);
        if (strVal.length > 40) {
          lines.push(`  ${name} = "${truncate(strVal, 40)}" (${strVal.length} chars)`);
        } else {
          lines.push(`  ${name} = "${strVal}"`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── formatInspectCompact (one-liner) ────────────────────

export function formatInspectCompact(result: InspectResult): string {
  const lines: string[] = [];

  lines.push(
    `Graph: ${result.graphSlug} (${result.graphStatus}) — ${result.totalNodes}/${result.totalNodes} nodes`
  );
  lines.push('');

  for (const node of result.nodes) {
    const glyph = getGlyph(node);
    const dur = formatDuration(node.durationMs);
    const outLabel = node.outputCount === 1 ? '1 output' : `${node.outputCount} outputs`;

    let context = '';
    const settings = node.orchestratorSettings;
    if (node.questions.length > 0) {
      context = `  (Q&A: ${node.questions.length} question${node.questions.length > 1 ? 's' : ''})`;
    } else if (settings.noContext) {
      context = `  (${settings.execution}, noContext)`;
    } else if (settings.contextFrom) {
      context = `  (inherit: ${settings.contextFrom})`;
    }

    lines.push(
      `  ${glyph} ${node.nodeId.padEnd(20)} ${node.unitType.padEnd(12)} ${dur.padEnd(6)} ${outLabel}${context}`
    );
  }

  return lines.join('\n');
}
