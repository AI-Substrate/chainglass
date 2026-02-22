/**
 * Plan 040: Graph Inspect CLI — Formatter Unit Tests
 *
 * ## Test Doc
 * - **Why**: Validates that formatters produce correct human-readable output from InspectResult.
 * - **Contract**: Each formatter is a pure function: InspectResult → string.
 * - **Usage Notes**: Tests construct InspectResult objects directly (no service calls).
 *   Glyphs: ✅ complete, ❌ blocked-error, 🔶 starting/accepted, ⏸️ waiting/restart, ⬜ ready, ⚪ pending
 * - **Quality Contribution**: Prevents regressions in CLI display formatting.
 * - **Worked Example**: Build a 2-node InspectResult, format, assert structure and content.
 */

import type {
  InspectFileMetadata,
  InspectNodeEvent,
  InspectNodeResult,
  InspectOrchestratorSettings,
  InspectResult,
} from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';

// ── Test Fixtures ───────────────────────────────────────

function makeNode(overrides: Partial<InspectNodeResult> = {}): InspectNodeResult {
  return {
    nodeId: 'node-a1b',
    unitSlug: 'worker',
    unitType: 'agent',
    lineIndex: 0,
    position: 0,
    execution: 'serial',
    status: 'complete',
    startedAt: '2026-02-21T08:45:51Z',
    completedAt: '2026-02-21T08:46:23Z',
    durationMs: 32000,
    inputs: {},
    outputs: {},
    outputCount: 0,
    eventCount: 0,
    events: [],
    orchestratorSettings: { execution: 'serial' },
    fileMetadata: {},
    questions: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<InspectResult> = {}): InspectResult {
  return {
    graphSlug: 'test-graph',
    graphStatus: 'complete',
    updatedAt: '2026-02-21T08:46:23Z',
    totalNodes: 2,
    completedNodes: 2,
    failedNodes: 0,
    nodes: [],
    errors: [],
    ...overrides,
  };
}

// ── Lazy imports (formatter not yet created) ────────────

async function loadFormatters() {
  return import(
    '@chainglass/positional-graph/features/040-graph-inspect/inspect.format'
  ) as Promise<{
    formatInspect: (result: InspectResult) => string;
    formatInspectNode: (result: InspectResult, nodeId: string) => string;
    formatInspectOutputs: (result: InspectResult) => string;
    formatInspectCompact: (result: InspectResult) => string;
  }>;
}

// ═══════════════════════════════════════════════════════
// T001: formatInspect() default mode
// AC-1, AC-2: Graph header + per-node sections + truncation
// ═══════════════════════════════════════════════════════

describe('formatInspect (T001)', () => {
  /** Test Doc: Why — validates default output structure matches Workshop 06. */
  it('includes graph header with status and progress', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'input-a1b',
      unitSlug: 'human-input',
      unitType: 'user-input',
    });
    const nodeB = makeNode({ nodeId: 'worker-c3d', unitSlug: 'worker', lineIndex: 1 });
    const result = makeResult({ nodes: [nodeA, nodeB] });

    const output = formatInspect(result);

    expect(output).toContain('Graph: test-graph');
    expect(output).toContain('complete');
    expect(output).toContain('Progress:');
    expect(output).toContain('2/2');
  });

  it('renders per-node sections with ━━━ separator', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({ nodeId: 'input-a1b' });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('━━━ input-a1b ━━━');
    expect(output).toContain('Unit:');
    expect(output).toContain('Status:');
  });

  it('truncates string outputs at 60 chars with … and char count', async () => {
    const { formatInspect } = await loadFormatters();
    const longValue = 'A'.repeat(100);
    const nodeA = makeNode({
      nodeId: 'node-a1b',
      outputs: { spec: longValue },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('…');
    expect(output).toContain('(100 chars)');
    expect(output).not.toContain(longValue);
  });

  it('shows input wiring as inputName ← fromNode/output ✓', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'worker-c3d',
      inputs: {
        data: { fromNode: 'input-a1b', fromOutput: 'result', available: true },
      },
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('data');
    expect(output).toContain('← input-a1b/result');
    expect(output).toContain('✓');
  });

  it('displays duration in human format', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({ durationMs: 199000 }); // 3m 19s
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('3m 19s');
  });

  it('shows (none) for nodes with no inputs', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({ inputs: {} });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('(none)');
  });
});

// ═══════════════════════════════════════════════════════
// T002: formatInspectNode() deep dive
// AC-4: Full values + event log
// ═══════════════════════════════════════════════════════

describe('formatInspectNode (T002)', () => {
  /** Test Doc: Why — validates --node deep dive with full values and event log. */
  it('shows full untruncated output values', async () => {
    const { formatInspectNode } = await loadFormatters();
    const longValue = 'B'.repeat(200);
    const nodeA = makeNode({
      nodeId: 'spec-a1b',
      outputs: { spec: longValue },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspectNode(result, 'spec-a1b');

    expect(output).toContain(longValue);
  });

  it('renders event log with numbered rows', async () => {
    const { formatInspectNode } = await loadFormatters();
    const events: InspectNodeEvent[] = [
      {
        eventId: 'e1',
        type: 'node:accepted',
        actor: 'agent',
        timestamp: '2026-02-21T08:46:01Z',
        status: 'handled',
        stamps: {
          cli: { stampedAt: '2026-02-21T08:46:01Z', action: 'ack' },
          orchestrator: { stampedAt: '2026-02-21T08:46:01Z', action: 'transition' },
        },
      },
      {
        eventId: 'e2',
        type: 'node:completed',
        actor: 'agent',
        timestamp: '2026-02-21T08:49:13Z',
        status: 'handled',
        stamps: {
          cli: { stampedAt: '2026-02-21T08:49:13Z', action: 'ack' },
          orchestrator: { stampedAt: '2026-02-21T08:49:13Z', action: 'transition' },
        },
      },
    ];
    const nodeA = makeNode({
      nodeId: 'spec-a1b',
      eventCount: 2,
      events,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspectNode(result, 'spec-a1b');

    expect(output).toContain('Events (2)');
    expect(output).toContain('1.');
    expect(output).toContain('node:accepted');
    expect(output).toContain('agent');
    expect(output).toContain('2.');
    expect(output).toContain('node:completed');
  });
});

// ═══════════════════════════════════════════════════════
// T003: formatInspectOutputs()
// AC-5: Output-only mode, 40-char truncation
// ═══════════════════════════════════════════════════════

describe('formatInspectOutputs (T003)', () => {
  /** Test Doc: Why — validates --outputs mode with grouped outputs and 40-char truncation. */
  it('groups outputs by node', async () => {
    const { formatInspectOutputs } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'input-a1b',
      outputs: { requirements: 'Build a CLI tool' },
      outputCount: 1,
    });
    const nodeB = makeNode({
      nodeId: 'writer-c3d',
      lineIndex: 1,
      outputs: { spec: 'A spec document' },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA, nodeB] });

    const output = formatInspectOutputs(result);

    expect(output).toContain('input-a1b:');
    expect(output).toContain('writer-c3d:');
    expect(output).toContain('requirements');
    expect(output).toContain('spec');
  });

  it('truncates at 40 chars', async () => {
    const { formatInspectOutputs } = await loadFormatters();
    const longValue = 'C'.repeat(80);
    const nodeA = makeNode({
      nodeId: 'node-a1b',
      outputs: { data: longValue },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspectOutputs(result);

    expect(output).toContain('…');
    expect(output).toContain('(80 chars)');
  });

  it('shows numbers without quotes', async () => {
    const { formatInspectOutputs } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'node-a1b',
      outputs: { total_loc: 160 },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspectOutputs(result);

    expect(output).toContain('160');
    expect(output).not.toContain('"160"');
  });
});

// ═══════════════════════════════════════════════════════
// T004: formatInspectCompact()
// AC-6: One line per node
// ═══════════════════════════════════════════════════════

describe('formatInspectCompact (T004)', () => {
  /** Test Doc: Why — validates --compact one-liner per node. */
  it('produces exactly one line per node', async () => {
    const { formatInspectCompact } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'input-a1b',
      unitType: 'user-input',
      durationMs: 3000,
      outputCount: 1,
    });
    const nodeB = makeNode({
      nodeId: 'worker-c3d',
      unitType: 'agent',
      durationMs: 32000,
      outputCount: 3,
    });
    const result = makeResult({ nodes: [nodeA, nodeB] });

    const output = formatInspectCompact(result);
    const lines = output.trim().split('\n');
    // Header line(s) + 2 node lines
    const nodeLines = lines.filter((l) => l.includes('input-a1b') || l.includes('worker-c3d'));
    expect(nodeLines).toHaveLength(2);
  });

  it('includes glyph, nodeId, type, duration, output count', async () => {
    const { formatInspectCompact } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'worker-c3d',
      unitType: 'agent',
      durationMs: 32000,
      outputCount: 3,
    });
    const result = makeResult({ nodes: [nodeA], totalNodes: 1, completedNodes: 1 });

    const output = formatInspectCompact(result);

    expect(output).toContain('✅');
    expect(output).toContain('worker-c3d');
    expect(output).toContain('agent');
    expect(output).toContain('32s');
    expect(output).toContain('3 outputs');
  });
});

// ═══════════════════════════════════════════════════════
// T005: File output display
// AC-3: → arrow for file outputs, = for regular
// ═══════════════════════════════════════════════════════

describe('file output display (T005)', () => {
  /** Test Doc: Why — validates file outputs use → and regular values use =. */
  it('uses → for data/outputs/ values with filename and size', async () => {
    const { formatInspect } = await loadFormatters();
    const fileMeta: Record<string, InspectFileMetadata> = {
      code: {
        filename: 'csv2json.py',
        sizeBytes: 2847,
        isBinary: false,
        extract: '#!/usr/bin/env python3\n"""CSV to JSON',
      },
    };
    const nodeA = makeNode({
      nodeId: 'prog-a1b',
      outputs: { code: 'data/outputs/csv2json.py' },
      outputCount: 1,
      fileMetadata: fileMeta,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('→');
    expect(output).toContain('csv2json.py');
    expect(output).toContain('2.8 KB');
  });

  it('uses = for regular string values', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'node-a1b',
      outputs: { language: 'Python' },
      outputCount: 1,
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('language');
    expect(output).toContain('=');
    expect(output).toContain('"Python"');
  });
});

// ═══════════════════════════════════════════════════════
// T006: In-progress and error rendering
// AC-8, AC-9: Running/pending/error states
// ═══════════════════════════════════════════════════════

describe('in-progress and error rendering (T006)', () => {
  /** Test Doc: Why — validates running, pending, and error node display. */
  it('shows running node with elapsed time', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'runner-a1b',
      status: 'agent-accepted',
      startedAt: '2026-02-21T08:45:51Z',
      completedAt: undefined,
      durationMs: undefined,
    });
    const result = makeResult({
      nodes: [nodeA],
      graphStatus: 'in_progress',
      completedNodes: 0,
    });

    const output = formatInspect(result);

    // Should show a running indicator instead of Ended
    expect(output).not.toContain('Ended:');
    expect(output).toContain('Running:');
  });

  it('shows pending node with waiting reason', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'pending-a1b',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
    });
    const result = makeResult({
      nodes: [nodeA],
      graphStatus: 'in_progress',
      completedNodes: 0,
    });

    const output = formatInspect(result);

    expect(output).toContain('Waiting:');
    expect(output).toContain('pending');
  });

  it('shows error node with code and message', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'error-a1b',
      status: 'blocked-error',
      error: { code: 'E999', message: 'Something broke', occurredAt: '2026-02-21T08:46:00Z' },
    });
    const result = makeResult({
      nodes: [nodeA],
      graphStatus: 'failed',
      failedNodes: 1,
      completedNodes: 0,
    });

    const output = formatInspect(result);

    expect(output).toContain('E999');
    expect(output).toContain('Something broke');
  });
});

// ═══════════════════════════════════════════════════════
// Review fixes: compact header, file fallback
// ═══════════════════════════════════════════════════════

describe('review fix: compact header progress', () => {
  it('shows completedNodes/totalNodes not totalNodes/totalNodes', async () => {
    const { formatInspectCompact } = await loadFormatters();
    const nodeA = makeNode({ nodeId: 'done-a1b', status: 'complete' });
    const nodeB = makeNode({
      nodeId: 'pending-c3d',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
    });
    const result = makeResult({
      nodes: [nodeA, nodeB],
      totalNodes: 2,
      completedNodes: 1,
    });

    const output = formatInspectCompact(result);

    expect(output).toContain('1/2 nodes');
    expect(output).not.toContain('2/2 nodes');
  });
});

describe('review fix: file output missing metadata fallback', () => {
  it('renders → filename (missing) when fileMetadata absent for data/outputs/ value', async () => {
    const { formatInspect } = await loadFormatters();
    const nodeA = makeNode({
      nodeId: 'node-a1b',
      outputs: { report: 'data/outputs/report.md' },
      outputCount: 1,
      fileMetadata: {},
    });
    const result = makeResult({ nodes: [nodeA] });

    const output = formatInspect(result);

    expect(output).toContain('→');
    expect(output).toContain('report.md');
    expect(output).toContain('(missing)');
  });
});
