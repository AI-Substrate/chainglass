# Flight Plan: Phase 4 — L3 Business Domains & Navigation Polish

**Plan**: [c4-models-plan.md](../../c4-models-plan.md)
**Phase**: Phase 4: L3 Business Domains & Navigation Polish
**Generated**: 2026-03-02
**Status**: Landed

---

## Departure → Destination

**Where we are**: 10 of 13 L3 component files exist (all infrastructure domains). The 3 business domain links in `web-app.md` and `README.md` point to files that don't exist yet. Domain.md files have no links back to their C4 diagrams (one-directional).

**Where we're going**: All 13 L3 component files exist. Every domain.md has a "C4 Diagram" link creating bidirectional navigation. All README.md quick links resolve. All navigation footers verified across 20 C4 files.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| — (docs) | 3 new L3 business domain files | `docs/c4/components/file-browser.md`, `workflow-ui.md`, `workunit-editor.md` |
| 13 domains | Add 1-line C4 Diagram link to each domain.md | `docs/domains/*/domain.md` (13 files) |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| — (docs) | Domain content for diagrams | `docs/domains/*/domain.md` (read for content, write 1 line) |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: file-browser L3" as S1
    state "2: workflow-ui L3" as S2
    state "3: workunit-editor L3" as S3
    state "4: Bidirectional links (13)" as S4
    state "5: Verify nav footers" as S5
    state "6: Verify README links" as S6

    [*] --> S1
    S1 --> S4
    [*] --> S2
    S2 --> S4
    [*] --> S3
    S3 --> S4
    S4 --> S5
    S4 --> S6
    S5 --> [*]
    S6 --> [*]

    class S1,S2,S3 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Business L3 files** — create 3 C4Component diagrams (file-browser, workflow-ui, workunit-editor)
- [x] **Stage 2: Bidirectional links** — add C4 Diagram line to all 13 domain.md files
- [x] **Stage 3: Verification** — verify nav footers (20 files) + README links (16 links)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Before["Before Phase 4"]
        B1["docs/c4/components/_platform/<br/>(10 files)"]:::existing
        B2["docs/c4/components/<br/>(empty — no business)"]:::existing
        B3["docs/domains/*/domain.md<br/>(no C4 links)"]:::existing
    end

    subgraph After["After Phase 4"]
        A1["docs/c4/components/_platform/<br/>(10 files)"]:::existing
        A2["docs/c4/components/<br/>file-browser.md<br/>workflow-ui.md<br/>workunit-editor.md"]:::new
        A3["docs/domains/*/domain.md<br/>(+ C4 Diagram link)"]:::changed
        A2 -.->|"cross-ref"| A3
        A3 -.->|"C4 link"| A2
        A3 -.->|"C4 link"| A1
    end
```

**Legend**: existing (green) | new (blue) | changed (orange, modified)

---

## Acceptance Criteria

- [x] AC-05: All 13 L3 component files exist with C4Component diagrams
- [x] AC-06: Every L3 file has cross-reference block to domain.md
- [x] AC-07: Every C4 file has navigation footer
- [x] AC-08: README.md quick links all resolve
- [x] AC-17: Every domain.md has C4 Diagram link to component file

## Goals & Non-Goals

**Goals**: Complete L3, bidirectional links, verified navigation
**Non-Goals**: No rendering verification (Phase 5), no code changes

---

## Checklist

- [x] T001: file-browser.md
- [x] T002: workflow-ui.md
- [x] T003: workunit-editor.md
- [x] T004: Bidirectional links (13 domain.md edits)
- [x] T005: Verify navigation footers
- [x] T006: Verify README links
