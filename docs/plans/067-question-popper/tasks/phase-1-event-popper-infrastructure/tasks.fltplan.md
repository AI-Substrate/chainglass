# Flight Plan: Phase 1 — Event Popper Infrastructure

**Plan**: [plan.md](../../plan.md)
**Phase**: Phase 1: Event Popper Infrastructure (`_platform/external-events`)
**Generated**: 2026-03-07
**Status**: Landed

---

## Departure → Destination

**Where we are**: The codebase has a mature SSE broadcasting system (`_platform/events`), global state system (`_platform/state`), and auth middleware (`proxy.ts`). No external event system exists — there's no way for CLI tools or agents to communicate with the web UI outside of workflow graphs. Tmux context is embedded in agents/terminal code with no shared utility.

**Where we're going**: After Phase 1, shared infrastructure exists for any future Event Popper concept: generic Zod envelope schemas, a port discovery mechanism (CLI can find the running server), a localhost-only API guard (secure unauthed access), a reusable tmux detection utility, and an SSE channel registered for event popper notifications. A developer can import `@chainglass/shared/event-popper` and build a new concept (questions, approvals, notifications) on top.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `_platform/external-events` (NEW) | Create domain: envelope schemas, GUID, port discovery, tmux utility | `packages/shared/src/event-popper/*`, `packages/shared/src/utils/tmux-context.ts` |
| `_platform/events` (additive) | Add `EventPopper` SSE channel constant | `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/events` | SSE channel naming convention | `WorkspaceDomain` const object |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Zod schemas" as S1
    state "2: GUID generation" as S2
    state "3: Port discovery" as S3
    state "4: Server boot hook" as S4
    state "5: Localhost guard" as S5
    state "6: Tmux utility" as S6
    state "7: SSE channel" as S7
    state "8: Unit tests" as S8
    state "9: Exports + docs" as S9

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S3 --> S5
    S3 --> S6
    S5 --> S7
    S6 --> S7
    S4 --> S8
    S7 --> S8
    S8 --> S9
    S9 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8,S9 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Define envelope schemas** — `EventPopperRequest` and `EventPopperResponse` Zod schemas with `.strict()` (`schemas.ts` — new file)
- [x] **Stage 2: Implement GUID generation** — timestamp + random suffix, filesystem-safe (`guid.ts` — new file)
- [x] **Stage 3: Build port discovery** — read/write `.chainglass/server.json` with stale PID detection (`port-discovery.ts` — new file)
- [x] **Stage 4: Hook server boot** — write port file in `instrumentation.ts`, cleanup on SIGTERM/SIGINT (`instrumentation.ts` — modify)
- [x] **Stage 5: Create localhost guard** — reject non-localhost, bypass auth in `proxy.ts` (`localhost-guard.ts` — new file, `proxy.ts` — modify)
- [x] **Stage 6: Extract tmux utility** — `detectTmuxContext()` + `getTmuxMeta()` shared helper (`tmux-context.ts` — new file)
- [x] **Stage 7: Register SSE channel** — add `EventPopper` to `WorkspaceDomain` (`workspace-domain.ts` — modify)
- [x] **Stage 8: Write unit tests** — all utilities tested: schemas, GUID, port, guard, tmux (`infrastructure.test.ts` — new file)
- [x] **Stage 9: Barrel exports + domain doc** — exports via index.ts, domain.md created (`index.ts` — new file, `domain.md` — new file)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 1"]
        B_WD["WorkspaceDomain<br/>(6 channels)"]:::existing
        B_INST["instrumentation.ts<br/>(central notifications)"]:::existing
        B_PROXY["proxy.ts<br/>(auth middleware)"]:::existing
        B_SHARED["@chainglass/shared<br/>(no event-popper module)"]:::existing
    end

    subgraph After["After Phase 1"]
        A_WD["WorkspaceDomain<br/>(7 channels:<br/>+ EventPopper)"]:::changed
        A_INST["instrumentation.ts<br/>(+ write server.json)"]:::changed
        A_PROXY["proxy.ts<br/>(+ event-popper bypass)"]:::changed
        A_EP["@chainglass/shared/<br/>event-popper/<br/>schemas, guid,<br/>port-discovery"]:::new
        A_TMUX["@chainglass/shared/<br/>utils/tmux-context"]:::new
        A_LG["localhost-guard.ts"]:::new
        A_DOC["domain.md<br/>(_platform/external-events)"]:::new
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [x] `EventPopperRequest` schema validates `{ version: 1, type, source, payload, meta? }` and rejects extra fields
- [x] `EventPopperResponse` schema validates `{ version: 1, status, respondedAt, respondedBy, payload, meta? }` and rejects extra fields
- [x] `generateEventId()` produces unique, chronologically sortable IDs with no filesystem-unsafe characters
- [x] `.chainglass/server.json` is written on server boot and removed on graceful shutdown
- [x] CLI can read `server.json` to discover port; returns null when file missing or PID stale
- [x] Non-localhost requests to `/api/event-popper/*` get 403 Forbidden
- [x] Localhost requests to `/api/event-popper/*` bypass auth middleware
- [x] `detectTmuxContext()` returns session/window/pane when in tmux, undefined when not
- [x] `WorkspaceDomain.EventPopper` exists as `'event-popper'`
- [x] All utilities importable via `@chainglass/shared/event-popper`

## Goals & Non-Goals

**Goals**: Generic Event Popper infrastructure — schemas, GUID, port discovery, localhost guard, tmux utility, SSE channel
**Non-Goals**: Question-specific types (Phase 2), API routes (Phase 3), CLI commands (Phase 4), UI (Phase 5)

---

## Checklist

- [x] T001: Define EventPopperRequest and EventPopperResponse Zod schemas
- [x] T002: Implement generateEventId() GUID generation
- [x] T003: Port discovery read/write utility with stale PID detection
- [x] T004: Write server.json on Next.js boot, cleanup on shutdown
- [x] T005: Localhost-only guard middleware + proxy.ts auth bypass
- [x] T006: Tmux detection shared utility (detectTmuxContext, getTmuxMeta)
- [x] T007: Add WorkspaceDomain.EventPopper channel constant
- [x] T008: Unit tests for all utilities
- [x] T009: Barrel exports + domain documentation
