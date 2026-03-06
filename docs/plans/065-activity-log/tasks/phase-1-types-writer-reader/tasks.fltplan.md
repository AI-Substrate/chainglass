# Flight Plan: Phase 1 — Types, Writer, Reader

**Plan**: [activity-log-plan.md](../../activity-log-plan.md)
**Phase**: Phase 1: Activity Log Domain — Types, Writer, Reader
**Generated**: 2026-03-06
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: No activity-log domain exists. The terminal sidecar polls pane titles and sends them as WS messages for a badge display — there's no per-worktree persistence. The `.chainglass/data/` directory convention exists (used by work-unit-state) but nothing writes activity logs.

**Where we're going**: A developer can import `appendActivityLogEntry()` and `readActivityLog()` from the activity-log feature. The writer appends JSONL entries to `<worktree>/.chainglass/data/activity-log.jsonl` with automatic dedup. The reader loads and filters entries. The `shouldIgnorePaneTitle()` filter handles cross-OS tmux noise. Contract tests verify behavioral correctness. The activity-log domain is registered and documented.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| activity-log (NEW) | Create entire domain: types, writer, reader, ignore patterns | `apps/web/src/features/065-activity-log/` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| (none) | Phase 1 is greenfield | — |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Entry type" as S1
    state "2: Writer + dedup" as S2
    state "3: Reader + filtering" as S3
    state "4: Ignore patterns" as S4
    state "5: Contract tests" as S5
    state "6: Domain registration" as S6
    state "7: Gitignore" as S7

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S1 --> S4
    S2 --> S5
    S3 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> [*]

    class S1,S2,S3,S4,S5,S6,S7 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Define entry type** — Create `ActivityLogEntry` with `id`, `source`, `label`, `timestamp`, `meta?` (`types.ts`)
- [ ] **Stage 2: Build writer with TDD** — `appendActivityLogEntry()` with JSONL append + 50-line dedup lookback (`activity-log-writer.ts` — new file)
- [ ] **Stage 3: Build reader with TDD** — `readActivityLog()` with limit/since/source filtering (`activity-log-reader.ts` — new file)
- [ ] **Stage 4: Build ignore list with TDD** — `shouldIgnorePaneTitle()` with cross-OS patterns (`ignore-patterns.ts` — new file)
- [ ] **Stage 5: Contract test factory** — Conformance tests for writer/reader with temp dirs (`activity-log.contract.ts` — new file)
- [ ] **Stage 6: Register domain** — domain.md, registry.md, domain-map.md updates
- [ ] **Stage 7: Gitignore** — Add `**/activity-log.jsonl` pattern

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 1"]
        B1[".chainglass/data/<br/>work-unit-state.json"]:::existing
        B2["Terminal sidecar<br/>pane title → WS badge"]:::existing
    end

    subgraph After["After Phase 1"]
        A1[".chainglass/data/<br/>work-unit-state.json"]:::existing
        A2[".chainglass/data/<br/>activity-log.jsonl"]:::new
        A3["appendActivityLogEntry()"]:::new
        A4["readActivityLog()"]:::new
        A5["shouldIgnorePaneTitle()"]:::new
        A3 -->|writes| A2
        A4 -->|reads| A2
    end
```

**Legend**: existing (green, unchanged) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-04: Consecutive identical labels for the same id are deduplicated
- [ ] AC-05: Activity log survives server restarts (persisted to disk)
- [ ] AC-10: Writer is general-purpose (`{ source, label, id, timestamp, meta? }`)
- [ ] AC-11: Reader returns last 200 entries by default
- [ ] AC-12: Ignore list is configurable regex array per source
- [ ] AC-14: `activity-log.jsonl` is gitignored

## Goals & Non-Goals

**Goals**: Types, writer with dedup, reader with filtering, ignore patterns, contract tests, domain registration, gitignore
**Non-Goals**: No sidecar integration, no UI overlay, no SSE, no log rotation

---

## Checklist

- [ ] T001: Create `ActivityLogEntry` type
- [ ] T002: Implement `appendActivityLogEntry()` with dedup (TDD)
- [ ] T003: Implement `readActivityLog()` with filtering (TDD)
- [ ] T004: Implement `shouldIgnorePaneTitle()` (TDD)
- [ ] T005: Create contract test factory
- [ ] T006: Create domain.md + update registry + domain-map
- [ ] T007: Add `activity-log.jsonl` to `.gitignore`
