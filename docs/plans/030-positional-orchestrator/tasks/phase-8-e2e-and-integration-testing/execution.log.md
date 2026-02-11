# Execution Log: Phase 8 — E2E and Integration Testing

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 8: E2E and Integration Testing
**Started**: 2026-02-10
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

---

## T000: Fix ONBAS to skip user-input nodes (CS-2)

**Started**: 2026-02-10
**Status**: Complete

### What I Did

**RED**: Added 2 tests to `onbas.test.ts` in the skip logic section:
1. `user-input node is always skipped` — ready user-input at position 0 with ready agent at position 1 → expects start-node for agent (not human)
2. `sole user-input node on incomplete line → all-waiting` — single ready user-input → expects no-action/all-waiting (not start-node)

Both tests failed as expected: ONBAS returned `start-node` for the user-input node.

**GREEN**: Added unitType check in `visitNode()` `case 'ready':` branch:
```typescript
if (node.unitType === 'user-input') {
  return null;
}
```

All 41 tests pass (39 existing + 2 new).

### Evidence

```
Tests  41 passed (41)
Duration  180ms
```

### Files Changed

- `packages/positional-graph/src/features/030-orchestration/onbas.ts` — added user-input skip in `visitNode()` ready case
- `test/unit/positional-graph/features/030-orchestration/onbas.test.ts` — added 2 tests for user-input skip behavior

**Completed**: 2026-02-10

---

## T001-T009: E2E Script — Graph Fixture + All 9 Acts (CS-3 aggregate)

**Started**: 2026-02-10
**Status**: Complete

### What I Did

Built the complete E2E validation script (`test/e2e/positional-graph-orchestration-e2e.ts`) across 9 acts, following the hybrid model: in-process orchestration via `handle.run()` + CLI subprocess for agent actions.

**ACT 0 — Graph Fixture**: Created temp workspace, 8 work unit YAML files inline, 4-line graph (line-001 with manual transition), 8 nodes (2 parallel on line-003), 7 input wirings via `service.setInput()`, and orchestration stack with real ONBAS/ODS/PodManager + FakeAgentAdapter + FakeScriptRunner.

**ACT 1 — User-Input**: get-spec completed via CLI (start → accept → save-output-data → end), then `handle.run()` advances past it (ONBAS skips user-input per T000 fix).

**ACT 2 — Serial Agents**: spec-builder started by run1, completed via CLI; spec-reviewer starts as serial successor.

**ACT 3 — Manual Transition**: Line 1 complete, `handle.run()` returns no-action (line-002 blocked by manual transition on line-001). Trigger via `cg wf trigger`, next `handle.run()` starts coder.

**ACT 4 — Question/Answer**: Coder accepted, raises `question:ask` event, settle finds waiting-question (no-action), human answers via `question:answer`, raises `node:restart`, coder re-starts.

**ACT 5 — Code Node**: Tester (type=code) starts as serial successor to coder, FakeScriptRunner resolves, completed via CLI.

**ACT 6 — Parallel**: alignment-tester + pr-preparer both start in one `run()` call (2 actions); pr-creator blocked by serial gate.

**ACT 7 — Serial After Parallel**: pr-creator starts after both parallel nodes complete.

**ACT 8 — Graph Complete**: `handle.run()` returns `stopReason='graph-complete'`, reality shows 8/8 complete, `isComplete=true`.

**ACT E — Error Recovery**: Separate 1-line 2-node graph, agent errors, node goes `blocked-error`, cross-graph isolation verified (main graph still complete).

### Bugs Found and Fixed

1. **CLI crash** (`pod.agent.ts` import.meta.url at top level): esbuild CJS output replaces `import.meta` with `{}`, making `.url` undefined. Fixed with lazy `getModuleDir()` function with cascading fallbacks.

2. **`addInputWiring` doesn't exist**: Correct API is `service.setInput(ctx, graphSlug, nodeId, inputName, { from_node, from_output })`. Fixed all 7 wiring calls.

3. **Output name validation**: Names like `detailed-spec` fail schema (`^[a-z][a-z0-9_]*`). Changed all to underscores: `detailed_spec`, `test_results`, `alignment_result`, `pr_draft`, `pr_url`.

4. **Manual transition semantics**: `transition: 'manual'` on line N gates entry to line N+1 (checks `precedingLine.orchestratorSettings.transition`). Moved setting from line-002 to line-001.

### Evidence

```
ALL 58 STEPS PASSED — Orchestration E2E Complete
Plan 030 Phase 8 validation: PASS
```

### Files Changed

- `test/e2e/positional-graph-orchestration-e2e.ts` — new file, 1114 lines, 58 steps
- `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` — fixed import.meta.url crash

**Completed**: 2026-02-10

---

## T010: Vitest Wrapper (CS-1)

**Started**: 2026-02-10
**Status**: Complete

### What I Did

Created `test/integration/positional-graph/orchestration-e2e.test.ts` following the Plan 032 pattern exactly: `it.skipIf(!existsSync(CLI_PATH))`, 120s timeout, `execSync` with `stdio: 'inherit'`, 5-field test doc comment block.

### Files Changed

- `test/integration/positional-graph/orchestration-e2e.test.ts` — new file

**Completed**: 2026-02-10

---

## T011: Acceptance Criteria Verification (CS-1)

**Started**: 2026-02-10
**Status**: Complete

### What I Did

Added AC annotation comments throughout the E2E script mapping each criterion to its test assertions:
- AC-1: Reality snapshot assertions in ACT 8 (`getReality()`, `isComplete`, `completedCount`)
- AC-2: Typed `start-node` request type checks throughout
- AC-3: Deterministic walk order verified in serial (ACTs 2,7), parallel (ACT 6), gate (ACT 3)
- AC-4: Real ONBAS used in all `handle.run()` calls
- AC-5: Serial chain context inheritance (ACT 2)
- AC-6: ODS handles user-input (ACT 1), agent (ACTs 2-7), code (ACT 5)
- AC-7: Pod lifecycle — FakeAgentAdapter (ACTs 2-7), FakeScriptRunner (ACT 5)
- AC-8: Deferred (pod session restart — unit-level scope)
- AC-9: Full question lifecycle (ACT 4)
- AC-10: Two-level entry point `svc.get() -> handle.run()` (ACT 0)
- AC-11: All `handle.run()` calls exercise in-process loop
- AC-12: 8 nodes, no real agents
- AC-13: Real PodManager + fake adapters
- AC-14: 7 input wirings (ACT 0), data flows validated in downstream acts

Added detailed AC coverage summary to the script's final output.

### Files Changed

- `test/e2e/positional-graph-orchestration-e2e.ts` — added AC annotation comments + coverage summary

**Completed**: 2026-02-10

---

## T012: Final Validation (CS-1)

**Started**: 2026-02-10
**Status**: Complete

### What I Did

Ran `just fft` — lint clean, format clean, all tests pass.

### Evidence

```
Test Files  254 passed | 5 skipped (259)
     Tests  3730 passed | 41 skipped (3771)
  Duration  94.52s
```

**Completed**: 2026-02-10

---
