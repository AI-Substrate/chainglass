# Fix Tasks: Phase 4 — Real Agent Wiring Integration Tests

**Review**: [review.phase-4-real-agent-wiring-integration-tests.md](./review.phase-4-real-agent-wiring-integration-tests.md)
**Date**: 2026-02-17

---

## Blocking Fixes (must resolve before merge)

### FIX-01: Populate execution log (F-01, CRITICAL)

**File**: `docs/plans/035-agent-orchestration-wiring/tasks/phase-4-real-agent-wiring-integration-tests/execution.log.md`

The execution log is completely empty (header only). Populate with:
- One entry per task (T001–T010) with heading anchors
- Compile verification evidence (since tests are `describe.skip`, classical RED/GREEN is inapplicable)
- `just fft` gate check results (test count, pass/fail)
- Timestamps and commit SHAs
- Explicit statement that Phase 4 follows "Compile TDD" (write test → verify compilation → verify structure) rather than classical RED/GREEN/REFACTOR, because `describe.skip` tests cannot be executed without real agent auth

**Template per task**:
```markdown
### T001 — Test scaffolding [^12]

**Dossier Task**: T001
**Plan Task**: 4.1
**Status**: ✅ Complete
**Commit**: <SHA>

Created `createRealOrchestrationStack()` with dynamic imports for both Claude Code and Copilot SDK adapters.
Created `waitForPodSession()` polling helper.
Compile verification: `pnpm tsc --noEmit` passes.
```

---

### FIX-02: Add T010 to plan task table (F-02, CRITICAL)

**File**: `docs/plans/035-agent-orchestration-wiring/agent-orchestration-wiring-plan.md`

Add row 4.10 to Phase 4 task table (after 4.9):

```markdown
| 4.10 | [x] | Write multi-turn session durability test (Workshop 02: poem → compact → recall) | 2 | Same sessionId throughout, output non-empty, `describe.skip` | [📋](tasks/phase-4-real-agent-wiring-integration-tests/execution.log.md#t010--session-durability-15) | Claude only (Copilot has no compact) [^15] |
```

Also update deliverables text (line ~346) from "3 suites" to "4 suites (Claude, Copilot, parity, session durability)".

---

### FIX-03: Fix event handler race condition (F-03, HIGH)

**File**: `test/integration/orchestration-wiring-real.test.ts`
**Lines**: 216–228, 296–306, 331–335

The event handler is attached after `orchestrationService.run()` returns, potentially missing events emitted during execution.

**Option A** (preferred): Hook into the agentManager to auto-attach handler on instance creation:
```typescript
// Before run(), set up handler capture
const events: AgentEvent[] = [];
const originalGetNew = stack.agentManager.getNew.bind(stack.agentManager);
// Wrap to auto-attach handler — but this is mock-like

// Better: use agentManager.getAgents() length delta
const agentCountBefore = stack.agentManager.getAgents().length;
await stack.orchestrationService.run(ctx, graphSlug);
const newAgents = stack.agentManager.getAgents().slice(agentCountBefore);
expect(newAgents.length).toBe(1);
newAgents[0].addEventHandler((e: AgentEvent) => events.push(e));
```

**Option B** (simpler, documents limitation): Add comment acknowledging the race and noting that real agents are slow enough that event collection after wiring is reliable in practice:
```typescript
// Note: handler attached after run() — real agents take seconds to start,
// so events are reliably captured. This would race with instant adapters.
```

---

### FIX-04: Add anchor hashes to plan [📋] links (F-04, HIGH)

**File**: `docs/plans/035-agent-orchestration-wiring/agent-orchestration-wiring-plan.md`
**Lines**: 363–371

Each plan task's [📋] link should include the anchor hash matching the execution log heading. Example:

```markdown
| 4.1 | [x] | ... | [📋](tasks/.../execution.log.md#t001--test-scaffolding-12) | ... |
| 4.2 | [x] | ... | [📋](tasks/.../execution.log.md#t002--claude-code-single-node-wiring-13) | ... |
```

(Anchors depend on actual headings created in FIX-01.)

---

## Recommended Fixes (quality improvements)

### FIX-05: Fix adapterFactory type (F-05, MEDIUM)

**File**: `test/integration/orchestration-wiring-real.test.ts`
**Lines**: 80, 92

Change factory type from `ClaudeCodeAdapter` return to proper interface:

```diff
- let adapterFactory: (type: string) => InstanceType<typeof shared.ClaudeCodeAdapter>;
+ let adapterFactory: (type: string) => InstanceType<typeof shared.ClaudeCodeAdapter> | ReturnType<any>;
```

Or better, import `IAgentAdapter` and use:
```typescript
let adapterFactory: (type: string) => IAgentAdapter;
```

Remove `as never` cast on line 94.

---

### FIX-06: Address 21 lint violations (F-06, MEDIUM)

**File**: `test/integration/orchestration-wiring-real.test.ts`
**Lines**: Multiple (see review Finding F-06)

Pattern: add explicit guards before non-null assertions:

```typescript
// Before:
const nodeId = addResult.nodeId!;

// After:
const nodeId = addResult.nodeId;
expect(nodeId).toBeDefined();

// Then use nodeId! where needed — the guard above documents the invariant
```

For the `podA?.sessionId!` pattern (lines 191, 277):
```typescript
// Before:
const sessionA = podA!.sessionId!;

// After:
expect(podA).toBeDefined();
expect(podA!.sessionId).toBeTruthy();
const sessionA = podA!.sessionId!;
```

---

### FIX-07: Fix state leakage (F-07, MEDIUM)

**File**: `test/integration/orchestration-wiring-real.test.ts`
**Lines**: 218, 298, 332

Replace `agents[0]` with `agents.at(-1)` to always get the most recently created agent:

```diff
- agents[0].addEventHandler((e: AgentEvent) => events.push(e));
+ agents.at(-1)!.addEventHandler((e: AgentEvent) => events.push(e));
```

Or capture count before `run()`:
```typescript
const countBefore = stack.agentManager.getAgents().length;
await stack.orchestrationService.run(ctx, graphSlug);
const agents = stack.agentManager.getAgents();
agents[countBefore].addEventHandler((e: AgentEvent) => events.push(e));
```

---

### FIX-08: Document Compile TDD adaptation (F-09, MEDIUM)

**File**: `docs/plans/035-agent-orchestration-wiring/tasks/phase-4-real-agent-wiring-integration-tests/tasks.md`

Add a note in the Alignment Brief → Test Plan section:

```markdown
**TDD Adaptation**: Phase 4 tests use `describe.skip` and cannot be executed without real agent auth (costs money). Classical RED/GREEN/REFACTOR is inapplicable. Phase 4 follows **Compile TDD**: write test → verify TypeScript compilation → verify structural correctness via code review. This is documented as a legitimate adaptation of the plan's Full TDD approach.
```
