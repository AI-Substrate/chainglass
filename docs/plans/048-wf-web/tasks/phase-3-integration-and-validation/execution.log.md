# Execution Log: Phase 3 — Integration Testing & Instance Validation

**Phase**: Phase 3: Integration Testing & Instance Validation
**Plan**: [wf-web-plan.md](../../wf-web-plan.md)
**Started**: 2026-02-26
**Completed**: 2026-02-26
**Commit**: `af4aa80`
**Branch**: `048-wf-web`

---

## Summary

7/7 tasks completed across 4 stages. All 4507 tests pass (`just fft` green).

**Domain**: `_platform/positional-graph` (all tasks)

### Files Created (3)

| File | Domain | Purpose |
|------|--------|---------|
| `packages/positional-graph/src/adapter/instance-graph.adapter.ts` | positional-graph | InstanceGraphAdapter — pre-resolved basePath, Liskov-substitutable for PositionalGraphAdapter |
| `test/unit/positional-graph/instance-graph-adapter.test.ts` | positional-graph | 6 unit tests for adapter path resolution |
| `test/integration/template-instance-validation.test.ts` | positional-graph | 5 integration tests with real filesystem (lifecycle, isolation, refresh, template isolation) |

### Files Modified (1)

| File | Domain | Change |
|------|--------|--------|
| `packages/positional-graph/src/adapter/index.ts` | positional-graph | Barrel export for InstanceGraphAdapter |

### Domain Impact

| Domain | Relationship | Changes |
|--------|-------------|---------|
| _platform/positional-graph | **modify** | +1 adapter (InstanceGraphAdapter), +11 tests |
| _platform/file-ops | consume | No changes — used NodeFileSystemAdapter for integration tests |

### Contract Changes

- `InstanceGraphAdapter` added to `@chainglass/positional-graph` public API (barrel export)
- No existing contracts broken
- `domain-map.md` does NOT need updating — InstanceGraphAdapter is internal composition, not a new contract

### ACs Covered by Phase 3

| AC | Status | Evidence |
|----|--------|----------|
| AC-6 | ✅ | T004: instantiation creates independent instance with graph.yaml + state.json + units |
| AC-7 | ✅ | T007: template modification doesn't propagate, refresh does |
| AC-8 | ✅ | T005: two independent instances with separate state |
| AC-12 | ✅ | T007: unit template edit doesn't affect instance until refresh |
| AC-16 | ✅ | T006: ACTIVE_RUN_WARNING on in_progress state, refresh proceeds |

---

## Task Log

### T001-T002: InstanceGraphAdapter — COMPLETE
- Created `packages/positional-graph/src/adapter/instance-graph.adapter.ts`
- Extends PositionalGraphAdapter, overrides getGraphDir() → pre-resolved instancePath (slug ignored)
- Constructor: `(fs, pathResolver, instancePath: string)` — scoped to one instance
- 6 unit tests pass (path resolution, slug ignored, graphExists, ensureGraphDir)
- Barrel export added

### T003: Integration test helper — COMPLETE
- Created `test/integration/template-instance-validation.test.ts`
- `setupTestWorkspace()`: creates temp dir, copies smoke fixture units, wires real PositionalGraphService + TemplateService with NodeFileSystemAdapter
- `buildSimpleGraph()`: creates 1-node graph via real service calls
- `buildLoader()`: real IWorkUnitLoader reading unit.yaml from disk
- Cleanup in afterEach (rm -rf temp dir)

### T004: Full lifecycle test — COMPLETE
- 2 tests: instance structure verified (graph.yaml, state.json pending, units), state.json excluded from template
- Real YAML parsing validates graph.yaml content

### T005: Multi-instance isolation — COMPLETE
- 1 test: two instances created, state modified in one, other unaffected
- Proves AC-8

### T006: Refresh safety — COMPLETE
- 1 test: state.json set to in_progress, refresh returns ACTIVE_RUN_WARNING, units still refreshed, state unchanged
- Proves AC-16

### T007: Template isolation — COMPLETE
- 1 test: template unit modified after instantiation, instance unchanged, then refresh propagates change
- Proves AC-7 and AC-12
