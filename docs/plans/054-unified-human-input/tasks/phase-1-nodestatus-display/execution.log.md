# Execution Log: Phase 1 — NodeStatusResult + Display Status

**Plan**: 054-unified-human-input
**Phase**: Phase 1
**Started**: 2026-02-27
**Completed**: 2026-02-27

---

## Stage 1: Format A Fix (T001–T003)

**T001**: Added Format A test to `collate-inputs.test.ts` — writes `{ outputs: { spec: {...} } }` via writeNodeData, verifies collateInputs resolves it. Test FAILED as expected (RED).

**T002**: One-line fix in `input-resolution.ts` line 352: `data?.outputs?.[fromOutput] ?? data?.[fromOutput]`. Required type annotations (`dataRecord as Record<string, unknown>`) due to discriminated union strictness. Test passes (GREEN).

**T003**: Updated `writeNodeData` helper to wrap data in `{ outputs: { ...data } }`. All 16 collateInputs tests pass. All 1052 positional-graph tests pass.

## Stage 2: Discriminated Type Unions (T005–T012)

**T005**: Refactored `NarrowWorkUnit` from single interface to discriminated union: `NarrowWorkUnitBase` + `NarrowAgentWorkUnit` + `NarrowCodeWorkUnit` + `NarrowUserInputWorkUnit`. The user-input variant carries `userInput` config.

**T006**: Refactored `NodeStatusResult` from single interface to discriminated union: `NodeStatusResultBase` + `AgentNodeStatus` + `CodeNodeStatus` + `UserInputNodeStatus`. The user-input variant carries `userInput` config.

**T007**: Added type guard functions `isNarrowUserInputUnit()` and `isUserInputNodeStatus()`. Exported from index.ts.

**T008**: Updated `InstanceWorkUnitAdapter` to construct correct variant. Extended YAML parse type to include `user_input?`. When `type === 'user-input'`, constructs `NarrowUserInputWorkUnit` with mapped config.

**T009**: Updated `getNodeStatus()` in positional-graph.service.ts. Builds base object, then conditionally returns `UserInputNodeStatus`, `CodeNodeStatus`, or `AgentNodeStatus` based on loaded unit type.

**T010–T012**: **Not needed** — existing test helpers compile and pass without changes. TypeScript structural typing means objects without `userInput` satisfy `NarrowAgentWorkUnit` when `type: 'agent'`. All 4610 tests pass.

**Build**: `pnpm --filter @chainglass/positional-graph build` passes with 0 errors.

## Stage 3: Display Status (T013–T015)

**T013**: Created `display-status.ts` in `apps/web/src/features/050-workflow-page/lib/`. Pure function `getDisplayStatus(unitType, status, ready)` returns `'awaiting-input'` for user-input + pending + ready. JSDoc explains this is a UI-only concept.

**T014**: Added `'awaiting-input'` to `NodeStatus` type and `STATUS_MAP` in `workflow-node-card.tsx`. Violet treatment matching `waiting-question`: `#8B5CF6`, violet Tailwind classes, `?` icon, "Awaiting Input" label.

**T015**: Created `display-status.test.ts` with 6 test cases covering all combinations. All pass.

## Evidence

- 4610 tests pass, 76 skipped (all pre-existing skips)
- positional-graph build: 0 errors
- No test helpers needed updating (structural typing backward compat)
