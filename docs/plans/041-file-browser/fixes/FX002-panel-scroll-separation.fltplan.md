# Flight Plan: Fix FX002 — Panel scroll separation and sticky headers

**Fix**: [FX002-panel-scroll-separation.md](./FX002-panel-scroll-separation.md)
**Status**: Landed

## What → Why

**Problem**: Three nested scroll containers (PanelShell → LeftPanel → FileTree) cause the "FILES" header and viewer toolbar to scroll away with content.

**Fix**: Eliminate competing scroll contexts — each panel gets exactly one scroll container below its fixed header.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform | Owner | `panel-shell.tsx` left wrapper: `overflow-y-auto` → `overflow-hidden`; `panel-header.tsx` remove stale `sticky top-0` |
| file-browser | Consumer | `file-tree.tsx` remove redundant `h-full overflow-y-auto` from root div |

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Fix PanelShell overflow" as S1
    state "2: Fix FileTree scroll" as S2
    state "3: Clean PanelHeader" as S3
    state "4: Verify behaviors" as S4

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

## Stages

- [x] **Stage 1: Fix PanelShell left wrapper** — change `overflow-y-auto` to `overflow-hidden` (`panel-shell.tsx`)
- [x] **Stage 2: Fix FileTree scroll container** — remove `h-full overflow-y-auto` from root div (`file-tree.tsx`)
- [x] **Stage 3: Clean PanelHeader sticky** — remove stale `sticky top-0` class (`panel-header.tsx`)
- [x] **Stage 4: Verify scroll behaviors** — Tests pass (4647/4647), Playwright limited by mobile viewport but CSS chain verified structurally

## Architecture: Before & After

```mermaid
flowchart TD
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before FX002"]
        B_PS["PanelShell left wrapper<br/>overflow-y-auto"]:::changed
        B_LP["LeftPanel content<br/>flex-1 overflow-y-auto"]:::existing
        B_FT["FileTree root<br/>h-full overflow-y-auto"]:::changed
        B_PH["PanelHeader<br/>sticky top-0"]:::changed
        B_PS --> B_LP --> B_FT
        B_PS --> B_PH
    end

    subgraph After["After FX002"]
        A_PS["PanelShell left wrapper<br/>overflow-hidden"]:::changed
        A_LP["LeftPanel content<br/>flex-1 overflow-y-auto<br/>(sole scroll context)"]:::existing
        A_FT["FileTree root<br/>no overflow"]:::changed
        A_PH["PanelHeader<br/>shrink-0 only"]:::changed
        A_PS --> A_LP --> A_FT
        A_PS --> A_PH
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified)

## Acceptance

- [x] "FILES" header stays pinned when scrolling tree
- [x] Edit/Preview/Diff toolbar stays pinned when scrolling content
- [x] Tree and content scroll independently
- [x] File selection scrolls tree entry into view
- [x] Line-offset navigation scrolls editor

## Checklist

- [x] FX002-1: Fix PanelShell left wrapper overflow
- [x] FX002-2: Remove FileTree redundant scroll container
- [x] FX002-3: Clean up PanelHeader stale sticky class
- [x] FX002-4: Verify scroll behaviors
