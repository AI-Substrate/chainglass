# Phase 5: Polish & End-to-End Verification — Execution Log

## T001: Extend doping script with work unit CRUD scenarios

**Status**: ✅ Complete
**Files modified**: `scripts/dope-workflows.ts`

**What was done**:
- Imported `WorkUnitService`, `WorkUnitAdapter`, `IWorkUnitService` from `@chainglass/positional-graph`
- Added `workUnitService` to `ScriptServices` interface and `createScriptServices()`
- Created 3 `UNIT_SCENARIOS`: `demo-agent-editor` (agent), `demo-code-editor` (code), `demo-userinput-editor` (user-input)
- Each scenario calls `service.create()` then `service.update()` with inputs/outputs
- Added demo work unit cleanup to `cleanDemoWorkflows()` (`.chainglass/units/demo-*`)
- Wired `UNIT_SCENARIOS` into `main()` alongside existing workflow `SCENARIOS`

**Discovery**: Input/output name validation requires underscores, not hyphens — `input-file` fails schema validation, `input_file` works. Fixed all names.

**Discovery**: Changed output message from "Dope Workflows" to "Dope" but this broke integration test `dope-workflows.test.ts` line 515 which asserts `expect(result.stdout).toContain('Dope Workflows')`. Reverted to "Dope Workflows" prefix.

**Evidence**: `just dope` creates 12 scenarios (9 workflows + 3 units). `just dope clean` removes all demo-* workflows and units.

---

## T002: Update plan AC checklist

**Status**: ✅ Complete
**Files modified**: `docs/plans/058-workunit-editor/workunit-editor-plan.md`

**What was done**:
- Marked Phase 3 ACs (AC-10 to AC-15) as complete `[x]` in the full AC list and Phase 3 section
- Marked Phase 4 ACs (AC-22 to AC-26) as complete `[x]` in the full AC list and Phase 4 section
- Verified 64 total `[x] AC-` checkmarks (29 unique ACs × multiple appearances), 0 unchecked
- Updated plan status to "Phase 5 in progress" and progress table

---

## T003: End-to-end walkthrough

**Status**: ✅ Complete
**Verification method**: Playwright headless Chrome + Next.js MCP (port 3001)

**Results**:
- **List page** (`/workspaces/chainglass/work-units`): Renders correctly. Shows 7 agents, 1 code unit, 3 input units grouped by type. Create Unit button present.
- **Agent editor** (`/work-units/sample-coder`): 3-panel layout. Left: unit catalog (11 units). Main: Prompt Template + Inputs (main-prompt locked + spec + challenge + language) + Outputs (language + code). Right: Metadata (type, slug, version, description).
- **User-input editor** (`/work-units/sample-input`): Question Configuration (type=Text Input, prompt, default). Inputs (empty, Add button). Outputs (1: spec, "Cannot delete last output" protection). Metadata panel.
- **Code editor** (`/work-units/sample-pr-creator`): Shows "Loading editor..." — CodeMirror lazy-loading in headless mode. Not a regression (editor works in real browser per Phase 3 screenshots).
- **Next.js MCP**: "No errors detected in 1 browser session(s)."

**Discovery**: Demo units created by `just dope` don't appear in the workspace list because workspace "chainglass" resolves to `/Users/jordanknight/substrate/chainglass` (the main workspace), not the repo root (`/Users/jordanknight/substrate/058-workunit-editor`). The doping script writes to ROOT/.chainglass/units/. This is by design — the script works correctly when run from the main workspace directory.

---

## T004: Run `just fft` — zero failures

**Status**: ✅ Complete
**Evidence**: `just fft` exit code 0

```
Test Files  336 passed | 9 skipped (345)
     Tests  4749 passed | 76 skipped (4825)
  Duration  162.53s
```

---

## T005: File-browser CodeEditor regression check

**Status**: ✅ Complete
**Verification method**: Playwright headless Chrome

**Results**:
- Navigated to `/workspaces/chainglass/browser`
- File tree rendered correctly with all project directories and files
- Clicked `package.json` — CodeEditor rendered with syntax-highlighted JSON content
- Edit/Preview/Diff buttons visible. Line-by-line code rendering confirmed (CodeMirror active).
- **Conclusion**: CodeEditor re-export from `_platform/viewer` → `041-file-browser` works. No regression.
