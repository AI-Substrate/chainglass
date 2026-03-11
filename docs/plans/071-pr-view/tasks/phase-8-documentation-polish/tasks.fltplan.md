# Flight Plan: Phase 8 — Documentation + Polish

**Plan**: [pr-view-plan.md](../../pr-view-plan.md)
**Phase**: Phase 8: Documentation + Polish
**Generated**: 2026-03-10
**Status**: Landed

---

## Departure → Destination

**Where we are**: All 7 implementation phases are complete. Both domains (file-notes, pr-view) are fully functional with 5167+ tests passing. Domain docs, registry, and domain-map have been maintained throughout. What's missing: two how-to guides, README CLI section for `cg notes`, and a Notes toggle button in the explorer panel.

**Where we're going**: A developer opening the project finds comprehensive documentation for both features — how-to guides explaining every workflow, CLI commands documented in README, and a Notes button in the explorer bar for quick access. The branch is ready to merge.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| _platform/panel-layout | Add Notes toggle button | `explorer-panel.tsx` |
| — (docs only) | Create how-to guides, update README | `docs/how/file-notes.md`, `docs/how/pr-view.md`, `README.md` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| file-notes | Feature knowledge for docs | NoteIndicatorDot, useNotes, CLI commands |
| pr-view | Feature knowledge for docs | Comparison modes, reviewed tracking, shortcuts |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: File Notes guide" as S1
    state "2: PR View guide" as S2
    state "3: README CLI update" as S3
    state "4: Notes explorer button" as S4
    state "5: Final fft" as S5

    [*] --> S1
    [*] --> S2
    [*] --> S3
    [*] --> S4
    S1 --> S5
    S2 --> S5
    S3 --> S5
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: File Notes how-to guide** — Create `docs/how/file-notes.md` covering web UI, CLI, SDK, link types, threading
- [x] **Stage 2: PR View how-to guide** — Create `docs/how/pr-view.md` covering modes, tracking, live updates, shortcuts
- [x] **Stage 3: README CLI update** — Add `cg notes` commands with examples to README.md
- [x] **Stage 4: Notes explorer button** — Add StickyNote button to `explorer-panel.tsx` next to PR View button
- [x] **Stage 5: Final quality gate** — Run `just fft`, verify all green

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Before["Before Phase 8"]
        B1["docs/how/ (14 guides)"]:::existing
        B2["README.md (no cg notes)"]:::existing
        B3["ExplorerPanel<br/>(PR View + Activity + Terminal)"]:::existing
    end

    subgraph After["After Phase 8"]
        A1["docs/how/ (16 guides)"]:::changed
        A2["file-notes.md"]:::new
        A3["pr-view.md"]:::new
        A4["README.md (+ cg notes)"]:::changed
        A5["ExplorerPanel<br/>(Notes + PR View + Activity + Terminal)"]:::changed
        A1 --- A2
        A1 --- A3
    end
```

---

## Acceptance Criteria

- [ ] AC: `docs/how/file-notes.md` exists and covers all user workflows
- [ ] AC: `docs/how/pr-view.md` exists and covers both comparison modes
- [ ] AC: README.md documents `cg notes list/files/add/complete` with examples
- [ ] AC: Notes button visible in explorer panel, dispatches `notes:toggle`
- [ ] AC: `just fft` passes (lint, format, typecheck, 5167+ tests)

## Goals & Non-Goals

**Goals**:
- Complete documentation coverage for both new domains
- README CLI section for agent consumption
- Notes button in explorer for discoverability

**Non-Goals**:
- No feature logic changes
- No new tests (documentation phase)
- No domain.md updates (already complete)

---

## Checklist

- [x] T001: Create `docs/how/file-notes.md` how-to guide
- [x] T002: Create `docs/how/pr-view.md` how-to guide
- [x] T003: Update README.md CLI section with `cg notes` commands
- [x] T004: Add Notes toggle button to ExplorerPanel
- [x] T005: Run `just fft` final quality gate
