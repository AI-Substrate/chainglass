# Flight Plan: Phase 2 — Playwright & CDP Integration

**Plan**: [harness-plan.md](../../harness-plan.md)
**Phase**: Phase 2: Playwright & CDP Integration
**Generated**: 2026-03-07
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Docker container boots with Next.js dev server (:3000) and terminal sidecar (:4500). Chromium is installed in the image but not launched. CDP port 9222 is mapped but nothing listens on it. The agent can `curl` the site but cannot see or interact with it visually.

**Where we're going**: The agent can connect to `http://localhost:9222` via CDP, open pages at desktop/tablet/mobile viewports, capture screenshots, read browser console logs, and run Playwright tests against the live app. This is the **minimum viable harness** — the agent can see the site.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| external (harness) | Add Chromium startup, Playwright config, viewport defs, smoke tests | `entrypoint.sh`, `playwright.config.ts`, `devices.ts`, `browser-smoke.spec.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/auth | DISABLE_AUTH bypass | `auth()` returns fake session |
| (all domains) | Browser-observable UI | HTTP on :3000 |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: RED test (CDP)" as S1
    state "2: Chromium startup" as S2
    state "3: Playwright config" as S3
    state "4: Smoke tests" as S4
    state "5: GREEN test" as S5

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Write RED integration test** — CDP connection + screenshot assertion (`cdp-integration.test.ts` — new file)
- [ ] **Stage 2: Launch Chromium in container** — Startup script + entrypoint update (`start-chromium.sh` — new, `entrypoint.sh` — modified)
- [ ] **Stage 3: Playwright config + viewports** — Config with 3 viewport projects (`playwright.config.ts`, `devices.ts` — new files)
- [ ] **Stage 4: Smoke Playwright tests** — Page load, multi-context, console capture (`browser-smoke.spec.ts` — new file)
- [ ] **Stage 5: GREEN integration test** — Unskip and verify CDP works end-to-end

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 2"]
        B_Next["Next.js :3000"]:::existing
        B_Term["Terminal :4500"]:::existing
        B_Entry["entrypoint.sh"]:::existing
        B_Entry --> B_Next
        B_Entry --> B_Term
    end

    subgraph After["After Phase 2"]
        A_Next["Next.js :3000"]:::existing
        A_Term["Terminal :4500"]:::existing
        A_Chrome["Chromium :9222"]:::new
        A_Entry["entrypoint.sh"]:::changed
        A_Config["playwright.config.ts"]:::new
        A_VP["devices.ts"]:::new
        A_Smoke["browser-smoke.spec.ts"]:::new
        A_Entry --> A_Next
        A_Entry --> A_Term
        A_Entry --> A_Chrome
        A_Smoke --> A_Config
        A_Config --> A_VP
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-04: `harness health` returns JSON with CDP status on :9222
- [ ] AC-05: Agent connects to `http://localhost:9222` via CDP and opens pages
- [ ] AC-06: Screenshots captured at desktop (1440x900), tablet (768x1024), mobile (375x812)
- [ ] AC-07: Multiple browser contexts browse simultaneously
- [ ] AC-10: Browser console output accessible via `page.on('console')`

## Goals & Non-Goals

**Goals**: CDP exposed, Playwright configured, smoke test passes, responsive viewports defined
**Non-Goals**: Full test suites, CLI commands, seed scripts, visual regression

---

## Checklist

- [ ] T001: Write CDP integration test (RED)
- [ ] T002: Create Chromium startup script
- [ ] T003: Update entrypoint.sh to launch Chromium
- [ ] T004: Create playwright.config.ts
- [ ] T005: Create viewport definitions
- [ ] T006: Write smoke Playwright test
- [ ] T007: Verify multi-context browsing
- [ ] T008: Verify browser console access
- [ ] T009: Run integration test (GREEN)
