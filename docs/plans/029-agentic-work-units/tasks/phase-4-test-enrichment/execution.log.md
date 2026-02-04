# Execution Log: Phase 4 — Test Enrichment

**Plan**: [../../agentic-work-units-plan.md](../../agentic-work-units-plan.md)
**Dossier**: [./tasks.md](./tasks.md)
**Started**: 2026-02-04

---

## Task T000: Create `sample-pr-creator` CodeUnit on disk
**Started**: 2026-02-04
**Dossier Task**: T000
**Plan Task**: 4.1
**Status**: Complete

### What I Did
Created `sample-pr-creator` CodeUnit on disk for E2E type verification tests.

### Files Created
- `.chainglass/units/sample-pr-creator/unit.yaml` (type: code)
- `.chainglass/units/sample-pr-creator/scripts/main.sh` (mock script, made executable)

### Evidence
```bash
$ node apps/cli/dist/cli.cjs wf unit info sample-pr-creator --json --workspace-path .
{"success":true,"data":{"unit":{"slug":"sample-pr-creator","type":"code",...}}}

$ node apps/cli/dist/cli.cjs wf unit get-template sample-pr-creator --json --workspace-path .
{"success":true,"data":{"content":"#!/bin/bash\n# Mock PR creation script...","templateType":"script"}}
```

### Discoveries
**Path discrepancy identified**: The E2E test (line 370-371) copies units from `.chainglass/data/units/` but the WorkUnitAdapter (per Phase 2 DYK #1) expects `.chainglass/units/`. This will need to be fixed in T008 when wiring the E2E test.

**Completed**: 2026-02-04

---

## Tasks T001-T004: Test Helper Enrichment
**Started**: 2026-02-04
**Dossier Tasks**: T001, T002, T003, T004
**Plan Tasks**: 4.2-4.5
**Status**: Complete

### What I Did
Added enriched fixtures, UserInputUnit fixtures, stubWorkUnitService helper, and fixed naming inconsistency in test-helpers.ts.

### Files Modified
- `test/unit/positional-graph/test-helpers.ts`

### Changes Made

**T001: Added `e2eEnrichedFixtures`** (lines 424-602)
- All 7 pipeline units with full WorkUnit types using `satisfies` pattern
- Types: 6 AgenticWorkUnit + 1 CodeUnit (sample-pr-creator)
- Full input/output declarations with `data_type` field

**T002: Added UserInputUnit fixtures** (lines 604-648)
- `sampleUserRequirements`: text question type for Row 0 entry point
- `sampleLanguageSelector`: single-choice question with 4 options

**T003: Implemented `stubWorkUnitService()`** (lines 660-793)
- Accepts `units: WorkUnit[]` and `templateContent: Map<string, string>`
- Implements `list()`, `load()`, `validate()` methods
- Creates fake instances with `getPrompt()`/`getScript()` that read from template map
- Supports `strictMode` for unknown slug handling (default: true)

**T004: Fixed naming inconsistency** (lines 394, 419)
- Renamed `samplePRCreator` → `samplePrCreator` in `e2eExecutionFixtures`
- Updated reference in `createE2EExecutionTestLoader()`
- Note: E2E test has no references to rename (uses on-disk units directly)

### Evidence
```bash
$ pnpm exec tsc --noEmit -p packages/positional-graph/tsconfig.json
# No errors - all types check

$ pnpm test test/unit/positional-graph
# Test Files  24 passed (24)
# Tests  457 passed (457)
```

### Implementation Notes
- Used `satisfies` pattern for type safety: `} satisfies AgenticWorkUnit`
- Created `createFakeWorkUnitInstance()` internal helper to generate instances
- UserInputUnit has no template methods (no getPrompt/getScript) per design
- Stub service throws E185-style error if template content not configured

**Completed**: 2026-02-04

---

## Tasks T005-T008: E2E Test Sections 13-15
**Started**: 2026-02-04
**Dossier Tasks**: T005, T006, T007, T008
**Plan Tasks**: 4.6-4.9
**Status**: Complete

### What I Did
Added E2E test sections 13-15 for unit type verification, reserved parameter routing, and Row 0 UserInputUnit entry point semantics.

### Files Modified
- `test/e2e/positional-graph-execution-e2e.test.ts`

### Changes Made

**T005: Section 13 - Unit Type Verification** (lines 1285-1324)
- Step 13.1: Verify sample-coder is AgenticWorkUnit (type=agent)
- Step 13.2: Verify sample-pr-creator is CodeUnit (type=code)
- Step 13.3: Verify sample-input is UserInputUnit (type=user-input)

**T006: Section 14 - Reserved Parameter Routing** (lines 1337-1390)
- Step 14.1: Get main-prompt on completed agent node (coder)
- Step 14.2: Get main-script on pending code node (pr-creator)
- Step 14.3: E186 error - main-prompt on CodeUnit rejected
- Step 14.4: E183 error - get-template on UserInputUnit rejected

**T007: Section 15 - Row 0 UserInputUnit** (lines 1402-1455)
- Step 15.1: Create alternate graph for isolated test
- Step 15.2: Add UserInputUnit (sample-input) to Line 0
- Step 15.3: Verify UserInputUnit is immediately ready
- Step 15.4: Complete UserInputUnit and verify outputs
- Step 15.5: Cleanup alternate graph

**T008: E2E Integration** (lines 164-177, 390-406, 1495-1529)
- Added UnitInfoResult and GetTemplateResult type interfaces
- Fixed setup() to copy units from BOTH paths:
  - `.chainglass/data/units/` (legacy units)
  - `.chainglass/units/` (new WorkUnitAdapter path)
- Updated main() to call new sections in correct order
- Added Phase 4 summary output

### Implementation Notes
- Reserved parameter tests run AFTER Line 1 completes but BEFORE Line 2
- This validates reserved params work on both completed and pending nodes
- Section 15 uses a separate graph (`e2e-user-input-test`) for isolation
- Fixed path discrepancy from T000 discovery by copying from both unit paths

### Evidence
```bash
$ just fft
# Test Files  222 passed | 5 skipped (227)
# Tests  3233 passed | 41 skipped (3274)
```

**Completed**: 2026-02-04

---

## Task T009: Run full E2E test and verify
**Started**: 2026-02-04
**Dossier Task**: T009
**Plan Task**: 4.10
**Status**: Complete

### What I Did
Ran the full E2E test suite and fixed issues discovered during execution.

### Issues Found and Fixed

**Issue 1: CLI `--json` flag placement**
- The E2E test placed `--json` after subcommand args, but `commander.js` expects parent options before subcommand
- Fixed by changing `['wf', ...args, '--json', '--workspace-path', path]` to `['wf', '--json', '--workspace-path', path, ...args]`

**Issue 2: CLI linked to wrong workspace**
- The `cg` command was symlinked to old 014-workspaces, not current 029-agentic-work-units
- Fixed by running `pnpm link --global` in apps/cli

**Issue 3: Unit files not present in workspace**
- Units were expected at `.chainglass/data/units/` and `.chainglass/units/` but didn't exist in 029 workspace
- Created all 8 required units with correct input/output definitions

**Issue 4: WorkUnitAdapter path mismatch**
- E2E test copied legacy units to `.chainglass/data/units/` but WorkUnitAdapter only looks at `.chainglass/units/`
- Fixed setup() to copy all units to `.chainglass/units/` in temp workspace

**Issue 5: Unit definition mismatches**
- Several units had incorrect input/output definitions that didn't match E2E test expectations
- Updated: sample-spec-builder (removed required input), sample-spec-reviewer (optional review_notes), sample-spec-alignment-tester (added test_output input, fixed outputs), sample-pr-preparer (fixed inputs/outputs)

### Files Created
- `.chainglass/data/units/sample-spec-builder/unit.yaml` + `commands/main.md`
- `.chainglass/data/units/sample-spec-reviewer/unit.yaml` + `commands/main.md`
- `.chainglass/data/units/sample-spec-alignment-tester/unit.yaml` + `commands/main.md`
- `.chainglass/data/units/sample-pr-preparer/unit.yaml` + `commands/main.md`
- `.chainglass/units/sample-pr-creator/unit.yaml` + `scripts/main.sh`
- Copied: sample-coder, sample-tester, sample-input from chainglass workspace

### Files Modified
- `test/e2e/positional-graph-execution-e2e.test.ts` (--json flag fix, setup path fix)

### Evidence
```bash
$ npx tsx test/e2e/positional-graph-execution-e2e.test.ts
=== ALL TESTS PASSED ===
Total steps: 65
7 nodes complete across 3 lines:
  - spec-builder, spec-reviewer (serial) [agent]
  - coder (with Q&A), tester (serial) [agent]
  - alignment-tester, pr-preparer (parallel) [agent], PR-creator (serial) [code]

Phase 4 verified:
  - Section 13: Unit type discrimination (agent/code/user-input)
  - Section 14: Reserved parameter routing (main-prompt/main-script)
  - Section 15: Row 0 UserInputUnit entry point semantics

$ just fft
# Test Files  222 passed | 5 skipped (227)
# Tests  3233 passed | 41 skipped (3274)
```

### Discoveries
- WorkUnitAdapter strictly expects `.chainglass/units/` — legacy path `.chainglass/data/units/` is ignored
- CLI parent options (`--json`, `--workspace-path`) must come before subcommand, not after
- The `cg` global command points to whichever workspace last ran `pnpm link --global` in apps/cli

**Completed**: 2026-02-04

---

## Phase 4 Complete

All 10 tasks (T000-T009) completed. Phase 4: Test Enrichment is done.

### Summary
- Created all required on-disk units (8 total)
- Added enriched fixtures with full WorkUnit types
- Added UserInputUnit fixtures
- Implemented stubWorkUnitService() helper
- Fixed naming inconsistency
- Added E2E Sections 13-15
- All 65 E2E test steps pass
- All 3233 unit tests pass

### Acceptance Criteria Met
- AC-8: E2E Section 13 verifies unit type discrimination ✓
- AC-9: E2E Section 14 verifies reserved parameter routing ✓
- AC-10: E2E Section 15 verifies Row 0 UserInputUnit entry point ✓

---
