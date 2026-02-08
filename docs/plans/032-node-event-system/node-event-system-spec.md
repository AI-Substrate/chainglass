# Node Event System

## Research Context

- **Components affected**: `packages/positional-graph/` (schemas, services, CLI commands), `apps/cli/` (new event subcommands + shortcut wiring), `packages/shared/` (error codes, fakes)
- **Critical dependencies**: Plan 030 Phase 6 (ODS Action Handlers — blocked on this plan), Plan 028 (question lifecycle), Plan 026 (positional graph model), Plan 029 (agentic work units)
- **Modification risks**: `state.json` schema extension (new `events` array on nodes), node status enum extension (`starting`, `agent-accepted`), service method internals re-routing through events, ONBAS walk reading event log instead of flat fields
- **Link**: See `research-dossier.md` for full analysis; see `workshops/01-node-event-system.md` for detailed design

This specification incorporates findings from research-dossier.md and detailed design decisions from Workshop #01 (Node Event System).

---

## Summary

Today, nodes communicate through bespoke service methods: `askQuestion()`, `answerQuestion()`, `saveOutputData()`, `endNode()`. Each has its own CLI command, its own validation path, its own storage location. Adding a new interaction type means adding a new method, a new command, a new schema, and a new status check. The system is brittle and closed.

This plan replaces the bespoke approach with a unified **typed, extensible, schema-validated event system**. Every node interaction becomes a NodeEvent — raised by any source (agent, executor, orchestrator, human), validated against a registered Zod schema, stored in an append-only event log per node, and progressed through a three-state lifecycle (new, acknowledged, handled).

The event system ships with 6 initial event types covering all current interactions plus two new capabilities (node acceptance, progress reporting). New event types are added by defining a schema and registering one entry — the CLI discovers them automatically. Agents learn the system at runtime through self-discovery commands (`event list-types`, `event schema`).

The plan also delivers the two-phase node handshake (`starting` / `agent-accepted` statuses) that Workshop #8 designed, since events and the handshake are co-dependent: `node:accepted` is the event that drives the `starting` to `agent-accepted` transition.

The culminating deliverable is a fully automatic E2E script that visually traces every event through the system — a human can run it and watch acceptance, work, questions, answers, and completion happen step by step with clear console output at each stage.

---

## Goals

1. **Unified event protocol**: All node interactions (acceptance, completion, errors, questions, answers, progress) flow through one `raiseEvent()` path with consistent validation, storage, and lifecycle tracking.

2. **Extensible without code changes**: Adding a new event type requires one schema definition and one registry call. No new CLI commands, no new service methods, no new status fields. The CLI self-discovers registered types.

3. **Full audit trail**: Every node maintains an append-only event log in `state.json`. Every event records who raised it, when, and what happened. Questions, errors — all traceable.

4. **Agent self-discovery**: Agents learn available event types and their schemas at runtime via `event list-types` and `event schema`. No hardcoded knowledge of event payloads.

5. **Two-phase node handshake**: Nodes transition through `starting` (orchestrator reserved) to `agent-accepted` (agent acknowledged) before work begins. This replaces the current direct jump to `running`.

6. **Backward-compatible migration**: Existing CLI commands (`ask`, `answer`, `end`, `save-output-data`) continue to work, internally routing through the event system. Existing `state.json` files without an `events` array parse without error.

7. **Visual E2E validation script**: A fully automatic script that traces the entire event lifecycle end-to-end with human-readable console output at every step. No real agents — the script plays all roles (orchestrator, agent, human) and shows each interaction.

---

## Non-Goals

1. **Real agent integration** — The E2E script and all tests use mock mode. Real agent wiring is out of scope.

2. **Central event system (Plan 027) integration** — `ICentralEventNotifier` for SSE-based UI notifications exists separately. We acknowledge it but do not integrate with or modify it.

3. **ODS implementation** — Plan 030 Phase 6 implements ODS. This plan provides the event system that ODS will consume. ODS itself is out of scope.

4. **Orchestration loop** — The loop (ONBAS + ODS + orchestration service) is Plan 030 Phase 7. This plan provides event primitives.

5. **Web/CLI wiring of orchestration** — Production hosting of orchestration services is out of scope for both this plan and Plan 030.

6. **Retry/timeout policies** — Events are raised once. Failure handling beyond recording the error is a follow-on concern.

7. **Event archival** — The 1000-event-per-node practical limit and archival to `events-archive.json` is a future enhancement if needed.

8. **Custom event type registration API** — The initial registry is populated in code. A runtime API for external plugins to register types is future work.

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**: S=2, I=1, D=2, N=0, F=0, T=2

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | New types/schemas, registry class, service method changes, 4+ CLI commands, state schema extension, ONBAS adaptation, test infrastructure, E2E script. Output persistence handled directly by the orchestrator, not via events. |
| Integration (I) | 1 | Depends on Plan 028 question schema, Plan 026 graph service, Plan 029 work units (all internal, stable) |
| Data/State (D) | 2 | `state.json` schema extension (events array), new node statuses (starting, agent-accepted), event lifecycle tracking, backward-compatible migration |
| Novelty (N) | 0 | Well-specified by Workshop #01 with resolved open questions; event types, schemas, CLI surface all designed |
| Non-Functional (F) | 0 | Standard performance, no compliance or security constraints |
| Testing/Rollout (T) | 2 | Three layers: unit tests for registry/schemas/handlers, integration tests for event-state interactions, E2E script for visual validation |

**Total**: P = 7 -> CS-3

**Confidence**: 0.90 — Workshop #01 resolved all 6 open questions; Q6 resolved as Option B (events as the implementation).

**Assumptions**:
- Existing `state.json` read/write via `loadState()`/`persistState()` and atomic writes work correctly
- ONBAS walk structure does not need restructuring — only the data it reads changes (event log vs flat fields)
- The two-phase handshake statuses (`starting`, `agent-accepted`) are additive to the existing status enum and do not break existing status checks

**Dependencies**:
- Plan 028: Question schema (`QuestionSchema`, `QuestionTypeSchema`) — these inform `question:ask` payload
- Plan 026: `IPositionalGraphService` for state persistence
- Plan 029: Work unit types for determining pod type and execution mode

**Risks**:
- State schema migration: Adding `events` array to `NodeStateEntry` could increase `state.json` size significantly for long-running nodes. Mitigation: `events` is optional; existing files parse without error.
- ONBAS adaptation: Changing ONBAS to read event logs instead of flat fields could introduce subtle bugs in the walk algorithm. Mitigation: Comprehensive unit tests with same-input-same-output property checks.
- Backward compatibility of shortcuts: Ensuring `cg wf node end` routes through events AND preserves exact current behavior. Mitigation: Contract tests that verify old and new paths produce identical state changes.

**Phases** (suggested):
1. Event types, schemas, and registry (data model)
2. NodeEvent object and event log storage (state schema extension)
3. Two-phase handshake status migration (starting/agent-accepted)
4. Event raise and validate service layer (core write path)
5. Event handlers for state transitions (side effect application; output persistence handled by orchestrator, not via events)
6. CLI commands (event list-types, schema, raise, log)
7. Shortcut commands (accept, end, error) wired through events
8. Service method wrappers (endNode, askQuestion become thin wrappers constructing events; output methods remain unchanged)
9. ONBAS adaptation (read event log instead of flat fields)
10. E2E validation script (fully automatic, visual output)

---

## Acceptance Criteria

### AC-1: NodeEventRegistry registers, validates, and lists event types

Given 6 initial event types registered in the NodeEventRegistry,
when `registry.list()` is called,
then all 6 types are returned with their metadata (type, displayName, description, payloadSchema, allowedSources, stopsExecution, domain).

When `registry.validatePayload('question:ask', validPayload)` is called,
then it returns `{ ok: true, errors: [] }`.

When `registry.validatePayload('question:ask', invalidPayload)` is called,
then it returns `{ ok: false, errors: [...] }` with actionable Zod error messages.

When `registry.get('nonexistent')` is called,
then it returns `undefined`.

### AC-2: NodeEvent objects are created with correct lifecycle state

Given a valid event type and payload,
when `raiseEvent(graphSlug, nodeId, eventType, payload, source)` is called,
then a NodeEvent is created with:
- A unique `event_id` (monotonic prefix + random suffix)
- `status: 'new'`
- `stops_execution` from the registry
- `created_at` set to current ISO-8601 timestamp
- The event is appended to the node's `events` array in `state.json`

### AC-3: Event payload validation rejects invalid data with actionable errors

Given an event raise with an invalid payload,
when the service validates the payload against the registry,
then:
- E191 error is returned with field-level Zod validation details
- The error message includes `action: "Run 'cg wf node event schema <type>' to see the required payload schema."`
- The event is NOT stored (validation failure = no persistence)

### AC-4: Event source validation rejects unauthorized sources

Given a `question:answer` event (allowedSources: `['human', 'orchestrator']`),
when raised with `source: 'agent'`,
then E192 error is returned listing allowed sources. The event is NOT stored.

### AC-5: Event state transition validation rejects events for wrong node state

Given a node in status `complete`,
when `node:accepted` is raised (requires `starting`),
then E193 error is returned listing valid states for that event type.

### AC-6: Two-phase handshake status transitions work

Given a node with no state entry (implicit pending),
when `startNode()` is called:
- Node transitions to `starting`

When `node:accepted` event is raised on a `starting` node:
- Node transitions to `agent-accepted`
- The event log records the acceptance

When `node:completed` event is raised on an `agent-accepted` node:
- Node transitions to `complete`
- `completed_at` is set

### AC-7: Question lifecycle works through events

Given an `agent-accepted` node,
when `question:ask` event is raised:
1. Node transitions to `waiting-question`
2. `pending_question_id` is set to the event's `event_id`
3. The event is stored with `status: 'new'`

When the event is acknowledged (ODS processes it):
4. Event status becomes `acknowledged`, `acknowledged_at` set

When `question:answer` event is raised with matching `question_event_id`:
5. Answer is stored on the answer event
6. Original question event becomes `handled`
7. `pending_question_id` is cleared

When a question:answer references a nonexistent question:
- E194 error returned

When a question:answer references an already-answered question:
- E195 error returned

### AC-8: Removed — orchestrator handles output persistence directly

Output events (`output:save-data`, `output:save-file`) have been removed from the event system.
The orchestrator handles output persistence directly through existing service methods, not via the event protocol.

### AC-9: Events that stop execution communicate clearly

Given an event type with `stopsExecution: true` (question:ask, node:completed, node:error),
when the event is raised via CLI,
then the CLI output includes: `[AGENT INSTRUCTION] This event requires you to stop. Exit now and wait for the orchestrator.`

### AC-10: `event list-types` CLI command lists all registered types

Given 6 registered event types,
when `cg wf node event list-types` is run (human-readable mode),
then output shows types grouped by domain with displayName and description.

When `cg wf node event list-types --json` is run,
then output is a JSON array of type metadata objects.

When `cg wf node event list-types --domain question` is run,
then only question domain types are shown.

### AC-11: `event schema` CLI command shows payload schema

Given a registered event type `question:ask`,
when `cg wf node event schema question:ask` is run,
then output shows: event metadata, payload field descriptions, and a concrete example.

When `cg wf node event schema question:ask --json` is run,
then output is a JSON object with JSON Schema representation and example.

When `cg wf node event schema nonexistent` is run,
then E190 error is returned listing available types.

### AC-12: `event raise` CLI command creates and persists events

Given a valid graph, node, event type, and payload,
when `cg wf node event raise <graph> <nodeId> <eventType> <payloadJson>` is run,
then:
- The event is validated, created, persisted, and state transitions applied
- Output shows: event ID, status, stops_execution flag
- If stops_execution is true, the agent instruction message is shown
- `--source` flag defaults to `'agent'`; `--source human` overrides

### AC-13: `event log` CLI command reads the event log

Given a node with multiple events,
when `cg wf node event log <graph> <nodeId>` is run,
then output shows a table of events with: event_id, event_type, source, status, created_at.

When `--type question:ask` filter is applied, only matching events are shown.
When `--status new` filter is applied, only events with that status are shown.
When `--json` flag is used, output is a JSON array of full event objects.

### AC-14: Shortcut commands route through the event system

When `cg wf node accept <graph> <nodeId>` is run,
then it is equivalent to `cg wf node event raise <graph> <nodeId> node:accepted '{}'`.

When `cg wf node end <graph> <nodeId>` is run,
then it is equivalent to `cg wf node event raise <graph> <nodeId> node:completed '{}'`.

When `cg wf node end <graph> <nodeId> --message "Done"` is run,
then it is equivalent to `cg wf node event raise <graph> <nodeId> node:completed '{"message":"Done"}'`.

When `cg wf node error <graph> <nodeId> --code X --message Y` is run,
then it is equivalent to `cg wf node event raise <graph> <nodeId> node:error '{"code":"X","message":"Y"}'`.

### AC-15: `raiseEvent()` is the single write path for all node state changes

All service methods are thin wrappers that construct event payloads and delegate to `raiseEvent()`:

When `endNode(graphSlug, nodeId)` is called,
then it constructs a `node:completed` event payload and calls `raiseEvent()`. The event handler applies the status transition and sets `completed_at`.

When `askQuestion(graphSlug, nodeId, questionData)` is called,
then it constructs a `question:ask` event payload and calls `raiseEvent()`. The event handler transitions to `waiting-question`.

There is no separate write path for node lifecycle and question events. The event handler IS the implementation. `pending_question_id` and `error` are written directly by event handlers. No separate derivation pass.

Note: Output persistence (`saveOutputData`, `saveOutputFile`) is handled directly by the orchestrator and does not flow through the event system.

### AC-16: ONBAS reads event log for sub-state determination

Given a node in `waiting-question` status with events in its log,
when ONBAS walks the graph:
- A `question:ask` event with `status: 'new'` produces `question-pending`
- A `question:ask` event with a matching `question:answer` event produces `resume-node`
- A `question:ask` event that is `acknowledged` with no answer is skipped (walk continues)

The walk algorithm structure (line order, position order, first-match-wins) is unchanged.

### AC-17: State schema is backward compatible

Given an existing `state.json` without an `events` array on nodes,
when parsed with the updated `StateSchema`,
then it parses successfully (events is optional).

Given a new `state.json` with events arrays,
when parsed with the updated schema,
then all events are validated against `NodeEventSchema`.

### AC-18: E2E script runs fully automatically with visual output

Given the E2E validation script,
when run via `npx tsx e2e-event-system-sample-flow.ts`:
- The script creates a graph, adds nodes, and walks through the full lifecycle
- Every step prints human-readable output showing what happened
- The script plays all roles: orchestrator (starts nodes), agent (accepts, works, asks questions, completes), human (answers questions)
- Event log is inspected and printed as a table
- Schema self-discovery is demonstrated (list-types, schema)
- Both shortcut commands and generic event raise are used
- The script exits 0 on success, 1 on failure
- No real agents are used — everything is mock
- A human watching the output can follow and validate every interaction

---

## Risks & Assumptions

### Risks

1. **State schema size growth**: Nodes with many events could bloat `state.json`. Mitigation: `events` array is optional; event count is bounded at 1000; handled events with no further use could be pruned in future.

2. **ONBAS regression**: Changing ONBAS from reading flat fields to reading event logs could introduce edge cases. Mitigation: ONBAS is a pure function — same-input-same-output property tests verify no regression. All existing walk tests rewritten against event-based node state.

3. **Backward compatibility breakage**: Routing existing methods through events could change subtle behaviors (timing, error messages, return values). Mitigation: Contract tests run both old-path and new-path with identical inputs, assert identical outputs.

4. **Status enum extension**: Adding `starting` and `agent-accepted` to `NodeExecutionStatus` could break existing `switch` statements or status checks. Mitigation: Exhaustive `never` checks in switch statements catch missing cases at compile time.

5. **Event handler ordering**: When multiple events are raised in quick succession, handler ordering matters (e.g., ask then complete). Mitigation: Events are processed sequentially in raise order; each event's handler runs to completion before the next.

### Assumptions

1. Single-process execution — only one CLI invocation at a time per graph
2. Existing `loadState()`/`persistState()` and atomic writes are reliable
3. ONBAS walk structure (line order, position order, first-match-wins) does not need restructuring
4. The 6 initial event types cover all current node lifecycle and communication interactions (output persistence handled separately by the orchestrator)
5. Q6 from Workshop #01 resolved as Option B (events as the implementation — single write path)
6. `question_id` generation pattern (monotonic + random) is sufficient for event IDs

---

## Open Questions

1. **[NEEDS CLARIFICATION: Progress event from ONBAS perspective]** `progress:update` events don't change node state. Should ONBAS ignore them entirely, or should the walk algorithm be aware of progress for future use (e.g., timeout detection based on last progress timestamp)?

2. **[NEEDS CLARIFICATION: Event log in graph status response]** The current `cg wf status` command returns node statuses. Should the status response include event counts or the latest event per node, or is `event log` the only way to inspect events?

---

## ADR Seeds (Optional)

### ADR-1: Events as Logged Facts, Not Commands

**Decision Drivers**: Audit trail (never lose data), debuggability (full history), resilience (handler failure doesn't lose the event)

**Candidate Alternatives**:
- A. Events are facts ("this happened") — logged first, then handled. Handler failure records error but event persists. (Workshop #01 recommendation)
- B. Events are commands ("do this") — only persisted if handler succeeds. Simpler but loses data on failure.
- C. CQRS-style — separate command and event stores. Over-engineered for this scale.

**Stakeholders**: Orchestrator (reliability), Developers (debugging), Users (audit)

### ADR-2: Events as the Implementation (Option B — Chosen)

**Decision Drivers**: Architectural simplicity (one write path), no dual-write consistency risk, clean long-term maintainability

**Decision**: `raiseEvent()` is the single write path. Service methods (`endNode`, `askQuestion`, etc.) are thin wrappers that construct event payloads. The event handler contains all state transition logic. Backward-compat fields are derived projections.

**Rejected Alternative**: Option A (wrap existing methods, add events as logging layer) — lower risk but creates two parallel write paths that must stay in sync. The dual-write maintenance burden was judged worse than the upfront implementation cost.

**Stakeholders**: Plan 030 Phase 6 (ODS consumes events), Future maintainers, Test authors

### ADR-3: CLI Shortcuts for Accept/End/Error but NOT Q&A

**Decision Drivers**: Agent UX (shortcuts for common ops), extensibility (Q&A path teaches agents the generic pattern), future-proofing (Q&A may expand)

**Candidate Alternatives**:
- A. Shortcuts for accept, end, error; no shortcuts for Q&A. (User directive)
- B. Shortcuts for all event types. Easier for agents but defeats extensibility teaching.
- C. No shortcuts at all. Forces generic path everywhere. Too verbose for common operations.

**Stakeholders**: Agents (UX), Extensibility story, User preference

---

## Workshop Opportunities

| Topic | Type | Status | Workshop |
|-------|------|--------|----------|
| Node Event System | Data Model / CLI Flow / State Machine | Complete | [Workshop #01](workshops/01-node-event-system.md) |
| First-Class Node Event Service | Data Model / Integration Pattern | Complete | [Workshop #09](workshops/09-first-class-node-event-service.md) |

Workshop #09 overrides Workshop #06's standalone function approach. Events are elevated to a first-class service (`INodeEventService`) with `HandlerContext` for clean handler ergonomics. See Workshop #09 for the override matrix.
