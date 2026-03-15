# Flight Plan: Fix FX001 — Combine window + copilot badges

**Fix**: [FX001-combine-badges.md](FX001-combine-badges.md)
**Status**: Landed

## What → Why

**Problem**: Window titles (row 1) and copilot details (row 2) are visually disconnected — users must mentally match window indices across rows.

**Fix**: Merge into unified per-window cards: title on line 1, copilot details on line 2 (when present).

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| terminal | extend | Merge rendering in overlay panel, delete copilot-session-badges component |

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Merge rendering" as S1
    state "2: Delete component" as S2
    state "3: Quality gates" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 done
```

**Legend**: grey = pending | yellow = active | red = blocked | green = done

## Stages

- [x] **Stage 1: Merge badge rendering** — Left-join window + copilot data, render combined cards (`terminal-overlay-panel.tsx`)
- [x] **Stage 2: Delete component** — Remove `copilot-session-badges.tsx` and its import
- [x] **Stage 3: Quality gates** — `just fft`, visual verification

## Acceptance

- [ ] Unified per-window cards with title + copilot details
- [ ] `just fft` passes

## Checklist

- [x] FX001-1: Merge badge rendering into combined cards
- [x] FX001-2: Delete CopilotSessionBadges component
- [x] FX001-3: Verify and run quality gates
