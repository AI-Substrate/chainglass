# Fix Tasks: Phase 8 — E2E and Integration Testing

**Review**: review.phase-8-e2e-and-integration-testing.md
**Date**: 2026-02-10
**Severity ordering**: HIGH first, then MEDIUM, then LOW

---

## HIGH — Blocking (must fix before commit)

### FIX-1: Update plan progress tracking (V1 + V2)

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`

1. **Line 744**: Change `- [ ] Phase 8: E2E and Integration Testing - Pending (awaiting Phase 7)` to `- [x] Phase 8: E2E and Integration Testing - COMPLETE`

2. **Lines 667-678**: Update all Phase 8 task statuses from `[ ]` to `[x]` and add Log/Notes entries. Recommended: run `plan-6a` to handle this systematically.

### FIX-2: Add Phase 8 footnotes to Change Footnotes Ledger (V3)

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`

Append after line ~900 (after [^32]):

```markdown
[^33]: Phase 8 Task T000 — ONBAS user-input skip fix
  - `function:packages/positional-graph/src/features/030-orchestration/onbas.ts:visitNode`
  - `file:test/unit/positional-graph/features/030-orchestration/onbas.test.ts`

[^34]: Phase 8 Tasks T001-T009 — E2E validation script + pod.agent.ts bug fix
  - `file:test/e2e/positional-graph-orchestration-e2e.ts`
  - `class:packages/positional-graph/src/features/030-orchestration/pod.agent.ts:AgentPod`

[^35]: Phase 8 Task T010 — Vitest wrapper
  - `file:test/integration/positional-graph/orchestration-e2e.test.ts`
```

### FIX-3: Populate Phase Footnote Stubs in dossier (V6)

**File**: `docs/plans/030-positional-orchestrator/tasks/phase-8-e2e-and-integration-testing/tasks.md`

Replace the empty stubs table (line ~421-423) with:

```markdown
| Footnote | Task | Description |
|----------|------|-------------|
| [^33] | T000 | ONBAS user-input skip fix (visitNode + tests) |
| [^34] | T001-T009 | E2E script + pod.agent.ts CJS compatibility fix |
| [^35] | T010 | Vitest wrapper for CI |
```

Add footnote references to the task table Notes column:
- T000 Notes: add `[^33]`
- T001-T009 Notes: add `[^34]`
- T010 Notes: add `[^35]`

---

## MEDIUM — Recommended (non-blocking)

### FIX-4: Add warning to process.cwd() fallback (V4)

**File**: `packages/positional-graph/src/features/030-orchestration/pod.agent.ts`, line 29

```diff
   if (typeof __dirname === 'string') {
     return __dirname;
   }
+  console.warn('[pod.agent] getModuleDir: falling back to process.cwd() — prompt file may not be found');
   return process.cwd();
```

### FIX-5: Fix "12 input wirings" text (V5)

**File**: `docs/plans/030-positional-orchestrator/tasks/phase-8-e2e-and-integration-testing/tasks.md`

- Line 111: Change "12 connections wired in ACT 0" → "7 connections wired in ACT 0"
- Line 202: Change "wire all 12 inputs" → "wire all 7 inputs" and "12 input wirings" → "7 input wirings" (in both Task and Validation columns)
- Line 400: Change "8 nodes, 12 inputs" → "8 nodes, 7 inputs"

### FIX-6: Add Deviation Ledger entry for pod.agent.ts

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`

Add to Deviation Ledger (after line 773):

```markdown
| Non-Goals: no production code changes | import.meta.url crashes in CJS (esbuild) — blocking E2E | Skip pod.agent.ts fix and run E2E without CLI — rejected because CLI is required for hybrid model | Minimal fix; lazy evaluation defers evaluation to runtime; 3-level fallback prevents future breakage |
```

---

## LOW — Nice to have

### FIX-7: Populate Discoveries & Learnings table (V7)

**File**: `docs/plans/030-positional-orchestrator/tasks/phase-8-e2e-and-integration-testing/tasks.md`

Populate line ~441 with:

```markdown
| 2026-02-10 | T001-T009 | gotcha | CLI crash: `import.meta.url` undefined in esbuild CJS output | Lazy `getModuleDir()` with cascading fallbacks | pod.agent.ts |
| 2026-02-10 | T001-T009 | gotcha | `addInputWiring` API doesn't exist — correct API is `service.setInput()` | Fixed all 7 wiring calls | E2E script |
| 2026-02-10 | T001-T009 | gotcha | Output names like `detailed-spec` fail schema (`^[a-z][a-z0-9_]*`) | Changed to underscores: `detailed_spec`, etc. | E2E script |
| 2026-02-10 | T001-T009 | insight | Manual transition semantics: `transition: 'manual'` on line N gates entry to line N+1 | Moved setting from line-002 to line-001 | E2E script |
```
