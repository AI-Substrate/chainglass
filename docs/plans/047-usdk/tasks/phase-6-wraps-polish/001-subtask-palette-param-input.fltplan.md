# Flight Plan: Subtask 001 — Palette Single-Parameter Input

**Subtask**: [001-subtask-palette-param-input.md](./001-subtask-palette-param-input.md)
**Phase**: Phase 6: SDK Wraps, Go-to-Line & Polish
**Plan**: [usdk-plan.md](../../usdk-plan.md)
**Status**: Landed

---

## Departure → Destination

**Where we are**: Parameterised commands are hidden from the palette via `safeParse({})` filter. Selecting them would crash with ZodError. `toast.show` and `openFileAtLine` are invisible to users.

**Where we're going**: Users select `> Show Toast Notification`, the palette prompts for a message, user types it, presses Enter, toast appears. All commands visible and usable.

---

## Domain Context

### Domains We Change

| Domain | Relationship | Changes | Key Files |
|--------|-------------|---------|-----------|
| `_platform/panel-layout` | **modify** | Param gathering state, schema introspection, inline input, remove stopgap filter | `explorer-panel.tsx`, `command-palette-dropdown.tsx` |

### Domains We Depend On

| Domain | Contract | Usage |
|--------|----------|-------|
| `_platform/sdk` | `ICommandRegistry.execute(id, params)` | Execute with gathered params |
| `_platform/sdk` | `SDKCommand.params` (Zod schema) | Introspect for required fields |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Schema helpers" as S1
    state "2: Param state in EP" as S2
    state "3: Param UI in dropdown" as S3
    state "4: Remove stopgap filter" as S4

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] Create `hasRequiredParams` + `extractFirstRequired` helpers (ST001)
- [x] Add param gathering state to ExplorerPanel (ST002)
- [x] Render param input hint in dropdown (ST003)
- [x] Remove safeParse stopgap filter (ST004)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Before["Before"]
        B_EP["ExplorerPanel<br/>paletteMode only"]:::existing
        B_CPD["Dropdown<br/>hides param commands"]:::existing
        B_EP --> B_CPD
    end

    subgraph After["After"]
        A_EP["ExplorerPanel<br/>+ paramGathering state"]:::changed
        A_CPD["Dropdown<br/>shows all commands<br/>+ param hint"]:::changed
        A_EP --> A_CPD
    end
```

---

## Acceptance Criteria

- [x] `toast.show` visible in palette, prompts for message, executes with typed value
- [x] Commands with no required params execute immediately (no prompt)
- [x] Escape from param input returns to command list
- [x] Enter with empty input does nothing (no crash)

---

## Checklist

| ID | Task | CS |
|----|------|----|
| ST001 | Schema introspection helpers | CS-1 |
| ST002 | Param gathering state in ExplorerPanel | CS-2 |
| ST003 | Param input hint in dropdown | CS-1 |
| ST004 | Remove stopgap filter | CS-1 |
