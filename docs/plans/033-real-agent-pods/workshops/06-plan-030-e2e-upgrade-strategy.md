# Workshop: Plan 030 E2E Upgrade Strategy

**Type**: Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: [real-agent-pods-spec.md](../real-agent-pods-spec.md) (AC-31 through AC-33)
**Created**: 2026-02-16
**Status**: Draft

**Related Documents**:
- [Workshop 02: Unified AgentInstance / AgentManagerService Design](02-unified-agent-design.md) (ODS dependency change)
- [Workshop 03: CLI-First Real Agent Execution](03-cli-first-real-agents.md) (Layer 1: Fake E2E upgrade)
- [Plan 030 Workshop 13: E2E Design](../../030-positional-orchestrator/workshops/13-phase-8-e2e-design.md) (original E2E design)
- `test/e2e/positional-graph-orchestration-e2e.ts` (the script to upgrade)
- `test/integration/positional-graph/orchestration-e2e.test.ts` (vitest wrapper)

---

## Purpose

Define the minimal, safe upgrade path for the Plan 030 orchestration E2E script when ODS changes from `IAgentAdapter` to `IAgentManagerService`. The E2E is the most complex test in the codebase (1128 lines, 58 steps, 8-node pipeline). The goal is to change ONLY the wiring — same assertions, same behavior, same pipeline.

## Key Questions Addressed

- Q1: What exact lines change in the E2E script?
- Q2: How do we verify the upgrade is equivalent?
- Q3: What about unit tests that also reference the old interfaces?
- Q4: Should we run old and new in parallel during transition?

---

## Scope: Minimal Wiring Change

The upgrade touches exactly ONE function in the E2E script: `createOrchestrationStack()`. Everything else — the 8-node pipeline, the 58-step sequence, all assertions — stays identical.

**Why minimal?** The E2E proves the orchestration machinery works. It uses fake agents (the test itself acts as the agent via CLI commands). Fake agents complete synchronously. The only change is HOW ODS gets its agent dependency — from a raw adapter to a manager service. The fake agent behavior is unchanged.

---

## Current Wiring (Plan 030)

```typescript
// test/e2e/positional-graph-orchestration-e2e.ts (lines 91-115)

import { FakeAgentAdapter } from '@chainglass/shared';

function createOrchestrationStack(service, ctx) {
  // ... event system setup (unchanged) ...

  const podManager = new PodManager(nodeFs);
  const agentAdapter = new FakeAgentAdapter();        // ← THIS CHANGES
  const scriptRunner = new FakeScriptRunner();
  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentAdapter,                                      // ← THIS CHANGES
    scriptRunner,
  });

  // ... orchestrationService setup (unchanged) ...

  return { orchestrationService, eventHandlerService, agentAdapter, scriptRunner, podManager };
}
```

**4 occurrences** of `FakeAgentAdapter` / `agentAdapter` in the file.

---

## New Wiring (Plan 033)

```typescript
// test/e2e/positional-graph-orchestration-e2e.ts

import { FakeAgentManagerService } from '@chainglass/shared';  // CHANGED import

function createOrchestrationStack(service, ctx) {
  // ... event system setup (UNCHANGED) ...

  const podManager = new PodManager(nodeFs);
  const agentManager = new FakeAgentManagerService();  // CHANGED: adapter → manager
  const scriptRunner = new FakeScriptRunner();
  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,                                       // CHANGED: adapter → manager
    scriptRunner,
  });

  // ... orchestrationService setup (UNCHANGED) ...

  return { orchestrationService, eventHandlerService, agentManager, scriptRunner, podManager };
  //                                                    ^ CHANGED return field name
}
```

### Exact Diff

```diff
-import { FakeAgentAdapter } from '@chainglass/shared';
+import { FakeAgentManagerService } from '@chainglass/shared';

 function createOrchestrationStack(service, ctx) {
   // ... unchanged ...
   const podManager = new PodManager(nodeFs);
-  const agentAdapter = new FakeAgentAdapter();
+  const agentManager = new FakeAgentManagerService();
   const scriptRunner = new FakeScriptRunner();
   const ods = new ODS({
     graphService: service,
     podManager,
     contextService,
-    agentAdapter,
+    agentManager,
     scriptRunner,
   });
   // ... unchanged ...
-  return { orchestrationService, eventHandlerService, agentAdapter, scriptRunner, podManager };
+  return { orchestrationService, eventHandlerService, agentManager, scriptRunner, podManager };
 }
```

**4 lines changed. Zero assertion changes.**

---

## Why This Works Without Behavior Changes

The E2E test acts as the agent — it calls CLI commands (`cg wf node accept`, `cg wf node end`, etc.) directly. The fake adapter / manager is never actually called for real agent work. Here's why:

1. **ODS fires `pod.execute()`** → pod calls `agentAdapter.run()` (or `agentInstance.run()` in the new code)
2. **But the fake adapter is never configured to do anything** — the test completes node execution manually via CLI commands
3. **The agent status transitions happen via events on disk** — not via the adapter return value
4. **ODS doesn't await `pod.execute()`** — fire-and-forget means the loop continues immediately

The fake adapter is a placeholder. The test drives the pipeline through CLI commands. Swapping `FakeAgentAdapter` for `FakeAgentManagerService` doesn't change test behavior because neither is actively used for agent work.

**One subtlety**: `FakeAgentManagerService` internally creates `FakeAgentInstance` objects when ODS calls `getNew()` / `getWithSessionId()`. These instances wrap `FakeAgentAdapter` (created by the fake's internal factory). The `FakeAgentInstance.run()` returns a default `AgentResult` with status `completed`. This matches the current `FakeAgentAdapter.run()` default behavior.

---

## Affected Unit Tests

Beyond the E2E script, these unit test files reference the old ODS interface:

| File | What Changes | Lines Affected |
|------|-------------|----------------|
| `test/unit/.../ods.test.ts` | `agentAdapter` → `agentManager` in deps | ~5-10 lines (setup) |
| `test/unit/.../pod.test.ts` | `IAgentAdapter` → `IAgentInstance` in pod constructor | ~5-10 lines |
| `test/unit/.../pod-manager.test.ts` | `PodCreateParams.adapter` → `.agentInstance` | ~3-5 lines |
| `test/unit/.../container-orchestration.test.ts` | DI token change | ~2-3 lines |

All changes are mechanical: swap the type/variable name. No assertion logic changes.

### ODS Unit Test Example

```diff
 // test/unit/.../ods.test.ts

-import { FakeAgentAdapter } from '@chainglass/shared';
+import { FakeAgentManagerService } from '@chainglass/shared';

 function createODS() {
-  const agentAdapter = new FakeAgentAdapter();
+  const agentManager = new FakeAgentManagerService();
   return new ODS({
     graphService: fakeGraphService,
     podManager: fakePodManager,
     contextService: fakeContextService,
-    agentAdapter,
+    agentManager,
     scriptRunner: fakeScriptRunner,
   });
 }
```

### Pod Unit Test Example

```diff
 // test/unit/.../pod.test.ts

-import { FakeAgentAdapter } from '@chainglass/shared';
+import { FakeAgentInstance } from '@chainglass/shared';

-const adapter = new FakeAgentAdapter();
-const pod = new AgentPod('test-node', adapter);
+const instance = new FakeAgentInstance({
+  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp'
+});
+const pod = new AgentPod('test-node', instance, 'test-unit');
```

---

## Verification Strategy

### Step 1: Baseline (Before Changes)

```bash
# Run the E2E and capture output
npx tsx test/e2e/positional-graph-orchestration-e2e.ts 2>&1 | tee /tmp/e2e-before.log
echo $?  # Should be 0

# Run all unit tests
just test 2>&1 | tail -5  # Should be 3858+ passed
```

### Step 2: Apply Changes

1. Update ODS interface (`agentAdapter` → `agentManager`)
2. Update AgentPod constructor (`adapter` → `agentInstance`)
3. Update PodCreateParams
4. Update E2E script wiring
5. Update unit tests

### Step 3: Verify (After Changes)

```bash
# Run the E2E — same output, same 58 steps
npx tsx test/e2e/positional-graph-orchestration-e2e.ts 2>&1 | tee /tmp/e2e-after.log
echo $?  # Should be 0

# Diff the outputs (ignoring timestamps)
diff <(grep -v 'timestamp\|ms\|[0-9]s' /tmp/e2e-before.log) \
     <(grep -v 'timestamp\|ms\|[0-9]s' /tmp/e2e-after.log)
# Should be empty or near-empty diff

# Run all unit tests — same count, same pass
just test 2>&1 | tail -5  # Should be 3858+ passed (possibly +/- for new tests)
```

### Step 4: Run just fft

```bash
just fft  # lint + format + test — must pass before commit
```

---

## Should We Run Old and New in Parallel?

**No.** The changes are mechanical wiring swaps. Running both versions adds maintenance burden without value. The verification strategy (before/after diff) is sufficient.

If we wanted extra safety, we could:
1. Create a git stash of the pre-change state
2. Run E2E before
3. Apply changes
4. Run E2E after
5. Compare outputs

But this is a one-time migration, not an ongoing concern. Once the wiring is updated, the old path is gone.

---

## Change Order

The recommended order minimizes broken intermediate states:

```
1. Update types/interfaces first:
   - ODSDependencies: agentAdapter → agentManager
   - PodCreateParams: adapter → agentInstance
   - AgentPod constructor: (nodeId, adapter) → (nodeId, instance, unitSlug)

2. Update implementations:
   - ODS.handleAgentOrCode(): use agentManager.getNew/getWithSessionId
   - AgentPod: wrap IAgentInstance, remove internal _sessionId
   - PodManager.createPod(): read agentInstance from params

3. Update tests (all at once — they share the same changes):
   - ODS unit tests
   - Pod unit tests
   - Pod manager unit tests
   - Container tests
   - E2E script

4. Run just fft — everything must pass

5. Commit
```

**Why all tests at once?** The interface change is breaking — you can't update ODS without updating its tests, and the tests import the same fakes. Doing it incrementally would leave the repo in a broken state between commits.

---

## Files Touched (Complete List)

| File | Change Type | Lines Changed (est.) |
|------|------------|---------------------|
| `packages/positional-graph/src/features/030-orchestration/ods.ts` | Interface + implementation | ~20 |
| `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` | Constructor + methods | ~30 |
| `packages/positional-graph/src/features/030-orchestration/pod-manager.ts` | PodCreateParams handling | ~5 |
| `packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts` | PodCreateParams type | ~3 |
| `packages/positional-graph/src/features/030-orchestration/pod.schema.ts` | PodExecuteOptions (remove contextSessionId) | ~2 |
| `packages/positional-graph/src/container.ts` | DI token change | ~5 |
| `test/unit/.../ods.test.ts` | Wiring swap | ~10 |
| `test/unit/.../pod.test.ts` | Constructor change | ~10 |
| `test/unit/.../pod-manager.test.ts` | PodCreateParams | ~5 |
| `test/unit/.../container-orchestration.test.ts` | DI token | ~3 |
| `test/e2e/positional-graph-orchestration-e2e.ts` | Wiring swap (4 lines) | ~4 |

**Total: ~97 lines across 11 files.** Mechanical changes, no logic changes.

---

## Open Questions

### Q1: Should we also add execution tracking to the E2E?

**OPEN**: The E2E currently works without execution tracking because fake agents complete synchronously. Should we add `trackExecution` calls to prove the new tracking works?

**Recommendation**: No — the E2E tests the orchestration pipeline, not PodManager internals. Execution tracking has its own unit tests (Workshop 05). The E2E upgrade should be minimal.

### Q2: Does the E2E need `FakeAgentManagerService` or can it use `AgentManagerService` with `FakeAgentAdapter`?

**OPEN**: Two options:
- A: `FakeAgentManagerService` — fully fake, no real adapter calls (current recommendation)
- B: Real `AgentManagerService` with fake adapter factory — tests more of the real code path

**Recommendation**: Option A for the existing E2E (keeps it fast and deterministic). Option B for new real-agent E2E tests (Layer 2).

---

## Quick Reference

```
WHAT CHANGES:
  - 4 lines in E2E script (import + 3 variable references)
  - ~10 lines each in ODS, pod, pod-manager unit tests
  - ~97 lines total across 11 files

WHAT STAYS:
  - All 58 E2E steps
  - All assertions
  - Pipeline structure (8 nodes, 4 lines)
  - CLI command execution pattern
  - Vitest wrapper (unchanged)

VERIFICATION:
  - Before/after E2E output diff
  - just fft passes
  - Test count stays at 3858+
```
