# Fix Tasks — Phase 1: Types and Schemas

## CRITICAL
1) **Sync plan↔dossier statuses and footnotes**
   - **Files**: docs/plans/029-agentic-work-units/agentic-work-units-plan.md, docs/plans/029-agentic-work-units/tasks/phase-1-types-and-schemas/tasks.md
   - **Issue**: Plan tasks 1.1–1.9 show [ ] while dossier tasks T001–T009 show [x]; footnote stubs empty.
   - **Fix**: Run `plan-6a-update-progress` to sync statuses, add [^N] footnotes in task Notes, and populate Phase Footnote Stubs to match plan ledger.

## HIGH
2) **Restore task↔log backlinks**
   - **Files**: tasks.md, execution.log.md
   - **Issue**: No log anchors in tasks table; execution log lacks Dossier Task/Plan Task backlinks.
   - **Fix**: Add execution log anchors to Notes column for T001–T009 and include metadata lines in each log section:
     - `**Dossier Task**: [T00X](./tasks.md#...)`
     - `**Plan Task**: [1.X](../../agentic-work-units-plan.md#...)`

3) **Resolve lint failure**
   - **File**: test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts
   - **Issue**: Biome import order error.
   - **Fix**: Run `pnpm biome check --fix --unsafe` or reorder imports manually; then rerun `just fft`.

4) **Use package aliases in tests (R-CODE-004)**
   - **Files**: workunit.types.test.ts, workunit.schema.test.ts, workunit-errors.test.ts
   - **Issue**: Relative imports cross package boundaries.
   - **Fix**: Replace with `@chainglass/positional-graph` exports (or appropriate alias) per rules.

5) **PlanPak dependency direction**
   - **File**: packages/positional-graph/src/index.ts
   - **Issue**: Root export re-exports feature module; shared/core should not depend on feature folder.
   - **Fix**: Remove export or introduce neutral API layer; update plan/dossier if exception needed.

## MEDIUM
6) **Record TDD evidence**
   - **File**: execution.log.md
   - **Issue**: Tests not run; log claims pass.
   - **Fix**: Run tests/typecheck/lint/build; update log with RED/GREEN/REFACTOR evidence and outputs.

## LOW
7) **PlanPak symlink manifest**
   - **Files**: docs/plans/029-agentic-work-units/files/, otherfiles/
   - **Issue**: Symlink manifest not present for edited files.
   - **Fix**: Add symlinks for edited files if PlanPak requires manifesting.

## Testing Guidance (Full TDD)
- Run `just fft` after fixes; ensure RED→GREEN evidence is recorded in execution.log.
