# Workshop: Plan 059 Resumption After Plan 061

**Type**: Integration Pattern
**Plan**: 059-fix-agents
**Spec**: [fix-agents-spec.md](../fix-agents-spec.md)
**Created**: 2026-03-02
**Status**: Approved

**Related Documents**:
- [Plan 061 workflow-events-plan.md](../../061-workflow-events/workflow-events-plan.md) — completed prerequisite
- [Workshop 003: Work Unit State System](003-work-unit-state-system.md) — Phase 2 design
- [Workshop 005: Server Event Router](005-server-event-router.md) — SSE bridge pattern
- [docs/how/workflow-events-integration.md](/docs/how/workflow-events-integration.md) — Plan 061 deliverable

**Domain Context**:
- **Primary Domain**: work-unit-state (Phase 2 target)
- **Related Domains**: workflow-events (now complete), agents (bridge consumer), _platform/state, _platform/events

---

## Purpose

Assess what's changed since Plan 059 Phase 2 was drafted, identify stale assumptions in the task dossier, and define the remediation needed before resuming implementation.

## Key Questions Addressed

- What did Plan 061 deliver that changes Phase 2's T007 (bridge) and T008 (answer routing)?
- Are there stale references or assumptions in the Phase 2 dossier that need updating?
- What's the correct execution order now?
- Does the merge from main (Plan 058/062) affect anything?

---

## What Plan 061 Delivered

| Deliverable | Location | Impact on Plan 059 Phase 2 |
|---|---|---|
| `IWorkflowEvents` interface | `@chainglass/shared` | T007 bridge can subscribe via `wfEvents.onQuestionAsked()` |
| `WorkflowEventsService` | `@chainglass/positional-graph` | Real implementation ready — bridge constructs per-graph |
| `WorkflowEventObserverRegistry` | `@chainglass/positional-graph` | globalThis-backed, HMR-surviving |
| `WorkflowEventError` | `@chainglass/shared/workflow-events` | Structured errors for answer failures |
| `WorkflowEventType` constants | `@chainglass/shared/workflow-events` | 7 typed constants replacing magic strings |
| Observer hooks | `onQuestionAsked`, `onQuestionAnswered`, `onProgress`, `onEvent` | Bridge subscribes to these — no raw event coupling needed |
| PGService Q&A methods deleted | Interface + implementation | Bridge CANNOT use old `askQuestion`/`answerQuestion` — must use WorkflowEvents |
| Integration guide | `docs/how/workflow-events-integration.md` | Reference for T007 implementation |

---

## Task-by-Task Remediation Assessment

### T001-T006: No changes needed

These tasks define the IWorkUnitStateService interface, fake, contract tests, real implementation, tidyUp rules, and DI registration. They are **self-contained** within the work-unit-state domain and don't interact with Plan 061. The dossier already incorporated DYK corrections (no Q&A methods, state path naming, CentralEventNotifier emission pattern).

**Verdict**: Proceed as written.

### T007: AgentWorkUnitBridge — NEEDS UPDATE

The dossier says: "**No QnA bridging** — deferred to Plan 061 observer hooks."

Plan 061 is now complete. The bridge CAN and SHOULD subscribe to WorkflowEvents observers. Updated scope:

| Before (dossier) | After (remediated) |
|---|---|
| Bridge registers agents + publishes status only | Bridge registers agents + publishes status + **subscribes to `wfEvents.onQuestionAsked()` to set `waiting_input` status** |
| No Q&A bridging | Bridge observes question events → calls `updateStatus(id, 'waiting_input')` |
| T008 deferred | T008 scope absorbed into T007 (see below) |

**How the bridge uses Plan 061**:

```typescript
// In AgentWorkUnitBridge constructor or init:
const unsub = wfEvents.onQuestionAsked(graphSlug, (event) => {
  // Find the work unit for this node
  const unit = stateService.getUnits({ nodeId: event.nodeId });
  if (unit.length > 0) {
    stateService.updateStatus(unit[0].id, 'waiting_input');
  }
});

const unsubAnswered = wfEvents.onQuestionAnswered(graphSlug, (event) => {
  const unit = stateService.getUnits({ nodeId: event.nodeId });
  if (unit.length > 0) {
    stateService.updateStatus(unit[0].id, 'working');
  }
});
```

### T008: Answer Routing — SCOPE CHANGE

Original: "DEFERRED — Answer routing deferred to Plan 061."

Plan 061 delivers answer routing through `WorkflowEventsService.answerQuestion()` — the web action already delegates to it. There's no separate callback mechanism needed in WorkUnitStateService.

**The flow is**:
1. UI sees `waiting_input` status on a work unit chip (via T007 observer)
2. User clicks chip → overlay opens → shows question
3. User answers → calls web `answerQuestion` server action → delegates to `wfEvents.answerQuestion()`
4. WorkflowEvents does the 3-event handshake
5. Bridge's `onQuestionAnswered` observer fires → updates status back to `working`

**T008 becomes**: "Wire answer UX to existing `answerQuestion` web action via the overlay (Phase 3 work, not Phase 2)." This means **T008 can be removed from Phase 2 entirely** — it's already handled by the existing web action (Phase 3 overlay calls it).

**Verdict**: Delete T008 from Phase 2. Mark as "delivered by Plan 061 Phase 3 + Phase 3 overlay UX."

### T009: Integration Guide — Minor update

Add a section on relationship to WorkflowEvents — explain that work-unit-state is a status aggregator, WorkflowEvents handles the actual Q&A mechanics.

---

## Stale References in Dossier

| Location | Issue | Fix |
|---|---|---|
| Tasks table T008 | Says "DEFERRED to Plan 061" — Plan 061 is done | Remove T008 or mark "delivered by Plan 061" |
| Data flow diagram | Shows `askQuestion()` and `answerQuestion()` on WorkUnitStateService | Remove Q&A boxes — only `register`, `updateStatus`, `tidyUp` |
| Sequence diagram | Shows question flow through WorkUnitStateService | Replace with simplified flow: observer → updateStatus('waiting_input') |
| Context Brief § Domain dependencies | References "Plan 061 for QnA" as future | Update to "Plan 061 (complete) — observer hooks available" |
| Discovery DYK-P2-05 | Says "Plan 061 created as prerequisite" | Update to "Plan 061 complete — observers ready for T007" |
| Architecture map | T008 node still present | Remove T008 node, update T007 to include observer subscription |

---

## Updated Execution Order

```
T001 (interface + types)
  ↓
T002 (fake) + T003 (contract tests)  ← parallel after T001
  ↓
T004 (real implementation + CentralEventNotifier + route descriptor)
  ↓
T005 (tidyUp) + T006 (DI registration)  ← parallel after T004
  ↓
T007 (AgentWorkUnitBridge — now includes observer subscription from Plan 061)
  ↓
T009 (integration guide)
```

**T008 removed** — answer routing is handled by existing web action + Plan 061.

---

## Impact of Main Merge (Plans 058/062)

| Change from main | Impact on Phase 2 |
|---|---|
| Plan 058: Work Unit Editor | New domain `058-workunit-editor` — leaf consumer, no impact on work-unit-state |
| Plan 062: Worktree resolution | Fixed worktree path resolution — benefits T004 (per-worktree persistence) |
| `WorkspaceDomain.UnitCatalog` added | New SSE channel — no conflict with `WorkspaceDomain.WorkUnitState` (already registered) |
| `@codemirror/legacy-modes` dependency | Web build dependency — no Phase 2 impact |

**Verdict**: No remediation needed from merge.

---

## Pre-Implementation Checklist

Before starting T001:

- [ ] Update T007 description in tasks.md to include observer subscription
- [ ] Remove T008 from tasks.md (or mark delivered)
- [ ] Update data flow diagram to remove Q&A boxes
- [ ] Update sequence diagram to show observer-based flow
- [ ] Update architecture map to remove T008 node
- [ ] Update DYK-P2-05 discovery text
- [ ] Update SQL todos (remove p2-t008, update p2-t007 description)

---

## Summary

**Good news**: Plan 061 completion removes uncertainty. The Phase 2 dossier was written with "Plan 061 will deliver X" assumptions — now those are facts. The bridge (T007) becomes more concrete because we know exactly what observers are available and how they work.

**Action needed**: Update the dossier to reflect Plan 061 as complete (not future), remove T008, expand T007 scope, and fix the diagrams. Then implement.

**Estimated remediation effort**: ~10 minutes of dossier edits before implementation begins.
