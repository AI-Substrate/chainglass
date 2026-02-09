# Concept Drift Audit: Plan 030 vs Plan 032

**Date**: 2026-02-09
**Context**: Plan 032 (Node Event System) is COMPLETE (all 8 phases, 3690 tests). Plan 030 (Positional Orchestrator) has Phases 1-5 COMPLETE, Phase 6 READY. Before resuming Phase 6, this audit identifies concept drift between Plan 030's original design and Plan 032's actual implementation, including findings from all 13 workshops.

---

## 1. Executive Summary

Plan 030 was designed before Plan 032 existed. Plan 032 introduced a typed event system that fundamentally changes how the orchestrator communicates with agents. Several areas of Plan 030 — particularly Phase 6 (ODS), Phase 7 (orchestration loop), and the spec's acceptance criteria — are **stale and contain assumptions contradicted by 13 workshops and Plan 032's implementation**.

**The key shift**: ONBAS and ODS were originally designed to handle Q&A, event processing, and agent communication. Now:
- **Q&A is entirely the event system's problem** (Plan 032)
- **ONBAS is purely "what happens next in the graph"** — reads flat fields, never events
- **ODS is purely "execute the decision"** — starts/resumes pods, never processes events
- **IEventHandlerService** (built by Plan 032) is the new "Settle" phase that processes events *before* ONBAS runs

**Critical concept drift issues found**: 7 major, 3 moderate, 2 minor

---

## 2. Current State of Plan 030

### Phase Completion Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | PositionalGraphReality Snapshot | COMPLETE | 26 tests, 6 files |
| 2 | OrchestrationRequest Discriminated Union | COMPLETE | 27 tests, 3 files |
| 3 | AgentContextService | COMPLETE | 14 tests, 4 files |
| 4 | WorkUnitPods and PodManager | COMPLETE | 41 tests, 9 files |
| 5 | ONBAS Walk Algorithm | COMPLETE | 28 tests, 3 files |
| 6 | ODS Action Handlers | READY (not started) | Phase 6 dossier exists but is STALE |
| 7 | Orchestration Entry Point | PENDING | Blocked on Phase 6 |
| 8 | E2E and Integration Testing | PENDING | Blocked on Phase 7 |

### Implemented Components (24 source files in `features/030-orchestration/`)

| Component | Interface | Real | Fake | Status |
|-----------|-----------|------|------|--------|
| PositionalGraphReality | `PositionalGraphReality` (type) | `buildPositionalGraphReality()` | `buildFakeReality()` | COMPLETE |
| OrchestrationRequest | 4-variant discriminated union | Zod schemas + guards | — | COMPLETE |
| AgentContextService | `IAgentContextService` | `AgentContextService` | `FakeAgentContextService` | COMPLETE |
| PodManager | `IPodManager` | `PodManager` | `FakePodManager` | COMPLETE |
| Pods | `IWorkUnitPod` | `AgentPod`, `CodePod` | `FakePod` | COMPLETE |
| ONBAS | `IONBAS` | `ONBAS` (wraps `walkForNextAction`) | `FakeONBAS` | COMPLETE |
| ODS | — | — | — | NOT STARTED |
| OrchestrationService | — | — | — | NOT STARTED |
| DI Tokens | — | — | — | NOT STARTED |

### Key: Zero references to Plan 032's event system exist in Plan 030's code

The 030-orchestration feature folder has NO imports from 032-node-event-system. Integration is entirely ahead of us.

---

## 3. What Plan 032 Built (Summary)

Plan 032 delivered a complete typed event system with 24 source files in `features/032-node-event-system/`:

- **6 event types**: `node:accepted`, `node:completed`, `node:error`, `question:ask`, `question:answer`, `progress:update`
- **INodeEventService**: raise (record-only), handleEvents (process + stamp), query methods
- **IEventHandlerService**: `processGraph(state, subscriber, context)` — graph-wide settlement
- **EventHandlerRegistry**: multi-handler per event type, context-tagged (`cli`/`web`/`both`)
- **Subscriber stamp model**: per-subscriber stamps instead of global `handled` status
- **8 CLI commands**: `raise-event`, `events`, `stamp-event`, `accept`, `end`, `error`, `event list-types`, `event schema`
- **3 fakes**: `FakeNodeEventRegistry`, `FakeNodeEventService`, `FakeEventHandlerService`
- **41-step E2E script** proving the full lifecycle

### What Plan 032 explicitly owns (Plan 030 must NOT duplicate):

1. Agent-orchestrator communication protocol (the 6 event types)
2. All node status transitions (via event handlers)
3. Progress reporting (progress:update events)
4. Error signaling (node:error events)
5. Q&A lifecycle (question:ask + question:answer events)
6. Event settlement and idempotency (processGraph)
7. Event validation pipeline (5-step: type → payload → source → state → question refs)
8. Event persistence and audit trail (append-only log with stamps)
9. CLI surface for agent interaction (8 commands)

---

## 4. Concept Drift Analysis

### CRITICAL-1: Phase 6 Dossier Is Completely Stale

**Location**: `docs/plans/030-positional-orchestrator/tasks/phase-6-ods-action-handlers/tasks.md`

The Phase 6 dossier was written BEFORE Workshop #8 (Shared Transition Ownership) and BEFORE Plan 032 was created. It contains assumptions that have been invalidated:

**Stale assumption 1**: ODS calls `graphService.endNode()`, `graphService.askQuestion()`, `graphService.failNode()` after pod outcomes.

**Reality**: Workshop #8 explicitly states: "ODS never tells the graph service what the agent did — it reads what the agent did. The agent speaks for itself through CLI commands."

**Stale assumption 2**: ODS has a `question-pending` handler that calls `graphService.surfaceQuestion()` and emits a domain event.

**Reality**: Workshop 11 says question surfacing moves to a web-context event handler (`pushQuestionToUI`), not ODS. The orchestration loop exits when ONBAS returns `question-pending` — ODS never receives it.

**Stale assumption 3**: Task groups T003 (start-node tests) describe post-execute outcome branching where ODS calls different service methods based on `PodExecuteResult.outcome`.

**Reality**: ODS reads the node's state after pod exit. The agent raised events during execution via CLI. The node's status (`complete`, `waiting-question`, `blocked-error`) is the truth, not the pod outcome.

**Resolution**: Phase 6 dossier must be regenerated from scratch using `/plan-5`. The old dossier should be archived.

---

### CRITICAL-2: `resume-node` Request Cannot Be Generated After Event Settlement

**Location**: `onbas.ts` (`walkForNextAction` → `visitWaitingQuestion`)

This is the most architecturally significant drift.

**Original design**: ONBAS finds a `waiting-question` node with an answered question and returns `resume-node`.

**After event settlement**: The `handleQuestionAnswer` handler transitions the node from `waiting-question` → `starting` and clears `pending_question_id`. By the time ONBAS runs (after Settle phase), the node is `starting` — not `waiting-question`. ONBAS skips `starting` nodes.

**The flow breaks down**:
1. Agent asks question → node becomes `waiting-question` (via question:ask handler)
2. Agent's pod exits (stopsExecution = true)
3. Human answers → raises `question:answer`
4. Settle phase: `handleQuestionAnswer` fires → node becomes `starting`, `pending_question_id` cleared
5. Decide phase: ONBAS walks → sees `starting` → **skips it** → returns `no-action`
6. **Node is orphaned** — `starting` status with no active pod, no mechanism to re-launch

**Root cause**: ONBAS treats `starting` as "actively running" and skips it. But after a question answer, `starting` means "needs a new pod to resume work". ONBAS cannot distinguish these cases from flat fields alone.

**Resolution options**:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Change handler | `question:answer` handler transitions to `ready` instead of `starting` | ONBAS returns `start-node` naturally; ODS detects prior session and resumes | Semantic change to `ready` (it means "actionable"); changes Plan 032 code |
| B. Add pod awareness | ONBAS checks pod sessions — `starting` with no active pod → `start-node` | Clean separation; no event system changes | ONBAS gains a new dependency (pod session data) |
| C. New status | Add `awaiting-resume` status between answer and re-launch | Explicit, no ambiguity | New status in schema; handler change; more states to manage |
| D. Resume flag | Handler sets a `needs_resume: true` flag; ONBAS checks it for `starting` nodes | Minimal change; flat field | New field in state schema |

**Recommended**: Option A or D (discuss with user). Option A is cleanest — `ready` with prior session context means "this node needs attention" and ODS can detect whether to fresh-start or resume.

---

### CRITICAL-3: ODS's Post-Execute Model Changed From Outcome-Based to State-Based

**Location**: Plan 030 spec AC-6, Phase 6 dossier tasks T003-T006

**Original design**: After `pod.execute()` returns, ODS inspects `PodExecuteResult.outcome` to decide what to do:
- `outcome: 'completed'` → call `graphService.endNode()`
- `outcome: 'question'` → keep pod alive, wait for answer
- `outcome: 'error'` → call `graphService.failNode()`
- `outcome: 'terminated'` → mark blocked

**After Workshop #8**: ODS reads the node's STATE, not the pod's outcome. The agent raised events during execution:
- Node status is `complete` → destroy pod (agent already called `cg wf node end`)
- Node status is `waiting-question` → keep pod alive or clean up
- Node status is `blocked-error` → handle error (agent already called `cg wf node error`)
- Node status is `agent-accepted` → abnormal exit, timeout/retry

**Impact**: The `PodOutcomeSchema` (`completed | question | error | terminated`) may still be useful as a hint, but is no longer the authoritative source. ODS's dispatching logic fundamentally changes.

**Resolution**: Rewrite ODS's post-execute logic around node status inspection. The pod outcome becomes supplementary information for diagnostics, not the primary dispatch.

---

### CRITICAL-4: `question-pending` Changes From Action to Stop Signal

**Location**: Plan 030 spec AC-9, Phase 6 task T006/T007, `orchestration-request.schema.ts`

**Original design**: When ONBAS returns `question-pending`, ODS calls `graphService.surfaceQuestion()`, sets `surfaced_at`, and emits a domain event via `ICentralEventNotifier`.

**After Workshop 11**: `question-pending` is a **loop stop signal**, not an action for ODS. Question surfacing moves to a web-context event handler (`pushQuestionToUI`) that fires during the Settle phase. ODS never receives `question-pending` — the loop exits before reaching ODS.

**Impact on Phase 6**: The `handleQuestionPending` handler in ODS either:
- Becomes a no-op (if the loop still passes it to ODS for completeness)
- Is removed entirely (if the loop exits before calling ODS)

**Impact on `surfaceQuestion()`**: This method on `IPositionalGraphService` may need to move into an event handler registered with `context: 'web'`.

**Resolution**: Phase 6 should NOT implement question surfacing. Phase 7 (orchestration loop) exits on `question-pending`. A future plan adds the web handler for question surfacing.

---

### CRITICAL-5: IEventHandlerService Is Already Built — Remove From Phase 7

**Location**: Plan 030 plan § Phase 7, subtask registry entry

Plan 030 Phase 7 lists `IEventHandlerService` as a deliverable and acceptance criterion:
> "IEventHandlerService processes graph-wide events as Settle step before ONBAS (subtask, per Workshop 10 Part 3, ADR-0011)"

The subtask registry has:
> "| 7 | T007 | IEventHandlerService — graph-wide event processing (Settle phase) | Pending |"

**Reality**: Plan 032 Phase 7 built `IEventHandlerService` completely. It exists, it's tested (29 tests), it has a fake (`FakeEventHandlerService`), and it was validated in the 41-step E2E.

**Resolution**: Mark the subtask as SUPERSEDED (like the two-phase handshake subtask). Remove from Phase 7 scope. Phase 7 only needs to IMPORT and USE it, not BUILD it.

---

### CRITICAL-6: Spec Acceptance Criteria Are Stale

**AC-6** says ODS "updates node status to running" — `running` no longer exists (replaced by `starting` + `agent-accepted` in Plan 032 Phase 2).

**AC-9** says "Agent pod returns outcome: 'question'" — Workshop #8 removes this. The agent raises `question:ask` via CLI during execution. ODS discovers the `waiting-question` state by reading state after pod exit.

**AC-9 step 1** says "ODS stores question in state, node becomes waiting-question" — The event handler does this, not ODS.

**AC-9 step 3** says "ODS marks question as surfaced" — Workshop 11 moves this to a web handler.

**Resolution**: The spec needs targeted amendments to align with the implemented event system. A revision pass should update ACs 6, 9, and possibly 10-12.

---

### CRITICAL-7: Three-Phase Loop (Settle → Decide → Act) Not In Original Design

**Location**: Plan 030 Phase 7

The original Phase 7 design was: `build reality → ONBAS → ODS → repeat`. Workshop 10 introduced the three-phase model:

1. **Settle**: `IEventHandlerService.processGraph(state, 'orchestrator', 'web')` — process all pending events
2. **Decide**: `ONBAS.walkForNextAction(reality)` — pure decision on settled state
3. **Act**: `ODS.execute(request)` — execute the decision
4. Loop back to Settle; exit on `no-action` or `question-pending`

Phase 7 needs to incorporate this pattern. The pseudocode from Workshop 10:

```typescript
async run(): Promise<OrchestrationRunResult> {
  while (true) {
    // 1. SETTLE
    const state = await this.loadState(this.graphSlug);
    const settleResult = this.eventHandlerService.processGraph(state, 'orchestrator', 'web');
    if (settleResult.eventsProcessed > 0) {
      await this.persistState(this.graphSlug, state);
    }
    // 2. DECIDE
    const reality = this.buildReality(state);
    const request = this.onbas.walkForNextAction(reality);
    if (request.type === 'no-action' || request.type === 'question-pending') {
      return { actions, finalRequest: request };
    }
    // 3. ACT
    const actionResult = await this.ods.execute(request);
    actions.push(actionResult);
  }
}
```

**Resolution**: Phase 7 must implement this pattern, importing `IEventHandlerService` from Plan 032.

---

### MODERATE-1: PodEventHandler/PodEvent Types Are Orphaned

**Location**: `pod.types.ts` — `PodEventHandler`, `PodEvent`, `PodOutputEvent`, `PodQuestionEvent`, `PodProgressEvent`

These types were designed for ODS to receive in-process events from pods. They are defined but UNUSED — neither `AgentPod` nor `CodePod` call the `onEvent` callback.

With Plan 032's event system, agents communicate via CLI events (persisted to state.json), not in-process callbacks. The `PodEvent` types may be:
- **Redundant**: agents use CLI events for everything
- **Complementary**: in-process events for real-time notifications (e.g., progress streaming) while CLI events provide the durable record

**Resolution**: Defer decision. These types are harmless as unused stubs. ODS Phase 6 should NOT use them for core flow — use node state inspection instead. They may find use later for real-time progress streaming.

---

### MODERATE-2: PodOutcomeSchema Has `question` Outcome

**Location**: `pod.schema.ts` — `PodOutcomeSchema: 'completed' | 'question' | 'error' | 'terminated'`

Under Workshop #8's model, the agent raises `question:ask` via CLI, which sets `stopsExecution=true`. The CLI tells the agent to exit. The pod exits normally. What outcome should it report?

- If the pod framework detects the `question:ask` event → `question`
- If the pod framework doesn't know → `completed` (agent exited cleanly)

Since ODS now reads node state (not pod outcome) for post-execute dispatching, the `question` outcome is diagnostic, not authoritative. The node's `waiting-question` status is the truth.

**Resolution**: Keep `PodOutcomeSchema` as-is for now. ODS should NOT branch on outcome — branch on node status. The outcome is metadata for logging/debugging.

---

### MODERATE-3: PositionalGraphReality Doesn't Include Events

**Location**: `reality.types.ts` — `NodeReality` interface

`NodeReality` has `pendingQuestionId`, `error`, `status` — all flat fields that handlers write. It does NOT include `events: NodeEvent[]`.

Workshop 11 explicitly says ONBAS doesn't need events. But ODS might need event data for:
- Determining the answer content when resuming a pod
- Reading error details for retry logic
- Checking progress history

**Resolution**: `NodeReality` stays as-is (no events). ODS accesses events via `INodeEventService.getEventsForNode()` when needed, operating on raw state rather than the reality snapshot. This keeps the reality snapshot lightweight and ONBAS pure.

---

### MINOR-1: `surfaceQuestion()` and `surfaced_at` Model

Plan 030's original question model has three sub-states: asked (not surfaced), surfaced (`surfaced_at` set), answered. ONBAS uses these sub-states in `visitWaitingQuestion()`.

With the event system, question surfacing moves to a web handler. The `surfaced_at` field may still be set by this handler, or the concept may be simplified (questions are surfaced immediately when the event is raised).

**Resolution**: Leave `surfaced_at` in the model. The web handler can set it. ONBAS's `visitWaitingQuestion()` logic remains valid for the cases where settlement doesn't transition the node away from `waiting-question` (see CRITICAL-2).

---

### MINOR-2: Plan 030 Plan Document Has Stale References

- Phase 6 callout updated to UNBLOCKED but still references "bespoke service calls to event-based communication"
- Phase 7 subtask for IEventHandlerService still marked "Pending" — should be "Superseded by Plan 032"
- ADR-0011 references IEventHandlerService as a subtask — already built

**Resolution**: Update plan document during Phase 6 dossier regeneration.

---

## 5. Impact on Existing Code (Phases 1-5)

### Phase 1 (PositionalGraphReality): NO CODE CHANGES NEEDED

The reality snapshot reads flat fields from state. Event handlers write these flat fields. The snapshot model is compatible with the event system. `waitingQuestionNodeIds`, `pendingQuestions`, etc. all work correctly because handlers maintain the flat fields.

**One consideration**: `buildPositionalGraphReality()` reads `state.nodes[id].status` which now includes `starting` and `agent-accepted` instead of `running`. This was already updated in Plan 032 Phase 2 (which modified reality types and schema).

### Phase 2 (OrchestrationRequest): SCHEMA CHANGES LIKELY NEEDED

The `resume-node` request type may need redesign depending on how CRITICAL-2 is resolved:
- If Option A (answer → ready): `resume-node` might be absorbed into `start-node` with context
- If Option B/C/D: `resume-node` semantics may need the request to carry answer payload or session context

`OrchestrationExecuteResult` may need revision based on the state-based (not outcome-based) post-execute model.

### Phase 3 (AgentContextService): NO CODE CHANGES NEEDED

Context inheritance is orthogonal to the event system. ODS still uses `getContextSource()` to determine whether a new pod gets a context session ID.

### Phase 4 (Pods and PodManager): NO CODE CHANGES NEEDED (but review)

- `AgentPod` and `CodePod` work as-is — they execute agents/scripts
- `PodManager` manages pod lifecycles — unchanged
- `PodOutcomeSchema` stays but becomes secondary to node state inspection
- `PodEventHandler`/`PodEvent` types remain unused stubs

### Phase 5 (ONBAS): CHANGES NEEDED (see CRITICAL-2)

The `visitWaitingQuestion()` logic and `starting` node handling need revision to work with the event settlement model. The core walk algorithm is sound — the issue is specifically how ONBAS handles nodes that transitioned from `waiting-question` to `starting` via event settlement.

---

## 6. Impact on Phase 6 (ODS) — Needs Full Regeneration

The Phase 6 dossier (`tasks/phase-6-ods-action-handlers/tasks.md`) must be regenerated. Here is what ODS should actually do:

### ODS Revised Responsibilities

ODS is a pure executor. It takes an `OrchestrationRequest` from ONBAS and performs side effects.

**`start-node` handler**:
1. Reserve node via `graphService.startNode()` (pending → starting) — this is NOT an event, it's a precondition
2. Create pod via PodManager (pass adapter/runner)
3. Resolve context via AgentContextService
4. Call `pod.execute(options)` — HANDOVER to agent
5. Agent runs, raises events via CLI during execution (accept, progress, question, complete, error)
6. Pod exits — HANDBACK
7. **Read node state** (not pod outcome) to determine what happened
8. React based on node status:
   - `complete` → destroy pod
   - `waiting-question` → clean up pod reference (pod exited due to stopsExecution)
   - `blocked-error` → log error, clean up pod
   - `agent-accepted` → abnormal exit (agent didn't finish), mark error
   - `starting` → agent never accepted (timeout?), mark error

**`resume-node` handler** (if resume-node still exists after CRITICAL-2 resolution):
1. Retrieve or recreate pod from persisted session
2. Load answer from event log via `INodeEventService.findEvents()`
3. Call `pod.resumeWithAnswer(answer, options)` — agent re-engages
4. Same post-execute state inspection as start-node

**`question-pending` handler**: **No-op or removed**. The orchestration loop exits on `question-pending`. Question surfacing is a web handler's job. ODS never receives this request type.

**`no-action` handler**: Return `{ ok: true, request }` with zero side effects.

### What ODS Does NOT Do

- Does NOT call `graphService.endNode()` after pod exit (agent already did it via CLI)
- Does NOT call `graphService.askQuestion()` (agent did it via CLI `raise-event question:ask`)
- Does NOT call `graphService.answerQuestion()` (human did it via CLI or web)
- Does NOT call `graphService.surfaceQuestion()` (web handler does this)
- Does NOT call `handleEvents()` (IEventHandlerService does this in the Settle phase)
- Does NOT emit domain events for question surfacing (web handler does this)

---

## 7. Impact on Phase 7 (Orchestration Entry Point)

### What Phase 7 Builds

- `IOrchestrationService` interface + implementation (singleton, DI-registered)
- `IGraphOrchestration` interface + implementation (per-graph handle)
- `OrchestrationRunResult` type
- The three-phase loop: Settle → Decide → Act
- `ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE`
- `registerOrchestrationServices()` in container.ts

### What Phase 7 Does NOT Build (already done by Plan 032)

- ~~IEventHandlerService~~ — SUPERSEDED, built by Plan 032 Phase 7
- ~~EventHandlerService~~ — exists
- ~~FakeEventHandlerService~~ — exists
- ~~processGraph()~~ — exists and tested

### Phase 7 Integrates These Plan 032 Exports

```typescript
import {
  EventHandlerService,
  FakeEventHandlerService,
  NodeEventService,
  FakeNodeEventRegistry,
  createEventHandlerRegistry,
  registerCoreEventTypes,
  type IEventHandlerService,
  type ProcessGraphResult,
} from '@chainglass/positional-graph/features/032-node-event-system';
```

---

## 8. Impact on Phase 8 (E2E Testing)

Phase 8 tests the full orchestration loop. Plan 032's E2E script (`test/e2e/node-event-system-visual-e2e.ts`) is the rehearsal — it manually walks the exact sequence Plan 030 will automate.

Phase 8 must exercise:
1. The Settle → Decide → Act loop
2. Multi-node pipeline with serial and parallel execution
3. Question/answer cycle through the loop (including the CRITICAL-2 resume gap)
4. Error handling and recovery
5. Graph completion detection
6. Input wiring from upstream outputs to downstream inputs

---

## 9. Remediation Plan

### Before Any Code: Document Updates

| # | Action | Files | Priority |
|---|--------|-------|----------|
| R1 | Archive stale Phase 6 dossier | `tasks/phase-6-ods-action-handlers/tasks.md` → rename to `tasks.md.archived` | HIGH |
| R2 | Update Plan 030 spec ACs | `positional-orchestrator-spec.md` — revise AC-6, AC-9 | HIGH |
| R3 | Update Plan 030 plan: IEventHandlerService subtask | Mark subtask as SUPERSEDED by Plan 032 | MEDIUM |
| R4 | Update Plan 030 plan: Phase 7 deliverables | Remove IEventHandlerService from deliverables list | MEDIUM |
| R5 | Resolve CRITICAL-2 (resume-node gap) via workshop | New workshop to decide how ONBAS handles post-answer resumption | HIGH |

### Phase 6 Regeneration

After R1-R5, regenerate Phase 6 dossier using `/plan-5 --phase "Phase 6: ODS Action Handlers"`. The new dossier will incorporate:
- Workshop #8 shared transition ownership model
- State-based post-execute logic (not outcome-based)
- No question surfacing (that's a web handler)
- Integration with INodeEventService for event queries
- CRITICAL-2 resolution

### ONBAS Modification (Phase 5 Retrofit or Phase 6 Task)

Depending on CRITICAL-2 resolution:
- If `question:answer` → `ready`: ONBAS needs no changes (ready nodes already produce start-node)
- If new status or flag: ONBAS needs a case for the new status/flag
- If pod awareness: ONBAS needs access to pod session data in reality snapshot

### Phase 7 Scope Reduction

Phase 7 shrinks because IEventHandlerService is done. It focuses on:
- Orchestration service interfaces and impls
- The three-phase loop
- DI registration
- Handle caching

---

## 10. Recommended Next Steps

1. **Workshop**: Hold a workshop (Workshop 14 or Plan 030 Workshop 09) to resolve CRITICAL-2 — the `resume-node` / post-answer resumption gap. This is the single most important design decision before Phase 6.

2. **Spec amendments**: Update AC-6, AC-9 to match the event-based reality.

3. **Plan updates**: Mark IEventHandlerService subtask as superseded, update Phase 7 scope.

4. **Regenerate Phase 6 dossier**: Fresh `/plan-5` with full context from this audit.

5. **Implement Phase 6**: ODS with the revised design.

6. **Implement Phase 7**: Orchestration loop with Settle → Decide → Act.

7. **Implement Phase 8**: E2E testing.

---

## Appendix A: Workshop Summary (All 13)

| Workshop | Title | Key Decision | Plan 030 Impact |
|----------|-------|-------------|-----------------|
| 01 | Node Event System | Events replace bespoke methods | Foundation for all changes |
| 02 | Event Schema and Storage | Events per-node, new status enum | `starting`/`agent-accepted` replace `running` |
| 03 | Question ID Migration | event_id IS question_id | ONBAS treats IDs as opaque strings — no change |
| 04 | Backward Compat | Drop compat layer, handlers write flat fields | Handlers maintain flat fields ONBAS reads |
| 05 | Raise Not Handle | raiseEvent is record-only | Handler processing moves to orchestration loop |
| 06 | Subscriber Stamps | raiseEvent + handleEvents separation | CLI handles immediately, EHS handles graph-wide |
| 07 | CLI Commands | Agent-first CLI design | Agents use these during pod execution |
| 08 | Concept Drift Audit | Remediation roadmap for Plan 032 | Established final architecture |
| 09 | INodeEventService | First-class service elevation | ODS uses service API, not raw functions |
| 10 | **Orchestration Loop** | **Settle → Decide → Act** | **Defines Plan 030 Phase 7 loop structure** |
| 11 | **ONBAS + Questions** | **ONBAS never reads events; question-pending is stop signal** | **ODS doesn't surface questions; loop exits** |
| 12 | Testable EHS | FakeEventHandlerService pattern | Plan 030 loop tests use fake |
| 13 | E2E Script Design | E2E as Plan 030 rehearsal | Direct mapping to Plan 030 components |

## Appendix B: Event Type to Plan 030 Component Mapping

| Event Type | Who Raises | Who Handles (CLI) | Who Handles (Web/Orchestrator) | Plan 030 Component |
|-----------|-----------|-------------------|-------------------------------|-------------------|
| node:accepted | Agent (CLI) | CLI handleEvents | EHS processGraph | ODS observes post-accept |
| node:completed | Agent (CLI) | CLI handleEvents | EHS processGraph | ODS destroys pod |
| node:error | Agent/Orchestrator | CLI handleEvents | EHS processGraph | ODS handles error |
| question:ask | Agent (CLI) | CLI handleEvents | EHS processGraph + web handler | Loop exits (question-pending) |
| question:answer | Human/Orchestrator | CLI handleEvents | EHS processGraph | **CRITICAL-2: resume gap** |
| progress:update | Agent (CLI) | CLI handleEvents | EHS processGraph | Informational only |

## Appendix C: Status Transition Authority

| Transition | Triggered By | Via |
|-----------|-------------|-----|
| pending → ready | Graph readiness rules | IPositionalGraphService (existing) |
| ready → pending | Upstream dependency change | IPositionalGraphService (existing) |
| pending → starting | ODS reserves node | `graphService.startNode()` (direct call, NOT event) |
| starting → agent-accepted | Agent accepts | `cg wf node accept` → node:accepted event |
| agent-accepted → complete | Agent completes | `cg wf node end` → node:completed event |
| agent-accepted → blocked-error | Agent/orchestrator error | `cg wf node error` → node:error event |
| starting → blocked-error | Agent/orchestrator error | node:error event |
| agent-accepted → waiting-question | Agent asks question | `cg wf node raise-event question:ask` |
| waiting-question → starting | Answer provided | question:answer event handler |
| **starting → ??? (after answer)** | **??? (CRITICAL-2)** | **Needs resolution** |
