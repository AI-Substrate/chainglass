# Workshop: Question ID Migration — Two Systems, One Transition

**Type**: Integration Pattern
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-07
**Status**: Draft

**Related Documents**:
- [Workshop 02: Event Schema and Storage](./02-event-schema-and-storage.md) — §Question Lifecycle, §Backward Compat
- [Phase 5 Tasks](../tasks/phase-5-service-method-wrappers/tasks.md) — T005–T009

---

## Purpose

Clarify the exact mechanics of how question IDs change when Phase 5 refactors `askQuestion()` and `answerQuestion()` to delegate through the event system. Two question ID systems exist in parallel today — this workshop traces the migration path and identifies what breaks, what's safe, and what the wrappers must handle.

## Key Questions Addressed

- What happens to in-flight questions (asked before migration, answered after)?
- Which consumers assume a specific question ID format?
- How does the `answerQuestion()` wrapper map between the caller's `questionId` parameter and the event system's `question_event_id`?
- Does `getAnswer()` still work after migration?

---

## The Two Systems

Today, the codebase has two parallel question identity systems:

### Legacy System (Plan 028, live in `positional-graph.service.ts`)

```
askQuestion() → generateQuestionId() → "2026-02-07T10:02:00.000Z_a3f7b2"
                                              ↓
                              state.questions[].question_id
                              node.pending_question_id
```

- **Generator**: `generateQuestionId()` at service line 1940
- **Format**: `YYYY-MM-DDTHH:mm:ss.sssZ_xxxxxx` (ISO timestamp + 6-char hex)
- **Storage**: `state.questions[]` array (graph-level), `pending_question_id` (node-level)
- **Lookup**: `state.questions.find(q => q.question_id === questionId)`

### Event System (Plan 032, live in `features/032-node-event-system/`)

```
raiseEvent('question:ask', payload, 'agent') → generateEventId() → "evt_18d5a3d2000_c1a9"
                                                        ↓
                                        node.events[].event_id
                                        node.pending_question_id (derived)
```

- **Generator**: `generateEventId()` in event-schemas
- **Format**: `evt_<hex_timestamp>_<hex_random>`
- **Storage**: `node.events[]` array (node-level), `pending_question_id` (derived by `deriveBackwardCompatFields`)
- **Lookup**: `node.events.find(e => e.event_id === question_event_id)`

### The Critical Difference

| Aspect | Legacy | Event System |
|--------|--------|-------------|
| Question ID source | `generateQuestionId()` | `generateEventId()` — the event_id IS the question ID |
| ID format | `2026-02-07T10:02:00.000Z_a3f7b2` | `evt_18d5a3d2000_c1a9` |
| `pending_question_id` contains | Legacy question_id | Ask event's event_id |
| Answer lookup key | `question_id` in `state.questions[]` | `question_event_id` in event payload |
| Question data lives in | `state.questions[]` (graph-level array) | Event payload + derived `state.questions[]` |

---

## After Phase 5: What Changes

When Phase 5 is complete, the three service methods delegate to `raiseEvent()`:

```
askQuestion(ctx, graphSlug, nodeId, options)
    → raiseEvent(deps, graphSlug, nodeId, 'question:ask', {type, text, ...}, 'agent')
    → returns { questionId: event.event_id, status: 'waiting-question' }
                              ↑
                   THIS is now "evt_..." format, not ISO timestamp
```

```
answerQuestion(ctx, graphSlug, nodeId, questionId, answer)
    → raiseEvent(deps, graphSlug, nodeId, 'question:answer',
                 { question_event_id: questionId, answer }, 'human')
    → returns { questionId, status: 'starting' }
                              ↑
                   Caller passes the question_event_id they got from askQuestion
```

The key insight: **the `questionId` parameter in `answerQuestion()` IS a `question_event_id`** in the new world. The caller gets an `evt_...` ID from `askQuestion()` and passes it back to `answerQuestion()`. No translation needed — the ID just changed format.

---

## Consumer Impact Analysis

### Who uses question IDs?

| Consumer | File | Action | Format Assumed? |
|----------|------|--------|-----------------|
| `askQuestion()` | service.ts:1974 | GENERATES | Will generate `evt_...` after refactor |
| `answerQuestion()` | service.ts:2056 | LOOKS UP by ID | Currently searches `state.questions[]`; will pass to `raiseEvent` |
| `getAnswer()` | service.ts:2114 | LOOKS UP by ID | Searches `state.questions[]` — still works if `questions[]` is derived |
| CLI `node ask` | command.ts:866 | DISPLAYS | No format assumption — shows whatever is returned |
| CLI `node answer` | command.ts:914 | PASSES from user | No format assumption — accepts any string |
| CLI `node get-answer` | command.ts:945 | PASSES from user | No format assumption — accepts any string |
| ONBAS | onbas.ts:119 | READS `pendingQuestionId` | No format assumption — opaque string match |
| Reality Builder | reality.builder.ts:79 | MAPS `question_id` → `questionId` | No format assumption — passthrough |
| Orchestration Requests | orchestration-request.schema.ts:50,63 | CARRIES `questionId` | `z.string().min(1)` — any non-empty string |
| Zod schemas | state.schema.ts:42 | VALIDATES | `z.string().min(1)` — any non-empty string |
| Unit test assertion | question-answer.test.ts:114 | VALIDATES format | **YES — regex expects ISO timestamp format** |

### Verdict

**Production code**: Zero format assumptions. All schemas use `z.string().min(1)`. All consumers treat question IDs as opaque strings. The format change is safe.

**Test code**: One test at `question-answer.test.ts:114` asserts the ISO timestamp regex pattern. This test must be updated in T010 (regression).

---

## The In-Flight Question Scenario

### Can a question asked before migration be answered after migration?

**Scenario**: An agent calls `askQuestion()` BEFORE Phase 5 deployment. The question gets a legacy ID like `2026-02-07T10:02:00.000Z_a3f7b2`. Later, the code is updated to Phase 5. A human tries to answer with `answerQuestion(ctx, graph, node, '2026-02-07T10:02:00.000Z_a3f7b2', 'React')`.

**What happens in the new code path**:

1. `answerQuestion()` wrapper constructs: `{ question_event_id: '2026-02-07T10:02:00.000Z_a3f7b2', answer: 'React' }`
2. Calls `raiseEvent(deps, graph, node, 'question:answer', payload, 'human')`
3. raiseEvent Step 5 searches `node.events[]` for a `question:ask` event with `event_id === '2026-02-07T10:02:00.000Z_a3f7b2'`
4. **No such event exists** — the question was created via the legacy path and lives only in `state.questions[]`, not in the event log
5. Returns **E194: Question event not found**

### Is this a problem?

**No — because it cannot happen in practice.** Here's why:

The migration happens at deploy time (code update), not at runtime. There is no "hot swap" where some calls go through the old path and some through the new. The service is a single process. When the code is updated:

- All NEW questions go through `raiseEvent('question:ask')` → get `evt_...` IDs → stored in event log
- All EXISTING questions in `state.questions[]` were already answered or are stale

But to be rigorous: **what if a question IS pending when the code is deployed?**

This is the one edge case. A node is in `waiting-question` with `pending_question_id = '2026-02-07T..._a3f7b2'`, and `state.questions[]` has the unanswered question. The human runs `cg wf node answer <graph> <node> '2026-02-07T..._a3f7b2' 'React'`.

**Resolution**: This is an accepted limitation. The workaround is:

1. Answer all pending questions before deploying Phase 5, OR
2. Accept that pending legacy questions must be re-asked after migration

This is a single-user CLI tool, not a production service with live traffic. The migration path is: finish pending Q&A, deploy, continue.

---

## getAnswer() After Migration

### Current `getAnswer()` implementation (service.ts:2100-2140):

```typescript
async getAnswer(ctx, graphSlug, nodeId, questionId): Promise<GetAnswerResult> {
  const state = await this.loadState(ctx, graphSlug);
  const question = state.questions?.find(q => q.question_id === questionId);
  if (!question) return questionNotFoundError(questionId);
  return { questionId, answered: !!question.answer, answer: question.answer };
}
```

### After Phase 5:

`getAnswer()` is NOT being refactored in Phase 5 (it's a read-only method, not a write path). It reads from `state.questions[]`.

After migration, `state.questions[]` is a **derived projection** computed by `deriveBackwardCompatFields()`. The derived `questions[]` uses the ask event's `event_id` as its `question_id` field (per Workshop 02 line 440-446).

So: `getAnswer('evt_18d5a3d2000_c1a9')` → finds the derived question entry → works correctly.

**No changes needed to `getAnswer()`.** It reads from `state.questions[]` which is kept in sync by the derivation layer.

---

## The Wrapper Implementations (Pseudocode)

### askQuestion wrapper

```typescript
async askQuestion(ctx, graphSlug, nodeId, options: AskQuestionOptions) {
  // Pre-check: verify node exists (better error message than raiseEvent's generic E193)
  await this.loadNodeConfig(ctx, graphSlug, nodeId);

  const deps = this.createRaiseEventDeps(ctx);
  const result = await raiseEvent(deps, graphSlug, nodeId, 'question:ask', {
    type: options.type,
    text: options.text,
    options: options.options,    // optional
    default: options.default,    // optional
  }, 'agent');

  if (!result.ok) return { errors: result.errors };

  return {
    nodeId,
    questionId: result.event!.event_id,   // ← event_id IS the new question ID
    status: 'waiting-question' as const,
  };
}
```

### answerQuestion wrapper

```typescript
async answerQuestion(ctx, graphSlug, nodeId, questionId, answer) {
  // Pre-check: verify node exists
  await this.loadNodeConfig(ctx, graphSlug, nodeId);

  const deps = this.createRaiseEventDeps(ctx);
  const result = await raiseEvent(deps, graphSlug, nodeId, 'question:answer', {
    question_event_id: questionId,  // ← caller's questionId IS the event_id
    answer,
  }, 'human');

  if (!result.ok) return { errors: result.errors };

  return {
    nodeId,
    questionId,
    status: 'starting' as const,
  };
}
```

The mapping is direct: `questionId` parameter → `question_event_id` field. No translation layer. No format conversion. The caller got an `evt_...` ID from `askQuestion()` and passes it back.

---

## Open Questions

### Q1: Should we handle legacy pending questions gracefully?

**RESOLVED**: No. This is a CLI development tool, not a production service. Migration path: answer pending questions before deploying. If a stale question exists, the user re-asks it. The error message (E194: "Question event not found") is clear enough.

### Q2: Does the question ID format regex in tests need updating?

**RESOLVED**: Yes. `test/unit/positional-graph/question-answer.test.ts:114` has:
```typescript
expect(result.questionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f0-9]+$/);
```
This must change to match `evt_<hex>_<hex>` format in T010 (regression tests). However, this test may be testing the OLD `askQuestion()` method directly — if so, it will naturally break when the method is refactored and should be updated to expect the new format.

### Q3: Does ONBAS need changes?

**RESOLVED**: Not in Phase 5. ONBAS reads `pending_question_id` from the node state entry. After Phase 5, this field is derived by `deriveBackwardCompatFields()` and contains an `evt_...` ID instead of an ISO timestamp ID. But ONBAS treats it as an opaque string for matching against `questions[].question_id` — and the derived `questions[]` uses the same `evt_...` ID. The match still works.

### Q4: What about `surfaced_at` in the Question schema?

**RESOLVED**: In the legacy system, `surfaced_at` is set by ODS when it surfaces a question. In the event system, `acknowledged_at` on the `question:ask` event serves this role. The `deriveBackwardCompatFields()` questions[] reconstruction (T001-T002) should map `acknowledged_at` → `surfaced_at` in the derived Question object. This is a detail for T002 implementation.

---

## Summary: What Phase 5 Must Do

1. **`askQuestion()` wrapper** returns `event.event_id` as `questionId` — no translation needed
2. **`answerQuestion()` wrapper** passes `questionId` as `question_event_id` — no translation needed
3. **`getAnswer()`** is untouched — reads from derived `state.questions[]` which uses `event_id` as `question_id`
4. **One test** at `question-answer.test.ts:114` needs its format regex updated
5. **In-flight legacy questions** are accepted breakage (answer before deploy)
6. **All production consumers** treat question IDs as opaque strings — safe

The complexity I originally flagged (DYK #1 insight about identifier mismatch) resolves cleanly: there IS no mismatch. The caller gets an `evt_...` ID and passes it back. The event system validates it against its own event log. The derived `questions[]` array uses the same ID. Everything lines up.
