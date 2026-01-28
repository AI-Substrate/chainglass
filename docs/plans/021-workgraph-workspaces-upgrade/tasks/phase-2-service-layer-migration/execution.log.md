# Phase 2: Service Layer Migration - Execution Log

**Started**: 2026-01-28 09:44 UTC
**Completed**: 2026-01-28
**Plan**: workgraph-workspaces-upgrade-plan.md
**Phase**: Phase 2: Service Layer Migration
**Testing Approach**: Full TDD (per plan Testing Strategy)

---

## Summary

Phase 2 successfully migrated all three workgraph services (WorkGraphService, WorkNodeService, WorkUnitService) to use WorkspaceContext for path resolution instead of hardcoded paths. All 34 contract tests pass.

### Key Changes

1. **WorkGraphService** (T001-T006)
   - Removed `graphsDir` field
   - Added `getGraphsDir(ctx)` and `getGraphPath(ctx, slug)` helpers
   - Updated all 6 methods: create, load, show, status, addNodeAfter, removeNode

2. **WorkNodeService** (T007-T010)
   - Removed `graphsDir` field
   - Added path helpers: `getGraphsDir`, `getNodePath`, `getNodeDataDir`, `getOutputPaths`
   - Updated all 14 methods with ctx parameter
   - saveOutputFile now stores relative paths in data.json

3. **WorkUnitService** (T011-T013)
   - Removed `unitsDir` field
   - Added `getUnitsDir(ctx)` and `getUnitPath(ctx, slug)` helpers
   - Updated all 4 methods: list, load, create, validate

4. **Fake Services**
   - Updated 27 methods across FakeWorkGraphService, FakeWorkNodeService, FakeWorkUnitService
   - All fakes now accept `_ctx: WorkspaceContext` as first parameter (ignored)
   - Updated path strings to use new `.chainglass/data/` structure

### Files Modified

- `packages/workgraph/src/services/workgraph.service.ts`
- `packages/workgraph/src/services/worknode.service.ts`
- `packages/workgraph/src/services/workunit.service.ts`
- `packages/workgraph/src/fakes/fake-workgraph-service.ts`
- `packages/workgraph/src/fakes/fake-worknode-service.ts`
- `packages/workgraph/src/fakes/fake-workunit-service.ts`

### Verification

- Build: `pnpm build --filter=@chainglass/workgraph` ✅
- Tests: 34 passed (workgraph-service, worknode-service, workunit-service contracts) ✅
- No hardcoded paths remaining (verified with grep) ✅

---

## Detailed Task Log

### T001: Remove hardcoded `graphsDir` from WorkGraphService ✅

Removed the hardcoded `private readonly graphsDir = '.chainglass/work-graphs';` field.

### T002: Add `getGraphsDir(ctx)` helper ✅

```typescript
protected getGraphsDir(ctx: WorkspaceContext): string {
  return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'data', 'work-graphs');
}
```

### T003: Add `getGraphPath(ctx, slug)` helper ✅

```typescript
protected getGraphPath(ctx: WorkspaceContext, slug: string): string {
  return this.pathResolver.join(this.getGraphsDir(ctx), slug);
}
```

### T004-T006: Update WorkGraphService methods ✅

All 6 methods updated to accept `ctx: WorkspaceContext` as first parameter.

### T007: Remove hardcoded `graphsDir` from WorkNodeService ✅

Removed the field from WorkNodeService.

### T008: Add path helpers to WorkNodeService ✅

Added 4 helpers:
- `getGraphsDir(ctx)`
- `getNodePath(ctx, graphSlug, nodeId)`
- `getNodeDataDir(ctx, graphSlug, nodeId)`
- `getOutputPaths(ctx, graphSlug, nodeId, fileName)` - returns `{absolute, relative}`

### T009: Update all 14 WorkNodeService methods ✅

Updated: canRun, markReady, start, end, canEnd, getInputData, getInputFile, getOutputData, saveOutputData, saveOutputFile, clear, ask, answer, getAnswer

### T010: Fix data.json to store worktree-relative paths ✅

saveOutputFile now stores relative path in data.json using `getOutputPaths().relative`.

### T011: Remove hardcoded `unitsDir` from WorkUnitService ✅

Removed the field.

### T012: Add path helpers to WorkUnitService ✅

```typescript
protected getUnitsDir(ctx: WorkspaceContext): string {
  return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'data', 'units');
}

protected getUnitPath(ctx: WorkspaceContext, slug: string): string {
  return this.pathResolver.join(this.getUnitsDir(ctx), slug);
}
```

### T013: Update all 4 WorkUnitService methods ✅

Updated: list, load, create, validate

### T014: Verify all services compile ✅

`pnpm build --filter=@chainglass/workgraph` succeeds with no errors.

### T015: Verify no hardcoded paths remain ✅

Grep confirms no remaining `.chainglass/units` or `.chainglass/work-graphs` paths outside of documentation comments.