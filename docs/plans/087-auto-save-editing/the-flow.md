# Flight plan — auto-save-editing

> Generated from `the-flow.json` — do not hand-edit. Mode: **Simple** · Stage: **awaiting-3** (spec done, architect next).

```mermaid
flowchart TD
    classDef done fill:#C8E6C9,stroke:#388E3C,color:#000
    classDef wip fill:#FFE0B2,stroke:#FB8C00,color:#000
    classDef blocked fill:#FFCDD2,stroke:#D32F2F,color:#000
    classDef known fill:#CFD8DC,stroke:#546E7A,color:#000
    classDef assumed fill:#ECEFF1,stroke:#B0BEC5,color:#000,stroke-dasharray:4 3
    classDef said fill:#E1F5FE,stroke:#0288D1,color:#000

    research["🔬 Research<br/>existing save/load internals"]:::done
    workshop001["🛠 Workshop 001<br/>draft storage & lifecycle"]:::done
    spec["📋 Spec<br/>auto-save + restore-on-load · Simple/CS-3"]:::done
    plan["🏗 Plan<br/>architect (next)"]:::known
    build["⚙ Build<br/>single phase (revealed at /plan-3)"]:::assumed
    merge["🔀 Merge"]:::assumed

    research --> spec
    spec --> plan
    plan --> build
    build --> merge
    research -.-> workshop001
    workshop001 -.-> spec

    sR>"🗣 next new feature is auto save in editing files (rich + preview)…"]:::said
    sR -.- research
    sW>"🗣 yer do workshop"]:::said
    sW -.- workshop001
    sS>"🗣 proceed to specity stage please."]:::said
    sS -.- spec
```

**Legend**: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known (designed future) · ⬜ assumed (speculative) · 🗣 your words · dotted = excursion

## Stage notes

- **research** ✅ — ~90% reuse; new surface = draft store + restore-on-load. → `research-dossier.md`
- **workshop-001** ✅ (excursion) — drafts under `.chainglass` (source watcher ignores it, ADR-0008), per-file JSON mirror, restore loads editor-only, `saveFile` mtime guard as backstop. Open Q1: data-watcher scope. → `workshops/001-…md`
- **spec** ✅ — Simple, CS-3 (conf 0.85); 30-day stale-draft sweep; 11 ACs; workshop folded in as authoritative. → `auto-save-editing-spec.md`, `auto-save-editing.fltplan.md`
- **plan** 🟦 next — `/plan-3` architects the single-phase implementation; must confirm Q1 (data-watcher scope) before build.
- **build / merge** ⬜ — revealed once `/plan-3` lands.
