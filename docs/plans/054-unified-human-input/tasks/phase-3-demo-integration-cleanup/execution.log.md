# Execution Log: Phase 3 — Demo + Integration + Cleanup

**Plan**: 054-unified-human-input
**Phase**: Phase 3
**Started**: 2026-02-28

---

## Stage 1: Sample Units + Dope Scenarios

**T002**: Created `sample-challenge` (text: "What coding challenge should we solve?", output: `challenge`) and `sample-language` (single-choice: TypeScript/Python/Go with `{key, label, description}` options, output: `language`). Updated `sample-coder` to accept 3 inputs: `spec` (kept for backward compat with `demo-serial`), `challenge`, and `language`. All inputs set to `required: false` so partial wiring works. Kept `sample-input` as-is — 50+ references across codebase made renaming too risky. 4668 tests pass (1 pre-existing failure in unrelated copilot-cli-adapter).

**T003**: Added `UNIT_CHALLENGE` and `UNIT_LANGUAGE` constants. Created `demo-multi-input` scenario: Line 0 = `sample-challenge` + `sample-language`, Line 1 = `sample-coder` wired to both outputs (`challenge` → `challenge`, `language` → `language`). `demo-serial` untouched — still uses `sample-input` → `spec`. Dope script runs successfully, generated workflow has correct wiring in `node.yaml`. All 10 dope integration tests pass.

## Stage 2: Integration Test

**T004**: Added multi-node composition test to `submit-user-input-lifecycle.test.ts`. Creates 2 user-input nodes (`sample-challenge` text, `sample-language` single-choice) on Line 0, 1 downstream `multi-coder` on Line 1 wired to both outputs. Asserts: before submission → downstream not ready; after first submission → still not ready (partial); after both → `ready: true, inputsAvailable: true, status: 'ready'`. All 3 lifecycle tests pass.

## Stage 3: Error Guard + Validation

**T005**: Added minimal error guard in `HumanInputModal` — if `userInput` is falsy, renders error message with Close button instead of broken form. Added guard in `workflow-editor.tsx` `openHumanInputModal` — if `node.userInput` undefined, shows toast error and returns early. All 7 modal tests pass.

**T006**: Ran `just fft` — lint, format, typecheck, then test. 332 test files, 4679 tests pass, 0 failures. Clean.

## Evidence

- 4679 tests pass, 76 skipped (all pre-existing skips)
- `just fft` exit code 0
- `demo-multi-input` dope scenario generates correct graph structure
- All 10 dope integration tests pass
- All 3 lifecycle tests pass (including new multi-node composition)
- All 7 modal rendering tests pass

