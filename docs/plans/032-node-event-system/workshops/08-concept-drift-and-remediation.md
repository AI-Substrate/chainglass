# Workshop: Concept Drift Audit and Remediation Plan

**Type**: Plan Assessment / Remediation
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-08
**Status**: Draft

**Related Documents**:
- [Workshop 04: Do We Need Backward Compat?](./04-do-we-need-backward-compat.md)
- [Workshop 05: Events Should Be Raised, Not Handled Inline](./05-event-raise-not-handle.md)
- [Workshop 06: raiseEvent/handleEvents Separation](./06-inline-handlers-and-subscriber-stamps.md)
- [Workshop 07: Event System CLI Commands](./07-event-system-cli-commands.md)

---

## Purpose

Audit Plan 032's current state against its spec, identify concept drift introduced by Workshops 04-07, determine what remediation is needed for completed and future phases, and produce an actionable roadmap for bringing the plan, spec, code, and documentation back into alignment.

## Key Questions Addressed

- What concept drift has accumulated across 7 workshops and 4.5 completed phases?
- Does completed work (Phases 1-4) need remediation, or is it structurally sound?
- Is Phase 5's current dossier and subtask structure still valid?
- Do Phases 6-8 need rewriting?
- What's the minimal remediation path to resume implementation?

---

## Phase Completion Status (Snapshot)

| Phase | Title | Tasks | Status | Test Delta |
|-------|-------|-------|--------|------------|
| 1 | Event Types, Schemas, and Registry | 12/12 | COMPLETE | +94 → 3523 |
| 2 | State Schema Extension + Two-Phase Handshake | 11/11 | COMPLETE | +18 → 3541 |
| 3 | raiseEvent Core Write Path | 9/9 | COMPLETE | +22 → 3563 |
| 4 | Event Handlers and State Transitions | 12/12 | COMPLETE | +25 → 3588 |
| 5 | Service Method Wrappers | Subtask 001 done, rest pending | IN PROGRESS | -9 → 3579 |
| 6 | CLI Commands | Not dossier'd | PENDING | -- |
| 7 | ONBAS Adaptation | Not dossier'd | PENDING | -- |
| 8 | E2E Validation Script | Not dossier'd | PENDING | -- |

---

## Concept Drift Inventory

Seven workshops introduced design changes during and after the initial plan. This section catalogs every drift point, its source, and its impact on existing work.

### Drift D1: Backward Compat Layer Removed

**Source**: Workshop 04 (Option C) → Subtask 001
**Impact**: Phase 4 (built it), Phase 5 (removed it)
**Status**: RESOLVED (code deleted, spec/dossier updated)

`deriveBackwardCompatFields()` was implemented in Phase 4 (T008-T011), then deleted by Phase 5 Subtask 001. This is fully remediated:
- Source file deleted, test file deleted, barrel export removed
- Spec AC-15 updated
- Phase 5 dossier: T001/T002 marked `[—] Eliminated`
- Pipeline reduced from 6 steps to 5
- 3588 → 3579 tests (exactly -9)

**Remediation needed**: None. Clean.

---

### Drift D2: raiseEvent/handleEvents Separation

**Source**: Workshop 05 (raise-only) → Workshop 06 (raiseEvent + handleEvents)
**Impact**: Phase 3 (built raiseEvent with inline handlers), Phase 4 (built handlers wired inline), Phase 5 (subtask 002 + all remaining tasks)
**Status**: UNRESOLVED — largest architectural drift

**What the code does today**:
`raiseEvent()` runs handlers inline. Pipeline: validate → create → append → handle → persist. Events get `status: 'handled'` immediately (except `question:ask` which stays `new`).

**What Workshop 06 says should happen**:
`raiseEvent()` records only (validate → create → append → persist). A separate `handleEvents()` function processes events. Events stay `status: 'new'` after raise. CLI layer calls both: `raiseEvent()` then `handleEvents('cli', ...)`. Subscribers stamp events they process.

**What exists vs. what's needed**:

| Component | Exists Today | Workshop 06 Design |
|-----------|-------------|-------------------|
| `raiseEvent()` | Inline handlers | Record-only (no handlers) |
| `handleEvents()` | Does not exist | New function: scan + process + stamp |
| `stampEvent()` | Does not exist | Replaces `markHandled()` |
| `EventStamp` type | Does not exist | New type + schema |
| `stamps` field on NodeEvent | Does not exist | New optional field |
| `markHandled()` | Exists in event-handlers.ts | Replaced by `stampEvent()` |
| Handler map | Wired into raiseEvent | Passed to handleEvents |
| `VALID_FROM_STATES` | Status-based validation | Stays as-is (Workshop 06 says NO rewrite needed) |

**Remediation needed**: Yes — this is the central remediation task. Subtask 002 was designed for the old Workshop 05 approach (pure removal). Workshop 06 supersedes it with a more nuanced design. Subtask 002 must be rewritten or replaced.

---

### Drift D3: Subscriber Stamps Model

**Source**: Workshop 06
**Impact**: Phase 1 schema, Phase 4 handler pattern, Phase 5 wrappers, Phase 6 CLI, Phase 7 ONBAS
**Status**: UNRESOLVED — new concept not in original plan or spec

The subscriber stamps model (`stamps: Record<string, EventStamp>` on each event) is entirely new. It was not in the original spec, plan, or Phase 1 schemas.

**What needs to change**:
- `NodeEventSchema` gains optional `stamps` field
- `EventStampSchema` (new Zod schema)
- `EventStamp` (new TypeScript type)
- `stampEvent()` helper function (new, replaces `markHandled()`)
- `handleEvents()` stamps each processed event
- `markHandled()` deprecated/removed
- `event.status` / `handled_at` / `handler_notes` preserved for compat but stamps are primary

**Remediation needed**: Yes — schema extension + new helper + handler refactor. Can be folded into the Phase 5 work.

---

### Drift D4: New CLI Commands

**Source**: Workshop 07
**Impact**: Phase 6 (complete rewrite needed)
**Status**: UNRESOLVED — Phase 6 plan is obsolete

**Original Phase 6** (from plan) had 10 tasks covering 4 generic event commands and 3 shortcuts:
- `event list-types` (6.1)
- `event schema` (6.2)
- `event raise` (6.3)
- `event log` (6.4)
- `accept` shortcut (6.5)
- `end` shortcut update (6.6)
- `error` shortcut (6.7)
- Registration (6.8)
- CLI integration tests (6.9)
- Refactor/verify (6.10)

**Workshop 07** redesigns the CLI surface with agent-first JSON output:
- `raise-event` (different naming from `event raise`)
- `events` (combines list + detail, replaces `event log`)
- `stamp-event` (entirely new, not in original plan)
- `event list-types` and `event schema` are NOT in Workshop 07 (discovery commands unchanged)

**Key differences**:
- Agent-first design (`--json` primary, `--source agent` default)
- `stamp-event` is a new command not in the original plan
- `events` combines list and detail view via `--id` flag
- Two new service methods: `getNodeEvents()`, `stampNodeEvent()`
- Two new error codes: E196 (event not found), E197 (invalid JSON)

**Remediation needed**: Phase 6 task table must be rewritten from scratch when dossier'd.

---

### Drift D5: Service Method Additions

**Source**: Workshop 07
**Impact**: Phase 5 (interface changes), Phase 6 (CLI implementations)
**Status**: UNRESOLVED — new methods not in interface or plan

Two new methods proposed for `IPositionalGraphService`:
- `getNodeEvents(ctx, graphSlug, nodeId, filters?)` → `GetNodeEventsResult`
- `stampNodeEvent(ctx, graphSlug, nodeId, eventId, stamp)` → `StampNodeEventResult`

These are not in the original plan. They require:
- Interface additions
- Implementation in `positional-graph.service.ts`
- New result type definitions
- New error codes (E196, E197)

**Remediation needed**: Fold into Phase 5 or Phase 6 task tables.

---

### Drift D6: question:answer Handler Missing Starting Transition

**Source**: Workshop 06 (also DYK #1 from Phase 2)
**Impact**: Phase 4 handler code, Phase 5 T003
**Status**: UNRESOLVED — code bug / design gap

The `handleQuestionAnswer` handler (Phase 4) clears `pending_question_id` and marks events as handled, but does **NOT** transition `node.status` to `'starting'`. The service method `answerQuestion()` does this transition directly. When service wrappers delegate to raiseEvent, the handler must handle this transition.

Phase 5 T003 was designed to fix this. Workshop 06 confirms T003 is still needed but under the new stamps model.

**Remediation needed**: T003 stays, but its implementation depends on whether handlers run via inline raiseEvent or via handleEvents.

---

### Drift D7: Subtask 002 Superseded

**Source**: Workshop 06 explicitly
**Impact**: Phase 5 subtask structure
**Status**: MUST DELETE and replace

Workshop 06 states: "Subtask 002 is superseded with revised scope." The original Subtask 002 was designed around Workshop 05's pure raise-only model:
- ST001: Remove handler call from raiseEvent
- ST002: Update tests (event.status handled → new)
- ST003: Rewrite VALID_FROM_STATES to event-log-based validation
- ST004-ST007: Test/doc updates

Workshop 06 changes the scope:
- ST001: Still YES — remove handler call from raiseEvent (**but add handleEvents call in CLI layer**)
- ST002: Still YES — events stay `status: 'new'` after raiseEvent
- ST003: **NO** — VALID_FROM_STATES stays as-is because handleEvents runs between CLI commands
- ST004: **REVISED** — tests call raiseEvent + handleEvents, assert stamps
- Plus NEW tasks: create stampEvent, create handleEvents, add stamps to schema, refactor handlers

**Remediation needed**: Delete Subtask 002 dossier and flight plan. Create replacement subtask(s) based on Workshop 06 design.

---

### Drift D8: Spec Needs Multiple Updates

**Source**: Workshops 04, 05, 06, 07
**Impact**: Spec document accuracy
**Status**: UNRESOLVED

| AC | Current Text | Needed Change | Source |
|----|-------------|---------------|--------|
| AC-7 | Event acknowledged → ODS processes it | Add: stamps model, subscriber-aware processing | WS 06 |
| AC-8 | "Removed" | No change needed | -- |
| AC-10-14 | CLI commands described | Update command names and surface per WS 07 | WS 07 |
| AC-15 | "handler IS the implementation" | Rewrite: raiseEvent records, handleEvents processes | WS 06 |
| Workshop Opportunities | "No additional workshops needed" | Update: 7 workshops now exist | All |
| Non-Goals | No mention of stamps or handleEvents | Add context for new concepts | WS 06 |
| ADR-2 | "raiseEvent is the single write path, handler contains all state transition logic" | Revise: raiseEvent records, handleEvents applies transitions | WS 05, 06 |

**Remediation needed**: Spec update pass. Can be done as a subtask or inline with phase work.

---

## Assessment: Does Completed Work Need Remediation?

### Phase 1 (Event Types, Schemas, Registry): NO REMEDIATION NEEDED

The registry, schemas, payload types, error codes, event ID generator, and fakes are structurally sound. They are consumed by raiseEvent and will be consumed by handleEvents. No drift affects them.

**One forward task**: Add `EventStampSchema` and `stamps` field to `NodeEventSchema`. This is new work, not remediation — the existing schema is valid, it just needs extension.

### Phase 2 (State Schema + Two-Phase Handshake): NO REMEDIATION NEEDED

The status enum changes (`starting`, `agent-accepted`), the `events` optional array, the predicates (`isNodeActive`, `canNodeDoWork`), and the test fixture migrations are all sound. No workshop contradicts this work.

### Phase 3 (raiseEvent Core Write Path): NEEDS MODIFICATION

`raiseEvent()` currently runs handlers inline. Workshop 06 says it should be record-only. The function needs:
1. Remove the handler map and handler invocation (~7 lines)
2. Events stay `status: 'new'` (no handler to set `'handled'`)
3. `VALID_FROM_STATES` stays as-is (Workshop 06 confirms)
4. Update 1 test assertion (`event.status 'handled'` → `'new'`)

This is surgical — the validation pipeline, event creation, append, and persist are all correct. Only the handler wiring changes.

**Estimated scope**: ~20 lines of code change + ~15 lines of test change.

### Phase 4 (Event Handlers): PARTIAL REMEDIATION

The 6 handler functions themselves are correct and reusable. They will be called by `handleEvents()` instead of by `raiseEvent()`. But:

1. `markHandled()` → replaced by `stampEvent()` (handlers must use stamps instead)
2. `handleQuestionAnswer` must add `status → 'starting'` transition (T003)
3. E2E walkthrough tests (4 tests) need updating — they call raiseEvent and assert handler effects, but after raiseEvent becomes record-only, these tests must call `raiseEvent()` + `handleEvents()` sequentially

**The handler functions are fine** — they'll be refactored to use `stampEvent()` instead of `markHandled()`, but the state mutation logic in each handler is correct.

### Phase 5 (Service Method Wrappers): SIGNIFICANT RESTRUCTURE

Phase 5 is IN PROGRESS with only Subtask 001 complete. The remaining work needs restructuring:

- **Subtask 002**: DELETE — superseded by Workshop 06
- **T003**: KEEP but implementation changes (handlers use stamps, not markHandled)
- **T004-T006**: KEEP (contract tests) but scope changes — test raiseEvent (recording) and handleEvents (processing) separately
- **T007-T009**: KEEP (service wrappers) but implementation changes — wrappers call raiseEvent only, CLI layer calls handleEvents
- **T010-T011**: KEEP (regression + verify)
- **NEW tasks needed**: stamps schema, stampEvent helper, handleEvents function, handler refactor, CLI wiring

---

## Assessment: Do Future Phases Need Rewriting?

### Phase 6 (CLI Commands): YES — COMPLETE REWRITE

The original Phase 6 task table (10 tasks) is obsolete. Workshop 07 redesigns the CLI surface:
- Different command names (`raise-event` not `event raise`)
- New command (`stamp-event`)
- New service methods (`getNodeEvents`, `stampNodeEvent`)
- Agent-first JSON design
- New error codes (E196, E197)
- The `event list-types` and `event schema` discovery commands from the original plan are still valid but need Workshop 07 alignment

Phase 6 dossier has not been created yet, so there's nothing to delete — it just needs to be written from scratch incorporating Workshop 07.

### Phase 7 (ONBAS Adaptation): PARTIAL REWRITE

The core concept (ONBAS reads events for sub-state detection) is unchanged. But:
- ONBAS must understand stamps (Workshop 06: "ONBAS does NOT stamp — read-only advisory")
- Event status interpretation changes: `event.status` vs `event.stamps['cli']` vs `event.stamps['ods']`
- The sub-state detection logic (AC-16) may reference stamp presence rather than `event.status`

The 7 original tasks are still directionally correct but need scope adjustments. No dossier exists yet.

### Phase 8 (E2E Validation Script): PARTIAL REWRITE

The script concept is sound but must demonstrate:
- The raiseEvent/handleEvents separation
- Subscriber stamps
- The three new CLI commands (raise-event, events, stamp-event)
- Agent event discovery patterns from Workshop 07

The 13 original tasks are still directionally correct. No dossier exists yet.

---

## The Remediation Roadmap

### What to Delete

| Item | Location | Reason |
|------|----------|--------|
| Subtask 002 dossier | `tasks/phase-5-service-method-wrappers/002-subtask-remove-inline-handlers.md` | Superseded by Workshop 06 |
| Subtask 002 flight plan | `tasks/phase-5-service-method-wrappers/002-subtask-remove-inline-handlers.fltplan.md` | Superseded by Workshop 06 |

### What to Create (New Subtask)

A new subtask replaces Subtask 002 with Workshop 06's design. Scope:

**Subtask 002-revised: raiseEvent/handleEvents Separation + Subscriber Stamps**

1. Add `EventStampSchema` and `stamps` field to `NodeEventSchema` (Phase 1 schema extension)
2. Create `stampEvent()` helper function (replaces `markHandled()`)
3. Create `handleEvents()` function (new — node-scoped, subscriber-aware)
4. Refactor handlers: `markHandled()` → `stampEvent()` + add `starting` transition to `handleQuestionAnswer`
5. Remove handler invocation from `raiseEvent()` (record-only)
6. Update raiseEvent tests (events stay `new`)
7. Update E2E walkthrough tests (call raiseEvent + handleEvents)
8. Update spec AC-15 and other drifted ACs
9. Update Phase 5 parent dossier
10. Verify all tests pass (`just fft`)

### What to Update (Existing Documents)

| Document | Updates Needed |
|----------|---------------|
| **Spec** (node-event-system-spec.md) | AC-7 stamps, AC-10-14 CLI commands, AC-15 separation, Workshop Opportunities, ADR-2 |
| **Plan** (node-event-system-plan.md) | Phase 5 description, Phase 6 description, Subtasks Registry (002 → 002-revised), Finding 03 already updated |
| **Phase 5 dossier** (tasks.md) | T003-T011 scope adjustments, new tasks for stamps/handleEvents, architecture map |
| **Phase 5 flight plan** (tasks.fltplan.md) | Regenerate after dossier changes |

### Phases 6-8: Write When Reached

No pre-work needed for Phases 6-8. Their dossiers haven't been created yet. When we reach them, they'll be written incorporating all workshop findings. The plan-level phase descriptions should be updated, but the detailed task tables wait for `/plan-5-phase-tasks-and-brief`.

---

## Recommended Execution Order

```
Step 1: Delete Subtask 002 files
        ├── 002-subtask-remove-inline-handlers.md
        └── 002-subtask-remove-inline-handlers.fltplan.md

Step 2: Update Subtasks Registry in plan.md
        └── Mark Subtask 002 as "[—] Superseded by Workshop 06"

Step 3: Create replacement subtask via /plan-5
        └── Subtask covering raiseEvent/handleEvents separation + stamps

Step 4: Execute the new subtask via /plan-6
        ├── Schema extension (EventStamp, stamps field)
        ├── stampEvent() + handleEvents() creation
        ├── Handler refactor (markHandled → stampEvent, T003 fix)
        ├── raiseEvent record-only refactor
        ├── Test updates
        └── just fft verification

Step 5: Resume Phase 5 parent tasks (T004-T011)
        ├── Contract tests (T004-T006)
        ├── Service wrapper refactor (T007-T009)
        └── Regression + verify (T010-T011)

Step 6: Update spec (AC drift)
        └── Can be done as inline subtask during Step 4 or 5

Step 7: Update plan phase descriptions (6-8)
        └── Quick text updates to reflect workshop findings

Step 8: Proceed to Phase 6 (dossier via /plan-5)
```

---

## Decision: How Much to Do Before Resuming Implementation

Three options for remediation scope:

### Option A: Minimal — Just Fix the Blocker (Recommended)

Delete Subtask 002. Create a new subtask scoped to the Workshop 06 separation + stamps. Execute it. Resume Phase 5 parent tasks. Fix spec ACs inline as we go.

**Pro**: Fastest path to resuming implementation. Workshop 06 design is solid.
**Con**: Spec and plan text drift until we circle back.
**Scope**: ~1 subtask creation + execution.

### Option B: Full Alignment — Fix Everything First

Update spec, plan, Phase 5 dossier, Phase 5 flight plan, plan phase descriptions for 6-8, then create and execute the new subtask.

**Pro**: All documents aligned before any code changes.
**Con**: Significant documentation churn before code moves forward. Some updates (Phase 6-8 details) are premature.
**Scope**: ~4-6 document updates + 1 subtask creation + execution.

### Option C: Spec-First — Update Spec, Then Fix Code

Update the spec to reflect all workshop findings. Then create and execute the new subtask with the updated spec as the source of truth.

**Pro**: Spec becomes accurate before code changes, preventing further drift.
**Con**: More upfront work than Option A, but spec updates are relatively quick.
**Scope**: 1 spec update + 1 subtask creation + execution.

**Recommendation**: Option A. The workshops ARE the design documents. The spec can be updated incrementally as each task completes. The blocker is Subtask 002 being superseded — fix that and implementation resumes.

---

## Impact on Completed Code (Phase 3-4)

### Phase 3 Code Changes (raise-event.ts)

Changes needed in the new subtask:

```typescript
// BEFORE (current — 173 lines)
// Lines ~140-165: handler map creation + handler invocation
const EVENT_HANDLERS = createEventHandlers();
// ... after append ...
const handler = EVENT_HANDLERS.get(eventType);
if (handler) {
  handler(state, nodeId, event);
}

// AFTER (Workshop 06 — ~160 lines)
// Remove EVENT_HANDLERS import and usage entirely
// Events stay status: 'new' after creation
// Remove handler invocation block
// persist state with event appended but no handler effects
```

### Phase 4 Code Changes (event-handlers.ts)

The handler functions themselves stay. Changes:

```typescript
// BEFORE: markHandled(event)
function markHandled(event: NodeEvent): void {
  event.status = 'handled';
  event.handled_at = new Date().toISOString();
}

// AFTER: stampEvent(event, subscriber, action, data?)
// markHandled deleted. Each handler calls stampEvent instead.
// handleQuestionAnswer gains: state.nodes[nodeId].status = 'starting'
```

### Test Changes

| Test File | Changes |
|-----------|---------|
| `raise-event.test.ts` | 1 assertion: `event.status 'handled'` → `'new'` for node:accepted success test. Remove `handled_at` assertion. |
| `event-handlers.test.ts` | E2E walkthrough tests (4): call `raiseEvent()` then `handleEvents()`. Assert stamps instead of `event.status === 'handled'`. Standalone handler tests (23): unchanged (they call handlers directly). |

---

## Open Questions

### Q1: Should stampEvent and handleEvents live in the 032 feature folder?

**RESOLVED**: Yes. They are part of the node event system feature. `handleEvents` is exported from the barrel alongside `raiseEvent`. Both are pure functions with injected deps.

### Q2: Should the new subtask be numbered 002-revised or 003?

**OPEN**: Two naming options:
- `002-subtask-raisevent-handleevents-separation` (replaces old 002)
- `003-subtask-raisevent-handleevents-separation` (next sequential)

Recommendation: Use `002` since the old 002 is being deleted, not preserved alongside.

### Q3: Should Phase 5 parent tasks T004-T009 be re-dossier'd?

**OPEN**: The scope changes for T004-T009 are significant enough that the task descriptions need updating. Options:
- Option A: Update tasks.md inline (edit existing rows)
- Option B: Create a new subtask specifically for the scope changes
- Recommendation: Option A — the Phase 5 dossier already exists, just update the descriptions.

### Q4: When to update the spec?

**OPEN**: Options:
- During the new subtask execution (spec updates as ST tasks)
- After Phase 5 completes (batch spec update)
- Before any code changes (spec-first)
- Recommendation: During subtask execution. Include 1-2 STs for spec updates.

---

## Summary

**Good news**: Phases 1-4 are structurally sound. The core event system (schemas, registry, raiseEvent, handlers) works correctly. The drift is architectural (where handlers run, how events are stamped) not foundational (what events are, how they're validated, what state transitions they perform).

**Bad news**: Subtask 002 is obsolete and must be replaced. The raiseEvent/handleEvents separation is a significant architectural change that touches Phase 3 code, Phase 4 handlers, and all of Phase 5's remaining tasks. Phases 6-8 plan descriptions are stale.

**The path forward**:
1. Delete Subtask 002
2. Create a replacement subtask based on Workshop 06
3. Execute it (schema + stampEvent + handleEvents + handler refactor + raiseEvent simplification)
4. Resume Phase 5 parent tasks (T004-T011)
5. Update spec ACs inline
6. Proceed to Phase 6 with Workshop 07 as the design guide
