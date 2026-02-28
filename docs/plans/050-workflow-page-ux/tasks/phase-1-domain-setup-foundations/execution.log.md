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
- `packages/positional-graph/src/fakes/fake-positional-graph-service.ts` — All 50+ methods implemented with call tracking (`calls` Map) and return builders (`with*Result()`) for 12 UI-critical methods. Non-critical methods return sensible defaults. All public methods use interface-native types (no `unknown` params except where the interface itself uses `unknown`).
- `packages/positional-graph/src/fakes/index.ts` — Barrel export.
- `packages/positional-graph/src/index.ts` — Added fakes barrel export.

**Discovery**: `BaseResult` has no `data` field (just `errors` and optional `wasNoOp`). `State` requires `graph_status` and `updated_at`. Fixed both defaults.

**Evidence**: `pnpm build --filter @chainglass/positional-graph` passes clean.

### T004: Verify FakeWorkUnitService ✅

Already exported from `packages/positional-graph/src/features/029-agentic-work-units/index.ts` line 92, and re-exported via `packages/positional-graph/src/index.ts` line 11. No changes needed.

### T005: Create doping script with 8 demo scenarios ✅

**Files created**:
- `scripts/dope-workflows.ts` — 8 scenarios: blank, serial, running, question, error, complete, complex, from-template. Uses committed `sample-*` work units (sample-coder, sample-pr-creator, sample-input) per AC-30. State injection via direct state.json writing.

**TDD evidence (RED → GREEN)**:
- RED: `npx tsx scripts/dope-workflows.ts demo-serial` — failed with "addNode n1 nodeId is undefined" when stale demo workflows existed from a previous run
- GREEN: After `clean` + re-run: all 8 scenarios generate successfully in <0.1s
- `just dope clean` removes all demo artifacts. `just dope demo-question` creates single scenario. `just redope` chains clean + generate.

### T006: Add justfile commands ✅

**Files modified**:
- `justfile` — Added `dope *args` (delegates to dope-workflows.ts), `redope` (clean + regenerate).

**Evidence**:
```
$ just dope
Dope Workflows — generating 8 scenario(s)
  demo-blank: Empty workflow — no nodes, just the default line
  demo-serial: Two-line serial workflow — user-input → coder
  ...
Done in 0.0s. Workflows at .chainglass/data/workflows/

$ just dope clean
Cleaned 7 demo workflow(s)
Cleaned 1 demo template(s)
Cleaned 1 demo instance(s)
```

### T007: Doping validation test ✅

**Files created**:
- `test/integration/dope-workflows.test.ts` — 10 tests: 8 scenario tests with temp workspace + Zod schema validation, 1 `ready` status verification via `getNodeStatus()` (AC-30 8th status), 1 script-path execution test (AC-37).

**TDD evidence (RED → GREEN)**:
- RED: Initial script-path test failed — `expect(result.stderr).toBe('')` caught npm warning output; assertion `demos.length >= 8` failed because `demo-from-template` creates in `instances/` not `data/workflows/`
- GREEN: Fixed stderr filter (ignore npm warnings), adjusted assertion to `>= 7`, added clean-before-run; all 10 tests pass
- `ready` status test: `getNodeStatus()` returns `status: 'ready'` for first node on line 0 with no state entry and loadable unit

**Evidence**:
```
$ pnpm vitest run test/integration/dope-workflows.test.ts
 ✓ test/integration/dope-workflows.test.ts (10 tests) 1604ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
