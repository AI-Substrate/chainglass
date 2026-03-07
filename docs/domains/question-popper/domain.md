# Domain: Question Popper (`question-popper`)

| Field | Value |
|-------|-------|
| **Slug** | `question-popper` |
| **Type** | business |
| **Created By** | Plan 067 — Event Popper |
| **Status** | active |

## Purpose

First-class question-and-answer experience built on top of Event Popper infrastructure. Any CLI tool, AI agent, or script can ask questions through the Chainglass web UI and receive answers. Includes fire-and-forget alerts as a second event type.

## Boundary

### Owns

- Question, answer, clarification, and alert payload schemas (Zod `.strict()`)
- Composed types (`QuestionIn`, `QuestionOut`, `AlertIn`, `AlertOut`, `StoredQuestion`, `StoredAlert`)
- `IQuestionPopperService` interface and `FakeQuestionPopperService` test double
- `QuestionPopperService` real implementation (disk persistence + SSE emission)
- Question lifecycle: pending → answered | needs-clarification | dismissed
- Alert lifecycle: unread → acknowledged
- DI registration (`WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE`)

### Does NOT Own

- Generic envelope schemas (`EventPopperRequest`/`EventPopperResponse` — owned by `_platform/external-events`)
- Event ID generation (`generateEventId` — owned by `_platform/external-events`)
- SSE infrastructure (`ICentralEventNotifier` — owned by `_platform/events`)
- Port discovery, localhost guard, tmux detection (owned by `_platform/external-events`)
- CLI commands (Phase 4 — not yet implemented)
- API routes (Phase 3 — not yet implemented)
- UI components (Phase 5 — not yet implemented)

## Composition

| Component | Role | Depends On |
|-----------|------|------------|
| `QuestionPayloadSchema` | Validate inbound question payloads | Zod |
| `AnswerPayloadSchema` | Validate answer responses | Zod |
| `ClarificationPayloadSchema` | Validate clarification requests | Zod |
| `AlertPayloadSchema` | Validate alert payloads | Zod |
| `IQuestionPopperService` | Service contract for question/alert lifecycle | Shared types |
| `FakeQuestionPopperService` | In-memory test double | `IQuestionPopperService` |
| `QuestionPopperService` | Real implementation with disk persistence + SSE | `ICentralEventNotifier`, `generateEventId`, `node:fs` |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Ask a question | `IQuestionPopperService.askQuestion()` | Stores a question on disk, emits SSE with outstanding count. Returns question ID for polling. |
| Answer a question | `IQuestionPopperService.answerQuestion()` | Records answer with atomic write (first-write-wins), decrements count, emits SSE. |
| Send an alert | `IQuestionPopperService.sendAlert()` | Fire-and-forget one-way notification. Stored on disk, increments outstanding count, emits SSE. |
| Track outstanding items | `IQuestionPopperService.getOutstandingCount()` | In-memory counter of unanswered questions + unread alerts. Rehydrated from disk on construction. |

## Contracts

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `QuestionPayloadSchema` | Zod schema | API routes, CLI | Validates question payloads (4 types: text, single, multi, confirm) |
| `AnswerPayloadSchema` | Zod schema | API routes, UI | Validates answer responses (string, boolean, string[] + freeform text) |
| `ClarificationPayloadSchema` | Zod schema | API routes, UI | Validates clarification requests |
| `AlertPayloadSchema` | Zod schema | API routes, CLI | Validates alert payloads |
| `IQuestionPopperService` | Interface | API routes, DI | Full lifecycle service contract |
| `FakeQuestionPopperService` | Class | Tests | In-memory test double with inspection helpers |
| `QuestionIn` | TypeScript type | CLI, API routes | Ergonomic input type for asking questions |
| `QuestionOut` | TypeScript type | CLI, API routes | Ergonomic output type for reading questions |
| `AlertIn` | TypeScript type | CLI, API routes | Ergonomic input type for sending alerts |
| `StoredQuestion` / `StoredAlert` | TypeScript types | Service internals | On-disk record types |
| `QuestionStatus` / `AlertStatus` | TypeScript types | All consumers | Status enum types |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/external-events` | `EventPopperRequest`, `EventPopperResponse`, `generateEventId()` | Envelope format for disk persistence, ID generation |
| `_platform/events` | `ICentralEventNotifier`, `WorkspaceDomain.EventPopper` | SSE emission on lifecycle events |

### Domains That Depend On This

| Domain | Contract Consumed | Why |
|--------|------------------|-----|
| (none yet) | — | API routes and CLI will consume in Phase 3-4 |

## Source Location

```
packages/shared/src/question-popper/
  ├── schemas.ts          # QuestionPayload, AnswerPayload, ClarificationPayload, AlertPayload
  ├── types.ts            # QuestionIn, QuestionOut, AlertIn, StoredQuestion, StoredAlert
  └── index.ts            # Barrel exports

packages/shared/src/interfaces/
  └── question-popper.interface.ts  # IQuestionPopperService

packages/shared/src/fakes/
  └── fake-question-popper.ts       # FakeQuestionPopperService

apps/web/src/features/067-question-popper/
  └── lib/
      └── question-popper.service.ts  # QuestionPopperService (real)

test/contracts/
  ├── question-popper.contract.ts       # Contract test definitions (12 tests)
  └── question-popper.contract.test.ts  # Runner (fake + real + 5 SSE companions)
```

## History

| Plan | Change | Date |
|------|--------|------|
| 067 Phase 2 | Domain created: payload schemas, composed types, service interface, fake, real service, contract tests, DI registration, barrel exports | 2026-03-07 |
