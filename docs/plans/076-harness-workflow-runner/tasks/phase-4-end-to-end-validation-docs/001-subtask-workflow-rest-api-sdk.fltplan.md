# Flight Plan: Subtask 001 — Workflow REST API + SDK

**Subtask**: [001-subtask-workflow-rest-api-sdk.md](001-subtask-workflow-rest-api-sdk.md)
**Parent Phase**: Phase 4: End-to-End Validation + Docs
**Generated**: 2026-03-21
**Status**: Landed

---

## What → Why

**Problem**: The harness can't trigger workflow execution through the web server — only via CLI subprocess. This means the web path is untestable from the harness, concurrent CLI+web runs can corrupt graph state, and the user never sees harness-triggered runs in their browser.

**Fix**: 5 REST endpoints + typed SDK client + drive lock. Harness calls `POST /execution` → user sees nodes moving in browser → one path, one lock, one truth.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| workflow-ui | 5 new REST API routes (Tier 1 execution control) | `apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/route.ts`, `.../detailed/route.ts` |
| _platform/positional-graph | Drive lock moves into engine | `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` |
| _(harness)_ | SDK client + `--server` mode | `harness/src/sdk/workflow-api-client.ts`, `harness/src/cli/commands/workflow.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| workflow-ui | WorkflowExecutionManager | start/stop/restart/getStatus |
| _platform/events | SSE mux | Browser receives execution-update events |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Interface + types" as S1
    state "2: REST API endpoints" as S2
    state "3: SDK client" as S3
    state "4: Fake + contract tests" as S4
    state "5: Harness --server" as S5
    state "6: Drive lock" as S6

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S1 --> S4
    S2 --> S5
    S3 --> S5
    S6 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5,S6 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Define contract** — IWorkflowApiClient interface + response DTOs (`workflow-api-client.interface.ts`)
- [x] **Stage 2: Build REST API** — 5 Tier 1 endpoints wrapping WorkflowExecutionManager (`execution/route.ts`, `detailed/route.ts`)
- [x] **Stage 3: Build SDK client** — WorkflowApiClient with typed fetch calls (`workflow-api-client.ts`)
- [x] **Stage 4: Build fake + tests** — FakeWorkflowApiClient + contract test suite (`fake-workflow-api-client.ts`, `workflow-api-client.test.ts`)
- [x] **Stage 5: Wire harness** — `--server` mode in workflow commands, uses SDK instead of spawnCg
- [x] **Stage 6: Drive lock** — Move filesystem lock into GraphOrchestration.drive(), remove from CLI

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Subtask"]
        B_H["Harness"]:::existing
        B_CLI["spawnCg()<br/>CLI subprocess"]:::existing
        B_WEB["Browser<br/>Server Actions"]:::existing
        B_ENG["Engine<br/>(no lock)"]:::existing

        B_H --> B_CLI --> B_ENG
        B_WEB --> B_ENG
    end

    subgraph After["After Subtask"]
        A_H["Harness<br/>--server mode"]:::changed
        A_SDK["WorkflowApiClient<br/>(SDK)"]:::new
        A_API["REST API<br/>(5 endpoints)"]:::new
        A_WEB["Browser<br/>Server Actions"]:::existing
        A_ENG["Engine<br/>(with lock)"]:::changed
        A_SSE["SSE Mux"]:::existing
        A_BROWSER["User Browser"]:::existing

        A_H --> A_SDK --> A_API --> A_ENG
        A_WEB --> A_ENG
        A_ENG --> A_SSE --> A_BROWSER
    end
```

---

## Acceptance Criteria

- [x] `POST /api/workspaces/{slug}/workflows/{graph}/execution` starts a workflow
- [x] `GET .../execution` returns current execution status
- [x] `DELETE .../execution` stops a running workflow
- [x] `GET .../detailed` returns per-node status with timing/sessions/blockers
- [x] `WorkflowApiClient` implements `IWorkflowApiClient` with typed fetch calls
- [x] `FakeWorkflowApiClient` passes same contract tests as real client
- [x] `harness workflow run --server` triggers web execution and user sees it in browser
- [x] Concurrent `drive()` calls on same graph are rejected (lock in engine)

---

## Checklist

- [x] ST001: Define IWorkflowApiClient interface + response types
- [x] ST002: Implement Tier 1 REST API endpoints (5 routes)
- [x] ST003: Implement WorkflowApiClient (fetch-based SDK)
- [x] ST004: Implement FakeWorkflowApiClient + contract tests
- [x] ST005: Wire SDK into harness `--server` mode
- [x] ST006: Move drive lock into GraphOrchestration.drive()
