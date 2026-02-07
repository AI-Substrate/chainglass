# Node Event System — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-07
**Spec**: [./node-event-system-spec.md](./node-event-system-spec.md)
**Status**: DRAFT

**Workshops**:
- [01-node-event-system.md](./workshops/01-node-event-system.md) — Event types, registry, CLI design, state machine
- [02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md) — Concrete data shapes, storage, migration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Project Structure](#project-structure)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Event Types, Schemas, and Registry](#phase-1-event-types-schemas-and-registry)
   - [Phase 2: State Schema Extension and Two-Phase Handshake](#phase-2-state-schema-extension-and-two-phase-handshake)
   - [Phase 3: raiseEvent Core Write Path](#phase-3-raiseevent-core-write-path)
   - [Phase 4: Event Handlers and State Transitions](#phase-4-event-handlers-and-state-transitions)
   - [Phase 5: Service Method Wrappers](#phase-5-service-method-wrappers)
   - [Phase 6: CLI Commands](#phase-6-cli-commands)
   - [Phase 7: ONBAS Adaptation and Backward-Compat Projections](#phase-7-onbas-adaptation-and-backward-compat-projections)
   - [Phase 8: E2E Validation Script](#phase-8-e2e-validation-script)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [File Placement Manifest](#file-placement-manifest)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Tracking](#progress-tracking)
11. [ADR Ledger](#adr-ledger)
12. [Deviation Ledger](#deviation-ledger)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

Plan 030's orchestration loop (Phases 1-5 complete) is blocked on ODS (Phase 6) because
ODS needs a unified event protocol for node communication. Currently, nodes talk through
bespoke methods (`askQuestion`, `endNode`, `saveOutputData`) — each with its own
validation, storage, and CLI command. Adding any new interaction requires changes in
4+ places.

This plan replaces the bespoke approach with a single `raiseEvent()` write path backed
by a typed, extensible, schema-validated event system. Every node interaction becomes a
`NodeEvent` — validated against a registered Zod schema, stored in an append-only event
log per node, and tracked through a three-state lifecycle (`new` → `acknowledged` →
`handled`).

**Solution approach**:
- Phase 1-2: Data model (event types/registry + state schema extension)
- Phase 3-4: Core engine (raiseEvent write path + event handlers)
- Phase 5: Migration (existing service methods become thin wrappers)
- Phase 6: CLI surface (4 generic commands + 3 shortcuts)
- Phase 7: Adaptation (ONBAS reads event log, backward-compat projections)
- Phase 8: Visual E2E script (fully automatic, human-readable output)

**Expected outcomes**: A unified event system that all node interactions flow through,
with a visual E2E script proving the complete lifecycle. Plan 030 Phase 6 (ODS) can
then resume, consuming events instead of calling bespoke methods.

---

## Technical Context

### Current System State

- **Plan 026**: Positional graph model (lines, nodes, 4-gate readiness, input wiring)
- **Plan 028**: Question lifecycle (`QuestionSchema`, `askQuestion`, `answerQuestion`)
- **Plan 029**: Agentic work units (discriminated types, execution lifecycle CLI)
- **Plan 030 Phases 1-5**: Orchestration core (Reality, OrchestrationRequest, AgentContext,
  Pods, ONBAS) — all complete. Phase 6 (ODS) blocked on this plan.

### Integration Requirements

- `IPositionalGraphService` — graph CRUD, state persistence, current node methods
- `packages/positional-graph/src/schemas/state.schema.ts` — state.json schema
- `packages/positional-graph/src/errors/positional-graph-errors.ts` — error factories
- `apps/cli/src/commands/positional-graph.command.ts` — CLI command registration
- `packages/positional-graph/src/features/030-orchestration/onbas.ts` — ONBAS walk

### Constraints

- New code in `packages/positional-graph/src/features/032-node-event-system/` (PlanPak)
- Schema changes in `packages/positional-graph/src/schemas/state.schema.ts` (cross-plan-edit)
- Error codes in `packages/positional-graph/src/errors/` (cross-plan-edit)
- CLI commands in `apps/cli/src/commands/` (cross-plan-edit)
- ONBAS adaptation in `packages/positional-graph/src/features/030-orchestration/` (cross-plan-edit)
- Fakes over mocks: no `vi.mock`/`jest.mock` ever
- `raiseEvent()` is the single write path (Option B — Workshop #01 Q6)

### Assumptions

- Single-process execution: one CLI invocation at a time per graph
- Existing `loadState()`/`persistState()` and atomic writes are reliable
- ONBAS walk structure (line order, position order, first-match-wins) unchanged
- The 8 initial event types cover all current node interactions
- Existing CLI commands (`ask`, `answer`, `end`, `save-output-data`) become aliases

---

## Critical Research Findings

Findings sourced from research-dossier.md, workshops, and implementation research.
Ordered by impact.

### 01: Status Enum Replacement Cascades Through Entire Codebase

**Impact**: Critical
**Sources**: [I1-02, R1-01, R1-02, R1-09]
**Problem**: Replacing `'running'` with `'starting'` and `'agent-accepted'` breaks every
`case 'running':` switch statement, every `status === 'running'` guard, and every test
fixture using `'running'`. The ONBAS walk, service methods (7+ sites), graph status
computation, and 100+ test references all need updating.
**Action**: Extract `isNodeActive(status)` helper. Replace all `status === 'running'`
checks. Add TypeScript `never` exhaustiveness checks to all switch statements before
migration. Run `pnpm typecheck` after enum change to catch all missing cases.
**Affects**: Phase 2, Phase 5, Phase 7

### 02: Service Methods Must Guard on agent-accepted, Not starting

**Impact**: Critical
**Sources**: [I1-04, R1-02]
**Problem**: `saveOutputData`, `saveOutputFile`, `endNode`, `askQuestion` all gate on
`status === 'running'`. After migration, agents can only do work in `agent-accepted`
state (after explicitly accepting the node). The `starting` state means the orchestrator
reserved the node but no agent has acknowledged yet.
**Action**: Create `canNodeDoWork(status)` predicate returning `true` only for
`'agent-accepted'`. Replace all `=== 'running'` guards in service methods.
**Affects**: Phase 2, Phase 5

### 03: Backward-Compat Fields Are Derived Projections, Not Independent State

**Impact**: Critical
**Sources**: [I1-01, R1-04, Workshop #02]
**Problem**: After Option B, `pending_question_id`, `error`, and top-level `questions[]`
are computed from the event log after every `raiseEvent()` call. No dual-write — these
fields are read-only projections. Any code that writes them directly creates inconsistency.
**Action**: Create `deriveBackwardCompatFields(state, nodeId)` function called after
every event raise. Mark old fields as `@deprecated` in schema comments. Add contract
test verifying old and new paths produce identical state.json.
**Affects**: Phase 4, Phase 5, Phase 7

### 04: State Schema Migration Requires Optional Events Array

**Impact**: High
**Sources**: [I1-01, R1-08]
**Problem**: `events: z.array(NodeEventSchema).optional()` must be added to
`NodeStateEntrySchema`. Old state.json files without events must parse without error.
The `loadState()` fallback (line 308 in service) uses `StateSchema.safeParse()`.
**Action**: Add optional `events` field. Add new status values to enum. Test backward
compatibility: load existing state.json, verify it parses. Upgrade on write: add empty
events array on first event raise.
**Affects**: Phase 2

### 05: ONBAS Must Read Events for Question Sub-State Detection

**Impact**: High
**Sources**: [I1-05, R1-03, Workshop #01]
**Problem**: ONBAS currently reads `node.pendingQuestionId` to detect question state.
After migration, `pending_question_id` becomes a derived projection. ONBAS should read
the event log directly: `question:ask` with status `new` → `question-pending`;
`question:ask` with matching `question:answer` → `resume-node`.
**Action**: Update reality builder to include `events` in NodeReality. Update ONBAS
`visitWaitingQuestion` to use event log. Keep backward compat: if no events array,
fall back to `pendingQuestionId` field.
**Affects**: Phase 7

### 06: Error Code Range E190-E195 Is Unallocated

**Impact**: Medium
**Sources**: [I1-03, R1-06]
**Problem**: Current error codes end at E179. Workshop #01 allocates E190-E195 for
event errors. Pattern is consistent: `xxxError(params): ResultError` factory functions
in `positional-graph-errors.ts`.
**Action**: Add E190-E195 codes and 6 factory functions following existing pattern.
Each includes `code`, `message`, and `action` fields.
**Affects**: Phase 1

### 07: CLI Commands Follow Established Registration Pattern

**Impact**: Medium
**Sources**: [I1-06, R1-05]
**Problem**: `positional-graph.command.ts` already has 40+ commands. New event commands
(4 generic + 3 shortcuts) follow the same pattern: Commander handler → DI resolution →
`wrapAction()` → `createOutputAdapter()`.
**Action**: Add 7 command handlers in one batch. Reuse existing helpers. Follow
`--json` option pattern for machine-readable output.
**Affects**: Phase 6

### 08: Atomic State Persistence Handles Event Appends

**Impact**: Medium
**Sources**: [I1-08]
**Problem**: All state.json writes use `atomicWriteFile()` (temp-then-rename). Events
are append-only within a node's state entry. Each `raiseEvent()` loads state, appends
to the events array, derives backward-compat fields, then persists atomically.
**Action**: No new persistence infrastructure needed. Existing `persistState()` handles
the full state.json write. Event ordering guaranteed by array position + timestamp.
**Affects**: Phase 3

### 09: Test Fixtures Must Migrate from 'running' to New Statuses

**Impact**: Medium
**Sources**: [R1-07]
**Problem**: Test fixtures, FakeONBAS, and E2E tests reference `'running'` status.
Must update to `'starting'`/`'agent-accepted'`. FakeONBAS `runningNodeIds` filter
needs updating.
**Action**: Update all test fixtures in Phase 2 alongside the schema change. Create
new fixture helpers for `starting` and `agent-accepted` states.
**Affects**: Phase 2, Phase 7

### 10: Plan 027 Central Event Notifier Is Orthogonal

**Impact**: Low
**Sources**: [I1-10]
**Problem**: The codebase has Plan 027 `ICentralEventNotifier` for SSE-based UI
notifications. NodeEvents (Plan 032) are a separate concept: persisted per-node
communication, not workspace-level broadcast.
**Action**: Do not integrate with Plan 027 in this plan. Future work could emit
domain events when node state changes, but that's out of scope.
**Affects**: None (informational)

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per constitution and spec)
**Rationale**: Constitution mandates RED-GREEN-REFACTOR; spec has CS-3 complexity
with multiple interacting components that benefit from test-first development.
**Focus Areas**: Registry validation, event-state transition correctness, backward
compatibility contracts, CLI output formatting.

### Test-Driven Development

Every phase follows the TDD cycle:
1. Write interface (`.interface.ts`)
2. Write fake (implements interface + test helpers)
3. Write tests against the fake (RED)
4. Implement the real service (GREEN)
5. Write contract tests proving fake and real behave identically
6. Refactor for quality (REFACTOR)

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

**Policy**: Fakes over mocks — no `vi.mock`/`jest.mock` ever. All test doubles
implement the real interface. Contract tests verify fake/real parity.

---

## Project Structure

```
./  (project root)
├── packages/
│   ├── positional-graph/
│   │   └── src/
│   │       ├── features/
│   │       │   ├── 030-orchestration/          # Existing (cross-plan-edit for ONBAS)
│   │       │   └── 032-node-event-system/      # NEW (PlanPak feature folder)
│   │       │       ├── index.ts                # Public exports
│   │       │       ├── event-source.schema.ts  # EventSource enum
│   │       │       ├── event-status.schema.ts  # EventStatus enum
│   │       │       ├── node-event.schema.ts    # NodeEvent object schema
│   │       │       ├── event-payloads.schema.ts # 8 payload schemas
│   │       │       ├── event-type-registration.ts # EventTypeRegistration interface
│   │       │       ├── node-event-registry.interface.ts
│   │       │       ├── node-event-registry.ts  # Registry implementation
│   │       │       ├── fake-node-event-registry.ts
│   │       │       ├── core-event-types.ts     # registerCoreEventTypes()
│   │       │       ├── event-id.ts             # generateEventId()
│   │       │       ├── raise-event.ts          # raiseEvent() core write path
│   │       │       ├── event-handlers.ts       # Handler per event type
│   │       │       ├── derive-compat-fields.ts # Backward-compat projection
│   │       │       ├── event-errors.ts         # E190-E195 error factories
│   │       │       └── event-helpers.ts        # Shared utilities
│   │       ├── schemas/
│   │       │   └── state.schema.ts             # Cross-plan-edit: add events, new statuses
│   │       ├── errors/
│   │       │   └── positional-graph-errors.ts  # Cross-plan-edit: add E190-E195 codes
│   │       └── services/
│   │           └── positional-graph.service.ts # Cross-plan-edit: thin wrappers
│   └── shared/
│       └── src/
│           └── di-tokens.ts                    # Cross-cutting: no new tokens needed
├── apps/
│   └── cli/
│       └── src/
│           └── commands/
│               └── positional-graph.command.ts # Cross-plan-edit: event commands
├── test/
│   ├── unit/positional-graph/
│   │   └── features/
│   │       └── 032-node-event-system/          # Unit tests
│   │           ├── node-event-registry.test.ts
│   │           ├── event-payloads.test.ts
│   │           ├── raise-event.test.ts
│   │           ├── event-handlers.test.ts
│   │           ├── derive-compat-fields.test.ts
│   │           └── event-errors.test.ts
│   ├── integration/positional-graph/
│   │   └── event-system-integration.test.ts    # Integration tests
│   └── e2e/
│       └── node-event-system-visual-e2e.ts     # Visual E2E script
└── docs/plans/032-node-event-system/
    └── node-event-system-plan.md               # This file
```

---

## Implementation Phases

### Phase 1: Event Types, Schemas, and Registry

**Objective**: Create the event type data model, Zod schemas for all 8 event payloads,
the NodeEventRegistry, and event error codes — all testable in isolation with no
service or state changes.

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md) §Event Types,
§Event Type Registry, §Payload Schemas

**Deliverables**:
- `EventSourceSchema`, `EventStatusSchema`, `NodeEventSchema` Zod schemas
- 8 payload schemas (per Workshop #01)
- `EventTypeRegistration` interface
- `INodeEventRegistry` interface with `register`, `get`, `list`, `listByDomain`, `validatePayload`
- `NodeEventRegistry` implementation
- `FakeNodeEventRegistry` with test helpers
- `registerCoreEventTypes()` function registering all 8 types
- `generateEventId()` utility
- Error codes E190-E195 and factory functions
- Contract tests for registry (fake/real parity)
- Unit tests for all payload schemas and registry operations

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Payload schema too strict/loose | Medium | Medium | Workshop #01 has exact schemas; tests validate positive and negative cases |
| Error code conflict with future plans | Low | Low | Document E190-E195 allocation in error file |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Create feature folder `032-node-event-system/` with barrel `index.ts` | 1 | Directory exists, empty index compiles | [^1] | PlanPak setup (T000) |
| 1.2 | [x] | Define `EventSourceSchema`, `EventStatusSchema`, `NodeEventSchema` | 2 | Schemas validate sample events from Workshop #02 walkthroughs | [^1] | Per Workshop #01 |
| 1.3 | [x] | Define all 8 payload schemas | 2 | Each schema accepts valid payloads and rejects invalid. Tests for `.strict()` (no extra fields) | [^1] | Per Workshop #01 §Payload Schemas; 38 tests |
| 1.4 | [x] | Define `EventTypeRegistration` interface and `INodeEventRegistry` | 1 | Interface compiles, includes register/get/list/validatePayload | [^1] | |
| 1.5 | [x] | Write tests for `NodeEventRegistry` | 2 | Tests: register, get, list, listByDomain, validatePayload (valid + invalid), duplicate registration error | [^1] | RED; 12 tests failing |
| 1.6 | [x] | Implement `NodeEventRegistry` | 2 | All tests from 1.5 pass | [^1] | GREEN; 12 tests passing |
| 1.7 | [x] | Implement `FakeNodeEventRegistry` with test helpers | 1 | Fake has: `addEventType()`, `getValidationHistory()`, `reset()` | [^1] | |
| 1.8 | [x] | Write contract tests (fake vs real registry) | 2 | Same assertions pass on both implementations | [^1] | 33 total tests |
| 1.9 | [x] | Implement `registerCoreEventTypes()` | 1 | All 8 types registered with correct metadata from Workshop #01 | [^1] | 43 total tests |
| 1.10 | [x] | Implement `generateEventId()` | 1 | Format: `evt_<timestamp_hex>_<random_4hex>`, monotonic ordering | [^1] | Per Workshop #01 Q3; 5 tests |
| 1.11 | [x] | Add E190-E195 error codes and factory functions | 2 | 6 factories follow existing pattern: eventTypeNotFoundError, eventPayloadValidationError, eventSourceNotAllowedError, eventStateTransitionError, eventQuestionNotFoundError, eventAlreadyAnsweredError | [^1] | 8 tests; `errors/index.ts` not modified |
| 1.12 | [x] | Refactor and verify | 1 | `just fft` clean | [^1] | 3523 tests, 0 failures |

**DI Note**: `NodeEventRegistry` is constructed internally by `IPositionalGraphService` (or by `raiseEvent()` caller). It does NOT get a public DI token — there are no consumers outside `positional-graph` package. The registry is created via `new NodeEventRegistry()` + `registerCoreEventTypes(registry)` during service initialization. Tests use `FakeNodeEventRegistry` directly.

### Acceptance Criteria
- [x] All 8 event types registered with correct metadata (AC-1)
- [x] Payload validation works for all 8 schemas (AC-3)
- [x] Registry rejects unknown types, invalid payloads, unauthorized sources (AC-1, AC-3, AC-4)
- [x] Contract tests pass on fake and real registry
- [x] Error codes E190-E195 with actionable messages
- [x] `just fft` clean

---

### Phase 2: State Schema Extension and Two-Phase Handshake

**Objective**: Extend `state.schema.ts` with the events array and new node statuses
(`starting`, `agent-accepted`), then update all existing code that references the
old `running` status. This is the breaking change — everything downstream adapts.

**Workshop**: [02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md)
§New Status Enum, §Updated NodeStateEntry Schema

**Deliverables**:
- `NodeExecutionStatusSchema` updated: remove `running`, add `starting` + `agent-accepted`
- `NodeStateEntrySchema` updated: add optional `events` array
- All `status === 'running'` references updated across codebase
- Helper predicate: `isNodeActive(status)` for graph status computation
- Backward compatibility: old state.json without events parses correctly
- All existing tests updated to use new status values

**Dependencies**: Phase 1 (NodeEventSchema used in state schema)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cascading breakage from enum change | High | High | TypeScript `never` checks catch all switch statements; `pnpm typecheck` after change |
| Existing state.json incompatibility | Medium | High | `events` is optional; old files parse without error |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Update `NodeExecutionStatusSchema`: remove `running`, add `starting` + `agent-accepted` | 2 | Schema compiles, old values rejected, new values accepted | - | Breaking change — cascades |
| 2.2 | [ ] | Add `events: z.array(NodeEventSchema).optional()` to `NodeStateEntrySchema` | 1 | Schema accepts both old (no events) and new (with events) state | - | Backward compat |
| 2.3a | [ ] | Write tests for `isNodeActive()` and `canNodeDoWork()` predicates | 1 | `isNodeActive(starting)` → true, `isNodeActive(agent-accepted)` → true, `isNodeActive(pending)` → false; `canNodeDoWork(agent-accepted)` → true, `canNodeDoWork(starting)` → false | - | RED; Per Finding 01, 02 |
| 2.3b | [ ] | Implement `isNodeActive()` and `canNodeDoWork()` helper predicates | 1 | All tests from 2.3a pass | - | GREEN; helpers go in `features/032-node-event-system/event-helpers.ts` |
| 2.4 | [ ] | Update `positional-graph.service.ts`: replace all `=== 'running'` with helpers | 3 | `startNode()` transitions to `starting`; `saveOutputData/File`, `endNode`, `askQuestion` guard on `canNodeDoWork()`; graph status uses `isNodeActive()`. Run `pnpm typecheck` to catch all missing cases. | - | 7+ sites; Finding 01 |
| 2.5 | [ ] | Update `transitionNodeState()` valid states map | 2 | New transitions: `pending→starting`, `starting→agent-accepted`, `agent-accepted→waiting-question`, `agent-accepted→complete`, `agent-accepted→blocked-error`, `starting→blocked-error` | - | Per Workshop #01 §Event → State Transition |
| 2.6 | [ ] | Update all test fixtures from `running` to `starting`/`agent-accepted` | 2 | All tests in `test/unit/positional-graph/` and `test/integration/` compile and reference new statuses | - | Finding 09 |
| 2.7 | [ ] | Update ONBAS switch: replace `case 'running':` with `case 'starting':` + `case 'agent-accepted':` | 2 | ONBAS skips both starting and agent-accepted nodes (they're already executing) | - | ONBAS cross-plan-edit |
| 2.8 | [ ] | Update FakeONBAS and reality builder for new statuses | 1 | `buildFakeReality` supports new statuses; `runningNodeIds` accessor renamed or handles both | - | |
| 2.9 | [ ] | Write backward compatibility test: load old state.json without events | 1 | Old state.json parses without error; nodes without events work correctly | - | AC-17 |
| 2.10 | [ ] | Verify all tests pass with `just fft` | 1 | Full test suite green | - | |

### Acceptance Criteria
- [ ] Two new statuses (`starting`, `agent-accepted`) replace `running` (AC-6)
- [ ] `events` array on NodeStateEntry is optional (AC-17)
- [ ] All existing tests updated and passing
- [ ] Old state.json files parse without error (AC-17)
- [ ] `just fft` clean

---

### Phase 3: raiseEvent Core Write Path

**Objective**: Implement the `raiseEvent()` function — the single write path for all
node state changes. This function validates the event, creates the NodeEvent record,
appends it to the log, and returns the created event. It does NOT apply side effects
yet (Phase 4 adds handlers).

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md) §Event →
State Transition Mapping; [02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md)
§Validation Rules

**Deliverables**:
- `raiseEvent(graphSlug, nodeId, eventType, payload, source)` function
- 5-step validation: type exists (E190), payload valid (E191), source allowed (E192),
  node in valid state (E193), question references valid (E194/E195)
- Event creation: generate ID, set status to `new`, set `stops_execution`, set timestamps
- Append to node's events array in state.json
- Persist state atomically

**Dependencies**: Phase 1 (registry, schemas), Phase 2 (state schema with events)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Validation ordering (must fail fast) | Low | Medium | Validate in spec order: type → payload → source → state → question refs |
| Concurrency: two raises on same node | Low | High | Single-process assumption; loadState + validate + persistState is atomic |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for `raiseEvent` validation: unknown type (E190) | 1 | Returns E190 error with available types listed | - | RED |
| 3.2 | [ ] | Write tests for `raiseEvent` validation: invalid payload (E191) | 2 | Returns E191 error with field-level Zod details and schema hint | - | RED |
| 3.3 | [ ] | Write tests for `raiseEvent` validation: unauthorized source (E192) | 1 | Returns E192 error listing allowed sources | - | RED |
| 3.4 | [ ] | Write tests for `raiseEvent` validation: wrong node state (E193) | 2 | Returns E193 error listing valid states for event type. Tests per Workshop #02 §Valid States table | - | RED |
| 3.5 | [ ] | Write tests for `raiseEvent` validation: question refs (E194, E195) | 2 | E194 for nonexistent question, E195 for already-answered question | - | RED |
| 3.6 | [ ] | Write tests for successful event creation | 2 | Event created with correct ID, status `new`, timestamps, stops_execution flag. Appended to events array. State persisted. | - | RED |
| 3.7 | [ ] | Implement `raiseEvent()` | 3 | All tests from 3.1-3.6 pass | - | GREEN |
| 3.8 | [ ] | Write tests proving validation fails before persistence | 1 | When validation fails, events array unchanged, state not persisted | - | AC-3 |
| 3.9 | [ ] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [ ] 5-step validation catches all invalid events (AC-3, AC-4, AC-5)
- [ ] Valid events create NodeEvent records with correct fields (AC-2)
- [ ] Events appended to node's events array in state.json
- [ ] Invalid events never persisted
- [ ] Error messages include actionable guidance (AC-3)
- [ ] `just fft` clean

---

### Phase 4: Event Handlers and State Transitions

**Objective**: Implement the handler for each event type that applies side effects
(status transitions, output writes, timestamp updates) and the backward-compat
projection that derives `pending_question_id`, `error`, and `questions[]` from the
event log.

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md)
§Event → State Transition Mapping; [02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md)
§Complete Lifecycle Walkthroughs, §Migration Strategy

**Deliverables**:
- Handler map: `Map<eventType, handler>` with one handler per event type
- `node:accepted` handler: `starting` → `agent-accepted`
- `node:completed` handler: `agent-accepted` → `complete`, set `completed_at`
- `node:error` handler: → `blocked-error`, set error field
- `question:ask` handler: → `waiting-question`, set `pending_question_id`
- `question:answer` handler: mark ask event `handled`, clear `pending_question_id`
- `output:save-data` handler: persist data to `data/data.json`
- `output:save-file` handler: copy file to `data/outputs/`
- `progress:update` handler: log only (no state change)
- `deriveBackwardCompatFields()` function called after every handler
- Wire handlers into `raiseEvent()` — event is created, handler runs, compat derived,
  state persisted

**Dependencies**: Phase 3 (raiseEvent function to wire handlers into)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Handler side effects partially applied on crash | Low | Medium | Atomic write covers entire state; output files written before state persist |
| Backward-compat projection drift | Medium | Medium | Contract test: same inputs → identical state whether via events or old methods |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for `node:accepted` handler | 2 | Status transitions `starting` → `agent-accepted`; event marked `handled` | - | Per Workshop #02 Walkthrough 1 |
| 4.2 | [ ] | Write tests for `node:completed` handler | 2 | Status transitions to `complete`; `completed_at` set; event `handled` | - | |
| 4.3 | [ ] | Write tests for `node:error` handler | 2 | Status transitions to `blocked-error`; error field populated from payload | - | Per Workshop #02 Walkthrough 3 |
| 4.4 | [ ] | Write tests for `question:ask` handler | 2 | Status → `waiting-question`; `pending_question_id` set; event stays `new` (deferred processing) | - | Per Workshop #02 Walkthrough 2 |
| 4.5 | [ ] | Write tests for `question:answer` handler | 2 | Ask event marked `handled`; `pending_question_id` cleared; answer event `handled`; node status unchanged | - | Per Workshop #02 Q&A lifecycle |
| 4.6 | [ ] | Write tests for `output:save-data` handler | 2 | Data persisted to node's `data/data.json`; event `handled`; warning in `handler_notes` for undeclared output | - | AC-8 |
| 4.7 | [ ] | Write tests for `output:save-file` handler | 1 | File copied to `data/outputs/`; event `handled` | - | |
| 4.8 | [ ] | Write tests for `progress:update` handler | 1 | No state change; event `handled` immediately | - | |
| 4.9 | [ ] | Implement all 8 event handlers | 3 | All tests from 4.1-4.8 pass | - | GREEN |
| 4.10 | [ ] | Write tests for `deriveBackwardCompatFields()` | 2 | `pending_question_id` derived from latest unanswered ask; `error` from latest error event; `questions[]` reconstructed from ask+answer pairs | - | Finding 03 |
| 4.11 | [ ] | Implement `deriveBackwardCompatFields()` | 2 | All tests from 4.10 pass | - | GREEN |
| 4.12 | [ ] | Wire handlers and compat derivation into `raiseEvent()` | 2 | `raiseEvent` now: validate → create event → run handler → derive compat → persist state | - | |
| 4.13 | [ ] | Write end-to-end handler tests matching Workshop #02 walkthroughs | 2 | Walkthrough 1 (happy path), 2 (Q&A), 3 (error), 4 (progress) — literal JSON output matches workshop | - | |
| 4.14 | [ ] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [ ] All 8 event types have working handlers (AC-6, AC-7, AC-8)
- [ ] `node:accepted` drives two-phase handshake (AC-6)
- [ ] Question lifecycle flows through events (AC-7)
- [ ] Output persistence works via events (AC-8)
- [ ] Backward-compat fields derived correctly (AC-15)
- [ ] `just fft` clean

---

### Phase 5: Service Method Wrappers

**Objective**: Refactor existing service methods (`endNode`, `askQuestion`,
`answerQuestion`, `saveOutputData`, `saveOutputFile`) to become thin wrappers that
construct event payloads and delegate to `raiseEvent()`. After this phase, there is
no separate write path — the event system IS the implementation.

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md) §Backward
Compatibility; [02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md)
§Migration Strategy

**Deliverables**:
- `endNode()` → constructs `node:completed` payload, calls `raiseEvent()`
- `askQuestion()` → constructs `question:ask` payload, calls `raiseEvent()`
- `answerQuestion()` → constructs `question:answer` payload, calls `raiseEvent()`
- `saveOutputData()` → constructs `output:save-data` payload, calls `raiseEvent()`
- `saveOutputFile()` → constructs `output:save-file` payload, calls `raiseEvent()`
- Contract tests: old path (direct method call) and new path (via events) produce
  identical state.json

**Dependencies**: Phase 4 (handlers must work before wrappers can delegate)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Return type mismatch | Medium | Medium | Wrappers map event result back to original method return types |
| Subtle behavior change | Medium | High | Contract tests compare state.json byte-for-byte (modulo timestamps) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write contract tests: `endNode()` via events produces same state as current | 2 | Same inputs → same node status, completed_at, events recorded | - | AC-15 |
| 5.2 | [ ] | Write contract tests: `askQuestion()` via events produces same state | 2 | Same inputs → same pending_question_id, question in questions[], events recorded | - | AC-15 |
| 5.3 | [ ] | Write contract tests: `answerQuestion()` via events produces same state | 2 | Same inputs → question answered, pending cleared, events recorded | - | AC-15 |
| 5.4 | [ ] | Write contract tests: `saveOutputData()` via events produces same state | 2 | Same inputs → data in data.json, event recorded | - | AC-15 |
| 5.5 | [ ] | Write contract tests: `saveOutputFile()` via events produces same state | 1 | Same inputs → file copied, event recorded | - | AC-15 |
| 5.6 | [ ] | Refactor `endNode()` to delegate to `raiseEvent('node:completed')` | 2 | Contract test from 5.1 passes; method return type unchanged | - | GREEN |
| 5.7 | [ ] | Refactor `askQuestion()` to delegate to `raiseEvent('question:ask')` | 2 | Contract test from 5.2 passes | - | GREEN |
| 5.8 | [ ] | Refactor `answerQuestion()` to delegate to `raiseEvent('question:answer')` | 2 | Contract test from 5.3 passes | - | GREEN |
| 5.9 | [ ] | Refactor `saveOutputData()` to delegate to `raiseEvent('output:save-data')` | 2 | Contract test from 5.4 passes | - | GREEN |
| 5.10 | [ ] | Refactor `saveOutputFile()` to delegate to `raiseEvent('output:save-file')` | 1 | Contract test from 5.5 passes | - | GREEN |
| 5.11 | [ ] | Verify all existing CLI tests still pass | 2 | E2E test `positional-graph-execution-e2e.test.ts` green | - | Regression check |
| 5.12 | [ ] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [ ] All service methods delegate to `raiseEvent()` (AC-15)
- [ ] No separate write path exists (AC-15)
- [ ] Contract tests prove behavioral parity between old and new paths
- [ ] All existing E2E/integration tests still pass
- [ ] `just fft` clean

---

### Phase 6: CLI Commands

**Objective**: Add the 4 generic event CLI commands and 3 shortcut commands, all wired
through the existing CLI registration pattern.

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md) §CLI Design

**Deliverables**:
- `cg wf node event list-types [--domain <domain>]` — lists registered types
- `cg wf node event schema <eventType>` — shows payload schema and example
- `cg wf node event raise <graph> <nodeId> <eventType> <payloadJson> [--source <source>]`
- `cg wf node event log <graph> <nodeId> [--type <type>] [--status <status>]`
- `cg wf node accept <graph> <nodeId>` — shortcut for `node:accepted`
- `cg wf node end <graph> <nodeId> [--message <msg>]` — update existing to route via events
- `cg wf node error <graph> <nodeId> --code <code> --message <msg>` — shortcut for `node:error`
- All commands support `--json` for machine-readable output
- `stops_execution` events show `[AGENT INSTRUCTION]` message (AC-9)

**Dependencies**: Phase 5 (service methods must be event-based before CLI routes through them)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing `end` command behavior change | Medium | Medium | `end` already works; now routes through events internally — same user-facing behavior |
| JSON payload parsing errors | Low | Low | CLI validates JSON before passing to service; clear error on parse failure |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Implement `event list-types` command handler | 2 | Human-readable: types grouped by domain. JSON: array of type metadata. `--domain` filter works | - | AC-10 |
| 6.2 | [ ] | Implement `event schema` command handler | 2 | Shows metadata, payload fields, concrete example. JSON mode shows JSON Schema. E190 for unknown type | - | AC-11 |
| 6.3 | [ ] | Implement `event raise` command handler | 3 | Validates JSON payload, calls `raiseEvent()`, shows event ID/status/stops_execution. Shows `[AGENT INSTRUCTION]` for stop events. `--source` defaults to `agent` | - | AC-12, AC-9 |
| 6.4 | [ ] | Implement `event log` command handler | 2 | Table format: event_id, type, source, status, created_at. Filters: `--type`, `--status`. JSON mode: full event objects | - | AC-13 |
| 6.5 | [ ] | Implement `accept` shortcut command | 1 | Equivalent to `event raise node:accepted '{}'`. Shows status transition | - | AC-14 |
| 6.6 | [ ] | Update `end` command to route through events | 1 | `--message` flag constructs payload. Internally calls `raiseEvent('node:completed')` | - | AC-14 |
| 6.7 | [ ] | Implement `error` shortcut command | 1 | `--code`, `--message`, `--details`, `--recoverable` flags construct payload | - | AC-14 |
| 6.8 | [ ] | Register all commands in `positional-graph.command.ts` | 2 | All 7 commands registered, `--help` shows them, TypeScript compiles | - | |
| 6.9 | [ ] | Write CLI integration tests | 2 | Test each command via `runCli()` helper; verify JSON output structure | - | |
| 6.10 | [ ] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [ ] 4 generic event commands work (AC-10, AC-11, AC-12, AC-13)
- [ ] 3 shortcut commands route through event system (AC-14)
- [ ] Stop-execution events show agent instruction (AC-9)
- [ ] All commands support `--json` output
- [ ] `just fft` clean

---

### Phase 7: ONBAS Adaptation and Backward-Compat Projections

**Objective**: Update ONBAS to read the event log for question sub-state detection
instead of flat `pending_question_id` field. Update the reality builder to include
events in `NodeReality`. Verify backward-compat projections work end-to-end.

**Workshop**: [01-node-event-system.md](./workshops/01-node-event-system.md) §ONBAS Changes;
[02-event-schema-and-storage.md](./workshops/02-event-schema-and-storage.md) §ONBAS Event
Log Reading

**Deliverables**:
- `NodeReality` type extended with optional `events` field
- Reality builder includes events from state.json in snapshot
- ONBAS `visitWaitingQuestion` reads event log: `new` ask → `question-pending`;
  ask with answer → `resume-node`; `acknowledged` without answer → skip
- Backward fallback: if no events array, use `pendingQuestionId` (old behavior)
- All existing ONBAS tests updated and still passing
- New ONBAS tests for event-based question detection

**Dependencies**:
- Plan 032 Phase 5 (service wrappers must be in place so events exist in state)
- Plan 030 Phase 5 (ONBAS Walk Algorithm — COMPLETE). ONBAS already exists and is working.
  This phase **modifies** the existing ONBAS, it does not create it.

**Cross-Plan Sequencing Note**: There is no circular dependency between Plans 030 and 032.
The execution order is: Plan 030 Phases 1-5 (done) → Plan 032 Phases 1-8 (this plan, all phases) → Plan 030 Phases 6-8 (resume).
ONBAS is stable after Plan 030 Phase 5. Plan 030 Phase 6 (ODS) is a separate component —
the executor that acts on OrchestrationRequests — and does not modify ONBAS internals.

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ONBAS regression from reading events vs flat fields | Medium | High | Same-input-same-output property tests on ONBAS |
| Reality builder performance with large event logs | Low | Low | Events are per-node; typical 3-8 events per node |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Extend `NodeReality` type with optional `events` field | 1 | Type compiles, backward compat (events undefined for old graphs) | - | |
| 7.2 | [ ] | Update reality builder to include events from state.json | 2 | Events populated in snapshot when present; absent when state has no events | - | |
| 7.3 | [ ] | Write tests for ONBAS event-based question detection | 2 | `question:ask` with `status: 'new'` → `question-pending`; with matching answer → `resume-node`; `acknowledged` no answer → skip | - | RED; AC-16 |
| 7.4 | [ ] | Update ONBAS `visitWaitingQuestion` to read events | 2 | All tests from 7.3 pass. Falls back to `pendingQuestionId` when no events | - | GREEN |
| 7.5 | [ ] | Write property tests: ONBAS with events produces same results as with flat fields | 2 | Given identical graph state (one with events, one with flat fields), ONBAS returns the same OrchestrationRequest | - | AC-16 |
| 7.6 | [ ] | Write integration test: full event lifecycle through ONBAS | 2 | Create graph, raise events, build reality, walk ONBAS — correct actions returned | - | |
| 7.7 | [ ] | Refactor and verify | 1 | `just fft` clean | - | |

### Acceptance Criteria
- [ ] ONBAS reads event log for question sub-state (AC-16)
- [ ] Backward fallback to flat fields when no events (AC-17)
- [ ] Property tests prove event-based and flat-field paths produce same results
- [ ] All existing ONBAS tests still pass
- [ ] `just fft` clean

---

### Phase 8: E2E Validation Script

**Objective**: Create the fully automatic E2E validation script that visually traces
every event through the system. A human runs it and watches acceptance, work, questions,
answers, and completion happen step by step with clear console output.

**Workshop**: See `e2e-event-system-sample-flow.ts` (design document)

**Deliverables**:
- Fully automatic script: creates graph, adds nodes, walks full lifecycle
- Plays all roles: orchestrator (starts nodes), agent (accepts, works, asks, completes),
  human (answers questions)
- Uses both generic `event raise` and shortcuts (`accept`, `end`)
- Demonstrates schema self-discovery (`event list-types`, `event schema`)
- Inspects and prints event log as table
- Human-readable output at every step with clear status indicators
- Exits 0 on success, 1 on failure

**Dependencies**: Phase 6 (CLI commands must work) and Phase 7 (ONBAS must handle events)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI commands not fully wired | Low | High | All commands tested in Phase 6 |
| Visual output formatting fragile | Low | Low | Assertions verify data, not formatting |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 8.1 | [ ] | Create E2E script structure with helpers (runCli, log, assert, banner) | 2 | Script scaffolding compiles, helpers work. File: `test/e2e/node-event-system-visual-e2e.ts` (new file) | - | Design reference: `docs/plans/032-node-event-system/e2e-event-system-sample-flow.ts` (design doc with intended CLI surface — adapt, do not copy verbatim) |
| 8.2 | [ ] | Implement Step 1: Create graph and add nodes | 1 | Graph created, 2 nodes added with wiring | - | |
| 8.3 | [ ] | Implement Step 2: Schema self-discovery | 1 | `event list-types` returns all 8 types; `event schema question:ask` returns schema | - | AC-18 |
| 8.4 | [ ] | Implement Step 3: Direct output node (user-input) | 1 | Save output data + end on Node 1, status → complete | - | |
| 8.5 | [ ] | Implement Step 4: Agent accepts Node 2 | 1 | Start node → starting; accept → agent-accepted; event logged | - | Two-phase handshake |
| 8.6 | [ ] | Implement Step 5: Agent does work (progress + output) | 1 | Progress event raised; output saved via event | - | |
| 8.7 | [ ] | Implement Step 6: Agent asks question (stops execution) | 2 | Question event raised; status → waiting-question; AGENT INSTRUCTION shown | - | |
| 8.8 | [ ] | Implement Step 7: Human answers question | 1 | Answer event raised with `--source human`; question handled | - | |
| 8.9 | [ ] | Implement Step 8-9: Agent resumes and completes | 2 | Agent retrieves answer, saves final output, completes via shortcut | - | |
| 8.10 | [ ] | Implement Step 10: Inspect event log | 2 | Full event log printed as table; all 8 events visible with correct statuses | - | |
| 8.11 | [ ] | Implement Step 11: Validate final state | 1 | All nodes complete; assertions pass; exit 0 | - | |
| 8.12 | [ ] | Run complete script and verify visual output | 1 | Script runs end-to-end, human can follow every step | - | AC-18 |
| 8.13 | [ ] | Final `just fft` validation | 1 | All tests pass | - | |

### Acceptance Criteria
- [ ] Script runs fully automatically with zero manual intervention (AC-18)
- [ ] Every step prints human-readable output (AC-18)
- [ ] Both shortcuts and generic event raise demonstrated (AC-18)
- [ ] Schema self-discovery shown (AC-18)
- [ ] Event log inspected and displayed (AC-18)
- [ ] Exit 0 on success, 1 on failure (AC-18)
- [ ] `just fft` clean

---

## Cross-Cutting Concerns

### Security Considerations
- No user-facing input beyond CLI arguments (validated by Commander framework)
- Event payloads validated by Zod schemas before any persistence
- No network calls — all operations are filesystem-based

### Observability
- Full event log per node provides audit trail
- Every event records source, timestamp, lifecycle status
- CLI `event log` command enables runtime inspection
- `handler_notes` field captures handler-specific context

### Documentation
**Strategy**: None (per spec — no documentation phases needed)
- Workshops serve as design documentation
- CLI `event list-types` and `event schema` provide runtime docs for agents
- Test Doc blocks document all test rationale

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| All event system source | plan-scoped | `features/032-node-event-system/` | Serves only this plan |
| `state.schema.ts` changes | cross-plan-edit | `schemas/state.schema.ts` | Shared state schema |
| Error codes E190-E195 | cross-plan-edit | `errors/positional-graph-errors.ts` | Shared error codes |
| Service method wrappers | cross-plan-edit | `services/positional-graph.service.ts` | Existing service |
| CLI commands | cross-plan-edit | `apps/cli/src/commands/positional-graph.command.ts` | Existing CLI file |
| ONBAS adaptation | cross-plan-edit | `features/030-orchestration/onbas.ts` | Existing ONBAS |
| Reality builder update | cross-plan-edit | `features/030-orchestration/reality.builder.ts` | Existing builder |
| Unit tests | plan-scoped | `test/unit/positional-graph/features/032-node-event-system/` | Test conventions |
| Integration tests | plan-scoped | `test/integration/positional-graph/` | Test conventions |
| E2E script | plan-scoped | `test/e2e/node-event-system-visual-e2e.ts` | E2E conventions |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 3 | Medium | S=2,I=1,D=2,N=0,F=0,T=2 | Cross-cutting schema, service, CLI changes; well-specified by workshops | Phase-by-phase delivery; each phase independently testable |
| Status Enum Migration | 3 | Medium | S=2,I=1,D=1,N=0,F=0,T=1 | Touches every status check in service, ONBAS, tests; cascading but mechanical | TypeScript exhaustiveness catches missing cases; one big phase |
| Service Method Wrappers | 3 | Medium | S=1,I=1,D=1,N=0,F=1,T=2 | Subtle behavior preservation; contract tests needed | Contract tests compare old/new paths |
| E2E Script | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | New visual output pattern; no complex logic | Based on existing e2e-sample-flow.ts pattern |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Event Types, Schemas, and Registry - Complete (94 tests, 12 source files, `just fft` clean)
- [ ] Phase 2: State Schema Extension and Two-Phase Handshake - Pending
- [ ] Phase 3: raiseEvent Core Write Path - Pending
- [ ] Phase 4: Event Handlers and State Transitions - Pending
- [ ] Phase 5: Service Method Wrappers - Pending
- [ ] Phase 6: CLI Commands - Pending
- [ ] Phase 7: ONBAS Adaptation and Backward-Compat Projections - Pending
- [ ] Phase 8: E2E Validation Script - Pending

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | All | DI with `useFactory`, no decorators |
| ADR-0006 | Accepted | Phase 5, 6 | CLI-based agent orchestration, session continuity |
| ADR-0008 | Accepted | Phase 1 | Module registration function pattern (`registerCoreEventTypes()` follows this pattern) |
| ADR-0010 | Accepted | (informational) | Central event notification — separate from node events |
| (Seed) ADR: Events as Logged Facts | Proposed | Phase 3, 4 | Events are facts, logged first then handled |
| (Seed) ADR: Events as Implementation (Option B) | Proposed | Phase 5 | raiseEvent is single write path |
| (Seed) ADR: CLI Shortcuts Scope | Proposed | Phase 6 | Shortcuts for accept/end/error, NOT Q&A |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| No new DI tokens | NodeEventRegistry does NOT get a public DI token. It's constructed internally by the service and not exposed through the container. | Register as public DI token — rejected because the registry has no consumers outside positional-graph. | Registry accessed via service methods; integration tests verify correct wiring |
| Cross-plan file edits | Phases 2, 5, 6, 7 edit files owned by Plans 026, 028, 029, 030 (state.schema.ts, service.ts, onbas.ts, CLI) | Create wrapper files that import and extend — rejected because the extensions are tightly coupled to the original files | Contract tests verify no regression in existing behavior |

---

## Change Footnotes Ledger

[^1]: Phase 1 complete (2026-02-07). 12 source files in `features/032-node-event-system/`, 1 modified file (`positional-graph-errors.ts` — E190-E195), 4 test files with 94 tests. Discovery: `errors/index.ts` did not need modification (auto-exports via `keyof typeof`).
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]
