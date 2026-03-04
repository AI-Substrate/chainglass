# Flight Plan: Fix FX004 — Extract and Display Agent Intents

**Fix**: [FX004-extract-display-agent-intents.md](FX004-extract-display-agent-intents.md)
**Status**: Ready

---

## Departure → Destination

**Where we are**: Agent intent field exists on all UI surfaces (chips, list, overlay) but is always stale — adapters never call `setIntent()` during runs.

**Where we're going**: Running an agent shows live intent updates everywhere — "Reading auth.ts", "Using Bash", "Thinking: analyzing the..." — automatically extracted from the event stream.

---

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| agents | modify | New intent-extractor.ts, wire into AgentInstance, overlay header |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Extract function" as S1
    state "2: Wire into instance" as S2
    state "3: Overlay display" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Extract function** — `extractIntent()` pure function + unit tests (FX004-1)
- [ ] **Stage 2: Wire into instance** — Call in AgentInstance event loop (FX004-2)
- [ ] **Stage 3: Overlay display** — Intent subtitle in overlay header (FX004-3)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef broken fill:#FFCDD2,stroke:#F44336,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before FX004"]
        B_ADAPT["Adapter events"]:::existing
        B_INST["AgentInstance"]:::existing
        B_INTENT["setIntent()"]:::broken
        B_UI["Chip/List/Overlay"]:::existing

        B_ADAPT --> B_INST
        B_INTENT -.->|"never called"| B_UI
    end

    subgraph After["After FX004"]
        A_ADAPT["Adapter events"]:::existing
        A_EXTRACT["extractIntent()"]:::new
        A_INST["AgentInstance"]:::existing
        A_UI["Chip/List/Overlay"]:::existing

        A_ADAPT --> A_INST
        A_INST --> A_EXTRACT
        A_EXTRACT -->|"setIntent()"| A_UI
    end
```

---

## Acceptance

- [ ] Running agent shows live intent in chip bar
- [ ] Intent persists after agent stops
- [ ] Overlay header shows intent subtitle
- [ ] Existing tests pass

---

## Checklist

- [ ] FX004-1: extractIntent() function + tests
- [ ] FX004-2: Wire into AgentInstance event loop
- [ ] FX004-3: Overlay panel intent subtitle
