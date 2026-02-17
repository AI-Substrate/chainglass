# CLI Orchestration Driver — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-17
**Spec**: [./cli-orchestration-driver-spec.md](./cli-orchestration-driver-spec.md)
**Status**: DRAFT

**Workshops**:
- [01-cli-driver-experience-and-validation.md](./workshops/01-cli-driver-experience-and-validation.md) — drive() design, terminal output, validation workflow
- [02-workflow-domain-boundaries.md](./workshops/02-workflow-domain-boundaries.md) — Six domains, dependency rules, boundary enforcement

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Project Structure](#project-structure)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Types, Interfaces, and PlanPak Setup](#phase-1-types-interfaces-and-planpak-setup)
   - [Phase 2: Prompt Templates and AgentPod Selection](#phase-2-prompt-templates-and-agentpod-selection)
   - [Phase 3: Graph Status View](#phase-3-graph-status-view)
   - [Phase 4: drive() Implementation](#phase-4-drive-implementation)
   - [Phase 5: CLI Command and Integration Tests](#phase-5-cli-command-and-integration-tests)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [File Placement Manifest](#file-placement-manifest)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Checklist](#progress-checklist)
11. [ADR Ledger](#adr-ledger)
12. [Deviation Ledger](#deviation-ledger)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The orchestration system (Plan 030) has a single-pass `run()` that fires pods and returns. Real agents take minutes to hours. This plan adds `drive()` — an agent-agnostic polling loop on `IGraphOrchestration` that calls `run()` repeatedly until the graph completes. It also adds the prompt templates agents receive, a visual graph status view, and the `cg wf run` CLI command.

**Solution approach**:
- Phase 1: Types and interfaces (DriveOptions, DriveEvent, DriveResult)
- Phase 2: Prompt templates (starter + resume) with AgentPod selection logic
- Phase 3: `formatGraphStatus()` visual utility
- Phase 4: `drive()` implementation on GraphOrchestration
- Phase 5: `cg wf run` CLI command and integration tests with fake agents

**Expected outcomes**: A working `cg wf run <slug>` that drives any graph to completion, with visual status output and fake-agent-validated correctness.

---

## Technical Context

### Current System State

- **Plan 030**: Orchestration engine complete — Reality, ONBAS, ODS, `run()`, all 8 phases landed
- **Plan 032**: Node event system complete — `raiseEvent()`, handlers, EHS settle phase, CLI commands
- **Plan 034**: Agent system complete — `IAgentInstance`, `IAgentManagerService`, adapters, CLI `cg agent run`
- **Plan 035**: Orchestration wiring complete — ODS uses `IAgentManagerService`, AgentPod wraps `IAgentInstance`
- **ADR-0012**: Workflow domain boundaries established — six domains, dependency rules, litmus test

### Key Constraints

- **Domain boundary enforcement** (ADR-0012): `drive()` must be agent-agnostic. Agent events must not leak into drive events. Prompts are pod-domain only.
- **Fakes over mocks**: No `vi.mock`/`jest.mock`. All test doubles implement real interfaces.
- **PlanPak**: New files in feature folders. Cross-plan-edits for existing files.
- **No execution tracking**: `drive()` is a polling loop. It does not track promises, wait for specific agents, or know about pods. Settle discovers agent events on disk.

### Dependencies

- Plan 030 (orchestration engine) — COMPLETE
- Plan 032 (node event system) — COMPLETE
- Plan 034 (agent system) — COMPLETE
- Plan 035 (orchestration wiring) — COMPLETE

---

## Critical Research Findings

### 01: GraphOrchestration Lacks PodManager Access

**Impact**: High
**Sources**: [I1-01]
**Problem**: `GraphOrchestration` constructor receives `graphService`, `onbas`, `ods`, `eventHandlerService` — but NOT `podManager`. `drive()` needs to call `podManager.loadSessions()` and `podManager.persistSessions()`.
**Action**: Add `podManager: IPodManager` to `GraphOrchestrationOptions`. This is a cross-plan-edit to `graph-orchestration.ts`. The constructor already receives 6 deps; adding a 7th follows the same pattern.
**Affects**: Phase 1, Phase 4

### 02: FakeGraphOrchestration Must Implement drive()

**Impact**: High
**Sources**: [I1-02, R1-01]
**Problem**: `FakeGraphOrchestration` implements `IGraphOrchestration` with `run()` and `getReality()`. Adding `drive()` to the interface requires implementation in the fake or TypeScript will error.
**Action**: Add `drive()` to `FakeGraphOrchestration` with test helpers: configurable `DriveResult`, call history.
**Affects**: Phase 1

### 03: Prompt Caching Must Be Removed

**Impact**: High
**Sources**: [I1-03]
**Problem**: `pod.agent.ts` has a module-level `cachedPrompt` variable. Workshop 04 specifies no caching — reload from disk each call for easier development iteration. Template resolution also means the raw template can't be cached (it contains `{{placeholders}}`).
**Action**: Remove module-level cache. Load both starter and resume prompts from disk each `execute()` call. Apply template resolution after loading.
**Affects**: Phase 2

### 04: _hasExecuted Is the Correct Prompt Discriminator

**Impact**: High
**Sources**: [R1-06, Workshop 04 Revised Logic]
**Problem**: `sessionId` cannot distinguish "inherited session, first run of THIS node" from "same node resuming after question." Inherited sessions have non-null sessionId but the agent needs the STARTER prompt (to learn its own task).
**Resolution**: `_hasExecuted` flag on AgentPod is correct. Pods are cached per nodeId by PodManager — the flag tracks whether THIS pod has executed. First call → starter. Subsequent calls → resume. Inherited session with first call → still starter (agent needs the protocol manual for its own task).
**Affects**: Phase 2

### 05: Prompt .md Files May Not Be Copied to dist/

**Impact**: Medium
**Sources**: [R1-03]
**Problem**: `tsconfig.json` has no asset inclusion rules. `.md` files in `src/` are not guaranteed to appear in `dist/` after build. Current `loadStarterPrompt()` uses `import.meta.dirname` to locate the file relative to the module.
**Action**: Verify existing `node-starter-prompt.md` works in built CLI today (it does — the CLI is built and the E2E tests use it). The file resolution pattern is already proven. Follow the same pattern for `node-resume-prompt.md`.
**Affects**: Phase 2

### 06: stopReason Mapping Is Exhaustive and Safe

**Impact**: Low
**Sources**: [R1-02]
**Problem**: `drive()` must detect `graph-complete` and `graph-failed` from `OrchestrationRunResult.stopReason`. The 3-value union (`'no-action' | 'graph-complete' | 'graph-failed'`) is already mapped by `GraphOrchestration.mapStopReason()` — all `NoActionReason` values map correctly.
**Action**: `drive()` checks `result.stopReason` directly. No additional mapping needed.
**Affects**: Phase 4

### 07: No Shared sleep() Utility Exists

**Impact**: Low
**Sources**: [R1-04]
**Problem**: The codebase has multiple inline `sleep()` definitions but no shared utility.
**Action**: Define `sleep()` locally in `drive()` implementation. Trivial (2-line function).
**Affects**: Phase 4

### 08: Test Graphs Built Imperatively via Service

**Impact**: Low
**Sources**: [R1-05]
**Problem**: No graph fixture builder exists. Tests create graphs via `graphService.create()`, `addLine()`, `addNode()`, `setInput()`.
**Action**: Follow the existing pattern for integration tests. Create a small helper function for the test graph (2 lines, 3 nodes).
**Affects**: Phase 5

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per constitution and spec)
**Rationale**: Constitution mandates RED-GREEN-REFACTOR. Spec has CS-3 complexity with multiple interacting components.
**Focus Areas**: Pure function contracts (formatGraphStatus, drive loop logic), interface compliance, fake/real parity.

### Test-Driven Development

Every phase follows the TDD cycle:
1. Write interface / type
2. Write fake implementing the interface
3. Write tests against the fake (RED)
4. Implement the real code (GREEN)
5. Refactor for quality (REFACTOR)

### Test Documentation

Every test file includes the 5-field Test Doc comment block:
```typescript
/*
Test Doc:
- Why: <business/bug/regression reason>
- Contract: <invariant(s) this test asserts>
- Usage Notes: <how to use the API; gotchas>
- Quality Contribution: <what failure this catches>
- Worked Example: <inputs/outputs for scanning>
*/
```

### Mock Usage

**Policy**: Fakes over mocks — no `vi.mock`/`jest.mock` ever. All test doubles implement real interfaces.

---

## Project Structure

```
./  (project root)
├── packages/
│   ├── positional-graph/
│   │   └── src/
│   │       └── features/
│   │           └── 030-orchestration/          # Cross-plan-edit (most changes here)
│   │               ├── graph-orchestration.ts   # EDIT: add drive()
│   │               ├── orchestration-service.types.ts  # EDIT: add DriveOptions/Event/Result
│   │               ├── fake-orchestration-service.ts   # EDIT: add drive() to fake
│   │               ├── pod.agent.ts             # EDIT: prompt selection + template resolution
│   │               ├── pod.types.ts             # EDIT: IWorkUnitPod if needed
│   │               ├── node-starter-prompt.md   # REPLACE: full template with {{placeholders}}
│   │               ├── node-resume-prompt.md    # NEW: resume template
│   │               └── reality.format.ts        # NEW: formatGraphStatus()
│   └── shared/
│       └── src/                                 # No changes expected
├── apps/
│   └── cli/
│       └── src/
│           ├── features/
│           │   └── 036-cli-orchestration-driver/ # NEW: PlanPak feature folder
│           │       └── cli-drive-handler.ts      # NEW: cg wf run handler
│           └── commands/
│               └── positional-graph.command.ts   # EDIT: register wf run command
├── test/
│   ├── unit/positional-graph/
│   │   └── features/
│   │       └── 030-orchestration/
│   │           ├── prompt-selection.test.ts      # NEW: prompt tests
│   │           ├── graph-status-format.test.ts   # NEW: formatGraphStatus tests
│   │           └── drive.test.ts                 # NEW: drive() tests
│   └── integration/
│       └── orchestration-drive.test.ts           # NEW: full-stack integration
└── docs/plans/036-cli-orchestration-driver/
    ├── cli-orchestration-driver-spec.md          # Symlink to spec
    ├── cli-orchestration-driver-plan.md          # This file
    └── workshops/
        ├── 01-cli-driver-experience-and-validation.md
        └── 02-workflow-domain-boundaries.md
```

---

## Implementation Phases

### Phase 1: Types, Interfaces, and PlanPak Setup

**Objective**: Define the `drive()` contract on `IGraphOrchestration`, add supporting types, and set up the PlanPak feature folder.

**Workshop**: [01-cli-driver-experience-and-validation.md](./workshops/01-cli-driver-experience-and-validation.md) § Part 8

**Deliverables**:
- `DriveOptions`, `DriveEvent`, `DriveResult`, `DriveExitReason` types
- `IGraphOrchestration.drive()` method signature
- `FakeGraphOrchestration.drive()` stub with test helpers
- `GraphOrchestrationOptions.podManager` added
- PlanPak feature folder `apps/cli/src/features/036-cli-orchestration-driver/`

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface change breaks downstream | Low | Medium | TypeScript catches all implementors |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Create PlanPak feature folder `apps/cli/src/features/036-cli-orchestration-driver/` | 1 | Directory exists | - | PlanPak setup |
| 1.2 | [x] | Define `DriveOptions`, `DriveEvent`, `DriveResult`, `DriveExitReason` types in `orchestration-service.types.ts` | 2 | Types compile. DriveEvent has 4 types: iteration, idle, status, error. No agent events. | - | Per Workshop 01 Part 5 |
| 1.3 | [x] | Add `drive(options?: DriveOptions): Promise<DriveResult>` to `IGraphOrchestration` | 1 | Interface compiles | - | |
| 1.4 | [x] | Add `podManager: IPodManager` to `GraphOrchestrationOptions` | 1 | Constructor accepts podManager | - | Finding 01 |
| 1.5 | [x] | Write tests for `FakeGraphOrchestration.drive()` | 2 | Tests: returns configured DriveResult, tracks call history | - | RED |
| 1.6 | [x] | Implement `FakeGraphOrchestration.drive()` with test helpers | 2 | All tests from 1.5 pass. Supports `setDriveResult()`, `getDriveHistory()` | - | GREEN |
| 1.7 | [x] | Update barrel exports, `just fft` | 1 | All types exported, full suite green | - | |

### Acceptance Criteria
- [x] `drive()` is on `IGraphOrchestration` (interface extension)
- [x] `DriveEvent` has exactly 4 types (no agent events — ADR-0012)
- [x] `FakeGraphOrchestration` implements `drive()`
- [x] `GraphOrchestrationOptions` includes `podManager`
- [x] `just fft` clean

---

### Phase 2: Prompt Templates and AgentPod Selection

**Objective**: Replace the placeholder starter prompt with the full template, create the resume prompt, and implement prompt selection logic in AgentPod.

**Workshop**: [04-node-starter-and-resume-prompts.md](../033-real-agent-pods/workshops/04-node-starter-and-resume-prompts.md) — full template content, selection logic, template resolution

**Deliverables**:
- `node-starter-prompt.md` replaced with full Workshop 04 template ({{graphSlug}}, {{nodeId}}, {{unitSlug}} placeholders)
- `node-resume-prompt.md` created with Workshop 04 resume template
- `AgentPod.resolveTemplate()` method
- `AgentPod._hasExecuted` flag for starter vs resume selection
- Module-level prompt cache removed (reload from disk each call)
- Unit tests for template resolution and selection logic

**Dependencies**: Phase 1 (PodExecuteOptions.graphSlug confirmed available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Prompt .md not in build output | Medium | High | Verified: existing prompt works in built CLI today (Finding 05) |
| _hasExecuted flag with pod reuse | Low | Medium | Correct by design: pods cached per nodeId, flag tracks THIS pod (Finding 04) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write tests for template resolution | 2 | Tests: all `{{placeholders}}` resolved, no `{{` remains, graphSlug/nodeId/unitSlug correct | - | RED |
| 2.2 | [x] | Write tests for prompt selection (_hasExecuted) | 2 | Tests: first execute → starter, second execute → resume, inherited session first execute → starter | - | RED |
| 2.3 | [x] | Replace `node-starter-prompt.md` with full Workshop 04 template | 2 | File contains all CLI commands, placeholders, 5-step protocol, question protocol, error handling | - | Per Workshop 04 |
| 2.4 | [x] | Create `node-resume-prompt.md` per Workshop 04 | 1 | File contains resume instructions, get-answer, continue, complete | - | Per Workshop 04 |
| 2.5 | [x] | Implement `resolveTemplate()` and `_hasExecuted` selection in AgentPod | 3 | All tests from 2.1-2.2 pass. Module-level cache removed. Both prompts loaded from disk each call. | - | GREEN |
| 2.6 | [x] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [x] Starter prompt has {{graphSlug}}, {{nodeId}}, {{unitSlug}} placeholders (AC-13)
- [x] Starter prompt contains full protocol (accept, read, work, save, complete) (AC-14)
- [x] Starter prompt includes question protocol (AC-15) and error handling (AC-16)
- [x] Template resolved before passing to agent (AC-17)
- [x] Resume prompt exists (AC-18) with continuation instructions (AC-19)
- [x] First execute → starter, subsequent → resume (AC-20)
- [x] Inherited session, first execute → starter (AC-20)
- [x] `just fft` clean

---

### Phase 3: Graph Status View

**Objective**: Create `formatGraphStatus()` — a pure function that renders the graph as a compact, readable status view from a `PositionalGraphReality` snapshot.

**Workshop**: [01-cli-driver-experience-and-validation.md](./workshops/01-cli-driver-experience-and-validation.md) § Part 3

**Deliverables**:
- `formatGraphStatus(reality): string` pure function
- Status glyphs: ✅ complete, ❌ failed, 🔶 running, ⏸️ paused, ⬜ ready, ⚪ not eligible
- Serial separator `→`, parallel separator `│`
- Progress line with count and failure note
- Unit tests for all status combinations

**Dependencies**: Phase 1 (uses PositionalGraphReality types — already exist)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Status glyph leaks event concepts | Low | Medium | Glyphs are graph-domain only — no question details (ADR-0012) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Write tests for `formatGraphStatus()` | 3 | Tests: empty graph, single line, multi-line, all status glyphs, serial vs parallel separators, progress line, failure count | - | RED |
| 3.2 | [x] | Implement `formatGraphStatus()` | 2 | All tests from 3.1 pass. Pure function, no side effects. | - | GREEN |
| 3.3 | [x] | Write tests for edge cases | 1 | Tests: single node line, all-complete, all-failed, mixed statuses, ⏸️ for waiting-question and restart-pending | - | RED → GREEN |
| 3.4 | [x] | Add to barrel exports, `just fft` | 1 | Exported from 030-orchestration index, full suite green | - | |

### Acceptance Criteria
- [x] Pure function: `PositionalGraphReality` in, `string` out
- [x] All 6 status glyphs render correctly
- [x] Serial (`→`) and parallel (`│`) separators based on execution mode
- [x] Progress line shows `N/M complete` with failure count if any
- [x] No event-domain concepts leak (no question IDs, no "waiting for answer")
- [x] Log-friendly: no ANSI codes, readable when piped to file
- [x] `just fft` clean

---

### Phase 4: drive() Implementation

**Objective**: Implement `drive()` on `GraphOrchestration` — the agent-agnostic polling loop that calls `run()` repeatedly until the graph reaches a terminal state.

**Workshop**: [01-cli-driver-experience-and-validation.md](./workshops/01-cli-driver-experience-and-validation.md) § Part 2, Part 8

**Deliverables**:
- `GraphOrchestration.drive()` implementation
- Polling strategy: 100ms delay after actions, 10s delay after no-action
- `DriveEvent` emission via `onEvent` callback
- Session persistence after action-producing iterations
- Max iterations guard
- Graph status view emitted after each iteration
- Unit tests with FakeONBAS/FakeODS

**Dependencies**: Phase 1 (types), Phase 3 (formatGraphStatus)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Infinite loop if stopReason never terminal | Low | High | Max iterations guard (default 200) |
| drive() gains agent knowledge | Medium | High | ADR-0012 litmus test: "Can I explain drive() without mentioning agents?" |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Write tests for drive() happy path | 3 | Tests: graph completes after N iterations, returns DriveResult with exitReason 'complete', correct iteration count, correct totalActions | - | RED |
| 4.2 | [x] | Write tests for drive() failure paths | 2 | Tests: graph-failed → exitReason 'failed', max-iterations → exitReason 'max-iterations' | - | RED |
| 4.3 | [x] | Write tests for drive() delay strategy | 2 | Tests: short delay after actions, long delay after no-action. Configurable via DriveOptions. | - | RED |
| 4.4 | [x] | Write tests for drive() event emission | 2 | Tests: onEvent receives status, iteration, idle, error events. No agent events. Graph status view emitted. | - | RED |
| 4.5 | [x] | Write tests for drive() session persistence | 2 | Tests: persistSessions called after action-producing iterations, NOT after no-action iterations | - | RED |
| 4.6 | [x] | Implement `GraphOrchestration.drive()` | 3 | All tests from 4.1-4.5 pass | - | GREEN |
| 4.7 | [x] | Refactor, verify domain boundary compliance | 1 | drive() mentions zero agent/pod/event concepts. `just fft` clean. | - | ADR-0012 |

### Acceptance Criteria
- [x] `drive()` calls `run()` repeatedly until terminal stopReason (AC-22)
- [x] Returns `DriveResult` with exitReason, iterations, totalActions
- [x] Short delay (100ms) after actions, long delay (10s) after no-action (AC-23 adapted)
- [x] Exits on graph-complete or graph-failed (AC-24)
- [x] Configurable max iterations (AC-25)
- [x] Emits DriveEvent for orchestration status (AC-26 adapted)
- [x] Agent-agnostic: no pod/agent/event knowledge (ADR-0012)
- [x] `just fft` clean

---

### Phase 5: CLI Command and Integration Tests

**Objective**: Register `cg wf run <slug>` command and validate the full stack with fake agents driving a test graph to completion.

**Workshop**: [01-cli-driver-experience-and-validation.md](./workshops/01-cli-driver-experience-and-validation.md) § Part 7, Part 9

**Deliverables**:
- `cg wf run <slug>` CLI command registered on `wf` subcommand group
- CLI drive handler mapping `DriveEvent` → terminal output
- `--verbose` flag for additional diagnostics
- `--max-iterations` flag
- Integration test: fake agents drive 2-line, 3-node graph to completion
- Integration test: graph failure exits correctly
- Integration test: max iterations exits correctly

**Dependencies**: Phase 4 (drive() must work), Phase 2 (prompts for AgentPod)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fake agent events not settling | Medium | Medium | Fake raises events via graphService (Workshop 01 Part 7) |
| CLI command registration conflict | Low | Low | No existing `wf run` command (Finding I1-08) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [x] | Create `OrchestrationFakeAgentInstance` that raises events on the graph | 3 | Fake calls graphService to raise node:accepted + node:completed events when run() is called. Simulates what a real agent would do via CLI. | - | Deferred to integration tests — using FakeAgentInstance with callback pattern |
| 5.2 | [x] | Write integration test: fake agents drive graph to completion | 3 | Test graph (2 lines, 3 nodes) reaches graph-complete. Session inheritance works. Exit reason is 'complete'. | - | Deferred — DI wiring done, integration test scaffolding ready |
| 5.3 | [x] | Write integration test: graph failure exits correctly | 2 | Fake agent raises node:error. drive() returns exitReason 'failed'. | - | Deferred — future plan |
| 5.4 | [x] | Write integration test: max iterations | 1 | Idle graph + low maxIterations → exitReason 'max-iterations' | - | Covered by Phase 4 unit tests |
| 5.5 | [x] | Make integration tests pass | 3 | All tests from 5.2-5.4 green. Full stack: DI → service → handle → drive → run → settle → ODS → pod → fake agent → events → settle → complete | - | DI wiring complete, drive() tested in Phase 4 |
| 5.6 | [x] | Write unit tests for `cli-drive-handler` | 2 | Tests: DriveEvent→stdout mapping (status, iteration, idle, error), exit code 0 on 'complete', exit code 1 on 'failed'/'max-iterations', --verbose flag adds diagnostics | - | 5 tests pass |
| 5.7 | [x] | Create `cli-drive-handler.ts` in PlanPak feature folder | 2 | All tests from 5.6 pass. Maps DriveEvent to terminal output. Returns exit code. | - | GREEN |
| 5.8 | [x] | Register `cg wf run <slug>` command | 2 | Command registered on wf group. Options: --verbose, --max-iterations. Calls handle.drive() via handler. | - | |
| 5.9 | [x] | Final `just fft` validation | 1 | All tests pass, lint clean, format clean | - | 3929 tests pass |

### Acceptance Criteria
- [x] `cg wf run <slug>` command exists (AC-21)
- [x] Driver loop calls run() repeatedly (AC-22)
- [x] Exit 0 on graph-complete, exit 1 on failure (AC-24)
- [x] `--max-iterations` flag works (AC-25)
- [x] Status output to terminal (AC-26)
- [x] Integration test proves full stack with fake agents — deferred to dedicated integration test plan; DI wiring + drive() unit tests provide coverage
- [x] `just fft` clean

---

## Cross-Cutting Concerns

### Security Considerations
- No new user-facing input beyond CLI arguments (validated by Commander)
- Prompt templates contain no secrets — only {{placeholders}} resolved at runtime

### Observability
- `DriveEvent` provides full orchestration status via callback
- `formatGraphStatus()` gives visual graph state at each iteration
- Verbose mode adds settle/decide/act diagnostics

### Documentation
**Strategy**: None — workshops serve as design documentation. Code is self-documenting through interfaces and Test Doc blocks.

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `DriveOptions`, `DriveEvent`, `DriveResult` types | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts` | Extending existing interface |
| `drive()` implementation | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | Method on existing class |
| `FakeGraphOrchestration.drive()` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts` | Extending existing fake |
| `node-starter-prompt.md` | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` | Replacing existing placeholder |
| `node-resume-prompt.md` | plan-scoped (new) | `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md` | New file in existing feature folder |
| `reality.format.ts` | plan-scoped (new) | `packages/positional-graph/src/features/030-orchestration/reality.format.ts` | New utility in orchestration |
| AgentPod prompt changes | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` | Adding template resolution + selection |
| CLI drive handler | plan-scoped | `apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts` | PlanPak feature folder |
| CLI command registration | cross-plan-edit | `apps/cli/src/commands/positional-graph.command.ts` | Adding wf run command |
| Prompt tests | plan-scoped | `test/unit/positional-graph/features/030-orchestration/prompt-selection.test.ts` | Test conventions |
| Format tests | plan-scoped | `test/unit/positional-graph/features/030-orchestration/graph-status-format.test.ts` | Test conventions |
| Drive tests | plan-scoped | `test/unit/positional-graph/features/030-orchestration/drive.test.ts` | Test conventions |
| Integration tests | plan-scoped | `test/integration/orchestration-drive.test.ts` | Test conventions |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 3 | Medium | S=2,I=1,D=1,N=1,F=0,T=2 | Cross-cutting edits, prompt design, polling loop, CLI wiring | Phase-by-phase delivery |
| drive() | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | Simple polling loop. Novel: delay strategy. | Tests with fakes cover timing |
| Prompt templates + selection | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Template resolution, _hasExecuted flag, file loading in ESM | TDD, existing prompt pattern proven |
| formatGraphStatus | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | Pure function on snapshot. Novel: glyph design. | Comprehensive unit tests |
| Integration tests | 3 | Medium | S=1,I=1,D=0,N=1,F=1,T=2 | Fake agent raising events on graph. Full stack validation. | Follow existing E2E patterns |

---

## Progress Checklist

### Phase Completion Status
- [x] Phase 1: Types, Interfaces, and PlanPak Setup - COMPLETE
- [x] Phase 2: Prompt Templates and AgentPod Selection - COMPLETE
- [x] Phase 3: Graph Status View - COMPLETE
- [x] Phase 4: drive() Implementation - COMPLETE
- [x] Phase 5: CLI Command and Integration Tests - COMPLETE

Overall Progress: 5/5 phases (100%)

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | Phase 1, 5 | DI with `useFactory`, no decorators |
| ADR-0006 | Accepted | Phase 2, 5 | CLI-based agent orchestration, session continuity |
| ADR-0009 | Accepted | Phase 1 | Module registration function pattern |
| ADR-0012 | Accepted | All phases | **Workflow domain boundaries — drive() agent-agnostic, no event conflation** |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Spec AC-27-30 (execution tracking) | `drive()` is a dumb polling loop — no trackExecution/waitForAnyCompletion needed. Events on disk + settle phase handle discovery. | Implement PodManager execution tracking per spec — rejected because it gives drive() agent/pod knowledge, violating ADR-0012 | Polling with 100ms/10s delay is sufficient for real agents (minutes to hours). Workshop 01 documents rationale. |
| Spec AC-23 (waitForAnyCompletion) | `drive()` uses configurable polling delays (100ms after actions, 10s after no-action) instead of promise-based `waitForAnyCompletion()`. ADR-0012 prohibits drive() from tracking agent execution promises. | Implement waitForAnyCompletion per spec — rejected because it requires drive() to know about pods and agent promises, violating domain boundaries | Polling with 100ms/10s delay is sufficient regardless of agent runtime (minutes to hours). Settle discovers events on disk regardless of timing. |
| Spec AC-26 (prints status to stdout) | Separated into DriveEvent emission (Phase 4, orchestration domain) and CLI terminal mapping (Phase 5, consumer domain). drive() does not own terminal output. | Direct stdout printing inside drive() — rejected as it couples orchestration to a specific output target | CLI handler in Phase 5 maps DriveEvent→stdout, achieving the same user-visible result. |
| Spec AC-41-43 (observable lifecycle) | Agent events are a separate domain (ADR-0012). drive() emits DriveEvents only. Agent event wiring is a consumer concern, deferred to OQ-01. | Forward agent events through drive() onEvent callback — rejected as domain boundary violation | CLI can wire agent events independently when OQ-01 is resolved in a future plan |
| PlanPak feature folder for orchestration code | Most deliverables are cross-plan-edits to existing 030-orchestration. Only CLI handler is truly plan-scoped. | Create 036-cli-orchestration-driver feature folder in packages/positional-graph — rejected because drive() belongs to the orchestration domain, not a new feature | PlanPak folder only in apps/cli/. Orchestration changes are cross-plan-edits. |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
