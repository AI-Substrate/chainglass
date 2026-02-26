# Execution Log: Phase 3 — Integration Testing & Instance Validation

**Phase**: Phase 3: Integration Testing & Instance Validation
**Plan**: [wf-web-plan.md](../../wf-web-plan.md)
**Started**: 2026-02-26

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
