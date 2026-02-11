# Phase 8: E2E Validation Script — Execution Log

**Plan**: [node-event-system-plan.md](../../node-event-system-plan.md)
**Phase**: Phase 8: E2E Validation Script
**Started**: 2026-02-09

---

## Task T014: Expose loadGraphState/persistGraphState on IPositionalGraphService
**Started**: 2026-02-09
**Status**: ✅ Complete

### What I Did
Added `loadGraphState(ctx, graphSlug): Promise<State>` and `persistGraphState(ctx, graphSlug, state): Promise<void>` to `IPositionalGraphService` interface and `PositionalGraphService` implementation. The public methods delegate to the existing private `loadState`/`persistState` methods. Added `State` to the interface's schema imports.

### Evidence
- `npx tsc --noEmit -p packages/positional-graph/tsconfig.json` — clean (exit 0)
- `npx vitest run test/unit/positional-graph/graph-crud.test.ts` — 15 passed, 0 failed

### Files Changed
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — added `State` import + 2 method signatures
- `packages/positional-graph/src/services/positional-graph.service.ts` — added 2 public delegating methods

**Completed**: 2026-02-09
---

## Task T015: Extract shared E2E helpers + refactor existing positional-graph-e2e.ts
**Started**: 2026-02-09
**Status**: ✅ Complete

### What I Did
1. Created `test/helpers/positional-graph-e2e-helpers.ts` with shared utilities: `createTestServiceStack`, `createTestWorkspaceContext`, `runCli`, `createStepCounter`, `assert`, `unwrap`, `banner`, `cleanup`.
2. Refactored `test/e2e/positional-graph-e2e.ts` to import `assert`, `unwrap`, `createStepCounter`, `createTestServiceStack`, `cleanup` from shared helpers instead of defining locally.
3. Fixed 2 broken method calls in old E2E: `setNodeExecution` → `updateNodeOrchestratorSettings`, `setLineTransition` → `updateLineOrchestratorSettings` (methods were renamed in Plan 026 Subtask 001 but E2E wasn't updated).

### Evidence
- `npx tsx test/e2e/positional-graph-e2e.ts` — ALL 33 E2E OPERATIONS VERIFIED, exit 0
- `just fft` — 3689 tests passed, 0 failed

### Files Changed
- `test/helpers/positional-graph-e2e-helpers.ts` — NEW: shared E2E helpers
- `test/e2e/positional-graph-e2e.ts` — refactored imports, fixed 2 broken method calls

### Discoveries
- `setNodeExecution` and `setLineTransition` were removed during Plan 026 Subtask 001 (property bags) but the old E2E was never updated. The old E2E was silently broken — not caught because it's not in `just fft`.

**Completed**: 2026-02-09
---

## Tasks T001-T012: Create complete E2E validation script
**Started**: 2026-02-09
**Status**: ✅ Complete

### What I Did
Created the complete E2E validation script at `test/e2e/node-event-system-visual-e2e.ts` — a 700+ line standalone `tsx` script exercising the entire node event system end-to-end. The script uses a hybrid model:
- **In-process**: graph/node creation (service calls), orchestrator settlement (processGraph), state verification
- **CLI subprocess**: all agent/human event actions (start, accept, raise-event, end, error, events, stamp-event, save-output-data, event list-types, event schema)

The script tells a 4-act story across 41 verified steps:
- **ACT 1**: Setup (graph + 2 nodes in-process), schema discovery (list-types, schema CLI), error handling (5 error codes E190/E191/E193/E196/E197 + error shortcut)
- **ACT 2**: Simple node lifecycle (spec-writer: start → accept → save-output-data → end)
- **ACT 3**: Agent node lifecycle (code-builder: start → accept → processGraph settle → progress:update → save-output-data → question:ask → processGraph settle → question:answer from human → processGraph settle → re-accept → progress:update → save-output-data → end)
- **ACT 4**: Inspection (event log table, stamp-event demo with 3 subscribers), proof (processGraph settle + idempotency 0 events, final state validation)

### Key Discoveries
1. **Work unit YAML required for CLI `end`**: The `endNode` method calls `canEnd` which calls `workUnitLoader.load()` to check required outputs. The CLI's real loader reads from `.chainglass/units/<slug>/unit.yaml`. Solution: create minimal YAML files for each unit slug in the temp workspace.
2. **Schema validation strictness**: `user-input` type requires `user_input` section, `agent` type requires `agent` section (including `prompt_template`). Missing sections cause E182 errors.
3. **Payload field naming**: `progress:update` uses `percent` (not `percentage`), `question:answer` uses `answer` (not `text`). All schemas `.strict()`.
4. **Idempotency requires two-pass**: After agent completes, events from re-accept/final-progress/node:completed need one more processGraph settle. True idempotency (0 events) only on second pass.
5. **Node ID indirection**: `generateNodeId()` produces `{slug}-{hex3}`, not the slug. All CLI calls must use actual generated IDs.

### Evidence
- `npx tsx test/e2e/node-event-system-visual-e2e.ts` — ALL 41 STEPS PASSED, exit 0
- `just fft` — 3689 tests passed, 0 failed

### Files Changed
- `test/e2e/node-event-system-visual-e2e.ts` — NEW: complete E2E validation script

**Completed**: 2026-02-09
---

## Task T013: Run complete script + just fft
**Started**: 2026-02-09
**Status**: ✅ Complete

### What I Did
1. Built CLI: `pnpm build --filter=@chainglass/cli` — cached
2. Ran E2E: `npx tsx test/e2e/node-event-system-visual-e2e.ts` — ALL 41 STEPS PASSED, exit 0
3. Fixed Biome lint: safe + unsafe fixes (template literals → string literals, line wrapping)
4. Ran `just fft` — 3689 tests passed, 0 failed

### Evidence
- E2E script: exit 0, ALL 41 STEPS PASSED
- `just fft`: 247 test files passed, 3689 tests passed, 0 failed

**Completed**: 2026-02-09
---

