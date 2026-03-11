# Flight Plan: Phase 4 — GlobalState Re-enablement

**Plan**: [../../sse-multiplexing-plan.md](../../sse-multiplexing-plan.md)
**Phase**: Phase 4: GlobalState Re-enablement
**Generated**: 2026-03-08
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-3 delivered the full multiplexed SSE stack — server endpoint, client provider, consumer hooks — and migrated QuestionPopper + FileChange. Per-tab connections are down to 1. But GlobalStateConnector is still disabled (Plan 053 DYK #4) and ServerEventRoute still uses `useSSE` (which would open a 2nd EventSource if mounted).

**Where we're going**: GlobalStateConnector is active. ServerEventRoute consumes from the multiplexed `useChannelEvents('work-unit-state')` — zero additional connections. Work-unit-state events (agent status, workflow pod state) flow through SSE → GlobalStateSystem → `useGlobalState` consumers. The original Plan 053/059 vision is complete.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `_platform/state` | ServerEventRoute: `useSSE` → `useChannelEvents`. State-connector comment updated. GlobalStateConnector un-commented. | `server-event-route.tsx`, `state-connector.tsx`, `browser-client.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/events` | `useChannelEvents(channel, options)` | Returns `{ messages, isConnected, clearMessages }` |
| `_platform/events` | `MultiplexedSSEProvider` | Already mounted, `work-unit-state` already in channel list |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Migrate ServerEventRoute" as S1
    state "2: Update connector comment" as S2
    state "3: Un-comment GlobalStateConnector" as S3
    state "4: Update tests" as S4
    state "5: Full suite + verify" as S5

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S1 --> S4
    S3 --> S5
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Migrate ServerEventRoute** — Replace `useSSE` with `useChannelEvents`, keep index cursor unchanged (`server-event-route.tsx`)
- [x] **Stage 2: Update connector comment** — Replace "future fix" comment with "now active" note (`state-connector.tsx`)
- [x] **Stage 3: Un-comment GlobalStateConnector** — Remove disabled comment, render component (`browser-client.tsx`)
- [x] **Stage 4: Update tests** — Tests are pure logic (DYK #1), no changes needed — verified 11/11 pass (`server-event-route.test.ts`)
- [x] **Stage 5: Full suite + verify** — 5173 passed, 0 failures

---

## Architecture: Before & After

```mermaid
flowchart TD
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef disabled fill:#FFEBEE,stroke:#F44336,color:#000

    subgraph Before["Before Phase 4"]
        B_MUX["MultiplexedSSEProvider<br/>(1 connection)"]:::existing
        B_SER["ServerEventRoute<br/>useSSE (would add connection)"]:::existing
        B_GSC["GlobalStateConnector<br/>(disabled/commented out)"]:::disabled
        B_GSS["GlobalStateSystem<br/>(no SSE events)"]:::existing
    end

    subgraph After["After Phase 4"]
        A_MUX["MultiplexedSSEProvider<br/>(1 connection, unchanged)"]:::existing
        A_SER["ServerEventRoute<br/>useChannelEvents"]:::changed
        A_GSC["GlobalStateConnector<br/>(active)"]:::changed
        A_GSS["GlobalStateSystem<br/>(receives work-unit-state)"]:::changed
        A_BC["browser-client.tsx"]:::changed

        A_MUX --> A_SER
        A_GSC --> A_SER
        A_SER --> A_GSS
        A_BC --> A_GSC
    end
```

**Legend**: green = existing/unchanged | orange = modified | red = disabled/removed

---

## Acceptance Criteria

- [x] AC-24: GlobalStateConnector re-enabled
- [x] AC-25: ServerEventRoute consumes from multiplexed provider
- [x] AC-26: Work-unit-state events flow through SSE → GlobalStateSystem
- [x] AC-28: 3+ tabs open simultaneously without lockup
- [x] AC-31: All existing tests pass

## Goals & Non-Goals

**Goals**:
- ServerEventRoute on multiplexed hook
- GlobalStateConnector active
- Work-unit-state events in GlobalStateSystem
- Still 1 SSE connection per tab

**Non-Goals**:
- New state routes
- Workflow/agent migration
- GlobalStateSystem changes

---

## Checklist

- [x] T001: Migrate ServerEventRoute to useChannelEvents
- [x] T002: Update state-connector.tsx connection limit comment
- [x] T003: Re-enable GlobalStateConnector in browser-client.tsx
- [x] T004: Update ServerEventRoute tests (no changes needed — DYK #1)
- [x] T005: Verify full test suite + manual smoke test
