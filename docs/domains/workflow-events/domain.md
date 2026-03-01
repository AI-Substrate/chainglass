# Domain: Workflow Events

**Slug**: `workflow-events`
**Type**: business
**Status**: active
**Created By**: Plan 061 — WorkflowEvents First-Class Convenience Domain

---

## Boundary

**Purpose**: Intent-based convenience API for workflow event interactions. Wraps the generic event system (Plan 032) so callers express business intent (ask question, answer question, report progress) without understanding the underlying event machinery (raiseEvent pipeline, handler stamping, state transitions, 3-event handshakes).

**Owns**:
- `IWorkflowEvents` interface — the convenience contract
- `WorkflowEventsService` implementation — wraps PositionalGraphService
- `FakeWorkflowEventsService` — self-contained test double with inspection methods
- `WorkflowEventType` typed constants — replaces magic event strings
- Convenience types: `QuestionInput`, `AnswerInput`, `AnswerResult`, `ProgressInput`, `ErrorInput`
- Observer event types: `QuestionAskedEvent`, `QuestionAnsweredEvent`, `ProgressEvent`, `WorkflowEvent`
- Server-side observer registry: `onQuestionAsked`, `onQuestionAnswered`, `onProgress`, `onEvent`

**Excludes**:
- Generic event infrastructure (raiseEvent, handleEvents, NodeEventRegistry — owned by `_platform/positional-graph`)
- Event type definitions and Zod schemas (owned by `_platform/positional-graph`)
- CLI command definitions (consumer layer — delegates to WorkflowEvents)
- Web server actions (consumer layer — delegates to WorkflowEvents)
- Orchestration logic (ONBAS/ODS — owned by `_platform/positional-graph`)

---

## Contracts

| Contract | Type | Location | Consumers |
|----------|------|----------|-----------|
| `IWorkflowEvents` | interface | `packages/shared/src/interfaces/workflow-events.interface.ts` | CLI handlers, web server actions, test helpers, agents bridge |
| `WorkflowEventType` | constants | `packages/shared/src/workflow-events/constants.ts` | All consumers replacing magic event strings |
| `QuestionInput` | type | `packages/shared/src/workflow-events/types.ts` | CLI, web, tests |
| `AnswerInput` | type | `packages/shared/src/workflow-events/types.ts` | CLI, web, tests |
| `AnswerResult` | type | `packages/shared/src/workflow-events/types.ts` | CLI, web, tests |
| `FakeWorkflowEventsService` | fake | `packages/shared/src/fakes/fake-workflow-events.ts` | All test consumers |
| `WORKFLOW_EVENTS_SERVICE` | DI token | `packages/shared/src/di-tokens.ts` | DI container registration |

---

## Composition

| Component | Type | Location | Role |
|-----------|------|----------|------|
| `IWorkflowEvents` | interface | `packages/shared/src/interfaces/` | Public contract — 5 actions + 4 observers |
| `WorkflowEventType` | constants | `packages/shared/src/workflow-events/` | Typed event type constants |
| convenience types | types | `packages/shared/src/workflow-events/` | Input/output/observer event types |
| `FakeWorkflowEventsService` | fake | `packages/shared/src/fakes/` | Test double with inspection methods |
| `WorkflowEventsService` | service | `packages/positional-graph/src/workflow-events/` | Implementation (Phase 2) |

---

## Dependencies

### This Domain Depends On

| Domain | Contract Used | Why |
|--------|-------------|-----|
| `_platform/positional-graph` | `IPositionalGraphService` (askQuestion, answerQuestion, getAnswer, raiseNodeEvent) | Implementation wraps PGService methods |
| `_platform/events` | `ICentralEventNotifier` | Emit observer events via SSE for client visibility |

### Domains That Depend On This

| Domain | Contract Consumed | Why |
|--------|------------------|-----|
| `agents` | `IWorkflowEvents.onQuestionAsked`, `onProgress` | AgentWorkUnitBridge subscribes to track work unit status |
| `workflow-ui` | `IWorkflowEvents.answerQuestion` | Web server action delegates QnA |
| `_platform/positional-graph` | `IWorkflowEvents` (CLI handlers) | CLI commands delegate to WorkflowEvents |

---

## Source Locations

```
packages/shared/src/
  interfaces/workflow-events.interface.ts    # IWorkflowEvents contract
  workflow-events/
    constants.ts                              # WorkflowEventType
    types.ts                                  # Input/output/observer types
    index.ts                                  # Barrel exports
  fakes/fake-workflow-events.ts              # FakeWorkflowEventsService
  di-tokens.ts                               # WORKFLOW_EVENTS_SERVICE token

packages/positional-graph/src/
  workflow-events/                            # Phase 2: implementation
    workflow-events.service.ts
    index.ts

docs/domains/workflow-events/
  domain.md                                   # This file
```

---

## Concepts

### Asking Questions

Agents ask questions when they need human input. The `askQuestion` method encapsulates raising a `question:ask` event, running handlers (node transitions to `waiting-question`), and persisting.

```ts
const { questionId } = await wfEvents.askQuestion('my-graph', 'node-1', {
  type: 'confirm',
  text: 'Deploy to production?',
});
```

### Answering Questions (3-Event Handshake)

Answering a question requires two events: `question:answer` (records the answer) and `node:restart` (restarts the node so the agent can retrieve the answer). `answerQuestion` handles both in a single call.

```ts
await wfEvents.answerQuestion('my-graph', 'node-1', questionId, {
  confirmed: true,
});
```

### Observing Workflow Events

Server-side observers let other domains react to workflow events without coupling to the event infrastructure. Returns an unsubscribe function.

```ts
const unsub = wfEvents.onQuestionAsked('my-graph', (event) => {
  console.log(`Node ${event.nodeId} asked: ${event.question.text}`);
});
// Later: unsub() to stop listening
```

### Typed Event Constants

Replace magic strings with typed constants for all 7 core event types.

```ts
import { WorkflowEventType } from '@chainglass/shared/workflow-events';
// WorkflowEventType.QuestionAsk === 'question:ask'
// WorkflowEventType.NodeRestart === 'node:restart'
```

---

## History

| Plan | Change | Date |
|------|--------|------|
| Plan 061 Phase 1 | Created domain: IWorkflowEvents, WorkflowEventType, convenience types, FakeWorkflowEventsService, DI token | 2026-03-01 |
