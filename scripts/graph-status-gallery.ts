/**
 * Graph Status Gallery — Visual reference for all formatGraphStatus() scenarios.
 *
 * Run: npx tsx scripts/graph-status-gallery.ts
 *
 * Produces all 11 visual scenarios from Workshop 03 so you can see
 * what the status view looks like for every combination of node states.
 *
 * @see docs/plans/036-cli-orchestration-driver/workshops/03-graph-status-visual-gallery.md
 */

import { buildFakeReality } from '../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { formatGraphStatus } from '../packages/positional-graph/src/features/030-orchestration/reality.format.js';

// ── Scenario definitions ────────────────────────────────

const scenarios = [
  {
    name: '1. Fresh — nothing started',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'pending',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'pending', ready: true, unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'pending' },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'pending', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'pending', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'pending', positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'pending', positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'pending' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'pending', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '2. First agent running',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'in_progress',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'agent-accepted', ready: true },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'pending', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'pending', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'pending', positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'pending', positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'pending' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'pending', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '3. Parallel nodes running',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'in_progress',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'complete' },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'complete', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'starting', ready: true, execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'starting', ready: true, positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'starting', ready: true, positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'pending' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'pending', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '4. Agent paused (question asked)',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'in_progress',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'complete' },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'complete', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'waiting-question', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'agent-accepted', ready: true, positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'starting', ready: true, positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'pending' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'pending', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '5. Agent failed',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'failed',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'complete' },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'complete', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'blocked-error', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'complete', positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'complete', positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'pending' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'pending', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '6. Graph complete',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'complete',
      lines: [
        { nodeIds: ['get-spec'] },
        { nodeIds: ['spec-builder', 'spec-reviewer'] },
        { nodeIds: ['coder', 'tester', 'alignment'] },
        { nodeIds: ['pr-preparer', 'pr-creator'] },
      ],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'spec-builder', lineIndex: 1, status: 'complete' },
        { nodeId: 'spec-reviewer', lineIndex: 1, status: 'complete', positionInLine: 1 },
        { nodeId: 'coder', lineIndex: 2, status: 'complete', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 2, status: 'complete', positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 2, status: 'complete', positionInLine: 2, execution: 'parallel' },
        { nodeId: 'pr-preparer', lineIndex: 3, status: 'complete' },
        { nodeId: 'pr-creator', lineIndex: 3, status: 'complete', positionInLine: 1 },
      ],
    }),
  },
  {
    name: '7. Simple linear (2 nodes)',
    reality: buildFakeReality({
      graphSlug: 'simple-pipeline',
      graphStatus: 'in_progress',
      lines: [{ nodeIds: ['writer'] }, { nodeIds: ['reviewer'] }],
      nodes: [
        { nodeId: 'writer', lineIndex: 0, status: 'complete' },
        { nodeId: 'reviewer', lineIndex: 1, status: 'starting', ready: true },
      ],
    }),
  },
  {
    name: '8. Empty graph',
    reality: buildFakeReality({
      graphSlug: 'empty-graph',
      graphStatus: 'pending',
      lines: [],
      nodes: [],
    }),
  },
  {
    name: '9. Restart pending',
    reality: buildFakeReality({
      graphSlug: 'retry-pipeline',
      graphStatus: 'in_progress',
      lines: [{ nodeIds: ['processor'] }],
      nodes: [{ nodeId: 'processor', lineIndex: 0, status: 'restart-pending' }],
    }),
  },
  {
    name: '10. Mixed serial + parallel',
    reality: buildFakeReality({
      graphSlug: 'mixed-pipeline',
      graphStatus: 'in_progress',
      lines: [{ nodeIds: ['a', 'b', 'c', 'd'] }],
      nodes: [
        { nodeId: 'a', lineIndex: 0, status: 'complete', positionInLine: 0 },
        { nodeId: 'b', lineIndex: 0, status: 'starting', positionInLine: 1, execution: 'parallel', ready: true },
        { nodeId: 'c', lineIndex: 0, status: 'starting', positionInLine: 2, execution: 'parallel', ready: true },
        { nodeId: 'd', lineIndex: 0, status: 'pending', positionInLine: 3, execution: 'serial' },
      ],
    }),
  },
  {
    name: '11. Failed + siblings still running',
    reality: buildFakeReality({
      graphSlug: 'hello-workflow',
      graphStatus: 'in_progress',
      lines: [{ nodeIds: ['get-spec'] }, { nodeIds: ['coder', 'tester', 'alignment'] }],
      nodes: [
        { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
        { nodeId: 'coder', lineIndex: 1, status: 'blocked-error', execution: 'parallel' },
        { nodeId: 'tester', lineIndex: 1, status: 'agent-accepted', ready: true, positionInLine: 1, execution: 'parallel' },
        { nodeId: 'alignment', lineIndex: 1, status: 'starting', ready: true, positionInLine: 2, execution: 'parallel' },
      ],
    }),
  },
];

// ── Run ─────────────────────────────────────────────────

for (const { name, reality } of scenarios) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(50)}\n`);
  console.log(formatGraphStatus(reality));
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`  Done — ${scenarios.length} scenarios rendered`);
console.log(`${'═'.repeat(50)}\n`);
