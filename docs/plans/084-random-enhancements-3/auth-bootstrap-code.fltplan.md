# Flight Plan: Always-On Bootstrap-Code Auth (with Optional GitHub OAuth)

**Spec**: [auth-bootstrap-code-spec.md](./auth-bootstrap-code-spec.md)
**Research**: [auth-bootstrap-code-research.md](./auth-bootstrap-code-research.md)
**Workshops**:
- [workshops/004-bootstrap-code-lifecycle-and-verification.md](./workshops/004-bootstrap-code-lifecycle-and-verification.md) — Storage Design + Integration Pattern (server-side story)
- _planned_: workshops/005-popup-ux-and-rootlayout-integration.md (Integration Pattern — popup wiring)

**Plan**: [auth-bootstrap-code-plan.md](./auth-bootstrap-code-plan.md)
**Generated**: 2026-04-30
**Status**: Ready

---

## The Mission

**What we're building**: A locally-generated bootstrap code, written to a known file at server boot, becomes the always-on outer gate for the web app. Every browser, every device, every fresh session must enter the code before any UI renders or data leaves the server. The code persists across server restarts (rotated by deleting the file). The same gate protects the terminal WS sidecar and other local sinks. GitHub OAuth becomes an optional inner second factor. Three concrete protection holes identified in research close as a side-effect: terminal-WS silent-bypass when `AUTH_SECRET` is unset, sidecar HTTP sinks accepting unauthenticated POSTs from any loopback caller, and `DISABLE_AUTH=true` removing every gate.

**Why it matters**: GitHub OAuth setup is a 10-minute speed-bump for new users and a hard blocker for anyone whose GitHub doesn't fit the allowlist model — for example, multi-account users, teams behind enterprise SSO, or a developer just wanting to try the tool. A locally-typed code lowers the barrier to first-run while *raising* the security floor by closing real holes. It also makes "I want to disable GitHub auth for local dev" a clean, supported configuration instead of a gun pointed at the foot.

---

## Where We Are → Where We're Headed

```
TODAY:                                                     AFTER this plan:

🔴 DISABLE_AUTH=true → entire app open                     🟢 Bootstrap-code popup blocks every page
🔴 Terminal WS, AUTH_SECRET unset → silent bypass          🟢 Terminal WS auth always on (HKDF fallback)
🔴 /api/event-popper, /api/tmux/events → localhostGuard    🟢 Composite cookie-or-X-Local-Token check
🟡 /login intentionally outside proxy matcher              🟢 RootLayout popup gates /login too
🟡 Bring up new instance → must configure GitHub OAuth     🟢 Boot → cat the file → enter code → done
🟡 GitHub OAuth required for any auth                      🟢 GitHub OAuth = optional inner second factor
🔵 Plan 067 localToken in .chainglass/server.json          🔵 (unchanged — CLI bearer)
🔵 Plan 064 token-exchange JWT pattern                     🔵 (unchanged — extended at the gate)
🔵 .chainglass/auth.yaml allowlist                         🔵 (unchanged — applies when GitHub on)
```

🔵 = unchanged   🟢 = working   🟡 = silent gap closed   🔴 = bug fixed

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Current["Current (gaps)"]
        B1[Browser]:::existing
        P1[proxy.ts<br/>matcher excludes /login, sidecars]:::existing
        WS1[Terminal WS<br/>silent-bypass if no AUTH_SECRET]:::existing
        EP1[event-popper / tmux-events<br/>localhostGuard only]:::existing
        DA1[DISABLE_AUTH=true<br/>removes every gate]:::existing
        B1 --> P1 --> WS1
        B1 --> EP1
        DA1 -.disables.-> P1
    end

    subgraph After["After this plan"]
        B2[Browser]:::existing
        Pop[BootstrapGate popup<br/>RootLayout]:::new
        Cookie[chainglass-bootstrap cookie<br/>HMAC]:::new
        P2[proxy.ts<br/>cookie ➜ optional GitHub auth]:::changed
        Verify[/api/bootstrap/verify<br/>+ /forget/]:::new
        File[.chainglass/bootstrap-code.json<br/>persistent, gitignored]:::new
        Sign[activeSigningSecret<br/>AUTH_SECRET ?? HKDF code]:::new
        WS2[Terminal WS<br/>always auth via Sign]:::changed
        EP2[event-popper / tmux-events<br/>requireLocalAuth]:::changed
        DGA[DISABLE_GITHUB_OAUTH=true<br/>only disables GitHub layer]:::changed
        B2 --> Pop --> Verify --> Cookie
        Cookie --> P2
        P2 --> WS2
        P2 --> EP2
        File --> Sign
        Sign --> WS2
        Sign --> Cookie
        DGA -.disables only.-> P2
    end
```

**Legend**: existing (green) | changed (orange) | new (blue)

---

## Scope

**Goals** (from spec):
- Default-deny on every page; popup blocks UI until code entered (including `/login`)
- One-prompt UX per browser; sticky across server restarts
- Saveable code via `.chainglass/bootstrap-code.json`
- Always-on terminal WS protection regardless of GitHub OAuth state
- Sidecar sinks gated (event-popper, tmux events)
- Optional GitHub OAuth, layered cleanly on top
- Discoverable rotation (delete file + restart)
- Fail-loudly on misconfiguration

**Non-Goals**:
- Multi-user identity model (defer to GitHub OAuth when wanted)
- Code TTL / time-based rotation
- WSS mandate when `TERMINAL_WS_HOST=0.0.0.0`
- Cross-machine code distribution
- CLI command to print the code (v2 candidate)
- Popup mobile-specific UX polish (workshop 005 territory)
- Settings-UI rotate command

---

## Journey Map

```mermaid
flowchart LR
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef ready fill:#9E9E9E,stroke:#757575,color:#fff

    R[Research]:::done --> W1[Workshop 004<br/>server-side]:::done
    W1 --> S[Specify]:::done
    S --> P[Plan]:::done
    P --> I[Implementation<br/>7 phases]:::active
    I --> D[Done]:::ready

    note1[Clarify skipped — defaults committed in plan]
    note2[Workshop 005 optional — fold into Phase 6 if small]
```

**Legend**: green = done | yellow = active | grey = not started

---

## Phases Overview

Mode: **Full** (CS-4). Plan committed defaults for the 8 spec-level open questions — see plan § "Pre-Plan Decisions".

| Phase | Title | Primary Domain | Tasks | Status |
|-------|-------|---------------|-------|--------|
| 1 | Shared primitives — types, generator, file IO, cookie sign/verify, `activeSigningSecret()` | `@chainglass/shared` | 7 | ✅ Done (46 tests pass) |
| 2 | Boot integration — `instrumentation.ts` writes file; misconfiguration assertion; `.gitignore` lines | `_platform/auth` | 4 | ✅ Done (60 tests pass; live `pnpm dev` matrix in operator runbook) |
| 3 | Server-side gate — verify/forget routes + proxy rewrite + RootLayout stub | `_platform/auth` | 7 | Pending |
| 4 | Terminal sidecar hardening — close silent-bypass; switch to `activeSigningSecret()`; JWT `iss`/`aud`/`cwd` | `terminal` | 6 | Pending |
| 5 | Sidecar HTTP-sink hardening + env-var rename — `requireLocalAuth(req)`; event-popper + tmux events; `DISABLE_GITHUB_OAUTH` alias | `_platform/events` (+ `_platform/auth`) | 7 | Pending |
| 6 | Popup component & RootLayout integration — replace stub with real BootstrapGate + popup UI | `_platform/auth` | 7 | Pending |
| 7 | Operator docs, migration, end-to-end tests, harness exercise | `_platform/auth` (+ docs) | 9 | Pending |

Total: 47 tasks across 7 phases.

---

## Acceptance Criteria (high-level — see spec for the full 25)

- [ ] AC-1/2/3: Fresh-browser gate, correct-code unlock, sticky after unlock
- [ ] AC-7/8: Persistence across server restart; rotation invalidates cookies
- [ ] AC-10: `/login` also gated
- [ ] AC-11/12: GitHub OAuth optional (both modes work)
- [ ] AC-13/14/15: Terminal protection always on (with or without `AUTH_SECRET`)
- [ ] AC-16/17: Sidecar sinks gated; CLI continues to work
- [ ] AC-18/19: `/api/health` and `/api/auth/*` stay public
- [ ] AC-20: Boot fails fast on misconfiguration
- [ ] AC-21: `DISABLE_AUTH` deprecation alias works + warns
- [ ] AC-22: Code never appears in logs
- [ ] AC-25: Cookie is `HttpOnly`

(See [spec](./auth-bootstrap-code-spec.md#acceptance-criteria) for the complete numbered list.)

---

## Key Risks (high-level — see spec for the full table)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Closing terminal-WS silent-bypass surprises operators | Medium | Medium | HKDF fallback so WS keeps working without `AUTH_SECRET`; release notes |
| Proxy rewrite locks operators out via off-by-one in bypass list | Medium | High | Test every excluded path; staged rollout |
| Next.js 16 RSC + HttpOnly + popup hydration subtleties | Medium | Medium | External research opportunity #1 in dossier; resolve in workshop 005 |
| 60-bit code + rate limit insufficient under attack | Low | High | External research opportunity #2; trivially upgradable to 80-bit |

---

## Open Questions — Resolved as Plan Defaults

(Clarify pass skipped per user direction; plan committed to defaults — see [plan § Pre-Plan Decisions](./auth-bootstrap-code-plan.md#pre-plan-decisions-skipped-clarify--defaults-committed).)

1. Workflow Mode → **Full**
2. Rate limit → **5/IP/60s leaky-bucket**
3. Code length → **12-char Crockford (60 bits)**
4. CLI `cg auth show-code` → **defer to v2**
5. Popup UX scope → **MVP** (no localStorage autofill in v1)
6. Forget endpoint discovery → **out-of-band only**
7. `DISABLE_AUTH` deprecation horizon → **one release with warning, remove next**
8. Harness coverage → **AC-1, AC-2, AC-13, AC-16 in Phase 7**

---

## Flight Log

<!-- Updated by /plan-3-v2-architect, /plan-5/6/7 after each phase completes -->

### 2026-04-30 — Specifying

Spec drafted from research dossier and workshop 004. Eight clarify questions queued. Workshop 005 (popup UX) recommended next; `/plan-3-v2-architect` will be enriched after clarify + workshop 005.

### 2026-04-30 — Plan ready (clarify skipped)

Plan-3 ran without a clarify pass per user direction. The 8 spec-level open questions were all parameter-tuning rather than foundational; plan committed defaults for each (see plan § Pre-Plan Decisions). 7 phases, 47 tasks total. Domain manifest covers ~17 new files + ~17 modified files. Constitution P1–P7 compliance reviewed — no deviations. Status promoted to **Ready**. Next: `/plan-4-v2-complete-the-plan` (fix all HIGH findings) → `/validate-v2`.

### 2026-04-30 — Phase 1 Landed (Shared Primitives)

All 7 tasks (T001–T007) implemented under TDD discipline. Public surface delivered: 14 names exported from `@chainglass/shared/auth-bootstrap-code` (types + Zod schema + Crockford generator + atomic-write persistence + HMAC cookie helpers + cwd-keyed `activeSigningSecret` with HKDF fallback + test-only cache-reset helper). Test coverage: **46 tests pass across 5 files** in 873ms. Constitution P1–P4, P7 satisfied. Plan key finding 01 (terminal-WS silent-bypass) is now structurally closed at the substrate level — `activeSigningSecret(cwd)` always returns a non-null Buffer. Validation fixes from `/validate-v2` baked in: `EnsureResult` exported (C-FC1), sync signature explicit (C-FC2), TSDoc cwd contract (C-FC3), `INVALID_FORMAT_SAMPLES: readonly` (C-FC4), EACCES propagation (C-Comp1), H6/C2 split (Cross-Ref H1), HMR test removed and replaced with cache-discipline test (Comp-H1), `afterEach` cleanup mandate (Comp-H2), 6-case enumeration parametric test (FC-H1), `@internal` JSDoc on test helper re-export (FC-H2). One CRITICAL validation finding (C-FC5 — export `BOOTSTRAP_CODE_ALPHABET`) was rejected in plan-4 and confirmed correct in implementation: T003 doesn't reference the alphabet; encapsulation by design. Next: `/plan-7-v2-code-review --phase "Phase 1: Shared Primitives" --plan ...`.

### 2026-05-02 — Phase 2 Landed (Boot Integration)

All 4 tasks (T001–T004) complete. T001 ships `apps/web/src/auth-bootstrap/boot.ts` (66 LOC) with `checkBootstrapMisconfiguration` (pure predicate; whitespace-only `AUTH_SECRET` rejected; case-sensitive literal `'true'` only disables; either-side-wins precedence) + `writeBootstrapCodeOnBoot` (idempotent wrapper around Phase 1's `ensureBootstrapCode`; never logs the code value). 14 tests pass in 7ms. T002 wires `apps/web/instrumentation.ts` with a third HMR-safe global flag (`__bootstrapCodeWritten`) — misconfig check + write live INSIDE the `NEXT_RUNTIME === 'nodejs'` branch (Edge runtime safe; `process.exit(1)` Node-only). Container guard preserved with explicit warn line. T003 adds two explicit `.gitignore` lines (`.chainglass/server.json`, `.chainglass/bootstrap-code.json`) at repo root; all 4 `git check-ignore -v` verifications pass; workflow-negation regression check intact. T004 captures pre-phase harness validation (✅ HEALTHY) + 60/60 regression sweep in 1.32s + working-tree audit; the live `pnpm dev` 8-step matrix is captured as an operator runbook in execution.log.md (deferred because user's harness was active). Constitution P1 (instrumentation → web helper → shared primitives = business → infrastructure) + P2 (interface-first via `MisconfigurationResult` discriminated union) + P3 (TDD on T001) + P4 (zero `vi.mock`) + P5 (1.32s test sweep) + P7 (web-only helper; shared primitives untouched) all satisfied. Companion code-review-companion (run `2026-05-02T12-27-45-639Z-92a4`) returned **APPROVE / 0 findings** for both T001 and T002. Next: `/plan-7-v2-code-review --phase "Phase 2: Boot Integration" --plan ...`.
