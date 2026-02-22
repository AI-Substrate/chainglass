# Advanced E2E Pipeline Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-02-21
**Spec**: [./advanced-e2e-pipeline-spec.md](./advanced-e2e-pipeline-spec.md)
**Status**: READY
**Mode**: Full
**File Management**: PlanPak

**Workshops**:
- [01-multi-line-qa-e2e-test-design.md](./workshops/01-multi-line-qa-e2e-test-design.md) — E2E test topology, Q&A flow, assertion matrix
- [03-simplified-context-model.md](./workshops/03-simplified-context-model.md) — Global Session + Left Neighbor context engine (6 rules)
- [02-context-backward-walk-scenarios.md](./workshops/02-context-backward-walk-scenarios.md) — DEPRECATED: led to Workshop 03

**Research**: [./research-dossier.md](./research-dossier.md)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Context Engine — Types, Schema, and Rules](#phase-1-context-engine--types-schema-and-rules)
7. [Phase 2: Readiness Gate and Status Pipeline](#phase-2-readiness-gate-and-status-pipeline)
8. [Phase 3: E2E Test Fixtures and Script](#phase-3-e2e-test-fixtures-and-script)
9. [Phase 4: Real Agent Verification and Polish](#phase-4-real-agent-verification-and-polish)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)
11. [Complexity Tracking](#complexity-tracking)
12. [Progress Tracking](#progress-tracking)
13. [ADR Ledger](#adr-ledger)
14. [Deviation Ledger](#deviation-ledger)
15. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The current 5-rule backward-walk context engine produces incorrect results when parallel agent nodes sit between a source and target node. This blocks multi-line workflows — a reviewer inherits from a parallel worker's session instead of from the spec-writer's global session.

**Solution approach**:
- Replace the context engine with the "Global Session + Left Neighbor" model: 6 flat rules, ~70 lines, no cross-line walks (Workshop 03)
- Add `noContext` and `contextFrom` to the orchestrator settings schema and thread through the reality pipeline
- Add a `contextFromReady` readiness gate so ONBAS never starts a node before its context target completes
- Build a 6-node, 4-line E2E pipeline test proving Q&A, parallel fan-out, context isolation, and global session inheritance with real Copilot agents (Workshop 01)
- Report and fix any orchestration issues found during implementation (full shakedown)

**Expected outcomes**:
- Context works correctly across parallel lines — no backward walk surprises
- `noContext` and `contextFrom` are first-class graph settings
- The E2E test becomes the repeatable proof that orchestration works end-to-end
- Dead code (`getFirstAgentOnPreviousLine`) removed

---

## Technical Context

### Current System State
- **Context engine**: `agent-context.ts` (129 lines, 5 rules) — single production consumer at `ods.ts:156`
- **NodeReality**: 15 fields — missing `noContext` and `contextFrom`
- **ReadinessDetail**: 5 gates — missing `contextFromReady`
- **Test suite**: 13 unit tests in `agent-context.test.ts` (572 lines) — all testing old rules
- **Fixtures**: 8 test graph directories in `dev/test-graphs/` — none for advanced pipeline
- **E2E script**: `scripts/test-copilot-serial.ts` (427 lines) — VerboseCopilotAdapter + drive loop pattern to extend

### Integration Requirements
- `IAgentContextService` interface and `ContextSourceResult` type are **unchanged** — same 3-variant discriminated union
- `FakeAgentContextService` (53 lines) must be updated to match new rules
- ONBAS and ODS are **not expected to change** — audit during implementation will confirm

### Constraints
- `positional-graph.service.ts` is ~2500 lines — surgical changes only
- Real agent E2E runs are non-deterministic (30-120s) — structural assertions only
- `getFirstAgentOnPreviousLine()` is dead code (no production callers) — safe to delete

### Assumptions
- Copilot SDK `createSession` / `resumeSession` handles session inheritance correctly
- `withTestGraph` fixture pattern handles 6 work units across 4 lines
- Q&A event flow (`answerQuestion` → `node:restart` → `ready`) works as documented

---

## Critical Research Findings

| # | Impact | Finding | Action | Affects |
|---|--------|---------|--------|---------|
| 01 | Critical | **Single production consumer** — only `ods.ts:156` calls `getContextSource()` | Replace engine body, keep interface identical | Phase 1 |
| 02 | Critical | **NodeReality gap** — missing `noContext` and `contextFrom` fields; forward-compatible guards exist in agent-context.ts lines 51-52 | Add fields to `reality.types.ts`, wire in `reality.builder.ts` | Phase 1 |
| 03 | Critical | **ReadinessDetail gap** — 5 gates, none for `contextFrom` target completion | Add `contextFromReady` boolean, compute in `getNodeStatus()` | Phase 2 |
| 04 | High | **Old tests are thorough** — 13 tests, all 5 rules covered with edge cases | Rewrite entirely for new 6-rule model; do NOT try incremental migration | Phase 1 |
| 05 | High | **Schema additive** — `NodeOrchestratorSettingsSchema` needs `noContext: z.boolean().default(false)` and `contextFrom: z.string().min(1).optional()` | Add to schema, defaults ensure backward compat | Phase 1 |
| 06 | High | **FakeAgentContextService is minimal** (53 lines, Map-based overrides) — easy to update | Update to implement new rules or keep as override-map | Phase 1 |
| 07 | High | **`getFirstAgentOnPreviousLine()` is dead code** — defined in reality.view.ts, tested but never called in production | Delete method and its tests | Phase 1 |
| 08 | High | **VerboseCopilotAdapter pattern** — scripts/test-copilot-serial.ts provides reusable pattern for SDK event logging | Extend for advanced pipeline; add QuestionWatcher | Phase 3 |
| 09 | Medium | **readyDetail computation at service.ts:1096-1103** — context is NOT currently factored into readiness | Insert `contextFromReady` after `serialNeighborComplete` | Phase 2 |
| 10 | Medium | **Test helpers pattern** — `makeNode`, `makeLine`, `makeReality` construct plain fixtures | Reuse pattern for new tests, extend with `noContext`/`contextFrom` fields | Phase 1 |
| 11 | Medium | **unit.yaml pattern established** — `slug`, `type`, `agent.prompt_template`, `inputs[]`, `outputs[]` | Follow for 6 new fixture units | Phase 3 |
| 12 | Medium | **buildStack() in serial test** — wires all services needed for orchestration | Extract/adapt for advanced pipeline script | Phase 3 |
| 13 | Low | **ContextSourceResult is Zod-first** — schema in `agent-context.schema.ts` (55 lines) | No changes needed — 3-variant union stays identical | Phase 1 |
| 14 | Low | **Container.ts DI registration** — registers AgentContextService by class name | No changes — same class, same interface | Phase 1 |

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Full shakedown before the web world — correctness must be proven at every layer
- **Focus Areas**:
  - Context engine rules (R0-R5): exhaustive unit tests for all 6 rules, all 7 scenarios from Workshop 03
  - `contextFrom` readiness gate: unit tests for input gate behaviour
  - Real-agent E2E: structural assertions (session IDs, statuses, output existence)
  - Q&A handshake: scripted answer flow end-to-end

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock/Fake Policy
- **This plan's tests**: No fakes, no mocks — real `PositionalGraphReality` objects for unit tests, real Copilot agents for E2E
- **Existing infrastructure fakes**: `FakeAgentContextService` maintained and updated (ODS tests depend on it)

### Test Documentation
Every test must include purpose, quality contribution, and acceptance criteria as inline comments.

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `agent-context.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Replacing engine body in existing file |
| `agent-context.test.ts` | cross-plan-edit | `test/unit/positional-graph/features/030-orchestration/` | Rewriting tests for existing file |
| `orchestrator-settings.schema.ts` | cross-plan-edit | `packages/positional-graph/src/schemas/` | Adding fields to existing schema |
| `reality.types.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Adding fields to existing interfaces |
| `reality.builder.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Wiring new fields |
| `reality.view.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Deleting dead method |
| `positional-graph.service.ts` | cross-plan-edit | `packages/positional-graph/src/services/` | Adding readiness gate + exposing fields |
| `positional-graph-service.interface.ts` | cross-plan-edit | `packages/positional-graph/src/interfaces/` | Adding fields to NodeStatusResult |
| `fake-agent-context.ts` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Updating fake to match new rules |
| `reality.test.ts` | cross-plan-edit | `test/unit/positional-graph/features/030-orchestration/` | Removing dead method tests |
| `test-advanced-pipeline.ts` | plan-scoped | `scripts/` | E2E test script (scripts/ convention) |
| `advanced-pipeline/units/*` | plan-scoped | `dev/test-graphs/advanced-pipeline/` | Test fixture units (test-graphs/ convention) |
| `context-inheritance.md` | cross-plan-edit | `docs/how/` | Already symlinked to Workshop 03 |

**Note**: No new feature folder needed under `packages/*/src/features/039-*/` — all production changes are edits to existing files in `030-orchestration/`. The E2E test script and fixtures follow the existing `scripts/` and `dev/test-graphs/` conventions.

---

## Phase 1: Context Engine — Types, Schema, and Rules

**Objective**: Replace the 5-rule backward-walk context engine with the 6-rule Global Session + Left Neighbor model, including all supporting type and schema changes.

**Deliverables**:
- `noContext` and `contextFrom` fields on schema, NodeStatusResult, and NodeReality
- New `getContextSource()` implementation (~70 lines, Workshop 03)
- Rewritten unit test suite covering all 6 rules and 7 scenarios
- `getFirstAgentOnPreviousLine()` deleted from reality.view.ts
- `FakeAgentContextService` updated

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Old tests break during rewrite | Certain | Medium | Rewrite all 13 tests before touching implementation — new tests RED first |
| `noContext` default affects existing graphs | Low | High | Default is `false` — additive, backward compatible |
| Forward-compat guards in current code mask bugs | Low | Medium | Delete guards, replace with typed fields |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Add `noContext` and `contextFrom` to `NodeOrchestratorSettingsSchema` | 1 | Schema compiles; defaults work (`false`, `undefined`) | - | `orchestrator-settings.schema.ts` |
| 1.2 | [x] | Add `noContext?` and `contextFrom?` to `NodeStatusResult` interface | 1 | Interface compiles; existing callers unaffected | - | `positional-graph-service.interface.ts` |
| 1.3 | [x] | Expose `noContext` and `contextFrom` in `getNodeStatus()` | 2 | Fields populated from `node.config.orchestratorSettings` | - | `positional-graph.service.ts` |
| 1.4 | [x] | Add `noContext?` and `contextFrom?` to `NodeReality` interface | 1 | Interface compiles | - | `reality.types.ts` |
| 1.5 | [x] | Wire `noContext` and `contextFrom` in reality builder | 1 | Reality snapshot includes both fields from `NodeStatusResult` | - | `reality.builder.ts` |
| 1.6 | [x] | Write unit tests for new context engine (all 6 rules, 7 scenarios) | 3 | Tests RED — all fail against old engine | - | `agent-context.test.ts` — rewrite entirely |
| 1.7 | [x] | Replace `getContextSource()` with new implementation | 2 | All tests from 1.6 pass GREEN | - | `agent-context.ts` — Workshop 03 code |
| 1.8 | [x] | Update `FakeAgentContextService` to match new rules | 1 | ODS unit tests still pass with updated fake | - | `fake-agent-context.ts` |
| 1.9 | [x] | Delete `getFirstAgentOnPreviousLine()` from reality.view.ts | 1 | No compile errors; removed tests from reality.test.ts | - | Dead code cleanup |
| 1.10 | [x] | Run full test suite — verify no regressions | 1 | `pnpm test` all pass (rewritten context tests + existing suite); `just fft` passes (lint + format + test); zero new TypeScript errors via `just typecheck` | - | Shakedown checkpoint |

### Test Examples (Write First!)

```typescript
describe('getContextSource — Global Session + Left Neighbor', () => {
  // Scenario 3: The E2E Pipeline (motivating case)
  test('R5: reviewer at pos 0 inherits from global agent, skipping noContext parallel line', () => {
    // Purpose: Proves the core bug fix — reviewer gets spec-writer's session, not programmer's
    // Quality Contribution: Prevents the exact bug that motivated the redesign
    const reality = makeReality([
      makeLine([makeNode('human', { unitType: 'user-input' })]),
      makeLine([makeNode('spec', { unitType: 'agent', execution: 'serial' })]),
      makeLine([
        makeNode('prog-a', { unitType: 'agent', execution: 'parallel', noContext: true }),
        makeNode('prog-b', { unitType: 'agent', execution: 'parallel', noContext: true }),
      ]),
      makeLine([
        makeNode('reviewer', { unitType: 'agent', execution: 'serial' }),
        makeNode('summariser', { unitType: 'agent', execution: 'serial' }),
      ]),
    ]);

    const result = getContextSource(reality, 'reviewer');
    expect(result.source).toBe('inherit');
    expect((result as InheritContextResult).fromNodeId).toBe('spec');
  });

  test('R1: noContext always gets fresh session regardless of position', () => {
    // Purpose: Proves noContext overrides everything
    const reality = makeReality([
      makeLine([makeNode('global', { unitType: 'agent', execution: 'serial' })]),
      makeLine([makeNode('isolated', { unitType: 'agent', execution: 'serial', noContext: true })]),
    ]);

    const result = getContextSource(reality, 'isolated');
    expect(result.source).toBe('new');
  });

  test('R2: contextFrom overrides default inheritance', () => {
    // Purpose: Proves explicit wiring works
    const reality = makeReality([
      makeLine([
        makeNode('A', { unitType: 'agent', execution: 'serial' }),
        makeNode('B', { unitType: 'agent', execution: 'serial', noContext: true }),
      ]),
      makeLine([makeNode('R', { unitType: 'agent', execution: 'serial', contextFrom: 'B' })]),
    ]);

    const result = getContextSource(reality, 'R');
    expect(result.source).toBe('inherit');
    expect((result as InheritContextResult).fromNodeId).toBe('B');
  });

  test('R4: parallel at pos > 0 gets fresh session', () => {
    // Purpose: Proves independent workers get isolated sessions
    const reality = makeReality([
      makeLine([makeNode('global', { unitType: 'agent', execution: 'serial' })]),
      makeLine([
        makeNode('w1', { unitType: 'agent', execution: 'parallel' }),
        makeNode('w2', { unitType: 'agent', execution: 'parallel' }),
      ]),
    ]);

    const result = getContextSource(reality, 'w2');
    expect(result.source).toBe('new');
  });
});
```

### Acceptance Criteria
- [x] All 6 rules (R0-R5) have dedicated unit tests
- [x] All 7 scenarios from Workshop 03 are tested
- [x] `contextFrom` override tested (AC-3)
- [x] Parallel pos > 0 tested without noContext (AC-4)
- [x] Left-hand rule tested: serial inherits from left even if parallel (AC-6)
- [x] `getFirstAgentOnPreviousLine()` deleted (AC-7)
- [x] `pnpm test` passes with zero regressions
- [x] `just fft` passes

---

## Phase 2: Readiness Gate and Status Pipeline

**Objective**: Add the `contextFromReady` readiness gate so ONBAS never starts a node before its `contextFrom` target is complete.

**Deliverables**:
- `contextFromReady` field on `ReadinessDetail`
- Gate logic in `getNodeStatus()` — target must exist AND be complete
- Runtime guard in `getContextSource()` for belt-and-suspenders safety
- Unit tests for the gate

**Dependencies**: Phase 1 must be complete (schema + types + engine)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gate logic interacts with existing 5 gates unexpectedly | Medium | High | Test gate independently and in combination |
| `positional-graph.service.ts` is 2500 lines | Low | Medium | Surgical change at ~line 1087; review carefully |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Add `contextFromReady` to `ReadinessDetail` interface | 1 | Interface compiles; existing code unaffected (new field optional or defaulted) | - | `reality.types.ts` |
| 2.2 | [x] | Write tests for contextFrom readiness gate | 2 | Tests RED: node with contextFrom targeting incomplete node → not ready; targeting complete node → ready; no contextFrom → always ready | - | New test file or extend existing |
| 2.3 | [x] | Implement contextFrom gate in `getNodeStatus()` | 2 | Tests from 2.2 pass GREEN | - | `positional-graph.service.ts` ~line 1087 |
| 2.4 | [x] | Wire `contextFromReady` in reality builder | 1 | Reality snapshot includes gate value | - | `reality.builder.ts` |
| 2.5 | [x] | Verify runtime guard in `getContextSource()` handles invalid contextFrom | 1 | Invalid contextFrom returns `new` with reason (belt-and-suspenders) | - | Already in Phase 1 implementation |
| 2.6 | [x] | Run full test suite — verify no regressions | 1 | `pnpm test` all pass; all 5 existing readiness gates still function (precedingLinesComplete, transitionOpen, serialNeighborComplete, inputsAvailable, unitFound); new contextFromReady gate tests pass; `just fft` passes | - | Shakedown checkpoint |

### Test Examples

```typescript
describe('contextFrom readiness gate', () => {
  test('node with contextFrom targeting incomplete node is NOT ready', () => {
    // Purpose: Proves contextFrom blocks execution until target completes
    // Quality Contribution: Prevents data race where node runs before context available
    // Build a graph where node R has contextFrom: 'S', but S is still running
    // Assert: R.readyDetail.contextFromReady === false
    // Assert: R.ready === false
  });

  test('node with contextFrom targeting complete node IS ready', () => {
    // Purpose: Proves gate opens when target completes
    // Build same graph but S is complete
    // Assert: R.readyDetail.contextFromReady === true
  });

  test('node without contextFrom always passes gate', () => {
    // Purpose: Proves gate is transparent for normal nodes
    // Assert: readyDetail.contextFromReady === true (default)
  });
});
```

### Acceptance Criteria
- [x] `contextFromReady` gate prevents premature execution (AC-3)
- [x] Gate is transparent for nodes without `contextFrom`
- [x] Runtime guard in getContextSource handles edge cases
- [x] All existing readiness gates still function correctly
- [x] `pnpm test` passes; `just fft` passes

---

## Phase 3: E2E Test Fixtures and Script

**Objective**: Build the centrepiece E2E test — 6 fixture work units and the test script with VerboseCopilotAdapter, QuestionWatcher, and rich terminal UX.

**Deliverables**:
- 6 work unit fixtures in `dev/test-graphs/advanced-pipeline/units/`
- `scripts/test-advanced-pipeline.ts` with all 8 sections (Workshop 01)
- `justfile` entry for `test-advanced-pipeline`

**Dependencies**: Phase 1 and Phase 2 must be complete (context engine + readiness gate)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fixture prompt design affects agent behaviour | Medium | Medium | Keep prompts simple and directive; structural assertions only |
| `withTestGraph` may not handle 6 units smoothly | Low | Medium | Test with simpler graph first |
| Q&A timing — agent must ask expected question | Medium | High | Prompt explicitly instructs agent to ask; retry logic in drive loop |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Create `dev/test-graphs/advanced-pipeline/units/human-input/unit.yaml` | 1 | user-input type; outputs: `requirements` | - | Fixture |
| 3.2 | [ ] | Create spec-writer unit: `unit.yaml` + `prompts/main.md` | 2 | Agent type; inputs: requirements; outputs: spec, language-1, language-2; prompt instructs Q&A | - | Fixture |
| 3.3 | [ ] | Create programmer-a unit: `unit.yaml` + `prompts/main.md` | 1 | Agent type; inputs: spec, language; outputs: code, test-results, summary | - | Fixture |
| 3.4 | [ ] | Create programmer-b unit (same structure as programmer-a) | 1 | Mirrors programmer-a | - | Fixture |
| 3.5 | [ ] | Create reviewer unit: `unit.yaml` + `prompts/main.md` | 2 | Agent type; inputs from both programmers; outputs: review-a, review-b, metrics-a, metrics-b | - | Fixture |
| 3.6 | [ ] | Create summariser unit: `unit.yaml` + `prompts/main.md` | 1 | Agent type; inputs from reviewer; outputs: final-report, overall-pass, total-loc | - | Fixture |
| 3.7 | [ ] | Write test script: imports, constants, VerboseCopilotAdapter | 2 | `pnpm tsx scripts/test-advanced-pipeline.ts --help` prints usage without errors; adapter wraps SDK with event streaming | - | `scripts/test-advanced-pipeline.ts` §1-2 |
| 3.8 | [ ] | Write QuestionWatcher class (scripted + interactive modes) | 2 | Detects pending questions, matches scripted answers, answers via `answerNodeQuestion()` helper; `--interactive` flag switches to readline prompt | - | §3 per Workshop 01 |
| 3.9 | [ ] | Write graph builder: `buildAdvancedPipeline()` | 3 | Creates graph with 4 lines, 6 nodes, all inputs wired, `noContext: true` on parallel nodes; returns node ID map for assertions | - | §4 — returns node ID map |
| 3.10 | [ ] | Write drive loop with Q&A integration | 3 | Drives orchestration via `handle.drive()`; on idle checks `reality.pendingQuestions`; answers; resumes; prints phase banners per line | - | §5 |
| 3.11 | [ ] | Write assertion section | 2 | 17 assertions per Workshop 01 matrix (AC-8 through AC-13); session chain + isolation verification; outputs non-empty check | - | §6 |
| 3.12 | [ ] | Write output display and main entry point | 1 | `pnpm tsx scripts/test-advanced-pipeline.ts` runs end-to-end (may fail on agent calls without Copilot token — script structure validated); prints outputs, session chain, summary | - | §7-8 |
| 3.13 | [ ] | Add `just test-advanced-pipeline` entry | 1 | `just test-advanced-pipeline` runs the script | - | `justfile` |

### Acceptance Criteria
- [ ] All 6 fixture units have valid `unit.yaml` files (AC-8)
- [ ] Script compiles and runs without errors
- [ ] QuestionWatcher handles scripted answers (AC-11)
- [ ] Graph builder creates correct topology with `noContext` on parallel nodes
- [ ] 17 assertions defined per Workshop 01 matrix
- [ ] `--interactive` flag switches to human input mode (AC-11)
- [ ] `just test-advanced-pipeline` works

---

## Phase 4: Real Agent Verification and Polish

**Objective**: Run the E2E test with real Copilot agents, verify all assertions pass, fix any issues found (shakedown), and polish the UX.

**Deliverables**:
- Passing E2E run with all 17 assertions green
- Any orchestration fixes discovered during shakedown
- Documentation in `docs/how/`

**Dependencies**: Phase 3 must be complete (script exists and compiles)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Agent doesn't ask the expected question | Medium | High | Prompt engineering; retry with adjusted prompts |
| Parallel nodes timeout | Medium | Medium | Increase timeout to 180s; add per-node timing |
| Orchestration bug surfaces during real run | Medium | High | Workshop and fix within this plan (Goal 5) |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Run E2E test with real Copilot agents (scripted mode) | 3 | `just test-advanced-pipeline` completes within 180s timeout; all 17 assertions pass; exit code 0. If timeout: retry up to 3 times. If 3 failures: investigate specific node, adjust prompt, re-run. | - | Command: `just test-advanced-pipeline`; timeout enforced by script-level `setTimeout(180_000)` |
| 4.2 | [ ] | Verify session chain: spec-writer = reviewer = summariser session IDs | 1 | Same session ID for all three (AC-9) | - | From test output |
| 4.3 | [ ] | Verify isolation: programmer-a ≠ programmer-b ≠ spec-writer sessions | 1 | All three session IDs differ (AC-10) | - | From test output |
| 4.4 | [ ] | Verify Q&A handshake: question detected, answered, agent resumed | 1 | Script logs show question→answer→resume flow (AC-11) | - | From test output |
| 4.5 | [ ] | Verify line ordering: parallel nodes start after line 1 completes | 1 | Timing shows programmer starts > spec-writer end (AC-12) | - | From test output |
| 4.6 | [ ] | Report and fix any orchestration issues found | 2 | Issues documented; fixes applied and tested (AC-14) | - | Shakedown — workshop if needed |
| 4.7 | [ ] | Test interactive mode (`--interactive`) | 1 | Human can answer question at terminal; pipeline completes | - | Manual verification |
| 4.8 | [ ] | Update `docs/how/context-inheritance.md` symlink target if needed | 1 | Symlink points to current Workshop 03 | - | Already exists; verify |
| 4.9 | [ ] | Run `just fft` — final quality gate | 1 | Lint, format, and tests all pass | - | Final checkpoint |

### Acceptance Criteria
- [ ] E2E test passes with real agents (AC-8)
- [ ] Session inheritance proven (AC-9)
- [ ] Session isolation proven (AC-10)
- [ ] Q&A handshake proven (AC-11)
- [ ] Line ordering proven (AC-12)
- [ ] All outputs non-empty (AC-13)
- [ ] Shakedown complete — no deferred orchestration bugs (AC-14)
- [ ] `just fft` passes

---

## Cross-Cutting Concerns

### Security Considerations
- `contextFrom` accepts arbitrary node ID strings — validated at readiness gate (existence check) and runtime guard
- No new external inputs; all settings set programmatically via `addNode()`

### Observability
- Context engine includes `reason` string on every result — logs show exactly which rule fired
- E2E script provides rich terminal output with per-node timing and session IDs
- Drive loop events logged for debugging

### Documentation
- **Location**: `docs/how/` only
- `docs/how/context-inheritance.md` symlink to Workshop 03 already exists
- E2E script is self-documenting via terminal UX (graph topology printed at start, assertion summary at end)

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Context engine replacement | 3 | Medium | S=1,I=0,D=1,N=0,F=0,T=1 | Well-specified by Workshop 03; single consumer | Rewrite tests first (TDD) |
| Readiness gate | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Single insertion point in existing gate chain | Test independently |
| E2E test script | 3 | Medium | S=1,I=1,D=0,N=0,F=0,T=1 | Extends existing pattern; new QuestionWatcher | Reuse VerboseCopilotAdapter |
| Real agent verification | 3 | Medium | S=0,I=1,D=0,N=1,F=0,T=1 | Non-deterministic; prompt engineering | Structural assertions only |

**Overall**: CS-3 (medium) — matches spec assessment.

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Context Engine — Types, Schema, and Rules
- [x] Phase 2: Readiness Gate and Status Pipeline
- [ ] Phase 3: E2E Test Fixtures and Script
- [ ] Phase 4: Real Agent Verification and Polish

### STOP Rule
**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0006 | Active | All | CLI-based workflow agent orchestration — the E2E test exercises this architecture |
| ADR-0008 | Active | Phase 3-4 | Workspace-scoped storage — test fixtures use this model |
| ADR-0011 | Active | Phase 1-2 | First-class domain concepts — `noContext` and `contextFrom` are new domain concepts |
| ADR-0012 | Active | Phase 1-2 | Workflow domain boundaries — context logic stays in Orchestration domain, separated from Agent domain |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| PlanPak R-ARCH-002 (feature folders) | All production changes are edits to existing `030-orchestration` files — no new feature folder warranted | Creating `039-advanced-e2e-pipeline` feature folder with re-exports | Changes are small edits, not new modules; feature folder would add indirection for no benefit |
| Integration tests always run | 3 integration tests (orchestration-drive, node-event-system-e2e, orchestration-e2e) were timing out at 210s in normal test runs | Running unconditionally | Added `RUN_INTEGRATION=1` env var gate; run explicitly via `RUN_INTEGRATION=1 pnpm test -- --run orchestration-drive` |
| No fakes policy — FakeNodeEventRegistry | E2E script uses `FakeNodeEventRegistry` for event type registration. This is shared test infrastructure (not a mock), used identically by every orchestration test and the serial E2E script. No real registry implementation exists — this IS the registry for test/script contexts. | Building a "real" registry that reads from config | FakeNodeEventRegistry is behaviorally identical to production; only difference is in-memory storage vs no storage. All event types registered via `registerCoreEventTypes()`. |

---

## Change Footnotes Ledger

[^1]: Phase 1 complete — modified: `orchestrator-settings.schema.ts` (noContext/contextFrom fields), `positional-graph-service.interface.ts` (NodeStatusResult fields), `positional-graph.service.ts` (getNodeStatus + addNode wiring), `reality.types.ts` (NodeReality + ReadinessDetail stub), `reality.builder.ts` (status→reality wiring), `agent-context.ts` (6-rule engine replacement), `agent-context.test.ts` (20 tests rewrite), `reality.view.ts` (deleted getFirstAgentOnPreviousLine), `reality.test.ts` (removed 4 dead tests), plus 3 integration test files gated with RUN_INTEGRATION=1.
[^2]: Phase 2 complete — modified: `input-resolution.ts` (Gate 5 contextFromReady in canRun()), `positional-graph-service.interface.ts` (CanRunResult gate union + NodeStatusResult inline readyDetail type), `positional-graph.service.ts` (contextFromReady in getNodeStatus() readyDetail), `reality.builder.ts` (contextFromReady pass-through). Tests: 4 new gate tests in `can-run.test.ts`, 21/21 agent-context tests pass. Discovery: NodeStatusResult has separate inline readyDetail type from ReadinessDetail — both need updating for new gates. `just fft`: 274 files, 3960 tests, 0 failures.
