# Flight Plan: Fix FX003 — Add `--wait-until` Navigation Flag

**Fix**: [FX003-wait-until-navigation-flag.md](FX003-wait-until-navigation-flag.md)
**Status**: Landed

## What → Why

**Problem**: Harness CLI commands hardcode `waitUntil: 'networkidle'` which never fires on SSE-enabled workspace pages, causing 30s timeouts on every screenshot/console-log capture.

**Fix**: Add `--wait-until` flag (default: `domcontentloaded`) and `--timeout` to all 3 navigation commands via a shared helper. Update README for discoverability.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/harness` | Modify | New `navigate.ts` helper, update 3 commands, update README |

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Shared navigate helper" as S1
    state "2: screenshot command" as S2
    state "3: screenshot-all command" as S3
    state "4: console-logs command" as S4
    state "5: README docs" as S5
    state "6: Harness verify" as S6
    state "7: Test suite" as S7

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> [*]

    class S1,S2,S3,S4,S5,S6,S7 done
```

**Legend**: grey = pending | yellow = active | red = blocked | green = done

## Stages

- [x] **Stage 1: Create helper** — `navigateTo()` with `WaitUntilValue` type, defaults (`harness/src/cdp/navigate.ts` — new file)
- [x] **Stage 2: Update screenshot** — Add flags, validate, use helper (`screenshot.ts`)
- [x] **Stage 3: Update screenshot-all** — Same pattern (`screenshot-all.ts`)
- [x] **Stage 4: Update console-logs** — Same pattern (`console-logs.ts`)
- [x] **Stage 5: README** — Page Navigation section with strategy guide (`harness/README.md`)
- [x] **Stage 6: Harness verify** — Screenshot agents page succeeds with default
- [x] **Stage 7: Test suite** — `just fft` green

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Fix"]
        SS1["screenshot.ts<br/>page.goto(url, networkidle)"]:::changed
        SA1["screenshot-all.ts<br/>page.goto(url, networkidle)"]:::changed
        CL1["console-logs.ts<br/>page.goto(url, networkidle)"]:::changed
    end

    subgraph After["After Fix"]
        NAV["navigate.ts<br/>navigateTo(page, url, opts)<br/>default: domcontentloaded"]:::new
        SS2["screenshot.ts<br/>--wait-until, --timeout"]:::changed
        SA2["screenshot-all.ts<br/>--wait-until, --timeout"]:::changed
        CL2["console-logs.ts<br/>--wait-until, --timeout"]:::changed
        SS2 --> NAV
        SA2 --> NAV
        CL2 --> NAV
    end
```

**Legend**: green = unchanged | orange = modified | blue = new

## Acceptance

- [ ] `just harness screenshot agents --url .../agents` succeeds (domcontentloaded default)
- [ ] `just harness screenshot --help` shows `--wait-until` and `--timeout`
- [ ] Invalid `--wait-until` returns E108 with available values
- [ ] `harness/README.md` Page Navigation section present
- [ ] `just fft` passes

## Checklist

- [ ] FX003-1: Create shared `navigateTo` helper
- [ ] FX003-2: Update `screenshot` command
- [ ] FX003-3: Update `screenshot-all` command
- [ ] FX003-4: Update `console-logs` command
- [ ] FX003-5: Update README with Page Navigation section
- [ ] FX003-6: Verify with harness
- [ ] FX003-7: `just fft` green
