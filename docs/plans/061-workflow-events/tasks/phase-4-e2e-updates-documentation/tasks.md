# Phase 4: E2E Test Updates and Documentation — Task Dossier

**Plan**: [workflow-events-plan.md](../../workflow-events-plan.md)
**Spec**: [workflow-events-spec.md](../../workflow-events-spec.md)
**Phase**: Phase 4 — E2E Test Updates and Documentation
**Domain**: workflow-events
**Status**: Ready

---

## Executive Briefing

**Purpose**: Replace magic event strings with `WorkflowEventType` typed constants across all consumer code (E2E tests, scripts, CLI, web, helpers). Write the integration guide. Final regression check. This phase is the "polish" — the system works, now we make it consistent and documented.

**What We're Building**: No new functionality. We're replacing `'question:ask'` → `WorkflowEventType.QuestionAsk` everywhere outside positional-graph internals, writing `docs/how/workflow-events-integration.md`, and verifying everything still passes.

**Goals**:
- Replace magic event strings with WorkflowEventType constants in all consumer code
- Write integration guide for consuming domains
- Final regression: all tests pass

**Non-Goals**:
- Replacing strings inside positional-graph core event system (those are the canonical definitions)
- Adding new functionality
- Migrating completeUserInputNode/clearErrorAndRestart (non-Q&A lifecycle — stay on PGService)

---

## Prior Phase Context

### Phases 1-3 Summary

**Delivered**:
- IWorkflowEvents interface, WorkflowEventType constants, convenience types (Phase 1)
- WorkflowEventsService, observer registry, contract tests (Phase 2)
- CLI/web/helper migration, WorkflowEventError, PGService Q&A deletion, QnA integration tests (Phase 3)

**Available for Phase 4**:
- `WorkflowEventType.QuestionAsk`, `.QuestionAnswer`, `.NodeRestart`, `.NodeAccepted`, `.NodeCompleted`, `.NodeError`, `.ProgressUpdate` — import from `@chainglass/shared/workflow-events`
- `WorkflowEventError` — structured error class
- All consumers already delegate Q&A to WorkflowEventsService

**Test baseline**: 334 files, 4722 tests, 0 failures

---

## Pre-Implementation Check

### Magic strings to replace (consumer code only)

| File | String | Line(s) | Context |
|------|--------|---------|---------|
| `apps/web/app/actions/workflow-actions.ts` | `'node:accepted'` | ~520+ | submitUserInput action |
| `apps/web/app/actions/workflow-actions.ts` | `'node:restart'` | ~580+ | resetUserInput action |
| `apps/cli/src/commands/positional-graph.command.ts` | `'node:accepted'` | event handler section | raiseNodeEvent calls |
| `dev/test-graphs/shared/helpers.ts` | `'node:restart'` | clearErrorAndRestart | raiseNodeEvent call |
| `dev/test-graphs/shared/helpers.ts` | `'node:accepted'` | completeUserInputNode | raiseNodeEvent call |
| `test/e2e/positional-graph-orchestration-e2e.ts` | `'question:ask'`, `'question:answer'` | event filtering | CLI-based, may be in grep/filter strings |
| `test/e2e/node-event-system-visual-e2e.ts` | `'question:ask'`, `'progress:update'`, `'node:accepted'`, `'question:answer'`, `'node:restart'` | Multiple | Event type assertions and filters |
| `test/integration/orchestration-drive.test.ts` | `'question:ask'` | ~402 | Event type filtering |

### Files that should NOT change

| File | Why |
|------|-----|
| `packages/positional-graph/src/features/032-node-event-system/*` | Core event definitions — the canonical source of truth |
| `packages/positional-graph/src/services/positional-graph.service.ts` | Internal implementation |
| Unit tests for event system features | Test the internal event infrastructure |

---

## Architecture Map

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff

    subgraph Phase4["Phase 4: E2E Updates + Docs"]
        T001["T001: Replace magic strings<br/>in web actions"]:::pending
        T002["T002: Replace magic strings<br/>in CLI command"]:::pending
        T003["T003: Replace magic strings<br/>in test helpers"]:::pending
        T004["T004: Replace magic strings<br/>in E2E tests"]:::pending
        T005["T005: Replace magic strings<br/>in integration tests"]:::pending
        T006["T006: Write integration guide"]:::pending
        T007["T007: Grep verification pass"]:::pending
        T008["T008: Final regression check"]:::pending

        T001 --> T007
        T002 --> T007
        T003 --> T007
        T004 --> T007
        T005 --> T007
        T006 --> T008
        T007 --> T008
    end
```

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Replace magic event strings in web actions with WorkflowEventType constants. `submitUserInput` uses `'node:accepted'`, `resetUserInput` uses `'node:restart'`. | workflow-ui | `apps/web/app/actions/workflow-actions.ts` | No magic event strings in file; imports WorkflowEventType | AC-06 |
| [x] | T002 | Replace magic event strings in CLI command with WorkflowEventType constants. Various handlers use `'node:accepted'` etc. in raiseNodeEvent calls. | _platform/positional-graph | `apps/cli/src/commands/positional-graph.command.ts` | No magic event strings in file; imports WorkflowEventType | AC-06 |
| [x] | T003 | Replace magic event strings in test helpers. `completeUserInputNode` uses `'node:accepted'`, `clearErrorAndRestart` uses `'node:restart'`. | workflow-events | `dev/test-graphs/shared/helpers.ts` | No magic event strings in file | AC-06 |
| [x] | T004 | E2E tests reviewed — all magic strings are CLI subprocess args. No programmatic usage to replace. Kept as strings per DYK-P4-01. | workflow-events | `test/e2e/positional-graph-orchestration-e2e.ts`, `test/e2e/node-event-system-visual-e2e.ts`, `test/e2e/positional-graph-execution-e2e.test.ts` | Correctly identified as CLI args; no changes needed | AC-13 |
| [x] | T005 | Replace magic event strings in integration tests. `orchestration-drive.test.ts` filter + `inspect-cli.test.ts` raiseNodeEvent calls. | workflow-events | `test/integration/orchestration-drive.test.ts`, `test/integration/positional-graph/features/040-graph-inspect/inspect-cli.test.ts` | No magic event strings in programmatic usage | AC-13 |
| [x] | T006 | Write `docs/how/workflow-events-integration.md`. Covers: asking questions, answering (3-event handshake), getting answers, reporting progress/errors, observing events, typed constants reference, migration guide from PGService, error handling with WorkflowEventError. | workflow-events | `docs/how/workflow-events-integration.md` | Guide exists with all sections; code examples use WorkflowEventType constants | AC-17 docs |
| [x] | T007 | Grep verification: zero consumer hits outside positional-graph internals, event-handler-service integration tests (DYK-P4-03), and E2E CLI subprocess args (DYK-P4-01). | workflow-events | Codebase-wide | Grep returns 0 consumer hits | AC-06 verification |
| [x] | T008 | Final regression: `pnpm test` — 338 files pass, 4783 tests, 0 failures. Baseline matches post-merge reality (DYK-P4-05). | workflow-events | — | 338 files, 4783 tests, 0 failures | AC-16 |

---

## Context Brief

### Key Findings

- **E2E tests are CLI-driven**: Many magic strings are in CLI subprocess args (`runCli(['wf', 'node', 'event', 'raise', graphSlug, nodeId, 'question:ask', ...])`). These are string arguments to CLI commands — they MUST stay as plain strings (the CLI parses them). Only replace programmatic TypeScript usage.
- **node-event-system-visual-e2e.ts is the densest**: 890 lines, multiple magic string types. Needs careful review of which are programmatic vs CLI args.
- **drive-demo.ts and test-advanced-pipeline.ts**: Use helpers only (no magic strings themselves). Already exercise WorkflowEvents through migrated helpers. No changes needed.
- **orchestration-drive.test.ts**: One `'question:ask'` string in event filtering (line ~402) — replace with constant.

### What to replace vs keep

| Replace | Keep (string stays) |
|---------|-------------------|
| `service.raiseNodeEvent(ctx, graph, node, 'node:accepted', ...)` | `runCli(['wf', 'node', 'event', 'raise', graph, node, 'question:ask', ...])` |
| `events.find(e => e.event_type === 'question:ask')` | String literals in CLI command construction |
| `if (type === 'node:restart')` | Comments and documentation |

### Patterns to Follow

```typescript
// BEFORE
await service.raiseNodeEvent(ctx, graph, node, 'node:accepted', {}, 'agent');

// AFTER
import { WorkflowEventType } from '@chainglass/shared/workflow-events';
await service.raiseNodeEvent(ctx, graph, node, WorkflowEventType.NodeAccepted, {}, 'agent');
```

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-03-01 | T004 | DYK | Most E2E magic strings are CLI subprocess args — no type safety gained from replacing | Only replace programmatic TypeScript usage (filters, assertions). CLI args stay as strings. | DYK-P4-01 |
| 2026-03-01 | T006 | DYK | Integration guide is the only task that unblocks other developers | Write guide first, string cleanup second | DYK-P4-02 |
| 2026-03-01 | T007 | DYK | event-handler-service.integration.test.ts tests infra, not consumer — 10+ strings are in-scope for grep but out-of-scope for replacement | Exclude from grep verification scope | DYK-P4-03 |
| 2026-03-01 | ALL | DYK | 8 tasks for 3 units of work — collapse to guide + string cleanup + regression | 3 real tasks: (A) guide, (B) programmatic string cleanup, (C) regression | DYK-P4-04 |
| 2026-03-01 | T008 | DYK | Test baseline stale after merge (4722 → 4783) | Update to 338 files, 4783 tests | DYK-P4-05 |
| 2026-03-01 | T004 | DYK | Save grep results as manifest, hand-pick changes, review diff before committing | No blind find-and-replace — user directive | DYK-P4-06 |

---

## Directory Layout

```
docs/plans/061-workflow-events/
  └── tasks/
      ├── phase-1-interface-types-constants/ ✅
      ├── phase-2-implementation-contract-tests/ ✅
      ├── phase-3-consumer-migration/ ✅
      └── phase-4-e2e-updates-documentation/
          ├── tasks.md              ← this file
          ├── tasks.fltplan.md      ← flight plan
          └── execution.log.md     # created by plan-6
```
