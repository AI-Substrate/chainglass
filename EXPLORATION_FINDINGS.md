# Question Popper Feature: Documentation & Historical Context

**Project**: Chainglass at `/Users/jordanknight/substrate/067-question-popper`
**Date Gathered**: March 7, 2026
**Plan**: 067-question-popper (empty directory — PRE-PLANNING PHASE)

---

## DE-01: Unified Human Input (Plan 054) — DIRECTLY RELEVANT

**Status**: ✅ COMPLETE (all 15 ACs green, all 3 phases complete)

**What It Is**: Enables user-input nodes in the workflow editor to collect data from humans. Each user-input node asks ONE question and produces ONE output. Users compose multiple questions by placing multiple nodes on a line.

**Key Insights for Question Popper**:
- **Single-question design is governing pattern** (Workshop 010) — NOT multi-field forms
- **User-input nodes display with violet `?` badge** and "Awaiting Input" status when ready
- **Clicking a ready node opens Human Input modal** — pre-populated from `unit.yaml` config
- **4 question types supported**: text input, single-choice (radio), multi-choice (checkbox), confirm (yes/no)
- **Always-on freeform text area** alongside structured input for user notes
- **Server action walks node lifecycle**: `startNode` → `accept` → `saveOutputData` → `endNode`
- **Data flows downstream** via existing input resolution system (`collateInputs`)

**Files Created**:
- `apps/web/src/features/050-workflow-page/components/human-input-modal.tsx` — new modal component
- `apps/web/src/features/050-workflow-page/lib/display-status.ts` — status computation helper
- Server actions in `apps/web/app/actions/workflow-actions.ts`

**Tests Added**: 17 new tests (display-status, modal rendering, lifecycle, multi-node composition)

**References**:
- Spec: `docs/plans/054-unified-human-input/unified-human-input-spec.md`
- Plan: `docs/plans/054-unified-human-input/unified-human-input-plan.md`
- Workshops: 011 (discriminated types), 012 (output name flow), 013 (re-edit UX)

---

## DE-02: WorkflowEvents Domain (Plan 061) — CRITICAL FOUNDATION

**Status**: ✅ COMPLETE (spec + implementation plan exist; DRAFT implementation plan)

**What It Is**: First-class convenience API wrapping the generic event system (Plan 032). Developers express intent ("ask question", "answer question") instead of orchestrating raw event primitives (3-event handshakes, handler stamping, state transitions).

**Key Interfaces for Question Popper**:
- `IWorkflowEvents` interface with methods: `askQuestion`, `answerQuestion`, `getAnswer`, `reportProgress`, `reportError`
- **Server-side observers**: `onQuestionAsked`, `onQuestionAnswered`, `onProgress`, `onEvent`
- `WorkflowEventType` typed constants (replaces magic strings like `'question:ask'`)
- `FakeWorkflowEventsService` for testing

**Critical Pattern: 3-Event QnA Handshake**:
```typescript
// OLD: Manual handshake (error-prone)
await pgService.askQuestion(ctx, graph, node, options);
await pgService.raiseNodeEvent(ctx, graph, node, 'question:answer', payload);
await pgService.raiseNodeEvent(ctx, graph, node, 'node:restart', {reason: '...'});

// NEW: Single call via WorkflowEvents
await wfEvents.answerQuestion(graphSlug, nodeId, questionId, answer);
```

**Observer Pattern Example**:
```typescript
// Observer fires when question is asked
const unsub = wfEvents.onQuestionAsked(graphSlug, (event) => {
  console.log(`Node ${event.nodeId} asked: ${event.question.text}`);
});
```

**Question Popper Integration Points**:
- Use `WorkflowEvents` for all Q&A operations (not raw PGService)
- Subscribe to question-asked/question-answered events for modal state management
- Use typed constants instead of magic strings

**Files Structure**:
- Interface: `packages/shared/src/interfaces/workflow-events.interface.ts`
- Types & constants: `packages/shared/src/workflow-events/`
- Implementation: `packages/positional-graph/src/workflow-events/`
- Fake: `packages/shared/src/fakes/fake-workflow-events.ts`

**References**:
- Spec: `docs/plans/061-workflow-events/workflow-events-spec.md`
- Plan: `docs/plans/061-workflow-events/workflow-events-plan.md`
- Integration Guide: `docs/how/workflow-events-integration.md`
- Research Dossier: `docs/plans/061-workflow-events/research-dossier.md` (78 findings, 9 subagents)

---

## DE-03: Global Toast System (Plan 042) — USER FEEDBACK

**Status**: ✅ COMPLETE

**What It Is**: Global toast notification system using Sonner library. Any component can call `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()` with zero setup.

**Key Features**:
- **No setup required** — works from any component/hook/utility function
- **Auto-dismiss** after ~4 seconds (configurable)
- **Stacking** — multiple toasts visible simultaneously
- **Dark mode** support (follows system theme)
- **Built-in icons** per type (check, X, warning, info)
- **Manual dismiss** via close button

**Question Popper Integration**:
- Show success toast after submitting user input: `toast.success('Input saved')`
- Show error toast if submission fails: `toast.error('Failed to save input')`
- Show info toast for validation hints: `toast.info('Required field')`

**Usage Example**:
```typescript
import { toast } from 'sonner';

// In any component, hook, or utility
toast.success('Question answered successfully');
```

**Files Modified**:
- `apps/web/src/components/providers.tsx` — Toaster component mounted
- Consumer components wire toast calls on success/error

**References**:
- Spec: `docs/plans/042-global-toast-system/global-toast-system-spec.md`
- Plan: `docs/plans/042-global-toast-system/global-toast-system-plan.md`

---

## DE-04: Global State System (Plan 053) — EPHEMERAL RUNTIME STATE

**Status**: ✅ COMPLETE (spec + implementation finished)

**What It Is**: Centralized, ephemeral runtime state registry. Domains publish values (workflow status, alert counts, active files) to named paths. Any consumer subscribes by path or pattern without coupling to the publisher.

**Path Syntax**:
```
domain:property                  // singleton domain
domain:instanceId:property       // multi-instance (one per workflow/file)
workflow:main:status             // e.g., "idle", "running", "complete"
worktree:my-slug:changed-files   // 0, 1, 2, ...
```

**Subscription Patterns**:
```typescript
// Exact path
useGlobalState<string>('workflow:main:status', 'idle')

// Wildcard — any instance
useGlobalStateList('workflow:*:status')  // [{path, value, updatedAt}, ...]
```

**Question Popper Integration**:
- Publish modal open/closed state: `globalState.publish('modal:question:open', true)`
- Publish current question being answered: `globalState.publish('modal:question:current', {...})`
- Subscribe from toolbar to show "answering question" badge: `useGlobalState('modal:question:open', false)`

**DX Pattern** (mirrors SDK settings):
```typescript
'use client';
import { useGlobalState } from '@/lib/state';

export function QuestionBadge() {
  const isOpen = useGlobalState<boolean>('modal:question:open', false);
  return isOpen ? <span>🔵 Answering...</span> : null;
}
```

**Architecture**:
- In-memory Map-based store
- No npm dependencies (uses React 19 `useSyncExternalStore`)
- Error isolation (one observer error doesn't crash others)
- Pattern-matching subscriptions

**References**:
- Spec: `docs/plans/053-global-state-system/global-state-system-spec.md`
- Plan: `docs/plans/053-global-state-system/global-state-system-plan.md`
- How-To: `docs/how/global-state-system.md`
- Workshops: 001 (hierarchical addressing), 002 (developer experience)

---

## DE-05: Central Domain Event Notification Architecture (ADR-0010)

**Status**: ✅ ACCEPTED (foundational architecture)

**What It Is**: Three-layer architecture for domain event notifications: Filesystem Layer (file watcher) → Domain Adapter Layer (domain-specific translation) → Notification Hub (SSE broadcast).

**Why Important for Question Popper**:
- Events from workflow execution flow through this system to reach the browser
- When agents ask questions, events propagate via `CentralEventNotifier` → SSE
- Question Popper modal subscribes to SSE events for real-time updates
- New "question-asked" domain event would follow this same pattern

**Three-Layer Pattern**:
1. **Filesystem/Source Layer**: Events originate (e.g., state.json change, agent Q&A event)
2. **Domain Adapter Layer**: `DomainEventAdapter<TEvent>` translates raw events → domain concepts
3. **Notification Hub Layer**: `CentralEventNotifier` broadcasts via `ISSEBroadcaster`

**SSE Channel Pattern**:
```typescript
// One SSE channel per domain (matches domain name)
WorkspaceDomain.Workgraphs = 'workgraphs'   // → /api/events/workgraphs
WorkspaceDomain.Agents = 'agents'           // → /api/events/agents
WorkspaceDomain.Questions? = 'questions'    // could be → /api/events/questions
```

**Question Popper Could Add**:
- New domain: `WorkspaceDomain.Questions = 'questions'`
- New adapter: `QuestionDomainEventAdapter` for question asked/answered/completed events
- Real-time browser updates via SSE

**References**:
- ADR-0010: `docs/adr/adr-0010-central-domain-event-notification-architecture.md`
- How-To Guides: `docs/how/dev/central-events/` (1-overview, 2-usage, 3-adapters, 4-testing)

---

## DE-06: SSE Single-Channel Event Routing (ADR-0007)

**Status**: ✅ ACCEPTED (proven pattern)

**What It Is**: One global SSE connection per domain (e.g., `/api/events/questions`). All events include identifiers (sessionId, graphSlug, nodeId) for client-side routing. No per-session channels.

**Why Important for Question Popper**:
- Modal state updates must route to the correct workflow instance
- SSE callbacks identify target via `graphSlug` + `nodeId` in payload
- Browser can have multiple workflows open; events must route correctly

**Pattern**:
```typescript
// Server: Every event includes routing identifiers
SSE payload: { type: 'question:asked', graphSlug: 'my-workflow', nodeId: '123', ... }

// Client: Route by identifier, not active tab
onQuestionAsked((event) => {
  updateWorkflow(event.graphSlug, event.nodeId, 'question-ready');
});
```

**Benefits**:
- Single connection regardless of workflow count
- Scales to 100+ concurrent workflows
- No browser connection limits hit
- Simpler client routing logic

**References**:
- ADR-0007: `docs/adr/adr-0007-sse-single-channel-routing.md`

---

## DE-07: Node Event System & Workflow Events (Plan 032)

**Status**: ✅ COMPLETE (underlying event infrastructure)

**What It Is**: Generic, schema-validated, registry-based event system that powers workflow orchestration. Provides 7 core event types via Zod schemas and handler pipelines.

**7 Core Event Types**:
```typescript
WorkflowEventType.QuestionAsk      // 'question:ask'      — node asks for input
WorkflowEventType.QuestionAnswer   // 'question:answer'   — human provides answer
WorkflowEventType.NodeRestart      // 'node:restart'      — restart node after answer
WorkflowEventType.NodeAccepted     // 'node:accepted'     — node accepted by orchestrator
WorkflowEventType.NodeCompleted    // 'node:completed'    — node finished
WorkflowEventType.NodeError        // 'node:error'        — node hit error
WorkflowEventType.ProgressUpdate   // 'progress:update'   — informational progress
```

**Handler Pipeline** (5-step validation):
1. Event raised
2. Zod schema validation
3. VALID_FROM_STATES map check (can this event fire from current state?)
4. Handler function execution (update node state)
5. Stamping (mark event with timestamp, handler info)

**Key Learning for Question Popper**:
- Never raise raw events; use `WorkflowEvents` convenience API (Plan 061)
- Payload fields must match Zod schemas exactly: `percent` not `percentage`
- `question:answer` + `node:restart` is a 2-event handshake (both needed for restart)

**Orchestration Integration**:
- **ONBAS** (the orchestrator) listens to events, makes decisions based on node state
- **ODS** (orchestration drive service) executes node lifecycle
- Events trigger state transitions (pending → ready → running → complete)

**References**:
- Plan 032: `docs/plans/032-node-event-system/` (research dossier, spec, plan)
- Workflow events integration: `docs/how/workflow-events-integration.md`

---

## DE-08: Discriminated Union Type Architecture (Workshop 011 via Plan 054)

**Status**: ✅ ESTABLISHED PATTERN

**What It Is**: Type-safe pattern for modeling variants (user-input vs agent vs code nodes) using TypeScript discriminated unions.

**Example**:
```typescript
// Discriminated union: common base + variants
type NodeStatusResult = 
  | { unitType: 'user-input'; userInput: UserInputConfig; ... }
  | { unitType: 'agent'; agentOutput?: string; ... }
  | { unitType: 'code'; codeOutput?: string; ... };

// Type guard
function isUserInputNodeStatus(s: NodeStatusResult): s is UserInputNodeStatus {
  return s.unitType === 'user-input';
}

// Usage
if (isUserInputNodeStatus(status)) {
  console.log(status.userInput.questionType);  // ✅ type-safe
}
```

**Question Popper Relevance**:
- Modal should type-guard to `UserInputNodeStatus` to safely access `userInput` config
- Prevents runtime errors from accessing missing fields on wrong node types

**References**:
- Workshop 011: `docs/plans/054-unified-human-input/workshops/011-discriminated-type-architecture.md`
- Implemented in: `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts`

---

## DE-09: Testing Strategy & Fakes (Established Pattern)

**Status**: ✅ PROVEN APPROACH

**Core Philosophy**: "Avoid mocks entirely — use real data + Fake test doubles only"

**Pattern**:
```typescript
// ❌ DON'T: Mock the service
const pgService = mock<IPositionalGraphService>();
pgService.getNodeStatus.mockResolvedValue({...});

// ✅ DO: Use real filesystem + Fake service
const fakeGraphService = new FakePositionalGraphService();
await fakeGraphService.saveOutputData({...});
assert(fakeGraphService.saved);
```

**Fake Test Double Pattern**:
```typescript
export class FakeWorkflowEventsService implements IWorkflowEvents {
  askedQuestions: QuestionAskedEvent[] = [];
  answers: Map<string, Answer> = new Map();

  async askQuestion(...) { /* record in array */ }
  getAskedQuestions() { return this.askedQuestions; }  // inspection method
}
```

**Question Popper Testing**:
- Use `FakePositionalGraphService` for node status/lifecycle tests
- Use `FakeWorkflowEventsService` for Q&A flow tests
- Use real filesystem fixtures for integration tests
- TDD for service-layer logic, lightweight for UI rendering

**Test Structure**:
- `test/unit/` — isolated logic, fakes
- `test/integration/` — multiple services, real filesystem
- `test/e2e/` — full workflows, real server

**References**:
- Pattern: `docs/how/dev/fast-feedback-loops.md`
- Plan 054 testing strategy: `docs/plans/054-unified-human-input/unified-human-input-spec.md` § Testing Strategy

---

## DE-10: Configuration & Project Structure

**Status**: ✅ ESTABLISHED

**Key Files & Directories**:
- **`.chainglass/` root config**: Contains all persistent state, configuration, workflows
  - `units/` — workflow unit definitions (each has `unit.yaml` with configuration)
  - `workflows/` — workflow templates and instances
  - `data/` — persisted node data, state.json per instance
  - `auth.yaml` — allowed GitHub users

- **`docs/` structure**:
  - `adr/` — architecture decision records (13 adopted ADRs)
  - `domains/` — domain documentation with boundaries, contracts, composition
  - `how/` — how-to guides, integration patterns, developer guides
  - `plans/` — 65+ completed/in-progress feature plans
  - `interfaces/` — shared type documentation

- **`packages/` monorepo structure**:
  - `shared/` — types, interfaces, DI tokens, fakes, utilities
  - `positional-graph/` — core workflow orchestration + event system
  - (others: cli, web app)

- **CLAUDE.md** (project context): Comprehensive guide for AI agents covering:
  - Framework stack (Next.js 16, React 19, Tailwind v4)
  - Git & PR style (no emojis, MANDATORY `just fft` before commit)
  - Conventions (server components default, App Router only, testing strategy)
  - Critical pattern: "Search Before Creating" — always check for existing implementations
  - FlowSpace MCP tools preferred for code exploration
  - C4 architecture diagrams in `docs/c4/`

**DI Container Pattern** (ADR-0004, ADR-0009):
- Decorator-free dependency injection
- `useFactory` for services, `useValue` for singletons
- `registerXxxServices()` function pattern for composition
- Tokens defined in `packages/shared/src/di-tokens.ts`

**References**:
- Project README: `README.md`
- CLAUDE.md: `CLAUDE.md` (lines 1-252)
- Domain registry: `docs/domains/registry.md` + `docs/domains/domain-map.md`

---

## Summary: Building Question Popper

**Architectural Layer Stack** (bottom to top):

1. **Event System** (Plan 032, ADR-0010, ADR-0007)
   - Raw event primitives, schemas, handlers
   - SSE broadcast pipeline
   - ✅ Ready to use

2. **WorkflowEvents** (Plan 061)
   - Convenience API wrapping event system
   - Observer hooks for question-asked/answered events
   - ✅ Provides `IWorkflowEvents` interface

3. **Human Input Nodes** (Plan 054)
   - UI modal for user-input node type
   - Node lifecycle completion
   - ✅ Existing `HumanInputModal` + `submitUserInput` server action

4. **Question Popper** (Plan 067 — YOUR FEATURE)
   - Standalone modal/overlay for asking questions mid-workflow
   - Could reuse `HumanInputModal` component from Plan 054
   - Use `WorkflowEvents` for Q&A operations
   - Use global toast for feedback
   - Use global state for open/closed modal state
   - Could add new `questions` SSE domain (ADR-0010 pattern)

**Key Decisions Already Made**:
- Single-question per node (Workshop 010 / Plan 054)
- 4 question types only (text, single, multi, confirm)
- No multi-field forms (composability through multiple nodes)
- WorkflowEvents is the standard API (not raw event raising)
- Fakes-only testing (no mocks)
- 3-event Q&A handshake encapsulated in `answerQuestion()`

**Patterns to Reuse**:
- `HumanInputModal` component (already exists)
- `WorkflowEvents` for Q&A operations
- `GlobalStateSystem` for modal open/closed state
- Toast system for success/error feedback
- Observer pattern from WorkflowEvents for real-time updates
- DI container registration pattern (ADR-0009)

**Next Steps for 067 Implementation**:
1. Create spec document incorporating above patterns
2. Design modal/overlay UI (reuse HumanInputModal or create custom)
3. Define new "workflow:question" state paths
4. Wire WorkflowEvents.askQuestion() and observer hooks
5. Create FakeWorkflowEventsService tests
6. Integration tests for full Q&A cycle
7. Update docs/domains/question-popper/ + registry

---

## Document References Summary

| Code | Title | Type | Status |
|------|-------|------|--------|
| DE-01 | Unified Human Input (Plan 054) | Feature | ✅ Complete |
| DE-02 | WorkflowEvents Domain (Plan 061) | Domain + API | ✅ Spec + Plan |
| DE-03 | Global Toast System (Plan 042) | UI Infrastructure | ✅ Complete |
| DE-04 | Global State System (Plan 053) | State Management | ✅ Complete |
| DE-05 | Central Domain Event Notification (ADR-0010) | Architecture | ✅ Accepted |
| DE-06 | SSE Single-Channel Routing (ADR-0007) | Architecture | ✅ Accepted |
| DE-07 | Node Event System (Plan 032) | Core Infrastructure | ✅ Complete |
| DE-08 | Discriminated Union Types (Workshop 011) | Pattern | ✅ Established |
| DE-09 | Testing Strategy & Fakes | Methodology | ✅ Proven |
| DE-10 | Configuration & Project Structure | Reference | ✅ Established |

