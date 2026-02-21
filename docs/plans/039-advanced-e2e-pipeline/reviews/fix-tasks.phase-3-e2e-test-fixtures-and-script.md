# Fix Tasks — Phase 3 (REQUEST_CHANGES)

## 1) Restore required phase evidence (Full TDD first)
1. Create `docs/plans/039-advanced-e2e-pipeline/tasks/phase-3-e2e-test-fixtures-and-script/execution.log.md`.
2. Record RED→GREEN→REFACTOR evidence per T001–T013, including command outputs and anchorable entries.
3. Add task/log backlinks (`Dossier Task`, `Plan Task`) for each completed task.

## 2) Repair provenance graph links (blocking)
1. Add footnote tags in `tasks.md` Notes for each diff-touched file.
2. Populate `## Phase Footnote Stubs` in phase dossier.
3. Sync plan `## Change Footnotes Ledger` with Phase 3 entries (plan authority).

## 3) Fix plan-compliance gaps in script (test-first)
1. Add missing AC-10 assertion: `programmer-a != programmer-b`.
2. Add explicit AC-12 assertion for line ordering (line 2 starts after line 1 completes).
3. Add AC-13 non-empty assertions for all required agent outputs (not just subset).
4. Add explicit phase banners for line 1, line 2, and line 3.

## 4) Resolve mock/fake policy conflict
1. Replace `FakeNodeEventRegistry` usage with approved real registry implementation **or** log a documented plan deviation with rationale and risk controls.
2. Re-run phase validation command(s) and update execution log evidence.

## 5) Security/observability hardening
1. Mask/omit session IDs in logs.
2. Redact or remove raw tool argument/result logging.
3. Improve output-read failure logging (capture error message, keep concise).

## 6) Correctness cleanup
1. Align `VerboseCopilotAdapter` contract methods (`terminate`, `compact`) with adapter interface behavior.
2. Re-run:  
   - `pnpm tsx scripts/test-advanced-pipeline.ts --help`  
   - `just test-advanced-pipeline --help`

## 7) Command alignment and naming consistency
1. Align `justfile` recipe command with task validation (`pnpm tsx`) or update the task validation text.
2. Resolve output naming drift (kebab-case vs snake_case) by either:
   - normalizing implementation names and wiring, **or**
   - updating plan/task text and all references consistently.

## 8) Re-validate before rerun of plan-7
1. `pnpm test -- --run agent-context.test.ts`
2. `pnpm test -- --run can-run.test.ts`
3. `just fft`
4. Re-run `plan-7-code-review` for Phase 3.

