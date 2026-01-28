# Manual Validation of Agent Graph Execution - Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-01-28
**Spec**: [./agent-graph-manual-validate-spec.md](./agent-graph-manual-validate-spec.md)
**Status**: DRAFT

**Workshops**:
- [e2e-sample-flow.md](./workshops/e2e-sample-flow.md) - Complete CLI flow and unit definitions

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The WorkGraph system from Plan 016 has not been validated end-to-end. The CLI commands, state transitions, and data flow between nodes have only been tested in isolation. Without a complete orchestration test, we cannot confidently adopt the system for production workflows.

**Solution**: Build a TypeScript orchestrator script that creates a 3-node WorkGraph, executes each node sequentially with proper state checks, handles agent question/answer handover, and reports pipeline success/failure based on final outputs. The harness operates in two modes: mock (for fast iteration) and real agent (for full validation).

**Expected Outcome**: A working E2E harness that validates the complete WorkGraph lifecycle, surfaces bugs in the Plan 016 implementation, and serves as a reference for future orchestrators.

---

## Critical Research Findings (Concise)

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **`end()` requires `running` state** (worknode.service.ts:446-460). Returns E112 error for any other state. | Modify condition to also accept `pending` state when outputs present |
| 02 | Critical | **`canEnd()` also requires `running` state** (worknode.service.ts:627-641). Same validation logic as `end()`. | Update in parallel with `end()` change |
| 03 | Critical | **`getOutputData()` does not exist** - No method in WorkNodeService or IWorkNodeService interface. Orchestrator cannot read completed node outputs. | Add `getOutputData()` method and `get-output-data` CLI command |
| 04 | High | **State machine has 5 states**: pending → ready → running → complete (with waiting-question branch). `end` only allowed from `running`. | `pending → complete` shortcut needed for direct output pattern |
| 05 | High | **Output validation in `end()`** (lines 480-542): Checks file/data outputs against unit config. File outputs at `data/outputs/{name}.{ext}`. | Rely on existing validation; ensure test fixtures have correct outputs |
| 06 | High | **CLI commands use DI pattern**: All handlers call `createCliProductionContainer()` and resolve services via `WORKGRAPH_DI_TOKENS`. | Follow same pattern for new `get-output-data` command |
| 07 | High | **Existing harness pattern at `manual-wf-run/`**: Shell scripts with `.current-run`, `.current-session` state files. Proven orchestration model. | Deprecate to `_old/`, use as reference for TypeScript port |
| 08 | High | **Project rules require `useFactory` DI registration** - No `@injectable()` decorators. Services only depend on interfaces. | Ensure any new service code follows this pattern |
| 09 | Medium | **Ask/answer flow**: `ask()` transitions running → waiting-question (line 1502), `answer()` transitions waiting-question → running (line 1648). | Orchestrator must poll status, detect waiting-question, call answer |
| 10 | Medium | **TypeScript preferred over shell** for JSON parsing and state management (research finding). | Implement orchestrator in TypeScript with `child_process.spawn` |
| 11 | Medium | **JSON output adapter** available via `--json` flag. CLI returns `CommandResult<T>` with `success`, `data`, `error` fields. | Parse CLI output as JSON for structured orchestration |
| 12 | Medium | **`saveOutputData()` works on PENDING nodes** (already verified in workshop). No state restriction on saving. | Direct output pattern: save data first, then call `end()` |
| 13 | Medium | **Atomic writes via `atomicWriteJson()`** (lines 283, 398, 581). State.json updates are crash-safe. | No action needed; rely on existing safety |
| 14 | Low | **No `workgraph-run/` directory exists yet**. Must be created at `docs/how/dev/workgraph-run/`. | Create directory structure per workshop spec |
| 15 | Low | **Testing approach is Hybrid** (per constitution + spec). Harness IS the E2E test; unit tests required for new service code per Constitution Principle 3 (TDD). | Unit tests for T001-T005 service changes; harness validates E2E flow |

---

## Implementation (Single Phase)

**Objective**: Create a complete E2E validation harness that validates the WorkGraph system works end-to-end, fixing any bugs discovered in Plan 016 code.

**Testing Approach**: Hybrid - Unit tests for service changes (T001-T005) per Constitution Principle 3; E2E harness validates complete flow
**Mock Usage**: Avoid mocks entirely - Use real fixtures and FakeWorkNodeService for unit tests; harness has built-in mock mode

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [ ] | T001 | Modify `end()` to accept PENDING state when outputs present | 2 | Core | -- | /home/jak/substrate/016-agent-units/packages/workgraph/src/services/worknode.service.ts | `end()` succeeds on PENDING node with outputs; E112 still returned if no outputs | Line 446-460: Change `!== 'running'` to `!== 'running' && !== 'pending'` |
| [ ] | T002 | Modify `canEnd()` to accept PENDING state | 1 | Core | -- | /home/jak/substrate/016-agent-units/packages/workgraph/src/services/worknode.service.ts | `canEnd()` returns true for PENDING node with outputs | Line 627-641: Same pattern as T001 |
| [ ] | T003 | Add `GetOutputDataResult` interface | 1 | Core | -- | /home/jak/substrate/016-agent-units/packages/workgraph/src/interfaces/worknode-service.interface.ts | Interface compiles, exports properly | Model after existing `GetInputDataResult` (line 109-120) |
| [ ] | T004 | Add `getOutputData()` method signature to `IWorkNodeService` | 1 | Core | T003 | /home/jak/substrate/016-agent-units/packages/workgraph/src/interfaces/worknode-service.interface.ts | Method signature in interface | Add after `getInputFile()` method (around line 340) |
| [ ] | T005 | Implement `getOutputData()` in WorkNodeService | 2 | Core | T003, T004 | /home/jak/substrate/016-agent-units/packages/workgraph/src/services/worknode.service.ts | Reads value from `data/data.json` outputs; returns structured result | Follow pattern of `getInputData()` (line 728-880), but read from node's own outputs |
| [ ] | T005a | Write unit tests for `end()` PENDING state transition | 2 | Test | T001, T002 | /home/jak/substrate/016-agent-units/packages/workgraph/src/services/__tests__/worknode.service.test.ts | Tests cover: (1) PENDING + outputs → complete succeeds, (2) PENDING + no outputs → E112 error, (3) running → complete unchanged | Per Constitution Principle 3 (TDD); add Test Doc comments |
| [ ] | T005b | Write unit tests for `getOutputData()` method | 2 | Test | T005 | /home/jak/substrate/016-agent-units/packages/workgraph/src/services/__tests__/worknode.service.test.ts | Tests cover: (1) returns saved output value, (2) returns error for missing output, (3) returns error for missing node | Per Constitution Principle 3 (TDD); add Test Doc comments |
| [ ] | T006 | Add `handleNodeGetOutputData` handler function | 2 | CLI | T005, T005b | /home/jak/substrate/016-agent-units/apps/cli/src/commands/workgraph.command.ts | Handler follows existing pattern, calls service, formats output | Model after `handleNodeGetInputData` (line 413-430) |
| [ ] | T007 | Register `get-output-data` CLI command | 1 | CLI | T006 | /home/jak/substrate/016-agent-units/apps/cli/src/commands/workgraph.command.ts | `cg wg node get-output-data <graph> <node> <name>` works with --json | Add near line 731-757 with other node commands |
| [ ] | T008 | Add `wg.node.get-output-data` output format | 1 | CLI | T006 | /home/jak/substrate/016-agent-units/packages/shared/src/adapters/console-output.adapter.ts | Console and JSON output works for new command | Add format handler for `wg.node.get-output-data` |
| [ ] | T009 | Create `docs/how/dev/workgraph-run/` directory structure | 1 | Setup | -- | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/ | Directory exists with README.md, lib/, fixtures/ | Per workshop file structure spec |
| [ ] | T010 | Create `lib/cli-runner.ts` utility | 2 | Harness | T009 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/lib/cli-runner.ts | Utility can execute `cg` commands and return typed JSON results | Use child_process.spawn, parse JSON output |
| [ ] | T011 | Create `lib/types.ts` with result interfaces | 1 | Harness | T009 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/lib/types.ts | All CLI result types defined (CanRunData, CanEndData, GetOutputDataData, etc.) | Per workshop type definitions |
| [ ] | T012 | Create `fixtures/units/sample-input/unit.yaml` | 1 | Fixture | T009 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/fixtures/units/sample-input/unit.yaml | Unit validates with `cg unit validate` | Per workshop unit definition |
| [ ] | T013 | Create `fixtures/units/sample-coder/` unit with command | 2 | Fixture | T009 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/fixtures/units/sample-coder/ | Unit validates, command prompt references inputs | unit.yaml + commands/main.md per workshop |
| [ ] | T014 | Create `fixtures/units/sample-tester/` unit with command | 2 | Fixture | T009 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/fixtures/units/sample-tester/ | Unit validates, command prompt references inputs | unit.yaml + commands/main.md per workshop |
| [ ] | T015 | Implement `e2e-sample-flow.ts` orchestrator script | 3 | Harness | T010, T011, T012, T013, T014 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/e2e-sample-flow.ts | Script runs to completion in mock mode, all nodes complete | Main orchestration logic per workshop flow |
| [ ] | T016 | Add polling helper for status changes | 1 | Harness | T010 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/lib/cli-runner.ts | `pollForStatus()` waits for target status with 500ms interval, 5min timeout | Per workshop polling helper pattern |
| [ ] | T017 | Implement mock mode execution logic | 2 | Harness | T015 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/e2e-sample-flow.ts | Mock mode completes in < 30 seconds, simulates agent outputs | Default mode, no external API calls |
| [ ] | T018 | Create README.md with usage instructions | 1 | Docs | T015 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/README.md | Clear quick-start, describes mock vs real mode | Per spec documentation strategy |
| [ ] | T019 | Move `manual-wf-run/` to `_old/` | 1 | Cleanup | -- | /home/jak/substrate/016-agent-units/docs/how/dev/_old/manual-wf-run/ | Old harness preserved but deprecated | Per spec Q2 resolution |
| [ ] | T020 | Run harness in mock mode, fix any Plan 016 bugs discovered | 3 | Validation | T001-T018 | Various (bugs may be anywhere in workgraph package) | Harness runs successfully, all nodes complete, pipeline reports SUCCESS | This is the primary validation; expect iteration |
| [ ] | T021 | Implement real agent mode (`--with-agent` flag) | 2 | Harness | T020 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/e2e-sample-flow.ts | Real agents invoked via `cg agent run`, 500ms polling, 5min timeout | Optional mode for full integration |
| [ ] | T022 | Final validation: run both modes, verify pipeline reports SUCCESS | 1 | Validation | T020, T021 | /home/jak/substrate/016-agent-units/docs/how/dev/workgraph-run/e2e-sample-flow.ts | Mock mode < 30s, real mode completes with agents, exit code 0 | Plan complete when this passes |

### Acceptance Criteria

Per spec acceptance criteria (AC-1 through AC-10), plus constitution compliance:

- [ ] **AC-0**: Unit tests pass for all service changes (`just test` includes T005a, T005b tests) - Constitution Principle 3
- [ ] **AC-1**: `cg wg node end` works from PENDING state when outputs present (T001, T002, T005a)
- [ ] **AC-2**: `cg wg node can-run` returns blocking nodes until upstream complete (existing, validated by T020)
- [ ] **AC-3**: Agent question handover works: orchestrator polls, sees `waiting-question`, answers, node resumes (T015, T020)
- [ ] **AC-4**: Cross-node data flow works: `get-input-data` and `get-input-file` resolve values from upstream (T20)
- [ ] **AC-5**: `cg wg node get-output-data` returns saved output values (T003-T008)
- [ ] **AC-6**: Orchestrator reads `success: true` → reports "Pipeline SUCCESS", exits 0 (T15, T20)
- [ ] **AC-7**: Orchestrator reads `success: false` → reports "Pipeline FAILED", exits 1 (T15)
- [ ] **AC-8**: Mock mode completes in < 30 seconds (T17, T20)
- [ ] **AC-9**: After completion, all nodes show status `complete` (T20)
- [ ] **AC-10**: Any bugs discovered in Plan 016 code are fixed as part of this plan (T20)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State machine edge cases in `end` from PENDING | Medium | Medium | Unit tests (T005a) cover both success and failure paths; existing test suite catches regressions |
| Undiscovered bugs in Plan 016 code | High | Medium | This is expected and in-scope; T020 has CS-3 to account for iteration |
| Mock-Real divergence | Medium | Low | Run both modes; document any differences |
| CLI output format changes | Low | Medium | Use typed interfaces; detect parse failures early |
| Question ID discovery in orchestrator | Medium | Low | Read from status command or data.json; workshop shows pattern |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/017-agent-graph-manual-validate/agent-graph-manual-validate-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended given iteration expectation)
