# Workshop: Do We Need Backward Compatibility?

**Type**: Integration Pattern
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-07
**Status**: Draft

**Related Documents**:
- [Workshop 02: Event Schema and Storage](./02-event-schema-and-storage.md) — §Backward Compatibility
- [Phase 5 Tasks](../tasks/phase-5-service-method-wrappers/tasks.md) — T001-T002 (questions[] derivation)
- [Phase 4 Tasks](../tasks/phase-4-event-handlers-and-state-transitions/tasks.md) — deriveBackwardCompatFields

---

## Purpose

Challenge the assumption that `deriveBackwardCompatFields()` and the `questions[]` derivation layer are necessary. If nothing has shipped to real users, the "backward compatibility" framing may be adding unnecessary complexity.

## Key Questions Addressed

- Is there any shipped, production-used feature that depends on `state.questions[]`?
- Is there any shipped feature that depends on `pending_question_id` or `error` as fields?
- Can we simplify Phase 5 by dropping the compat derivation layer entirely?
- What's the minimal set of fields we actually need?

---

## What's Actually Shipped?

| Feature | Code Exists? | Wired to CLI? | Used in Production? | Depends On |
|---------|-------------|---------------|--------------------|----|
| ONBAS | Yes (Plan 030 Phase 5) | No | No | `pending_question_id`, `reality.questions` |
| ODS | No (Plan 030 Phase 6 BLOCKED) | No | No | Will consume ONBAS output |
| askQuestion() | Yes | Yes (`cg wf node ask`) | No evidence | Writes `state.questions[]` |
| answerQuestion() | Yes | Yes (`cg wf node answer`) | No evidence | Reads/writes `state.questions[]` |
| getAnswer() | Yes | Yes (`cg wf node get-answer`) | No evidence | Reads `state.questions[]` |
| deriveBackwardCompatFields() | Yes (Plan 032 Phase 4) | Via raiseEvent() | No (Plan 032 in progress) | — |
| Event system (raiseEvent) | Yes (Plan 032 Phases 1-4) | No | No (Plan 032 in progress) | — |

**Nothing has shipped to real users.** The entire orchestration stack (Plans 030 + 032) is in development. ONBAS is implemented and tested but not wired to any production entry point. ODS doesn't exist yet. The CLI question commands work but there's no evidence of real usage — no state.json files with question data.

---

## The Compat Layer: What It Does and Why It Exists

`deriveBackwardCompatFields(state, nodeId)` currently:
1. Derives `pending_question_id` from the event log (latest unanswered `question:ask`)
2. Derives `error` from the event log (latest `node:error` payload)
3. Does NOT yet derive `questions[]` (deferred to Phase 5 T001-T002)

The spec (AC-15) says:
> "Backward-compat fields (pending_question_id, error, top-level questions[]) are derived projections computed from the event log after each raise."

This framing assumes there are existing consumers that read these fields and can't be changed. But:

### Who reads `pending_question_id`?

| Consumer | File | Status |
|----------|------|--------|
| ONBAS | onbas.ts:118 | IMPLEMENTED, not shipped |
| Reality Builder | reality.builder.ts:67 | IMPLEMENTED, not shipped |
| FakeONBAS | fake-onbas.ts:100,140 | Test infrastructure |

**ONBAS is the only real consumer**, and it hasn't shipped. We can change ONBAS to read events directly.

### Who reads `state.questions[]`?

| Consumer | File | Status |
|----------|------|--------|
| getAnswer() | service.ts:2114 | WIRED to CLI, not used |
| Reality Builder | reality.builder.ts:78-91 | Not shipped |
| ONBAS (via reality) | onbas.ts:119 | Not shipped |

**getAnswer() is the only consumer that touches the CLI surface**, and it's never been used with real data. We can change it to read from events.

### Who reads `node.error`?

| Consumer | File | Status |
|----------|------|--------|
| Reality Builder | reality.builder.ts (implied) | Not shipped |
| Some web UI display | apps/web/* | Not shipped |

Same story. Not shipped.

---

## Three Options

### Option A: Keep the Compat Layer (Current Plan)

Maintain `deriveBackwardCompatFields()`. Extend it for `questions[]` in T001-T002. All consumers keep reading the old fields. Events are the write path, derived fields are the read path.

**Pros**: No changes to ONBAS, reality builder, getAnswer(), or tests
**Cons**: Maintaining a projection layer for zero real users. Two representations of the same data. The "derive" function must be called after every event and must cover every edge case.

**Complexity**: T001-T002 add questions[] derivation (graph-wide scan), T003 updates handler, T004-T011 as planned. 11 tasks.

### Option B: Drop `questions[]` Derivation, Keep `pending_question_id` and `error`

Don't build `state.questions[]` from events. `getAnswer()` reads from node events directly. ONBAS keeps reading `pending_question_id` (already derived by Phase 4 handler + compat). `error` stays derived.

**Pros**: Eliminates T001-T002. `getAnswer()` refactored to read events (small change).
**Cons**: Still maintaining partial compat layer. `pending_question_id` and `error` are still derived projections.

**Complexity**: Remove T001-T002, add small getAnswer refactor to T010. 9 tasks.

### Option C: Drop the Entire Compat Layer

Delete `deriveBackwardCompatFields()`. Event handlers set `pending_question_id` and `error` directly (they already do — handlers write these fields before compat derivation re-derives them). Drop `state.questions[]` entirely. `getAnswer()` reads from events. ONBAS reads `pending_question_id` (still set by handlers). Reality builder updated if needed.

**Wait — the handlers already write `pending_question_id`?**

Let's check:
- `handleQuestionAsk` (event-handlers.ts:50): `nodes[nodeId].pending_question_id = _event.event_id` — **YES, handler writes it directly**
- `handleQuestionAnswer` (event-handlers.ts:69): `nodes[nodeId].pending_question_id = undefined` — **YES, handler clears it directly**
- `handleNodeError` (event-handlers.ts:39-42): sets `entry.error = { code, message, details }` — **YES, handler writes error directly**

Then `deriveBackwardCompatFields()` runs and **overwrites** these with re-derived values from the event log. For `pending_question_id`, the derived value should be identical to what the handler just wrote. For `error`, same.

**The compat derivation layer is redundant with what the handlers already do.** It's a belt-and-suspenders approach: handlers write the fields, then derivation re-derives them to "make sure." If we trust the handlers (and we test them), derivation is unnecessary.

**Pros**: Eliminates T001-T002. Eliminates `deriveBackwardCompatFields()` entirely. Simpler mental model: handlers write all fields, no separate derivation pass. `getAnswer()` refactored to read events.
**Cons**: Lose the "replay from events" guarantee (can't reconstruct state from events alone without re-running handlers). Need to update raise-event.ts to remove the compat call. Need to update/remove Phase 4 compat tests.

**Complexity**: Remove T001-T002. Remove compat derivation call from raiseEvent. Update getAnswer(). Update/remove compat tests. Net reduction in tasks.

---

## Analysis

### The "replay from events" argument

The spec says events should be the source of truth. `deriveBackwardCompatFields()` embodies this — you can reconstruct node state from the event log alone. But:

1. We don't have a replay mechanism
2. We don't need one (no production data to replay)
3. The handlers already produce correct state
4. If we ever need replay, we can build it then

### The `questions[]` array specifically

In the event world, question data lives in event payloads:
- `question:ask` payload has `{ type, text, options, default }`
- `question:answer` payload has `{ question_event_id, answer }`
- `asked_at` = event's `created_at`
- `answered_at` = answer event's `created_at`
- `surfaced_at` = ask event's `acknowledged_at`

Reconstructing `questions[]` means scanning ALL nodes' events, pairing asks with answers, and building Question objects. This is O(nodes * events) on every event raise. For a field that nothing reads in production.

### What ONBAS actually needs

ONBAS reads:
1. `node.pendingQuestionId` — to find which question is pending (handler already writes this)
2. `reality.questions.find(q => q.questionId === node.pendingQuestionId)` — to get question details

For #2, ONBAS needs question details (type, text, options) to build the orchestration request. Currently it gets this from `state.questions[]` via the reality builder.

If we drop `state.questions[]`, ONBAS would need to read from the node's events instead. But ONBAS hasn't shipped and will be adapted in Phase 7 anyway. We could:
- Have the reality builder read question details from `question:ask` events instead of `state.questions[]`
- Or defer this to Phase 7 when ONBAS gets its event-aware adaptation

---

## Recommendation

**Option C with a pragmatic twist**: Drop `deriveBackwardCompatFields()` from the raiseEvent pipeline. Keep `pending_question_id` and `error` as handler-written fields (they already are). Don't build `state.questions[]` from events.

For `getAnswer()` and ONBAS question details: these consumers need question data. Two sub-options:

**C1: Refactor getAnswer() now, defer ONBAS to Phase 7**
- `getAnswer()` searches node events for the `question:ask` event with matching event_id, then finds matching `question:answer` event
- ONBAS question detail reading deferred to Phase 7 (already planned)
- `state.questions[]` becomes dead — not written, not read

**C2: Keep questions[] as a handler-written field (not derived)**
- `handleQuestionAsk` writes to `state.questions[]` directly (in addition to setting pending_question_id)
- `handleQuestionAnswer` updates the answer in `state.questions[]` directly
- No derivation pass — handlers do the work
- getAnswer() and ONBAS continue reading `state.questions[]` unchanged
- Simplest migration path

---

## Open Questions

### Q1: Should we keep deriveBackwardCompatFields() as a safety net?

**OPEN**: Depends on whether we value "events are source of truth" (Option A) or "handlers write correct state" (Option C).

### Q2: Is Option C2 (handlers write questions[]) simpler than C1 (read from events)?

**OPEN**: C2 is fewer changes but means `state.questions[]` is handler-maintained rather than event-derived. C1 is cleaner (events are the only storage) but requires refactoring getAnswer() and reality builder.

### Q3: Does this affect the spec's AC-15?

**OPEN**: AC-15 says "backward-compat fields are derived projections." If we switch to handler-written fields, the spec should be updated to reflect reality.
