# Phase 2: Schema, Types, and Filesystem Adapter — Execution Log

---

## Task T001: Create positional-graph package scaffold
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T001 | **Plan Task**: 2.1

### What I Did
1. Created `packages/positional-graph/` directory structure with `src/{schemas,services,errors,adapter}` subdirectories
2. Created `package.json` with deps on `@chainglass/shared`, `@chainglass/workflow`, `zod`; subpath exports for `/schemas`, `/errors`, `/adapter`
3. Created `tsconfig.json` extending root, referencing shared+workflow
4. Created `src/index.ts` barrel re-exporting all submodules
5. Created stub barrel files for schemas, services, errors, adapter (with `export {}` for valid modules)
6. Created placeholder `container.ts` with `registerPositionalGraphServices` stub
7. Added `@chainglass/positional-graph` path alias to root `tsconfig.json`
8. Added `@chainglass/positional-graph` resolve alias to `vitest.config.ts`
9. Ran `pnpm install` — workspace resolved successfully
10. Ran `pnpm build --filter @chainglass/positional-graph` — 3/3 tasks successful

### Evidence
```
pnpm build --filter @chainglass/positional-graph
Tasks: 3 successful, 3 total (shared cached, workflow cached, positional-graph built)
```

### Discoveries
- Empty barrel files with only comments are not valid ES modules — need `export {}` for TypeScript to treat them as modules

### Files Changed
- `packages/positional-graph/package.json` — NEW
- `packages/positional-graph/tsconfig.json` — NEW
- `packages/positional-graph/src/index.ts` — NEW
- `packages/positional-graph/src/schemas/index.ts` — NEW (stub)
- `packages/positional-graph/src/services/index.ts` — NEW (stub)
- `packages/positional-graph/src/errors/index.ts` — NEW (stub)
- `packages/positional-graph/src/adapter/index.ts` — NEW (stub)
- `packages/positional-graph/src/container.ts` — NEW (stub)
- `tsconfig.json` (root) — Added positional-graph path mapping
- `vitest.config.ts` — Added positional-graph resolve alias

**Completed**: 2026-02-01
---

## Task T002: Write schema tests (TDD RED)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T002 | **Plan Task**: 2.2

### What I Did
Wrote 50 tests covering all Zod schemas: TransitionModeSchema, ExecutionSchema, LineDefinitionSchema, PositionalGraphDefinitionSchema, InputResolutionSchema, NodeConfigSchema, GraphStatusSchema, NodeExecutionStatusSchema, NodeStateEntrySchema, TransitionEntrySchema, StateSchema. Tests verify valid parses, defaults, rejections for invalid data.

### Evidence
```
RED: 50 failed (50) — all schema imports undefined (no implementation yet)
```

### Files Changed
- `test/unit/positional-graph/schemas.test.ts` — NEW (475 lines, 50 tests)

**Completed**: 2026-02-01
---

## Task T004: Write ID generation tests (TDD RED)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T004 | **Plan Task**: 2.4

### What I Did
Wrote 10 tests: generateLineId format, uniqueness, collision avoidance; generateNodeId format, prefix, hex3 suffix, collision avoidance, max attempts error.

### Evidence
```
RED: 9 failed | 1 passed (10) — one "max attempts" test passes vacuously since import throws
```

### Files Changed
- `test/unit/positional-graph/id-generation.test.ts` — NEW (10 tests)

**Completed**: 2026-02-01
---

## Task T006: Write error code tests (TDD RED)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T006 | **Plan Task**: 2.6

### What I Did
Wrote tests for all 14 error factories (E150-E156, E160-E164, E170-E171) plus error code constant validation and shape verification.

### Evidence
```
RED: no tests — imports fail entirely (errors barrel is empty)
```

### Files Changed
- `test/unit/positional-graph/error-codes.test.ts` — NEW (14 factory tests + constant + shape tests)

**Completed**: 2026-02-01
---

## Task T003: Implement Zod schemas (TDD GREEN)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T003 | **Plan Task**: 2.3

### What I Did
Created three schema files:
1. `graph.schema.ts` — ExecutionSchema, TransitionModeSchema, LineDefinitionSchema, PositionalGraphDefinitionSchema
2. `node.schema.ts` — InputResolutionSchema (union of from_unit/from_node), NodeConfigSchema
3. `state.schema.ts` — GraphStatusSchema, NodeExecutionStatusSchema, NodeStateEntrySchema, TransitionEntrySchema, StateSchema

Updated `schemas/index.ts` barrel with all exports (schemas + inferred types).

### Evidence
```
GREEN: 50 passed (50) — all schema tests pass
```

### Files Changed
- `packages/positional-graph/src/schemas/graph.schema.ts` — NEW
- `packages/positional-graph/src/schemas/node.schema.ts` — NEW
- `packages/positional-graph/src/schemas/state.schema.ts` — NEW
- `packages/positional-graph/src/schemas/index.ts` — Updated with exports

**Completed**: 2026-02-01
---

## Task T005: Implement ID generation (TDD GREEN)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T005 | **Plan Task**: 2.5

### What I Did
Implemented `generateLineId` and `generateNodeId` in `id-generation.ts` using hex3 pattern (locally reimplemented per CD-06/CD-14). Updated services barrel.

### Evidence
```
GREEN: 10 passed (10)
```

### Files Changed
- `packages/positional-graph/src/services/id-generation.ts` — NEW
- `packages/positional-graph/src/services/index.ts` — Updated with exports

**Completed**: 2026-02-01
---

## Task T007: Implement error code factories (TDD GREEN)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T007 | **Plan Task**: 2.7

### What I Did
Implemented 14 error factory functions following workgraph-errors.ts pattern. All return `ResultError` with code, message, and action. Error codes: E150-E156 (structure), E160-E164 (input resolution), E170-E171 (status). Updated errors barrel.

### Evidence
```
GREEN: 18 passed (18) — all error code tests pass
```

### Files Changed
- `packages/positional-graph/src/errors/positional-graph-errors.ts` — NEW
- `packages/positional-graph/src/errors/index.ts` — Updated with exports

**Completed**: 2026-02-01
---

## Task T008: Add DI tokens to shared
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T008 | **Plan Task**: 2.8

### What I Did
Added `POSITIONAL_GRAPH_DI_TOKENS` to `packages/shared/src/di-tokens.ts` with 2 tokens: `POSITIONAL_GRAPH_SERVICE` and `POSITIONAL_GRAPH_ADAPTER`. Added export to shared barrel. Verified shared builds.

### Evidence
```
pnpm build --filter @chainglass/shared: 1 successful, 1 total
```

### Files Changed
- `packages/shared/src/di-tokens.ts` — Added POSITIONAL_GRAPH_DI_TOKENS
- `packages/shared/src/index.ts` — Added barrel export

**Completed**: 2026-02-01
---

## Task T009: Write adapter tests (TDD RED)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T009 | **Plan Task**: 2.9

### What I Did
Wrote 15 tests for PositionalGraphAdapter (signpost pattern): getGraphDir path correctness, ensureGraphDir creates dirs, listGraphSlugs returns slugs, graphExists checks for graph.yaml, removeGraph lifecycle. Plus 3 tests for atomicWriteFile utility. Used FakeFileSystem + FakePathResolver per established codebase pattern.

### Evidence
```
RED: 15 failed (15) — adapter and atomicWriteFile not yet implemented
```

### Files Changed
- `test/unit/positional-graph/adapter.test.ts` — NEW (15 tests)

**Completed**: 2026-02-01
---

## Task T010: Implement adapter (TDD GREEN)
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T010 | **Plan Task**: 2.10

### What I Did
1. Created `PositionalGraphAdapter` extending `WorkspaceDataAdapterBase` with `domain = 'workflows'`. Signpost pattern: `getGraphDir` + 4 directory lifecycle methods.
2. Created `atomicWriteFile` utility in `services/atomic-file.ts` (temp-then-rename).
3. Updated adapter and services barrels.

### Evidence
```
GREEN: 15 passed (15) — all adapter tests pass
```

### Discoveries
- Adapter constructor removed explicit `(fs, pathResolver)` params per Biome — base class constructor handles it. Actually kept explicit constructor for clarity.
- Used FakeFileSystem/FakePathResolver from @chainglass/shared — not mocks, real in-memory implementations

### Files Changed
- `packages/positional-graph/src/adapter/positional-graph.adapter.ts` — NEW
- `packages/positional-graph/src/services/atomic-file.ts` — NEW
- `packages/positional-graph/src/adapter/index.ts` — Updated with exports
- `packages/positional-graph/src/services/index.ts` — Updated with atomicWriteFile export

**Completed**: 2026-02-01
---

## Task T011: Container registration
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T011 | **Plan Task**: 2.11

### What I Did
Implemented `registerPositionalGraphServices(container)` in `container.ts`. Registers `POSITIONAL_GRAPH_ADAPTER` with `useFactory` resolving `IFileSystem` and `IPathResolver` from `SHARED_DI_TOKENS`. Per ADR-0009 pattern. JSDoc documents prerequisite tokens.

### Evidence
```
pnpm build --filter @chainglass/positional-graph: 3 successful, 3 total
```

### Files Changed
- `packages/positional-graph/src/container.ts` — Updated with full implementation

**Completed**: 2026-02-01
---

## Task T012: Full quality gate
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: T012 | **Plan Task**: implicit

### What I Did
1. Ran `just format` to fix Biome formatting (7 files auto-formatted)
2. Ran `pnpm biome check --write --unsafe` on positional-graph files to fix import ordering (5 files)
3. Ran `just check` (lint + typecheck + test) — all green

### Evidence
```
just check:
  lint: ✅ (758 files checked, 0 errors, 8 warnings — all from broken symlinks in plan 019)
  typecheck: ✅ (zero errors)
  test: ✅ (191 passed | 4 skipped, 2787 tests | 36 skipped)

pnpm build --filter @chainglass/positional-graph: ✅ (3/3 tasks)

New tests breakdown:
  schemas.test.ts: 50 tests
  id-generation.test.ts: 10 tests
  error-codes.test.ts: 18 tests
  adapter.test.ts: 15 tests
  Total new: 93 tests
```

### Discoveries
- Biome enforces alphabetical import ordering — `@chainglass/*` before `vitest`
- Biome reformats single-element arrays inline
- 8 warnings in lint are all from broken symlinks in plan 019 (pre-existing, not our issue)

### Files Changed
- Various formatting fixes across test and source files

**Completed**: 2026-02-01
---

