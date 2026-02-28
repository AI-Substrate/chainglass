# Fix Tasks: Phase 1: Service Layer — Extend IWorkUnitService with CRUD

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Ensure rename cascade is wired in runtime DI
- **Severity**: HIGH
- **File(s)**: 
  - /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/container.ts
  - /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts
- **Issue**: `WorkUnitService` accepts optional `pathResolver`, and container registration omits it. `rename()` cascade can no-op in production.
- **Fix**:
  1. Make `pathResolver` constructor arg required.
  2. Inject `pathResolver` in `registerPositionalGraphServices()` when constructing `WorkUnitService`.
  3. Remove `if (!this.pathResolver) return []` guard.
- **Patch hint**:
  ```diff
  - constructor(adapter, fs, yamlParser, pathResolver?)
  + constructor(adapter, fs, yamlParser, pathResolver)
  
  - return new WorkUnitService(adapter, fs, yamlParser);
  + const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  + return new WorkUnitService(adapter, fs, yamlParser, pathResolver);
  ```

### FT-002: Surface rename partial-failure errors
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts
- **Issue**: Rename catches write failures for `unit.yaml` and `node.yaml` updates but still returns success with `errors: []`.
- **Fix**:
  1. Collect write/read failures into `ResultError[]`.
  2. Return `errors` in `RenameUnitResult`.
  3. Include file paths/reasons for failed updates.
- **Patch hint**:
  ```diff
  - try { ... } catch { }
  + try { ... } catch (err) {
  +   errors.push({ code: 'E190', message: `Rename write failed: ${nodeYamlPath}`, action: String(err) });
  + }
  
  - return { newSlug, updatedFiles, errors: [] };
  + return { newSlug, updatedFiles, errors };
  ```

### FT-003: Add AC19 cascade verification tests
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts
- **Issue**: Contract suite does not verify `unit_slug` rewrite in workflow/template `node.yaml` files after rename.
- **Fix**:
  1. Seed representative workflow/template node.yaml fixtures.
  2. Execute `rename(oldSlug, newSlug)`.
  3. Assert node.yaml `unit_slug` updates and `updatedFiles` includes touched files.
- **Patch hint**:
  ```diff
  + it('should rewrite unit_slug in node.yaml files during rename', async () => {
  +   // arrange seeded node.yaml refs
  +   const result = await service.rename(ctx, 'old', 'new');
  +   expect(result.updatedFiles).toContain(expectedNodePath);
  +   expect(await fs.readFile(expectedNodePath)).toContain('unit_slug: new');
  + });
  ```

## Medium / Low Fixes

### FT-004: Wire E190 in delete failure path
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts
  - /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts
- **Issue**: `delete()` can throw raw FS errors instead of returning typed `E190` result.
- **Fix**: Catch adapter delete exceptions and map to `workunitDeleteFailedError(slug, reason)` in `errors`.

### FT-005: Update domain artifacts for Phase 1 changes
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/positional-graph/domain.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
- **Issue**: Domain docs and phase manifest are stale relative to changed files and expanded contracts.
- **Fix**:
  1. Add Plan 058 Phase 1 history entry and CRUD contract/composition updates.
  2. Add missing Domain Manifest rows for `index.ts` and `workunit-service.contract.test.ts`.
  3. Add/refresh `Concepts` section for expanded `IWorkUnitService` capabilities.

### FT-006: Add required Test Doc blocks
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts
- **Issue**: Tests do not include required 5-field Test Doc comments.
- **Fix**: Add Test Doc comments (Why, Contract, Usage Notes, Quality Contribution, Worked Example) to each contract test or equivalent grouped blocks.

### FT-007: Remove incidental generated file drift
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/next-env.d.ts
- **Issue**: Out-of-scope generated file changed in service-layer phase.
- **Fix**: Exclude/revert from phase commit or document explicit rationale.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
