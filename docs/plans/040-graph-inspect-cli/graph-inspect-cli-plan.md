# Graph Inspect CLI — Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-02-21
**Spec**: [graph-inspect-cli-spec.md](./graph-inspect-cli-spec.md)
**Status**: READY
**Workshops**:
- [06-graph-inspect-cli-command.md](./workshops/06-graph-inspect-cli-command.md) — CLI Flow (full design + sample output)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: InspectGraph Service Method + Unit Tests](#phase-1-inspectgraph-service-method--unit-tests)
7. [Phase 2: Formatters (Human-Readable + JSON)](#phase-2-formatters-human-readable--json)
8. [Phase 3: CLI Command Registration + Integration Tests](#phase-3-cli-command-registration--integration-tests)
9. [Phase 4: E2E Validation Against Real Pipeline](#phase-4-e2e-validation-against-real-pipeline)
10. [Phase 5: Documentation](#phase-5-documentation)
11. [Cross-Cutting Concerns](#cross-cutting-concerns)
12. [Complexity Tracking](#complexity-tracking)
13. [Progress Tracking](#progress-tracking)
14. [ADR Ledger](#adr-ledger)
15. [Deviation Ledger](#deviation-ledger)
16. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The Chainglass CLI has `cg wf status` for dashboard views but no command that dumps everything: node state, timing, inputs, outputs (values + files), and events. During Plan 039 E2E testing, debugging required manually reading `state.json`, `data.json`, and `node.yaml` files. This plan implements `cg wf inspect <slug>` with 5 output modes (default, `--node`, `--outputs`, `--compact`, `--json`) that replace manual file inspection with a single command.

**Approach**: Build bottom-up — service method first (composes existing reads), then formatters (pure functions), then CLI wiring, then validate against the real advanced-pipeline E2E.

**Expected outcomes**:
- `cg wf inspect advanced-pipeline` dumps all 6 nodes with status, timing, inputs, outputs
- `cg wf inspect advanced-pipeline --json | jq '.data.nodes[].outputs'` for scripting
- Inspect snapshots at 3 lifecycle points during E2E run

## Technical Context

### Current System State
- `IPositionalGraphService` exposes `getStatus()`, `getNodeStatus()`, `canEnd()`, `getOutputData()`, `loadGraphState()` — all building blocks exist
- CLI uses Commander.js with `wrapAction()` + `createOutputAdapter(json)` pattern
- `formatGraphStatus(reality)` renders compact glyph view — reusable as inspect header
- No existing inspect/dump functionality

### Integration Requirements
- New `inspectGraph()` method on `IPositionalGraphService` (composes existing methods)
- New `formatInspect()` module (pure function, no ANSI — per OutputAdapter contract)
- New `cg wf inspect` command in `positional-graph.command.ts`
- Existing `OutputAdapter` pattern for JSON vs human-readable

### Constraints (from ADR-0012)
- CLI is Consumer Domain — thin wrappers only, no orchestration logic
- Events on disk are the sole interface — inspect reads disk state only
- No agent session internals exposed (session IDs are Pod Domain)
- No pod/container execution details exposed

### Assumptions
- `save-output-file` stores `data/outputs/<filename>` as value in `data.json` (verified)
- Events stored in `state.json` per node (verified)
- Work unit type available via `workUnitLoader.load()` (verified)

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | ADR-0012 forbids exposing Pod Domain internals — session IDs, pod state must NOT appear in inspect output | Exclude session data from InspectResult; only graph-domain data |
| 02 | Critical | `createOutputAdapter(json)` returns `IOutputAdapter` with single `format(command, result)` method — JSON mode wraps in `CommandResponse<T>` envelope | Use existing adapter pattern; result must extend `BaseResult` |
| 03 | High | `getOutputData()` reads from `data.json` — file outputs stored as relative path `data/outputs/<filename>` (not the file content itself) | Detect `data/outputs/` prefix to distinguish file from data outputs |
| 04 | High | `canEnd()` returns `savedOutputs: string[]` — efficient way to discover output names without reading all data | Use `canEnd()` first, then `getOutputData()` per name for values |
| 05 | High | `loadGraphState()` returns raw `State` with `nodes[id].events[]` and `questions[]` — needed for event log and Q&A display | Use `loadGraphState()` for events; `getNodeStatus()` for structured status |
| 06 | High | `createTestServiceStack()` provides real service + real temp filesystem — use for all tests | Use createTestServiceStack; tests create graphs via service API, no manual file manipulation |
| 07 | High | Node config (`node.yaml`) has `inputs` wiring (from_node, from_output) and `orchestratorSettings` — needed for input display and context line | Load via `loadNodeConfig()` per node |
| 08 | Medium | `formatGraphStatus()` is a pure function taking `PositionalGraphReality` — but `inspectGraph()` returns `InspectResult`, not reality | Build reality separately for header, or embed formatted header in InspectResult |
| 09 | Medium | Work unit type (agent/code/user-input) comes from `workUnitLoader.load()` — one extra async call per node | Batch with `Promise.all` for parallel loading |
| 10 | Medium | `ConsoleOutputAdapter.format()` does basic rendering — inspect needs richer formatting than adapter provides | Implement custom `formatInspect()` formatter; adapter wraps for JSON only |
| 11 | Low | Existing test helpers: `createTestServiceStack()`, `FakeOutputAdapter`, `assertOutputExists` — reusable for inspect tests | Leverage existing test infrastructure |

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Per user clarification — fakes only, no mocks
- **Focus Areas**: Service method correctness, formatter output, CLI integration

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)
- All test files MUST include Test Doc comment per R-TEST-002 (Why, Contract, Usage Notes, Quality Contribution, Worked Example)

### Mock Usage
- **No fakes, no mocks** — use `createTestServiceStack()` with real filesystem in temp directory
- Tests create graphs via service API (addLine, addNode, save outputs), run inspectGraph(), assert on results
- Temp directories cleaned up after each test
- Real advanced-pipeline for E2E validation

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `inspect.ts` | plan-scoped | `packages/positional-graph/src/features/040-graph-inspect/` | Core inspect logic |
| `inspect.types.ts` | plan-scoped | `packages/positional-graph/src/features/040-graph-inspect/` | InspectResult types |
| `inspect.format.ts` | plan-scoped | `packages/positional-graph/src/features/040-graph-inspect/` | Human-readable formatter |
| `index.ts` | plan-scoped | `packages/positional-graph/src/features/040-graph-inspect/` | Barrel exports |
| `inspect.test.ts` | plan-scoped | `test/unit/positional-graph/features/040-graph-inspect/` | Unit tests |
| `inspect-format.test.ts` | plan-scoped | `test/unit/positional-graph/features/040-graph-inspect/` | Formatter tests |
| `positional-graph.command.ts` | cross-plan-edit | `apps/cli/src/commands/` | Add inspect command registration |
| `positional-graph-service.interface.ts` | cross-plan-edit | `packages/positional-graph/src/interfaces/` | Add inspectGraph to interface |
| `positional-graph.service.ts` | cross-plan-edit | `packages/positional-graph/src/services/` | Implement inspectGraph |
| `test-advanced-pipeline.ts` | cross-plan-edit | `scripts/` | Add inspect snapshots during E2E |
| `graph-inspect.md` | plan-scoped | `docs/how/` | CLI usage guide |

---

## Phase 1: InspectGraph Service Method + Unit Tests

**Objective**: Define the `InspectResult` types and implement `inspectGraph()` on the positional graph service, driven by comprehensive tests.

**Deliverables**:
- `InspectResult` and `InspectNodeResult` type definitions
- `inspectGraph()` method composing existing service reads
- `inspectGraph` on `IPositionalGraphService` interface
- Unit tests with FakeFileSystem covering all node states

**Dependencies**: None (foundational)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `getOutputData()` per-output is N+1 | Medium | Low | Batch with Promise.all; graphs are small (< 20 nodes) |
| Work unit not found for deleted units | Low | Medium | Graceful fallback: `unitType: 'unknown'` |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0 | [ ] | Create feature folder `features/040-graph-inspect/` and test dir `test/unit/positional-graph/features/040-graph-inspect/` | 1 | Directories exist, index.ts barrel created | - | PlanPak setup |
| 1.1 | [ ] | Define `InspectResult` and `InspectNodeResult` types | 2 | Types compile, exported via index.ts | - | Per Workshop 06 schema |
| 1.2 | [ ] | Write unit tests for inspectGraph() — complete graph | 3 | Tests cover: 6-node graph all complete, outputs present, events counted, inputs wired | - | RED first |
| 1.3 | [ ] | Write unit tests for inspectGraph() — in-progress graph | 2 | Tests cover: running nodes with elapsed, pending with waiting reason, Q&A state | - | RED first |
| 1.4 | [ ] | Write unit tests for inspectGraph() — error states | 2 | Tests cover: blocked-error nodes with error detail, missing work units, missing outputs | - | RED first |
| 1.5 | [ ] | Write unit tests for inspectGraph() — file outputs | 2 | Tests cover: data/outputs/ path detection, file size, text vs binary distinction | - | RED first |
| 1.6 | [ ] | Add `inspectGraph()` to `IPositionalGraphService` interface | 1 | Interface updated, compiles | - | Cross-plan-edit |
| 1.7 | [ ] | Implement `inspectGraph()` in `PositionalGraphService` | 3 | All tests from 1.2–1.5 pass (GREEN) | - | Compose existing methods |
| 1.8 | [ ] | Compile check + existing tests pass | 1 | `just fft` passes, no regressions | - | Safety gate |

**Fast TDD command**: `pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/` (run after each RED→GREEN cycle; `just fft` only at phase end)

### Acceptance Criteria
- [ ] `inspectGraph()` returns complete `InspectResult` for a 6-node graph
- [ ] Output data values and file output paths distinguished correctly
- [ ] Events counted per node, questions extracted from state
- [ ] Duration computed from startedAt/completedAt
- [ ] In-progress and error states handled gracefully
- [ ] All unit tests pass; no regressions in existing 3960 tests

---

## Phase 2: Formatters (Human-Readable + JSON)

**Objective**: Implement pure formatter functions for all 5 output modes: default, `--node`, `--outputs`, `--compact`, and JSON (via existing adapter).

**Deliverables**:
- `formatInspect()` — default full dump
- `formatInspectNode()` — single node deep dive with events + raw node.yaml
- `formatInspectOutputs()` — outputs-only mode
- `formatInspectCompact()` — one-liner per node
- Unit tests for all formatters with snapshot-style assertions

**Dependencies**: Phase 1 (InspectResult types)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Formatter output formatting tedious | High | Low | Workshop 06 has exact sample output — copy formatting |
| Unicode width issues with glyphs | Low | Low | Use same glyphs as `formatGraphStatus()` — already proven |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for `formatInspect()` default mode | 3 | Tests verify: header, node sections, truncated outputs, input wiring, duration display | - | RED first; compare against Workshop 06 sample |
| 2.2 | [ ] | Write tests for `formatInspectNode()` deep dive | 2 | Tests verify: full output values, event log, stamp status, raw node.yaml dump | - | RED first |
| 2.3 | [ ] | Write tests for `formatInspectOutputs()` | 2 | Tests verify: output-only sections, 40-char truncation, grouped by node | - | RED first |
| 2.4 | [ ] | Write tests for `formatInspectCompact()` | 2 | Tests verify: one line per node, glyph + nodeId + type + duration + output count | - | RED first |
| 2.5 | [ ] | Write tests for file output display (→ arrow, size, extract) | 2 | Tests verify: `→ filename (size)` format, 2-line extract, `[binary]` tag, `(missing)` fallback | - | RED first |
| 2.6 | [ ] | Implement all formatters to pass tests | 3 | All formatter tests GREEN | - | `inspect.format.ts` |
| 2.7 | [ ] | Compile check + all tests pass | 1 | `just fft` passes | - | Safety gate |

**Fast TDD command**: `pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/` (run after each RED→GREEN cycle; `just fft` only at phase end)

### Acceptance Criteria
- [ ] Default mode matches Workshop 06 sample output structure
- [ ] `--node` mode shows full values + event log + raw node.yaml
- [ ] File outputs display with `→`, filename, size, extract
- [ ] `--compact` produces exactly one line per node
- [ ] All formatters are pure functions (InspectResult in, string out)

---

## Phase 3: CLI Command Registration + Integration Tests

**Objective**: Wire the inspect command into the CLI and verify end-to-end with real filesystem tests.

**Deliverables**:
- `cg wf inspect <slug>` registered with `--node`, `--outputs`, `--compact` options
- `handleWfInspect()` CLI handler
- Integration tests using real filesystem with fixture graph
- JSON output via existing `OutputAdapter` pattern

**Dependencies**: Phase 1 + Phase 2

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI handler too thick | Medium | Medium | Keep handler thin — delegate to service + formatter |
| JSON envelope structure mismatch | Low | Medium | Use existing `adapter.format()` pattern |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write integration test: `cg wf inspect` on fixture graph | 3 | Test builds graph, runs inspect, verifies output contains all node sections | - | RED first; use `createTestServiceStack()` |
| 3.2 | [ ] | Write integration test: `--json` mode parseable | 2 | Test verifies: JSON parseable, has `data.nodes[]`, output values present | - | RED first |
| 3.3 | [ ] | Write integration test: `--node` mode with events | 2 | Test verifies: single node output, event list, node.yaml dump | - | RED first |
| 3.4 | [ ] | Write integration test: `--compact` mode | 1 | Test verifies: one line per node, correct output count | - | RED first |
| 3.4b | [ ] | Write integration test: `--outputs` mode | 2 | Test verifies: output-only sections, 40-char truncation, grouped by node | - | RED first; mirrors Phase 2 task 2.3 at integration level |
| 3.5 | [ ] | Implement `handleWfInspect()` CLI handler | 2 | Thin handler: resolve context → call service → format → print | - | Cross-plan-edit |
| 3.6 | [ ] | Register `cg wf inspect <slug>` command with options | 1 | Command registered with `--node`, `--outputs`, `--compact` flags | - | Cross-plan-edit |
| 3.7 | [ ] | JSON mode uses existing OutputAdapter | 1 | `--json` wraps InspectResult in CommandResponse envelope | - | Reuse pattern |
| 3.8 | [ ] | `just fft` passes | 1 | All tests pass, lint clean, build succeeds | - | Safety gate |

### Acceptance Criteria
- [ ] `cg wf inspect <slug>` works from CLI
- [ ] `--json` returns valid JSON parseable by `jq`
- [ ] All 4 modes produce correct output on fixture graph
- [ ] Handler follows existing `wrapAction()` + `createOutputAdapter()` pattern
- [ ] ADR-0012: no pod/session internals in output

---

## Phase 4: E2E Validation Against Real Pipeline

**Objective**: Run the advanced-pipeline E2E test, capture inspect snapshots at 3 lifecycle points, and verify inspect output is correct and useful.

**Deliverables**:
- Inspect snapshots captured at: (1) during spec-writer Q&A, (2) during parallel execution, (3) after completion
- Snapshot capture wired into `test-advanced-pipeline.ts` onEvent handler
- JSON snapshots parsed and spot-checked for correctness
- Human-readable output reviewed for clarity

**Dependencies**: Phase 3 + working E2E pipeline (Plan 039)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E takes ~2 min with real agents | High | Low | One run; capture all 3 snapshots |
| Agent output non-deterministic | Medium | Low | Check structure not content |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Add inspect snapshot calls to test-advanced-pipeline.ts | 2 | 3 snapshots: (1) during Q&A pause, (2) during parallel, (3) after completion | - | In onEvent handler, NOT production code |
| 4.2 | [ ] | Rebuild CLI: `pnpm turbo build --force` | 1 | Build succeeds | - | CLI imports from dist/ |
| 4.3 | [ ] | Run `just test-advanced-pipeline` full E2E | 2 | All existing assertions pass, 3 inspect snapshots captured | - | ~2 min with real agents |
| 4.4 | [ ] | Verify snapshot 1 (Q&A): spec-writer waiting-question | 1 | Shows ⏸️ for spec-writer, pending question text | - | Structural check |
| 4.5 | [ ] | Verify snapshot 2 (parallel): programmers running | 1 | Shows 🔶 for both programmers, ⚪ for reviewer/summariser | - | Structural check |
| 4.6 | [ ] | Verify snapshot 3 (complete): all nodes complete with outputs | 1 | All ✅, all outputs present, session chain not exposed | - | Full data check |
| 4.7 | [ ] | Review human-readable output for clarity | 1 | Output matches Workshop 06 design intent | - | Manual review |

### Acceptance Criteria
- [ ] 23/23 E2E assertions still pass (no regressions)
- [ ] 3 inspect snapshots captured and structurally correct
- [ ] JSON snapshots parseable by `jq`
- [ ] Human-readable output matches Workshop 06 style
- [ ] No session IDs or pod internals in inspect output (ADR-0012)

---

## Phase 5: Documentation

**Objective**: Create a CLI usage guide in `docs/how/` with examples for all 5 modes.

**Deliverables**:
- `docs/how/graph-inspect.md` — usage guide with real examples

**Dependencies**: Phase 4 (real output to reference)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E output changes between Phase 4 and docs | Low | Low | Re-run inspect to capture fresh output |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Survey existing `docs/how/` for placement | 1 | Documented existing structure | - | Discovery step |
| 5.2 | [ ] | Create `docs/how/graph-inspect.md` | 2 | Guide covers: all 5 modes, real examples from E2E, jq recipes | - | Use Phase 4 output |
| 5.3 | [ ] | `just fft` passes | 1 | All tests pass | - | Final gate |

### Acceptance Criteria
- [ ] `docs/how/graph-inspect.md` exists with examples for all modes
- [ ] Examples use real output from the advanced-pipeline
- [ ] `jq` recipes documented for common queries

---

## Cross-Cutting Concerns

### Security
- Inspect is read-only — no mutation risk
- File output extracts read from workspace only (no path traversal — workspace-scoped)
- ADR-0012: no agent session internals exposed

### Observability
- No logging needed (CLI command, runs once and exits)
- Error states surfaced in output (blocked-error nodes show error detail)

### Documentation
- `docs/how/graph-inspect.md` — Phase 5

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| `inspectGraph()` service method | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=0 | Composes 5+ existing service calls per node | Promise.all batching |
| Formatters (4 modes) | 3 | Medium | S=1,I=0,D=0,N=0,F=0,T=2 | 4 formatters with string output | Workshop 06 sample output as spec |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: InspectGraph Service Method + Unit Tests
- [ ] Phase 2: Formatters (Human-Readable + JSON)
- [ ] Phase 3: CLI Command Registration + Integration Tests
- [ ] Phase 4: E2E Validation Against Real Pipeline
- [ ] Phase 5: Documentation

### STOP Rule
This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0006 | Accepted | Phase 2, Phase 3 | CLI is Consumer Domain — thin wrapper + OutputAdapter pattern |
| ADR-0012 | Accepted | All phases | No pod/session internals in inspect output; events on disk only |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| (none anticipated) | — | — | — |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-enrich-inspectresult-data-model | 2026-02-21 | Phase 1 | T008 | Phase 2 formatters blocked: InspectResult missing events array, file metadata, orchestratorSettings (DYK #1-3, #5) | [x] Complete | [dossier](./tasks/phase-1-inspectgraph-service-method-unit-tests/001-subtask-enrich-inspectresult-data-model.md) |
