/**
 * Plan 040: Graph Inspect CLI — Formatters
 *
 * Pure functions: InspectResult → string. Uses chalk for terminal styling.
 * Consumed by CLI handler (Phase 3) and tests.
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import { isFileOutput } from './inspect.types.js';
import type { InspectFileMetadata, InspectNodeResult, InspectResult } from './inspect.types.js';

// ── Alignment helpers ───────────────────────────────────

/** Visible width of a string accounting for emoji (2-wide) and ANSI codes (0-wide). */
function visWidth(str: string): number {
  // Strip ANSI escape codes using ESC[...m pattern
  const ESC = String.fromCharCode(0x1b);
  const stripped = str.split(ESC).reduce((acc, part, i) => {
    if (i === 0) return acc + part;
    const mIdx = part.indexOf('m');
    return mIdx >= 0 ? acc + part.slice(mIdx + 1) : acc + part;
  }, '');
  let w = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0) ?? 0;
    // Most emoji and CJK are double-width; variation selectors are 0-width
    if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) w += 2;
    else if (code === 0xfe0f)
      w += 0; // variation selector
    else w += 1;
  }
  return w;
}

/** Pad a string to a target visible width. */
function padTo(str: string, width: number): string {
  const diff = width - visWidth(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

// ── Value helpers ───────────────────────────────────────

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
  const label = chalk.cyan(name);
  if (fileMeta) {
    const sizeStr = chalk.dim(formatFileSize(fileMeta.sizeBytes));
    const lines = [`    ${label} ${chalk.yellow('→')} ${fileMeta.filename} (${sizeStr})`];
    if (!fileMeta.isBinary && fileMeta.extract) {
      for (const extractLine of fileMeta.extract.split('\n').slice(0, 2)) {
        lines.push(`               ${chalk.dim(truncate(extractLine, maxLen))}`);
      }
    } else if (fileMeta.isBinary) {
      lines.push(`               ${chalk.dim('[binary]')}`);
    }
    return lines.join('\n');
  }
  if (isFileOutput(value)) {
    const filename = String(value).split('/').pop() ?? '';
    return `    ${label} ${chalk.yellow('→')} ${filename} ${chalk.dim('(missing)')}`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `    ${label} ${chalk.dim('=')} ${chalk.green(String(value))}`;
  }
  const strVal = String(value);
  if (strVal.length > maxLen) {
    return `    ${label} ${chalk.dim('=')} "${truncate(strVal, maxLen)}" ${chalk.dim(`(${strVal.length} chars)`)}`;
  }
  return `    ${label} ${chalk.dim('=')} "${strVal}"`;
}

// ── formatInspect (default mode) ────────────────────────

export function formatInspect(result: InspectResult): string {
  const lines: string[] = [];

  lines.push(`${chalk.bold('Graph:')} ${result.graphSlug}`);
  lines.push(`${chalk.bold('Status:')} ${result.graphStatus}`);
  lines.push(`${chalk.bold('Updated:')} ${chalk.dim(result.updatedAt)}`);
  lines.push('');

  // Topology
  lines.push(chalk.dim('─────────────────────────────────────────'));
  const byLine = new Map<number, InspectNodeResult[]>();
  for (const node of result.nodes) {
    const group = byLine.get(node.lineIndex) ?? [];
    group.push(node);
    byLine.set(node.lineIndex, group);
  }
  for (const [lineIdx, nodes] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const nodeStrs = nodes.map((n) => `${getGlyph(n)} ${chalk.bold(n.nodeId)}`);
    lines.push(`  ${chalk.dim(`Line ${lineIdx}:`)} ${nodeStrs.join(chalk.dim(' │ '))}`);
  }
  lines.push(`  ${chalk.dim('Progress:')} ${result.completedNodes}/${result.totalNodes} complete`);
  lines.push(chalk.dim('─────────────────────────────────────────'));
  lines.push('');

  // Per-node sections
  for (const node of result.nodes) {
    lines.push(chalk.bold(`━━━ ${node.nodeId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    lines.push(`  ${chalk.dim('Unit:')}     ${node.unitSlug} ${chalk.dim(`(${node.unitType})`)}`);
    lines.push(`  ${chalk.dim('Status:')}   ${node.status}`);

    if (node.startedAt) {
      lines.push(`  ${chalk.dim('Started:')}  ${chalk.dim(node.startedAt)}`);
    }
    if (node.completedAt && node.durationMs != null) {
      lines.push(
        `  ${chalk.dim('Ended:')}    ${chalk.dim(node.completedAt)}  ${chalk.green(`(${formatDuration(node.durationMs)})`)}`
      );
    } else if (node.startedAt && !node.completedAt) {
      lines.push(`  ${chalk.yellow('Running:')}  in progress`);
    } else if (!node.startedAt && (node.status === 'pending' || node.status === 'ready')) {
      lines.push(
        `  ${chalk.dim('Waiting:')}  ${node.status === 'ready' ? 'ready to start' : 'dependencies pending'}`
      );
    }

    if (node.error) {
      lines.push(
        `  ${chalk.red('Error:')}    ${chalk.red(node.error.code)} — ${node.error.message}`
      );
    }

    // Inputs
    const inputEntries = Object.entries(node.inputs);
    if (inputEntries.length === 0) {
      lines.push(`  ${chalk.dim('Inputs:')}   ${chalk.dim('(none)')}`);
    } else {
      lines.push(`  ${chalk.dim('Inputs:')}`);
      for (const [inputName, input] of inputEntries) {
        const mark = input.available ? chalk.green('✓') : chalk.red('✗');
        lines.push(`    ${chalk.cyan(inputName)} ← ${input.fromNode}/${input.fromOutput}  ${mark}`);
      }
    }

    // Outputs
    if (node.outputCount > 0) {
      lines.push(`  ${chalk.dim('Outputs:')}`);
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
  if (!node) return chalk.red(`Node not found: ${nodeId}`);

  const lines: string[] = [];

  lines.push(chalk.bold(`━━━ ${node.nodeId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  lines.push(`  ${chalk.dim('Unit:')}     ${node.unitSlug} ${chalk.dim(`(${node.unitType})`)}`);
  lines.push(`  ${chalk.dim('Status:')}   ${node.status}`);

  if (node.startedAt) {
    lines.push(`  ${chalk.dim('Started:')}  ${chalk.dim(node.startedAt)}`);
  }
  if (node.completedAt && node.durationMs != null) {
    lines.push(
      `  ${chalk.dim('Ended:')}    ${chalk.dim(node.completedAt)}  ${chalk.green(`(${formatDuration(node.durationMs)})`)}`
    );
  }

  if (node.error) {
    lines.push(`  ${chalk.red('Error:')}    ${chalk.red(node.error.code)} — ${node.error.message}`);
  }

  // Inputs
  const inputEntries = Object.entries(node.inputs);
  if (inputEntries.length === 0) {
    lines.push(`  ${chalk.dim('Inputs:')}   ${chalk.dim('(none)')}`);
  } else {
    lines.push(`  ${chalk.dim('Inputs:')}`);
    for (const [inputName, input] of inputEntries) {
      const mark = input.available ? chalk.green('✓') : chalk.red('✗');
      lines.push(`    ${chalk.cyan(inputName)} ← ${input.fromNode}/${input.fromOutput}  ${mark}`);
    }
  }

  // Outputs — full (untruncated)
  if (node.outputCount > 0) {
    lines.push(`\n  ${chalk.dim(`Outputs (${node.outputCount}):`)}`);
    for (const [name, value] of Object.entries(node.outputs)) {
      const fileMeta = node.fileMetadata[name];
      if (fileMeta) {
        const sizeStr = chalk.dim(formatFileSize(fileMeta.sizeBytes));
        lines.push(
          `    ${chalk.cyan(name)} ${chalk.yellow('→')} ${fileMeta.filename} (${sizeStr})`
        );
        if (!fileMeta.isBinary && fileMeta.extract) {
          for (const extractLine of fileMeta.extract.split('\n')) {
            lines.push(`               ${chalk.dim(extractLine)}`);
          }
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`    ${chalk.cyan(name)} ${chalk.dim('=')} ${chalk.green(String(value))}`);
      } else {
        lines.push(`    ${chalk.cyan(name)} ${chalk.dim('=')} "${String(value)}"`);
      }
    }
  }

  // Events
  if (node.events.length > 0) {
    lines.push(`\n  ${chalk.dim(`Events (${node.events.length}):`)}`);
    for (let i = 0; i < node.events.length; i++) {
      const ev = node.events[i];
      const stampKeys = Object.keys(ev.stamps);
      const stampStr = stampKeys.map((k) => chalk.green(`${k}✓`)).join(' ');
      const num = chalk.dim(`${i + 1}.`);
      lines.push(
        `    ${num} ${padTo(ev.type, 18)} ${padTo(ev.actor, 14)} ${chalk.dim(ev.timestamp)}  ${stampStr}`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── formatInspectOutputs (outputs-only) ─────────────────

export function formatInspectOutputs(result: InspectResult): string {
  const lines: string[] = [];

  lines.push(`${chalk.bold('Graph:')} ${result.graphSlug} ${chalk.dim(`(${result.graphStatus})`)}`);
  lines.push('');

  for (const node of result.nodes) {
    if (node.outputCount === 0) continue;

    lines.push(`${chalk.bold(node.nodeId)}:`);
    for (const [name, value] of Object.entries(node.outputs)) {
      const fileMeta = node.fileMetadata[name];
      if (fileMeta) {
        lines.push(
          `  ${chalk.cyan(name)} ${chalk.yellow('→')} ${fileMeta.filename} ${chalk.dim(`(${formatFileSize(fileMeta.sizeBytes)})`)}`
        );
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`  ${chalk.cyan(name)} ${chalk.dim('=')} ${chalk.green(String(value))}`);
      } else {
        const strVal = String(value);
        if (strVal.length > 40) {
          lines.push(
            `  ${chalk.cyan(name)} ${chalk.dim('=')} "${truncate(strVal, 40)}" ${chalk.dim(`(${strVal.length} chars)`)}`
          );
        } else {
          lines.push(`  ${chalk.cyan(name)} ${chalk.dim('=')} "${strVal}"`);
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
    `${chalk.bold('Graph:')} ${result.graphSlug} ${chalk.dim(`(${result.graphStatus})`)} — ${result.completedNodes}/${result.totalNodes} nodes`
  );
  lines.push('');

  // Group nodes by line
  const byLine = new Map<number, InspectNodeResult[]>();
  for (const node of result.nodes) {
    const group = byLine.get(node.lineIndex) ?? [];
    group.push(node);
    byLine.set(node.lineIndex, group);
  }

  for (const [lineIdx, lineNodes] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const lineLabel = chalk.dim(`Line ${lineIdx}:`);

    for (let i = 0; i < lineNodes.length; i++) {
      const node = lineNodes[i];
      const glyph = getGlyph(node);
      const nodeId = padTo(chalk.bold(node.nodeId), 22);
      const unitType = padTo(chalk.dim(node.unitType), 12);
      const dur = padTo(formatDuration(node.durationMs), 8);
      const outLabel = node.outputCount === 1 ? '1 output' : `${node.outputCount} outputs`;

      let context = '';
      const settings = node.orchestratorSettings;
      if (node.questions.length > 0) {
        context = chalk.dim(
          `  (Q&A: ${node.questions.length} question${node.questions.length > 1 ? 's' : ''})`
        );
      } else if (settings.noContext) {
        context = chalk.dim(`  (${settings.execution}, noContext)`);
      } else if (settings.contextFrom) {
        context = chalk.dim(`  (inherit: ${settings.contextFrom})`);
      }

      const leader =
        i === 0 ? `  ${lineLabel} ` : `  ${' '.repeat(visWidth(lineLabel))} ${chalk.dim('│')} `;
      lines.push(`${leader}${glyph} ${nodeId} ${unitType} ${dur} ${outLabel}${context}`);
    }
  }

  return lines.join('\n');
}
