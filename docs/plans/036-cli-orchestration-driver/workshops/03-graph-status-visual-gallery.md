# Workshop: Graph Status View — Visual Scenario Gallery

**Type**: Test Fixtures / Visual Reference
**Plan**: 036-cli-orchestration-driver
**Spec**: [cli-orchestration-driver-spec.md](../cli-orchestration-driver-spec.md)
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [01-cli-driver-experience-and-validation.md](./01-cli-driver-experience-and-validation.md) § Part 3 — format specification
- [02-workflow-domain-boundaries.md](./02-workflow-domain-boundaries.md) — domain rules (graph-domain only)

---

## Purpose

Define a gallery of test graph scenarios that exercise every visual path of `formatGraphStatus()`. Each scenario is a concrete `buildFakeReality()` call paired with its expected output. This serves two purposes:

1. **During Phase 3**: drives the test cases (copy-paste into tests)
2. **After Phase 3**: a visual reference gallery you can run to see all scenarios

## Key Questions Addressed

- What does every combination of node states look like?
- How do serial vs parallel layouts render?
- What does a complex real-world graph look like at various stages of execution?
- How do we build a runnable script that dumps all scenarios?

---

## The `buildFakeReality()` API

All scenarios use `buildFakeReality()` from `fake-onbas.ts`. No filesystem, no services, no YAML.

```typescript
import { buildFakeReality } from '../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { formatGraphStatus } from '../packages/positional-graph/src/features/030-orchestration/reality.format.js';
```

### Node Options

```typescript
{
  nodeId: string;           // required
  lineIndex?: number;       // default: 0
  positionInLine?: number;  // default: auto-increment
  unitSlug?: string;        // default: `unit-${nodeId}`
  unitType?: 'agent' | 'code' | 'user-input';  // default: 'agent'
  status?: ExecutionStatus; // default: 'pending'
  execution?: 'serial' | 'parallel';  // default: 'serial'
  ready?: boolean;          // default: status === 'ready'
}
```

### Line Options (optional — auto-generated from nodes if omitted)

```typescript
{
  nodeIds: string[];        // required
  index?: number;           // default: auto-increment
  label?: string;           // default: `Line ${index}`
  isComplete?: boolean;     // default: inferred from nodes
}
```

---

## Scenario Gallery

### Scenario 1: Fresh Graph — Nothing Started

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (pending)
─────────────────────────────
  Line 0: ⬜ get-spec
  Line 1: ⚪ spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 0/8 complete
```

**What this tests**: ⬜ (ready) vs ⚪ (not eligible), serial `→` vs parallel `│`, header format

---

### Scenario 2: First Agent Running

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: 🔶 spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 1/8 complete
```

**What this tests**: ✅ complete, 🔶 running (`agent-accepted`), mix of states

---

### Scenario 3: Parallel Nodes Running

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: 🔶 coder │ 🔶 tester │ 🔶 alignment
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 3/8 complete
```

**What this tests**: Multiple 🔶 running in parallel, line transition (Line 1 complete → Line 2 active)

---

### Scenario 4: Agent Paused (Question Asked)

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ⏸️ coder │ 🔶 tester │ 🔶 alignment
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 3/8 complete
```

**What this tests**: ⏸️ paused (waiting-question) — no "waiting for answer" text, just paused glyph

---

### Scenario 5: Agent Failed

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (failed)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ❌ coder │ ✅ tester │ ✅ alignment
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 5/8 complete (1 failed)
```

**What this tests**: ❌ failed, `(1 failed)` suffix on progress line, graph status `failed`

---

### Scenario 6: Graph Complete

```typescript
const reality = buildFakeReality({
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
});
```

**Expected output:**
```
Graph: hello-workflow (complete)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ✅ coder │ ✅ tester │ ✅ alignment
  Line 3: ✅ pr-preparer → ✅ pr-creator
─────────────────────────────
  Progress: 8/8 complete
```

**What this tests**: All ✅, terminal state, 100% progress

---

### Scenario 7: Simple Linear Graph (2 nodes)

```typescript
const reality = buildFakeReality({
  graphSlug: 'simple-pipeline',
  graphStatus: 'in_progress',
  lines: [
    { nodeIds: ['writer'] },
    { nodeIds: ['reviewer'] },
  ],
  nodes: [
    { nodeId: 'writer', lineIndex: 0, status: 'complete' },
    { nodeId: 'reviewer', lineIndex: 1, status: 'starting', ready: true },
  ],
});
```

**Expected output:**
```
Graph: simple-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ writer
  Line 1: 🔶 reviewer
─────────────────────────────
  Progress: 1/2 complete
```

**What this tests**: Minimal graph, single-node lines (no separators)

---

### Scenario 8: Empty Graph

```typescript
const reality = buildFakeReality({
  graphSlug: 'empty-graph',
  graphStatus: 'pending',
  lines: [],
  nodes: [],
});
```

**Expected output:**
```
Graph: empty-graph (pending)
─────────────────────────────
─────────────────────────────
  Progress: 0/0 complete
```

**What this tests**: Degenerate case, no lines, no nodes

---

### Scenario 9: Restart Pending (After Error Clear)

```typescript
const reality = buildFakeReality({
  graphSlug: 'retry-pipeline',
  graphStatus: 'in_progress',
  lines: [
    { nodeIds: ['processor'] },
  ],
  nodes: [
    { nodeId: 'processor', lineIndex: 0, status: 'restart-pending' },
  ],
});
```

**Expected output:**
```
Graph: retry-pipeline (in_progress)
─────────────────────────────
  Line 0: ⏸️ processor
─────────────────────────────
  Progress: 0/1 complete
```

**What this tests**: `restart-pending` → ⏸️ (same glyph as `waiting-question`)

---

### Scenario 10: Mixed Serial + Parallel on Same Line

```typescript
const reality = buildFakeReality({
  graphSlug: 'mixed-pipeline',
  graphStatus: 'in_progress',
  lines: [
    { nodeIds: ['a', 'b', 'c', 'd'] },
  ],
  nodes: [
    { nodeId: 'a', lineIndex: 0, status: 'complete', positionInLine: 0 },
    { nodeId: 'b', lineIndex: 0, status: 'starting', positionInLine: 1, execution: 'parallel', ready: true },
    { nodeId: 'c', lineIndex: 0, status: 'starting', positionInLine: 2, execution: 'parallel', ready: true },
    { nodeId: 'd', lineIndex: 0, status: 'pending', positionInLine: 3, execution: 'serial' },
  ],
});
```

**Expected output:**
```
Graph: mixed-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ a │ 🔶 b │ 🔶 c → ⚪ d
─────────────────────────────
  Progress: 1/4 complete
```

**What this tests**: Mixed `│` and `→` separators on the same line — separator is determined by the **right** node's execution mode

---

## Runnable Gallery Script

After Phase 3 implementation, run this to see all scenarios:

```typescript
// file: scripts/graph-status-gallery.ts
// Run: npx tsx scripts/graph-status-gallery.ts

import { buildFakeReality } from '../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { formatGraphStatus } from '../packages/positional-graph/src/features/030-orchestration/reality.format.js';

const scenarios = [
  { name: '1. Fresh — nothing started', reality: buildFakeReality({ /* Scenario 1 */ }) },
  { name: '2. First agent running', reality: buildFakeReality({ /* Scenario 2 */ }) },
  // ... all 10 scenarios
];

for (const { name, reality } of scenarios) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(50)}\n`);
  console.log(formatGraphStatus(reality));
}
```

This can be committed as `scripts/graph-status-gallery.ts` and run anytime to visually inspect the output. It's not a test — it's a human reference.

---

## Glyph Quick Reference

| Glyph | Status | Meaning |
|-------|--------|---------|
| ✅ | `complete` | Done |
| ❌ | `blocked-error` | Failed |
| 🔶 | `starting`, `agent-accepted` | Running |
| ⏸️ | `waiting-question`, `restart-pending` | Paused |
| ⬜ | `pending` + `ready`, `ready` | Ready to start |
| ⚪ | `pending` + `!ready` | Not yet eligible |

## Separator Quick Reference

| Separator | Meaning | When |
|-----------|---------|------|
| `→` | Serial dependency | Right node has `execution: 'serial'` |
| `│` | Parallel (independent) | Right node has `execution: 'parallel'` |

## Open Questions

### Q1: Should the gallery script be committed?

**OPEN**: It's useful as a development tool. Options:
- A: Commit to `scripts/` — available to everyone
- B: Keep as a local-only dev tool — mention in docs only
- C: Make it a CLI command (`cg wf debug graph-status-gallery`) — available but clearly debug

### Q2: Should the gallery also show the `buildFakeReality()` call alongside the output?

**OPEN**: Would make it self-documenting but noisy. Could print the scenario name + expected output only.

---

### Scenario 11: Failed Node While Siblings Still Running

```typescript
const reality = buildFakeReality({
  graphSlug: 'hello-workflow',
  graphStatus: 'in_progress',
  lines: [
    { nodeIds: ['get-spec'] },
    { nodeIds: ['coder', 'tester', 'alignment'] },
  ],
  nodes: [
    { nodeId: 'get-spec', lineIndex: 0, status: 'complete', unitType: 'user-input' },
    { nodeId: 'coder', lineIndex: 1, status: 'blocked-error', execution: 'parallel' },
    { nodeId: 'tester', lineIndex: 1, status: 'agent-accepted', ready: true, positionInLine: 1, execution: 'parallel' },
    { nodeId: 'alignment', lineIndex: 1, status: 'starting', ready: true, positionInLine: 2, execution: 'parallel' },
  ],
});
```

**Expected output:**
```
Graph: hello-workflow (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ❌ coder │ 🔶 tester │ 🔶 alignment
─────────────────────────────
  Progress: 1/4 complete (1 failed)
```

**What this tests**: ❌ failed alongside 🔶 still running — graph hasn't been marked `failed` yet because siblings are still in progress. The `(1 failed)` note appears even while graph status is `in_progress`.
