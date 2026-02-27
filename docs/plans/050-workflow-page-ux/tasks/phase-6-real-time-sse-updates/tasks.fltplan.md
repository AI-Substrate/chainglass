# Flight Plan: Phase 6 — Real-Time SSE Updates

**Plan**: [workflow-page-ux-plan.md](../../workflow-page-ux-plan.md)
**Phase**: Phase 6: Real-Time SSE Updates
**Generated**: 2026-02-27
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: The workflow editor renders and edits graphs with full CRUD, context indicators, Q&A modals, node properties editing, and in-memory undo/redo. But changes made externally (CLI, agents, other tabs) are invisible until manual page refresh.

**Where we're going**: A developer working in the editor sees the canvas auto-update within ~500ms when the CLI or an agent modifies the workflow. A toast says "Workflow changed externally", and the undo stack is invalidated to prevent conflicts. Own mutations are silently suppressed from triggering unnecessary refreshes.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| _platform/events | New WorkflowWatcherAdapter + WorkflowDomainEventAdapter, register in bootstrap | `workflow-watcher.adapter.ts`, `workflow-domain-event-adapter.ts`, `start-central-notifications.ts` |
| workflow-ui | New useWorkflowSSE hook, editor wiring for invalidation + toast + self-suppression | `use-workflow-sse.ts`, `workflow-editor.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/events | CentralWatcherService, IWatcherAdapter, DomainEventAdapter, useSSE, SSE route | Existing SSE pipeline |
| _platform/events | ICentralEventNotifier, ISSEBroadcaster | Event routing contracts |
| workflow-ui | UndoRedoManager.invalidate(), loadWorkflow action | Phase 5 deliverables |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Watcher + Domain Adapters" as S1
    state "2: Client Hook + Editor Wiring" as S2
    state "3: Tests" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Watcher + Domain Adapters + Registration** — Create `WorkflowWatcherAdapter` (self-filter, 200ms debounce), `WorkflowDomainEventAdapter` (SSE routing), register in `startCentralNotificationSystem()` (`workflow-watcher.adapter.ts`, `workflow-domain-event-adapter.ts`, `start-central-notifications.ts`)
- [ ] **Stage 2: Client Hook + Editor Wiring** — Build `useWorkflowSSE` hook (SSE subscription, graphSlug filter, self-event suppression), wire into editor with undo invalidation + sonner toast + auto re-fetch (`use-workflow-sse.ts`, `workflow-editor.tsx`)
- [ ] **Stage 3: Tests** — Watcher adapter unit test (path filtering, debounce), hook unit test (SSE handling, self-suppression) (`workflow-watcher-adapter.test.ts`, `use-workflow-sse.test.ts`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 6"]
        B_CWS["CentralWatcherService"]:::existing
        B_WGWA["WorkGraphWatcherAdapter"]:::existing
        B_SSE["SSE /api/events/workgraphs"]:::existing
        B_ED["WorkflowEditor<br/>(no live updates)"]:::existing

        B_CWS --> B_WGWA --> B_SSE
    end

    subgraph After["After Phase 6"]
        A_CWS["CentralWatcherService"]:::existing
        A_WGWA["WorkGraphWatcherAdapter"]:::existing
        A_SSE_WG["SSE /workgraphs"]:::existing
        A_WWA["WorkflowWatcherAdapter"]:::new
        A_WDA["WorkflowDomainEventAdapter"]:::new
        A_SSE_WF["SSE /workflows"]:::new
        A_HOOK["useWorkflowSSE"]:::new
        A_ED["WorkflowEditor<br/>(live + toast + undo invalidate)"]:::changed

        A_CWS --> A_WGWA --> A_SSE_WG
        A_CWS --> A_WWA --> A_WDA --> A_SSE_WF --> A_HOOK --> A_ED
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-25: External changes invalidate undo stack + toast
- [ ] AC-26: SSE live updates for active workflow editor
- [ ] AC-27: WorkflowWatcherAdapter for graph file changes

## Goals & Non-Goals

**Goals**:
- ✅ External file changes trigger SSE → editor refresh within ~500ms
- ✅ Undo stack invalidated + toast on external change
- ✅ Self-event suppression (no refresh from own mutations)

**Non-Goals**:
- ❌ Real-time conflict resolution
- ❌ Granular diff-based updates (full reload per change)
- ❌ SSE for workflow list page

---

## Checklist

- [ ] T001: WorkflowWatcherAdapter (self-filter, debounce)
- [ ] T002: WorkflowDomainEventAdapter (SSE routing)
- [ ] T003: Register adapters in bootstrap
- [ ] T004: useWorkflowSSE hook
- [ ] T005: Undo invalidation + toast
- [ ] T006: Self-event suppression
- [ ] T007: Unit + integration tests
