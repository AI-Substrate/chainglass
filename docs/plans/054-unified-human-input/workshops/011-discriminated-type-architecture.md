# Workshop: Discriminated Type Architecture for Human Input

**Type**: Architecture
**Plan**: 054-unified-human-input
**Created**: 2026-02-27
**Status**: Authoritative

---

## Purpose

Define the type architecture for surfacing `user_input` config through the system: from unit.yaml → NarrowWorkUnit → NodeStatusResult → UI. The design uses idiomatic TypeScript discriminated unions on both `NarrowWorkUnit` and `NodeStatusResult`, keeping base types config-free and placing type-specific data on the correct variant.

---

## Problem

`NarrowWorkUnit` was designed as a 4-field interface (`slug`, `type`, `inputs`, `outputs`) to avoid cross-package dependency on `@chainglass/workgraph` (per DYK-P4-I2). The interface deliberately strips type-specific config (`agent`, `code`, `user_input`) at the adapter boundary.

Now the UI needs `user_input` config (prompt, questionType, options) to render the Human Input modal. Adding it as an optional field on the base `NarrowWorkUnit` or `NodeStatusResult` would violate the narrow principle and set a precedent for bloating these types with `agentConfig`, `codeConfig`, etc.

---

## Design: Discriminated Unions

### NarrowWorkUnit — Discriminated on `type`

The full `WorkUnit` schema is already a discriminated union (`AgenticWorkUnit | CodeUnit | UserInputUnit`). `NarrowWorkUnit` should mirror this pattern.

```typescript
// ─── Base (shared fields, no type-specific config) ───

interface NarrowWorkUnitBase {
  slug: string;
  inputs: NarrowWorkUnitInput[];
  outputs: NarrowWorkUnitOutput[];
}

// ─── Variants (discriminated on 'type') ───

interface NarrowAgentWorkUnit extends NarrowWorkUnitBase {
  type: 'agent';
}

interface NarrowCodeWorkUnit extends NarrowWorkUnitBase {
  type: 'code';
}

interface NarrowUserInputWorkUnit extends NarrowWorkUnitBase {
  type: 'user-input';
  userInput: {
    prompt: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string; description?: string }[];
    default?: string | boolean;
  };
}

// ─── Union ───

type NarrowWorkUnit = NarrowAgentWorkUnit | NarrowCodeWorkUnit | NarrowUserInputWorkUnit;
```

**Why**: Each variant carries only its own config. The base stays lean. Existing code that reads `slug`, `type`, `inputs`, `outputs` compiles unchanged against the union. Type narrowing is automatic:

```typescript
if (unit.type === 'user-input') {
  unit.userInput.prompt; // ← TypeScript narrows to NarrowUserInputWorkUnit
}
```

### NodeStatusResult — Discriminated on `unitType`

```typescript
// ─── Base (all existing fields, no type-specific config) ───

interface NodeStatusResultBase {
  nodeId: string;
  unitSlug: string;
  execution: Execution;
  noContext?: boolean;
  contextFrom?: string;
  lineId: string;
  position: number;

  status: ExecutionStatus;

  ready: boolean;
  readyDetail: {
    precedingLinesComplete: boolean;
    transitionOpen: boolean;
    serialNeighborComplete: boolean;
    contextFromReady?: boolean;
    inputsAvailable: boolean;
    unitFound: boolean;
    reason?: string;
  };

  inputPack: InputPack;

  // State-conditional fields (stay on base — not type-specific)
  /** @deprecated Q&A protocol is scaffolding. */
  pendingQuestion?: {
    questionId: string;
    text: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string }[];
    askedAt: string;
  };

  error?: {
    code: string;
    message: string;
    occurredAt: string;
  };

  startedAt?: string;
  completedAt?: string;
}

// ─── Variants (discriminated on 'unitType') ───

interface AgentNodeStatus extends NodeStatusResultBase {
  unitType: 'agent';
}

interface CodeNodeStatus extends NodeStatusResultBase {
  unitType: 'code';
}

interface UserInputNodeStatus extends NodeStatusResultBase {
  unitType: 'user-input';
  userInput: {
    prompt: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string; description?: string }[];
    default?: string | boolean;
  };
}

// ─── Union ───

type NodeStatusResult = AgentNodeStatus | CodeNodeStatus | UserInputNodeStatus;
```

**Why**: The discriminator `unitType` is already checked throughout the codebase (ONBAS, ODS, context-badge, pod-manager). Making it a formal discriminated union adds compiler-enforced narrowing for free. Existing consumers that access common fields compile unchanged.

---

## Backward Compatibility Analysis

### Consumers that compile unchanged

| Consumer | Accesses | Why safe |
|----------|----------|----------|
| ONBAS (`onbas.ts`) | `node.unitType === 'user-input'` guard | `unitType` on all variants ✓ |
| ODS (`ods.ts`) | `node.unitType`, `node.ready`, `node.status` | Common fields ✓ |
| Agent context (`agent-context.ts`) | `node.unitType !== 'agent'` guard | ✓ |
| Pod manager (`pod-manager.ts`) | `switch(unit.type)` | Discriminator ✓ |
| Context badge (`context-badge.ts`) | `node.unitType !== 'agent'` | ✓ |
| QA modal (`qa-modal.tsx`) | `node.pendingQuestion` | On base ✓ |
| Workflow editor (`workflow-editor.tsx`) | `node.status`, `node.nodeId`, etc. | Common fields ✓ |
| Node card (`workflow-node-card.tsx`) | `status`, `unitType` for icons | ✓ |
| Properties panel | `node.unitType`, `node.status` | ✓ |

### Sites that need updating

| Site | File | Change |
|------|------|--------|
| `InstanceWorkUnitAdapter` | `instance-workunit.adapter.ts` | Construct `NarrowUserInputWorkUnit` when `type === 'user-input'`; others get `NarrowAgentWorkUnit` or `NarrowCodeWorkUnit` |
| `getNodeStatus()` | `positional-graph.service.ts` | Build `UserInputNodeStatus` (with `userInput`) or `AgentNodeStatus`/`CodeNodeStatus` based on loaded unit type |
| `createWorkUnit()` helper | `test/unit/positional-graph/test-helpers.ts` | Accept optional `userInput` config; construct correct variant |
| `stubWorkUnitLoader()` | `test/unit/positional-graph/test-helpers.ts` | Support `user-input` units with `userInput` in stub map |
| `createTestUnit()` | `test/e2e/positional-graph-e2e.ts` | Add `type` param (if missing) and optional `userInput` |
| `createTestUnit()` | `test/integration/positional-graph/graph-lifecycle.test.ts` | Same |
| `makeNode()` helpers | `test/unit/web/features/050-workflow-page/*.test.*` | Accept `unitType` override; construct correct variant |
| `makeNodeStatus()` | `test/unit/positional-graph/features/030-orchestration/reality.test.ts` | Same pattern |
| Inline `NarrowWorkUnit` literals | Various test files (`collate-inputs.test.ts`, `input-wiring.test.ts`, `status.test.ts`, `can-run.test.ts`, `input-retrieval.test.ts`) | Add explicit `type` to satisfy variant; `user-input` literals add `userInput` |

**Total**: ~1 production adapter + ~1 production service + ~8-10 test helpers/fixtures.

---

## Construction Patterns

### Adapter (production)

```typescript
// InstanceWorkUnitAdapter.load()
if (unitDef.type === 'user-input') {
  const unit: NarrowUserInputWorkUnit = {
    slug: unitDef.slug,
    type: 'user-input',
    inputs: unitDef.inputs ?? [],
    outputs: unitDef.outputs,
    userInput: {
      prompt: unitDef.user_input.prompt,
      questionType: unitDef.user_input.question_type,
      options: unitDef.user_input.options,
      default: unitDef.user_input.default,
    },
  };
  return { unit, errors: [] };
} else {
  const unit: NarrowWorkUnit = {
    slug: unitDef.slug,
    type: unitDef.type,
    inputs: unitDef.inputs ?? [],
    outputs: unitDef.outputs,
  };
  return { unit, errors: [] };
}
```

### getNodeStatus() (production)

```typescript
// Build base fields
const base: NodeStatusResultBase = { nodeId, unitSlug, ... };

// Return discriminated variant
if (unitResult.unit?.type === 'user-input') {
  return {
    ...base,
    unitType: 'user-input' as const,
    userInput: (unitResult.unit as NarrowUserInputWorkUnit).userInput,
  } satisfies UserInputNodeStatus;
}

return {
  ...base,
  unitType: unitResult.unit?.type ?? 'agent',
} as NodeStatusResult;
```

### Test helper

```typescript
// Updated createWorkUnit()
export function createWorkUnit(config: WorkUnitConfig): NarrowWorkUnit {
  const base = { slug: config.slug, inputs, outputs };

  if (config.unitType === 'user-input' && config.userInput) {
    return { ...base, type: 'user-input', userInput: config.userInput };
  }
  return { ...base, type: config.unitType ?? 'agent' };
}
```

---

## UI Consumption Pattern

```typescript
// In HumanInputModal or workflow-editor:
function handleNodeClick(node: NodeStatusResult) {
  if (node.unitType === 'user-input') {
    // TypeScript narrows to UserInputNodeStatus
    openHumanInputModal({
      prompt: node.userInput.prompt,
      questionType: node.userInput.questionType,
      options: node.userInput.options,
    });
  }
}
```

No type assertions needed. Compiler-enforced safety.

---

## Type Guard Functions

For convenience, add type guards alongside the existing WorkUnit guards:

```typescript
// NarrowWorkUnit guards
export function isNarrowUserInputUnit(unit: NarrowWorkUnit): unit is NarrowUserInputWorkUnit {
  return unit.type === 'user-input';
}

// NodeStatusResult guards
export function isUserInputNodeStatus(node: NodeStatusResult): node is UserInputNodeStatus {
  return node.unitType === 'user-input';
}
```

---

## Impact on Tasks Dossier

### Replaced tasks

| Old Task | New Task(s) | Change |
|----------|-------------|--------|
| T005: Extend NarrowWorkUnit with optional userInput | T005a: Create NarrowWorkUnit discriminated union (base + 3 variants) | Not an optional field — a proper union |
| T006: Extend NodeStatusResult with optional userInput | T006a: Create NodeStatusResult discriminated union (base + 3 variants) | Not an optional field — a proper union |
| T008: Update InstanceWorkUnitAdapter | T008a: Adapter constructs correct NarrowWorkUnit variant | Conditional construction, not field mapping |

### New tasks

| Task | Description |
|------|-------------|
| T005b | Add type guard functions (`isNarrowUserInputUnit`, `isUserInputNodeStatus`) |
| T012 | Update test helpers (`createWorkUnit`, `stubWorkUnitLoader`, `makeNode`, `makeNodeStatus`) to support discriminated variants |
| T013 | Update inline NarrowWorkUnit literals in test files to satisfy variant types |

### Unchanged tasks

| Task | Why unchanged |
|------|--------------|
| T001-T003 | Format A fix — unrelated to type architecture |
| T004 | TDD test for userInput config — still valid, just tests narrowing |
| T007 | Populate userInput in getNodeStatus() — same goal, different construction pattern |
| T009-T011 | Display status — downstream of type changes, same behavior |

---

## Summary

1. **NarrowWorkUnit** becomes a discriminated union mirroring `WorkUnit` — each variant carries its own config
2. **NodeStatusResult** becomes a discriminated union on `unitType` — `UserInputNodeStatus` carries `userInput`
3. **Base types stay clean** — no type-specific config on `NarrowWorkUnitBase` or `NodeStatusResultBase`
4. **Existing consumers compile unchanged** — all common fields on the base, discriminator on every variant
5. **Compiler-enforced narrowing** — `if (node.unitType === 'user-input') { node.userInput.prompt }` just works
6. **~12 sites need updates** — 2 production + ~10 test helpers/fixtures
