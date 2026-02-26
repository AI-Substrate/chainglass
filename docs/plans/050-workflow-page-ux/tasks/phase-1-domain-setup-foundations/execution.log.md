# Execution Log: Phase 1 — Domain Setup + Foundations

**Plan**: 050-workflow-page-ux
**Phase**: Phase 1
**Started**: 2026-02-26

---

## Task Log

### T001: Create workflow-ui domain docs ✅

**Files created/modified**:
- `docs/domains/workflow-ui/domain.md` — Created. Leaf business domain, no contracts exported. Dependencies: positional-graph, events, panel-layout, workspace-url, sdk.
- `docs/domains/registry.md` — Added workflow-ui row (business, Plan 050, active).
- `docs/domains/domain-map.md` — Added workflow-ui node with 5 dependency edges + health summary row.

**Evidence**: All 3 files exist and are consistent.

### T002: Register positional-graph services in web DI ✅

**Files modified**:
- `apps/web/src/lib/di-container.ts` — Added `POSITIONAL_GRAPH_DI_TOKENS` import, `registerPositionalGraphServices` import, `TemplateAdapter`/`InstanceAdapter`/`TemplateService`/`ITemplateService` imports. Added production registrations: `registerPositionalGraphServices()`, `WORK_UNIT_LOADER` bridge, `TEMPLATE_ADAPTER`, `INSTANCE_ADAPTER`, `TEMPLATE_SERVICE`.

**Discovery**: `WORK_UNIT_LOADER` bridge registration needed — `registerPositionalGraphServices()` doesn't register it but `PositionalGraphService` factory depends on it. Followed CLI container pattern.

**Evidence**: `npx tsc --noEmit` passes (only unrelated errors in use-file-filter.ts from parallel work).

### T003: Build FakePositionalGraphService ✅

**Files created**:
- `packages/positional-graph/src/fakes/fake-positional-graph-service.ts` — All 50+ methods implemented with call tracking (`calls` Map) and return builders (`with*Result()`) for 12 UI-critical methods. Non-critical methods return sensible defaults.
- `packages/positional-graph/src/fakes/index.ts` — Barrel export.
- `packages/positional-graph/src/index.ts` — Added fakes barrel export.

**Discovery**: `BaseResult` has no `data` field (just `errors` and optional `wasNoOp`). `State` requires `graph_status` and `updated_at`. Fixed both defaults.

**Evidence**: `npx tsc --noEmit --project packages/positional-graph/tsconfig.json` passes clean.

### T004: Verify FakeWorkUnitService ✅

Already exported from `packages/positional-graph/src/features/029-agentic-work-units/index.ts` line 92, and re-exported via `packages/positional-graph/src/index.ts` line 11. No changes needed.

### T005: Create doping script with 8 demo scenarios ✅

**Files created**:
- `scripts/dope-workflows.ts` — 8 scenarios: blank, serial, running, question, error, complete, complex, from-template. Uses `createScriptServices()` helper with real services. State injection via direct state.json writing. Creates demo work units (demo-agent, demo-code, demo-user-input) in workspace .chainglass/units/.

**Evidence**: `npx tsx scripts/dope-workflows.ts` generates all 8 scenarios in <0.1s. `clean` removes all demo artifacts. Single-scenario mode works.

### T006: Add justfile commands ✅

**Files modified**:
- `justfile` — Added `dope *args` (delegates to dope-workflows.ts), `redope` (clean + regenerate).

**Evidence**: `just dope`, `just dope clean`, `just dope demo-serial`, `just redope` all work.

### T007: Doping validation test ✅

**Files created**:
- `test/integration/dope-workflows.test.ts` — 8 tests covering all scenarios. Each test creates temp workspace, builds graph, injects state, validates structure + Zod schema round-trip.

**Evidence**: All 8 tests pass in 46ms. `pnpm vitest run test/integration/dope-workflows.test.ts`.
