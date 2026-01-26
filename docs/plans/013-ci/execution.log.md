# CI Pipeline Implementation - Execution Log

**Plan**: [ci-plan.md](./ci-plan.md)
**Tasks**: [tasks.md](./tasks.md)
**Started**: 2026-01-27
**PR**: https://github.com/AI-Substrate/chainglass/pull/12

---

## Execution Timeline

### T001: Add JSON reporters to vitest.config.ts

**Status**: Complete
**Started**: 2026-01-27

**Action**: Added `json-summary` and `json` to the reporter array in vitest.config.ts line 38.

**Change**:
```typescript
// Before
reporter: ['text', 'html', 'lcov'],

// After
reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
```

**Validation**: Tests run without error with new reporters.

---

### T002: Create .github/workflows directory

**Status**: Complete

Created directory: `/home/jak/substrate/013-ci/.github/workflows/`

---

### T003-T007: Create CI workflow file

**Status**: Complete

Created `.github/workflows/ci.yml` with:
- Triggers: push to main, PR to main
- Concurrency groups with cancel-in-progress
- Jobs: lint, build, typecheck, test, gate
- pnpm caching via setup-node
- Turbo cache via actions/cache
- Coverage reporting via vitest-coverage-report-action
- Gate job using alls-green action

---

### T011-T012: Create CI documentation

**Status**: Complete

Created `docs/how/ci.md` with:
- Job descriptions
- Caching explanation
- Coverage reporting details
- Troubleshooting guide
- Branch protection setup instructions
- Local command equivalents

---

### T008: Push to trigger workflow

**Status**: In Progress

**First push**: Triggered workflow run 21377001899

**Issue discovered**: Build job failed with:
```
error TS2307: Cannot find module '@chainglass/workflow' or its corresponding type declarations.
```

**Root cause**: `@chainglass/mcp-server` imports from `@chainglass/workflow` but doesn't declare it as a dependency in package.json. Turbo built them in parallel, causing the import to fail.

**Fix**: Added `"@chainglass/workflow": "workspace:*"` to mcp-server's package.json dependencies.

**Second push**: Triggered workflow run 21377074816

**Second issue discovered**: Test job failed with:
```
Cannot find module '/home/jak/substrate/003-wf-basics/packages/workflow/schemas/wf-phase.schema.json'
```

**Root cause**: Test file `schema-validator.test.ts` had hardcoded absolute paths from developer's local machine that don't exist in CI environment.

**Fix**: Changed absolute paths to relative imports (`../../../packages/workflow/schemas/wf-phase.schema.json`).

**Third issue discovered**: Biome lint errors on coverage JSON files in `test/coverage/.tmp/`.

**Fix**: Added `coverage` and `test/coverage` to biome.json ignore list.

**Third push**: Triggered workflow run 21377326954

**Fourth issue discovered**: Coverage report action failed:
```
ENOENT: no such file or directory, open '/home/runner/work/chainglass/chainglass/coverage/coverage-summary.json'
```

**Root cause**: Vitest's test root is set to `test/`, so coverage files are generated in `test/coverage/` not `coverage/`. The coverage action was looking in the wrong location.

**Fix**: Added explicit paths to coverage action:
```yaml
json-summary-path: ./test/coverage/coverage-summary.json
json-final-path: ./test/coverage/coverage-final.json
```

**Fourth push**: Pushing coverage path fix...

