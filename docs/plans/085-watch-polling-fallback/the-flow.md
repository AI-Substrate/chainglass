# Flight Plan — watch-polling-fallback

```mermaid
flowchart TD
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef wip fill:#FFC107,stroke:#FFA000,color:#000
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff
    classDef known fill:#90A4AE,stroke:#607D8B,color:#fff
    classDef assumed fill:#ECEFF1,stroke:#B0BEC5,color:#000,stroke-dasharray: 5 5
    classDef said fill:#E1F5FE,stroke:#0288D1,color:#000

    classDef companion fill:#7E57C2,stroke:#5E35B1,color:#fff

    research["Research"]:::done
    spec["Spec (Simple, CS-3)"]:::done
    plan["Plan (READY, validated)"]:::done
    merge["Merge"]:::known

    subgraph companion["🛡 code-review-companion (reviewed T001-T005 · 2 findings fixed)"]
        phase1["Implementation (T001-T006 + FX)"]:::done
    end
    class companion companion

    ws1["Workshop: Polling adapter design"]:::done
    research --> spec --> plan --> phase1 --> merge
    spec -.-> ws1
    ws1 -.-> plan

    say1>"🗣 force it on with env... super edge case, i rarely use this modality"]:::said
    say1 -.- spec
    say2>"🗣 do workshops"]:::said
    say2 -.- ws1
    say3>"🗣 architect please"]:::said
    say3 -.- plan
    say4>"🗣 use compaion /6 command to implement please"]:::said
    say4 -.- phase1
```

**Legend**: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known (designed) · ⬜ assumed (speculative) · 🗣 your words · 🛡 companion reviewer

_Build complete (commits d31288ee → 38972ecf). Companion reviewed T001-T005; 2 findings (T004 HIGH barrel export, T002 MEDIUM unwatch lifecycle) both fixed. dist rebuilt + `just harness-verify` PASS. tsc 0 / biome clean / 41 watcher tests green. Next: merge (/plan-8)._
