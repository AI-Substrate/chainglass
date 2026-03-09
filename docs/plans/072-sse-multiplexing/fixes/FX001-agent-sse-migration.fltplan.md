# Flight Plan: Fix FX001 — Migrate Agent Hooks to Multiplexed SSE

**Fix**: [FX001-agent-sse-migration.md](FX001-agent-sse-migration.md)
**Status**: Landed

## What → Why

**Problem**: Agent hooks open direct EventSource connections, exhausting HTTP/1.1 connection limit and causing browser lockups on the agents page.

**Fix**: Route agent SSE events through the existing multiplexed provider — 1 channel addition, 2 hook rewrites, net -139 lines.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/events` | Modify | Add `'agents'` to WORKSPACE_SSE_CHANNELS |
| `agents` | Modify | useAgentManager + useAgentInstance → useChannelCallback |

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Add agents channel" as S1
    state "2: Migrate useAgentManager" as S2
    state "3: Migrate useAgentInstance" as S3
    state "4: Harness verify" as S4
    state "5: Full test suite" as S5

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 done
```

**Legend**: grey = pending | yellow = active | red = blocked | green = done

## Stages

- [x] **Stage 1: Add channel** — Add `'agents'` to WORKSPACE_SSE_CHANNELS (`layout.tsx`)
- [x] **Stage 2: Migrate useAgentManager** — Replace EventSource with useChannelCallback, map 8 event types (`useAgentManager.ts`)
- [x] **Stage 3: Migrate useAgentInstance** — Replace EventSource with useChannelCallback, preserve agentId filter + agent_event unwrap (`useAgentInstance.ts`)
- [x] **Stage 4: Harness verify** — Screenshot agents page, check console errors
- [x] **Stage 5: Full test suite** — `just fft` green

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef removed fill:#FFEBEE,stroke:#F44336,color:#000

    subgraph Before["Before Fix"]
        MUX1["/api/events/mux<br/>(5 channels)"]:::existing
        AGE1["/api/agents/events<br/>(useAgentManager)"]:::removed
        AGE2["/api/agents/events<br/>(useAgentInstance)"]:::removed
    end

    subgraph After["After Fix"]
        MUX2["/api/events/mux<br/>(6 channels incl agents)"]:::changed
    end
```

**Legend**: green = unchanged | orange = modified | red = removed

## Acceptance

- [x] Agents page loads without lockup
- [x] Click agent → overlay opens without freeze
- [x] Network tab: 0 connections to `/api/agents/events`
- [x] `just fft` passes
- [x] Harness screenshot succeeds
