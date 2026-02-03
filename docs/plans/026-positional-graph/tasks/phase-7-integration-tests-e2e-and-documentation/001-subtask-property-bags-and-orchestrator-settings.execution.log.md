# Execution Log: Subtask 001 — Property Bags and Orchestrator Settings

**Started**: 2026-02-03
**Subtask**: 001-subtask-property-bags-and-orchestrator-settings
**Testing Approach**: TAD (Test-Assisted Development)

---

## Task ST001: Create property bag schemas
**Status**: Complete

### What I Did
Created `packages/positional-graph/src/schemas/properties.schema.ts` with three open-bag schemas using `.catchall(z.unknown())`.

### Files Changed
- `packages/positional-graph/src/schemas/properties.schema.ts` — New file

---

## Task ST002: Create orchestrator settings schemas
**Status**: Complete

### What I Did
Created `packages/positional-graph/src/schemas/orchestrator-settings.schema.ts` with base + 3 entity-specific schemas. Used `.strict()` to reject unknown keys.

### Discoveries
- Circular dependency between `graph.schema.ts` and `orchestrator-settings.schema.ts` — both import from each other. Resolved by extracting `ExecutionSchema` and `TransitionModeSchema` into `enums.schema.ts`, with `graph.schema.ts` re-exporting for backward compatibility.

### Files Changed
- `packages/positional-graph/src/schemas/orchestrator-settings.schema.ts` — New file
- `packages/positional-graph/src/schemas/enums.schema.ts` — New file (extracted enums)

---

## Task ST003: Migrate graph.schema.ts
**Status**: Complete

### What I Did
Removed top-level `transition` from `LineDefinitionSchema`. Added `properties` and `orchestratorSettings` with `.default({})` to both `LineDefinitionSchema` and `PositionalGraphDefinitionSchema`.

### Files Changed
- `packages/positional-graph/src/schemas/graph.schema.ts` — Modified

---

## Task ST004: Migrate node.schema.ts
**Status**: Complete

### What I Did
Removed top-level `execution` and `config` from `NodeConfigSchema`. Added `properties` and `orchestratorSettings` with `.default({})`.

### Files Changed
- `packages/positional-graph/src/schemas/node.schema.ts` — Modified

---

## Task ST005: Update barrel exports
**Status**: Complete

### What I Did
Updated `packages/positional-graph/src/schemas/index.ts` to export all new schemas and types from `enums.schema.ts`, `properties.schema.ts`, and `orchestrator-settings.schema.ts`.

### Files Changed
- `packages/positional-graph/src/schemas/index.ts` — Modified

---

## Task ST006: Add backfill migration to service
**Status**: Complete

### What I Did
Added pre-parse transforms in `loadGraphDefinition` and `loadNodeConfig`:
- Lines with top-level `transition` but no `orchestratorSettings` get migrated
- Nodes with top-level `execution` but no `orchestratorSettings` get migrated
- Dead `config` field stripped from nodes

Used destructuring to avoid `delete` (Biome noDelete lint rule).

### Files Changed
- `packages/positional-graph/src/services/positional-graph.service.ts` — Modified

---

## Task ST007: Update service interface + implementation
**Status**: Complete

### What I Did
1. **Interface**: Removed `setLineTransition`, `setNodeExecution`. Removed `transition` from `AddLineOptions`, `execution` from `AddNodeOptions`. Added 6 new methods: `updateGraphProperties`, `updateLineProperties`, `updateNodeProperties`, `updateGraphOrchestratorSettings`, `updateLineOrchestratorSettings`, `updateNodeOrchestratorSettings`.
2. **Service**: Updated all ~12 runtime consumer sites (DYK-I1 accessor pattern). Updated write paths in `create()`, `addLine()`, `addNode()` (DYK-I2). Service flattens `orchestratorSettings` into result types (DYK-I3). Added 6 new method implementations with Zod `.partial().safeParse()` validation for orch settings.
3. **input-resolution.ts**: Updated Gate 2 (`precedingLine.orchestratorSettings.transition`) and Gate 3 (`nodeConfig.orchestratorSettings.execution`).

### Files Changed
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — Modified
- `packages/positional-graph/src/services/positional-graph.service.ts` — Modified
- `packages/positional-graph/src/services/input-resolution.ts` — Modified

---

## Task ST008: Update existing tests
**Status**: Complete

### What I Did
Updated all existing tests referencing `execution`, `transition`, `setLineTransition`, `setNodeExecution`, and `AddNodeOptions.execution`/`AddLineOptions.transition`:
- `schemas.test.ts` — 4 assertion changes
- `node-operations.test.ts` — Converted `setNodeExecution` tests to `updateNodeOrchestratorSettings`, updated addNode calls
- `line-operations.test.ts` — Converted `setLineTransition` tests to `updateLineOrchestratorSettings`, updated addLine calls
- `can-run.test.ts` — Updated 3 calls
- `status.test.ts` — Updated 3 calls
- `graph-lifecycle.test.ts` (integration) — Updated 2 calls

### Evidence
All 221 positional-graph tests pass (13 files, 0 failures).

### Files Changed
- `test/unit/positional-graph/schemas.test.ts`
- `test/unit/positional-graph/node-operations.test.ts`
- `test/unit/positional-graph/line-operations.test.ts`
- `test/unit/positional-graph/can-run.test.ts`
- `test/unit/positional-graph/status.test.ts`
- `test/integration/positional-graph/graph-lifecycle.test.ts`

---

## Task ST009: CLI get commands
**Status**: Complete

### What I Did
Added kubectl-style `get` commands for graph, line, and node. `get` aliases `show` for graph and node; `line get` delegates to status with line filter.

### Files Changed
- `apps/cli/src/commands/positional-graph.command.ts` — Modified

---

## Task ST010: CLI set commands
**Status**: Complete

### What I Did
Added kubectl-style `set` commands with `--prop key=value` (repeatable) and `--orch key=value` (repeatable) flags for graph, line, and node. Removed `set-transition` and `set-execution` commands. Added `parseKeyValuePairs` helper (JSON.parse for type coercion).

### Files Changed
- `apps/cli/src/commands/positional-graph.command.ts` — Modified

---

## Task ST011: New unit tests
**Status**: Complete

### What I Did
Created `test/unit/positional-graph/properties-and-orchestrator.test.ts` with 19 tests:
- Schema validation (6 tests): defaults, open bag, strict rejection
- Properties round-trip (4 tests): node, line, graph, deep-merge
- Orchestrator settings round-trip (4 tests): set/get, partial update, rejection of unknown keys
- Backfill migration (2 tests): old-format node YAML, old-format graph YAML
- Defaults (3 tests): new node, new line, empty properties

### Evidence
All 19 tests pass.

### Files Changed
- `test/unit/positional-graph/properties-and-orchestrator.test.ts` — New file

---

## Task ST012: Final quality gate
**Status**: Complete

### Evidence
```
just check: PASS
- Lint: 0 errors
- Typecheck: 0 errors
- Tests: 2959 passed, 41 skipped, 0 failures (209 test files)
- Build: Success
```

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-02-03 | ST002 | gotcha | Circular dependency: graph.schema imports orchestrator-settings, which imports ExecutionSchema from graph.schema | Extracted ExecutionSchema/TransitionModeSchema to enums.schema.ts |
| 2026-02-03 | ST002 | insight | Zod `.extend()` does NOT preserve `.strict()` — must chain `.strict()` after every `.extend()` call | Added `.strict()` to all orchestrator settings schemas |
| 2026-02-03 | ST006 | gotcha | Biome lint rule `noDelete` prohibits `delete obj.key` — need alternative approach | Used destructuring to create new objects without the keys |
| 2026-02-03 | ST013 | insight | `wf status` command has pre-existing bug: `Cannot read properties of undefined (reading 'length')` — console-output.adapter.ts inline types are outdated stubs mismatched with actual service result types. Confirmed same error on pre-change code. Not caused by this subtask. | Documented as pre-existing; out of scope per DYK-I3 |

---

## Task ST013: Manual CLI validation with real data
**Status**: Complete

### What I Did
Ran full manual CLI validation against real workspace (`chainglass-main`):

1. **Graph creation**: `wf create test-props-orch` -- created with initial line
2. **Node creation**: `wf node add test-props-orch line-5d6 sample-coder` -- added node
3. **Node set props + orch**: `wf node set ... --prop role=coder --prop priority=5 --orch execution=parallel`
   - Verified YAML: `properties.role: coder`, `properties.priority: 5`, `orchestratorSettings.execution: parallel`, `orchestratorSettings.waitForPrevious: true` (default)
4. **Line set props + orch**: `wf line set ... --prop environment=staging --orch transition=manual --orch autoStartLine=false`
   - Verified YAML: `properties.environment: staging`, `orchestratorSettings.transition: manual`, `orchestratorSettings.autoStartLine: false`
5. **Graph set props**: `wf set ... --prop owner=jak --prop version=2`
   - Verified YAML: `properties.owner: jak`, `properties.version: 2`
6. **Zod rejection**: `wf node set ... --orch bogusKey=true` -- correctly returned E170 error
7. **Deep-merge**: Added `--prop status=active` -- preserved existing `role` and `priority`
8. **Partial orch update**: `--orch waitForPrevious=false` -- preserved `execution: parallel`
9. **get/show aliases**: Both `wf get` and `wf show` produce same output with `[manual]` transition display
10. **JSON output**: `wf node get --json` returns flat `execution` field (DYK-I3 confirmed)
11. **Pre-existing bug**: `wf status` fails with same error on old code -- not our regression

### Evidence
- Node YAML shows correct nested structure: `orchestratorSettings.execution: parallel`, `properties.role: coder`
- Graph YAML shows correct line structure: `orchestratorSettings.transition: manual`, `properties.environment: staging`
- E170 error returned for unknown orch key `bogusKey`
- Deep-merge preserves existing properties on partial update
- `wf status` bug is pre-existing (verified by testing on stashed pre-change code)

### Discoveries
- `wf status` command has pre-existing bug in console-output.adapter.ts (inline types don't match service result types). Not caused by this subtask -- confirmed by testing on old code.

**Completed**: 2026-02-03
