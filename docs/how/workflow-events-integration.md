# WorkflowEvents Integration Guide

How to use the WorkflowEvents convenience API for Q&A, progress reporting, error handling, and event observation.

## Overview

`IWorkflowEvents` wraps the generic event system (Plan 032) so you express intent — "ask a question", "answer a question" — instead of orchestrating raw event primitives. One method call replaces multi-step handshakes.

```typescript
import type { IWorkflowEvents } from '@chainglass/shared';
import { WorkflowEventType } from '@chainglass/shared/workflow-events';
```

## Asking Questions

Agents ask questions when they need human input. The node transitions to `waiting-question`.

```typescript
const { questionId } = await wfEvents.askQuestion(graphSlug, nodeId, {
  type: 'confirm',       // 'text' | 'single' | 'multi' | 'confirm'
  text: 'Deploy to production?',
  options: ['yes', 'no'], // for single/multi only
});
```

The `questionId` is returned for later answer retrieval. Internally this raises a `question:ask` event, runs handlers (node transitions), and persists to `state.questions[]`.

## Answering Questions

Answering encapsulates the 3-event handshake: `question:answer` + `node:restart` in a single call. The node resumes execution automatically.

```typescript
await wfEvents.answerQuestion(graphSlug, nodeId, questionId, true);
```

The `answer` parameter is `unknown` — pass whatever the question type expects (boolean for confirm, string for text, string for single, string[] for multi).

If the answer succeeds but the restart fails, a `WorkflowEventError` is thrown with the restart errors. The answer is still recorded.

## Getting Answers

Retrieve a previously asked question's answer. Returns `null` if the question doesn't exist or hasn't been answered yet.

```typescript
const result = await wfEvents.getAnswer(graphSlug, nodeId, questionId);
if (result) {
  console.log(result.answered);   // true
  console.log(result.answer);     // the answer value
  console.log(result.answeredAt); // ISO timestamp
}
```

## Reporting Progress

Informational only — no state change. Raises a `progress:update` event.

```typescript
await wfEvents.reportProgress(graphSlug, nodeId, {
  message: 'Processing file 3 of 10',
  percent: 30, // optional, 0-100
});
```

## Reporting Errors

Raises a `node:error` event. Node transitions to `blocked-error`.

```typescript
await wfEvents.reportError(graphSlug, nodeId, {
  code: 'E_TIMEOUT',
  message: 'API call timed out after 30s',
  details: { endpoint: '/api/deploy' },  // optional, unknown type
  recoverable: true,                      // optional
});
```

## Observing Events

Server-side observer hooks let other domains react to workflow events without coupling to the event infrastructure. Returns an unsubscribe function.

```typescript
// Question asked — fires when any node enters waiting-question
const unsub = wfEvents.onQuestionAsked(graphSlug, (event) => {
  console.log(`Node ${event.nodeId} asked: ${event.question.text}`);
  // event: { graphSlug, nodeId, questionId, question, askedAt, source }
});

// Question answered
wfEvents.onQuestionAnswered(graphSlug, (event) => {
  // event: { graphSlug, nodeId, questionId, answer, answeredAt }
});

// Progress
wfEvents.onProgress(graphSlug, (event) => {
  // event: { graphSlug, nodeId, message, percent? }
});

// Generic (any event)
wfEvents.onEvent(graphSlug, (event) => {
  // event: { graphSlug, nodeId, eventType, payload, source, timestamp }
});

// Stop listening
unsub();
```

Observer error isolation: if one handler throws, others still fire.

## Error Handling

`WorkflowEventsService` throws `WorkflowEventError` on failure. This preserves structured error information for CLI JSON output and web action responses.

```typescript
import { WorkflowEventError } from '@chainglass/shared/workflow-events';

try {
  await wfEvents.askQuestion(graphSlug, nodeId, question);
} catch (error) {
  if (error instanceof WorkflowEventError) {
    // Structured errors: error.errors is ResultError[]
    // Each has: { code, message, action?, path?, details? }
    console.log(error.errors);
  }
}
```

## Typed Constants

Replace magic strings with typed constants for all 7 core event types:

```typescript
import { WorkflowEventType } from '@chainglass/shared/workflow-events';

WorkflowEventType.QuestionAsk      // 'question:ask'
WorkflowEventType.QuestionAnswer   // 'question:answer'
WorkflowEventType.NodeRestart      // 'node:restart'
WorkflowEventType.NodeAccepted     // 'node:accepted'
WorkflowEventType.NodeCompleted    // 'node:completed'
WorkflowEventType.NodeError        // 'node:error'
WorkflowEventType.ProgressUpdate   // 'progress:update'
```

Use these in programmatic TypeScript code (event filtering, assertions, raiseNodeEvent calls). CLI subprocess arguments stay as plain strings.

## Creating WorkflowEventsService

The service needs a PGService, a context resolver, and an observer registry. In consumer code (CLI, web, tests), construct per-request:

```typescript
import { WorkflowEventsService, WorkflowEventObserverRegistry } from '@chainglass/positional-graph';

const wfEvents = new WorkflowEventsService(
  pgService,
  (graphSlug) => ctx,  // WorkspaceContextResolver
  new WorkflowEventObserverRegistry()
);
```

For DI-based resolution (future server-side consumers like agents bridge):

```typescript
import { POSITIONAL_GRAPH_DI_TOKENS } from '@chainglass/shared';
const wfEvents = container.resolve<IWorkflowEvents>(
  POSITIONAL_GRAPH_DI_TOKENS.WORKFLOW_EVENTS_SERVICE
);
```

## Migration from PGService

| Before (PGService) | After (WorkflowEvents) |
|---|---|
| `service.askQuestion(ctx, graph, node, options)` | `wfEvents.askQuestion(graph, node, question)` |
| `service.answerQuestion(ctx, graph, node, qId, answer)` + `service.raiseNodeEvent(ctx, graph, node, 'node:restart', ...)` | `wfEvents.answerQuestion(graph, node, qId, answer)` |
| `service.getAnswer(ctx, graph, node, qId)` | `wfEvents.getAnswer(graph, node, qId)` |
| Returns `{ errors: [] }` | Throws `WorkflowEventError` |
| `'question:ask'` string literal | `WorkflowEventType.QuestionAsk` |

Key differences:
- **No ctx parameter** — resolved internally by the service
- **Throws on error** — use try/catch instead of checking `result.errors.length`
- **answerQuestion includes restart** — single call does both events
- **getAnswer returns null** — not `{ answered: false, errors: [] }`
