# Always-On Bootstrap-Code Auth — Implementation Plan

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-04-30
**Spec**: [auth-bootstrap-code-spec.md](./auth-bootstrap-code-spec.md)
**Research**: [auth-bootstrap-code-research.md](./auth-bootstrap-code-research.md)
**Workshops**:
- [004-bootstrap-code-lifecycle-and-verification.md](./workshops/004-bootstrap-code-lifecycle-and-verification.md) — server-side story (authoritative)
- _planned_: 005-popup-ux-and-rootlayout-integration.md (referenced; popup polish in Phase 6 may need it)
**Status**: DRAFT

---

## Summary

Generate a one-line, human-readable secret at server boot (`.chainglass/bootstrap-code.json`), require every browser to type it into a popup before any UI renders, and use the same secret as the root-of-trust for the terminal-WS sidecar and other local-process sinks. GitHub OAuth becomes a layered, optional second factor. Implementation is a 7-phase, domain-aware build: shared primitives → boot integration → server-side gate (verify/forget routes + proxy rewrite) → terminal hardening → sidecar-sink hardening + env-var rename → popup component → docs/migration/e2e. Closes three exposure holes the research dossier identified (terminal-WS silent-bypass, unauthenticated event-popper/tmux-events sinks, `DISABLE_AUTH=true` removing every gate) while lowering the barrier to first-run (no GitHub OAuth setup required for personal use).

---

## Pre-Plan Decisions (Skipped Clarify — Defaults Committed)

The user opted to run `/plan-3-v2-architect` directly without `/plan-2-v2-clarify`. The 8 spec-level open questions were all parameter-tuning rather than foundational design choices, so this plan commits to sensible defaults documented below. Any of these can be revisited by amending the plan; the workshop 004 design is unaffected by tuning these knobs.

| # | Question | Default Committed | Source |
|---|---|---|---|
| 1 | Workflow Mode | **Full** (CS-4 + security stakes) | Spec recommendation |
| 2 | Rate-limit policy | **5 attempts per IP per 60s, leaky-bucket, in-memory `Map`**, `Retry-After` on 429 | Workshop 004 § Verify API |
| 3 | Code length | **12 chars Crockford base32 (60 bits entropy)**, format `XXXX-XXXX-XXXX` | Workshop 004 § Code generation |
| 4 | CLI `cg auth show-code` in v1 | **Defer** to v2; the cat-the-file workflow is the v1 operator path | Spec recommendation |
| 5 | Popup UX scope for v1 | **MVP** — input, autoformat hyphens, error states (wrong code, format invalid, rate-limited). No `localStorage` autofill in v1 (deferrable to v2) | Spec recommendation; Phase 6 |
| 6 | Forget-endpoint UX | **Out-of-band only** in v1 (no Settings menu entry). Document the route in operator docs | Spec recommendation |
| 7 | `DISABLE_AUTH` deprecation horizon | **One release** with deprecation log; remove in the release after | Workshop 004 § Migration |
| 8 | Boot-time log hint | **Log absolute file path** of `.chainglass/bootstrap-code.json`; **never log the code value** | Workshop 004 § Operator UX |

If clarify is run later, this table is the single point of update.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/auth` | existing | **modify (primary)** | Owns bootstrap-code generator, verify/forget endpoints, proxy gate, popup component, cookie machinery. Existing GitHub OAuth pieces become a sub-feature within it. |
| `terminal` | existing | **modify** | Token-issuing route + WS sidecar consume `activeSigningSecret()`; silent-bypass closed; JWT gains `iss`/`aud`/`cwd` binding. |
| `_platform/events` | existing | **modify** | Sidecar HTTP sinks (event-popper, tmux events) gain composite `requireLocalAuth(req)` check. |
| `@chainglass/shared` | existing (package) | **modify** | New module `auth/bootstrap-code/` for code generation, file IO, cookie HMAC, signing-key helper. Per Constitution Principle 7. |
| `_platform/sdk` | existing | **consume** | Settings store; placeholder for future "rotate code" command (out of scope v1). |

No new domains created.

---

## Domain Manifest

Every file this plan introduces or modifies, mapped to its owning domain. Absolute paths.

### New files

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/types.ts` | `@chainglass/shared` (auth) | **contract** | Public types: `BootstrapCodeFile`, schema, regex, file-path constant, `BOOTSTRAP_COOKIE_NAME` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/generator.ts` | `@chainglass/shared` (auth) | internal | `generateBootstrapCode()` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/persistence.ts` | `@chainglass/shared` (auth) | internal | `readBootstrapCode`, `writeBootstrapCode`, `ensureBootstrapCode` (atomic temp+rename) |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/cookie.ts` | `@chainglass/shared` (auth) | **contract** | `buildCookieValue`, `verifyCookieValue` (HMAC-SHA256, timing-safe) |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/signing-key.ts` | `@chainglass/shared` (auth) | **contract** | `activeSigningSecret(cwd)` — `AUTH_SECRET` if set else HKDF from code; cache + test-reset |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth/bootstrap-code/index.ts` | `@chainglass/shared` (auth) | **contract** | Barrel export |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/bootstrap-code.ts` | `_platform/auth` | internal | Web-side `getBootstrapCodeAndKey()` accessor used by proxy + routes. **Renamed from `bootstrap.ts`** (Phase 3 dossier validation 2026-05-02): that path already exists for DI/config bootstrap (`apps/web/src/lib/bootstrap.ts:1-3` — "Application Bootstrap — Config Loading and DI Container Setup"). |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/local-auth.ts` | `_platform/events` | internal | `requireLocalAuth(req)` — composite cookie-or-X-Local-Token check |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/bootstrap/verify/route.ts` | `_platform/auth` | internal | `POST /api/bootstrap/verify` with rate limit |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/bootstrap/forget/route.ts` | `_platform/auth` | internal | `POST /api/bootstrap/forget` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/063-login/components/bootstrap-gate.tsx` | `_platform/auth` | internal | Server component shell — reads cookie, decides whether popup renders |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/063-login/components/bootstrap-popup.tsx` | `_platform/auth` | internal | Client component — modal dialog, form, error states |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/how/auth/bootstrap-code.md` | docs | docs | Operator guide |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/shared/auth-bootstrap-code/generator.test.ts` | `@chainglass/shared` (auth) | test | Distribution + regex |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/shared/auth-bootstrap-code/persistence.test.ts` | `@chainglass/shared` (auth) | test | Idempotence + corruption recovery |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/shared/auth-bootstrap-code/cookie.test.ts` | `@chainglass/shared` (auth) | test | HMAC sign/verify + rotation invalidation |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/shared/auth-bootstrap-code/signing-key.test.ts` | `@chainglass/shared` (auth) | test | AUTH_SECRET branch + HKDF branch + cache |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/api/bootstrap/verify.test.ts` | `_platform/auth` | test | Happy + 4xx + rate limit |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/api/bootstrap/forget.test.ts` | `_platform/auth` | test | Always 200 + Max-Age=0 |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/lib/local-auth.test.ts` | `_platform/events` | test | Cookie path / token path / both fail / non-localhost |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/web/auth-bootstrap-code.integration.test.ts` | `_platform/auth` | test | End-to-end: generate → verify → cookie-set → page renders |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/web/features/064-terminal/terminal-bootstrap.integration.test.ts` | `terminal` | test | WS auth with AUTH_SECRET set + unset |

### Modified files

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/instrumentation.ts` | `_platform/auth` | internal | Add bootstrap-code generation block; misconfiguration assertion |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/proxy.ts` | `_platform/auth` | internal | Broaden matcher; add cookie gate before auth chain |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/auth.ts` | `_platform/auth` | internal | Accept both `DISABLE_AUTH` and `DISABLE_GITHUB_OAUTH`; deprecation warning |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/layout.tsx` | `_platform/auth` | **cross-domain** | RootLayout wraps `{children}` in `<BootstrapGate>` (auth domain extending app shell) |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/server/terminal-ws.ts` | `terminal` | internal | Close silent-bypass; switch to `activeSigningSecret()`; enforce `iss`/`aud`/`cwd` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/terminal/token/route.ts` | `terminal` | internal | Sign with `activeSigningSecret()`; bind cwd; defence-in-depth cookie check |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/event-popper/ask-question/route.ts` | `_platform/events` | internal | Replace `localhostGuard`-only with `requireLocalAuth` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/event-popper/list/route.ts` | `_platform/events` | internal | Same |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/event-popper/route.ts` | `_platform/events` | internal | Same (and any other event-popper siblings) |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/tmux/events/route.ts` | `_platform/events` | internal | Same |
| `/Users/jordanknight/substrate/084-random-enhancements-3/.gitignore` | cross-cutting | infra | Explicit lines for `.chainglass/bootstrap-code.json` and `.chainglass/server.json` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/how/auth/github-oauth-setup.md` | docs | docs | Reference bootstrap-code as the always-on first layer |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/auth/domain.md` | `_platform/auth` | docs | Composition + Contracts + Concepts + Source Location + History |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/terminal/domain.md` | `terminal` | docs | History row + Composition note |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/events/domain.md` | `_platform/events` | docs | Composition (`requireLocalAuth`) + History |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | cross-cutting | docs | Add edges for signing-key dependency |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/proxy.test.ts` _(extend if exists)_ | `_platform/auth` | test | Cookie gate behaviour |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/064-terminal/server/terminal-ws.test.ts` _(extend)_ | `terminal` | test | Close silent-bypass; iss/aud assertion |

---

## Key Findings

| # | Impact | Finding | Action | Phases affected |
|---|--------|---------|--------|---|
| 01 | Critical | Terminal-WS silently degrades to no-auth when `AUTH_SECRET` unset (`terminal-ws.ts:235-240`) | Replace `authEnabled = !!authSecret` with `authEnabled = true`; signing key from `activeSigningSecret()` | 4 |
| 02 | Critical | `/api/event-popper/*` and `/api/tmux/events` only check `localhostGuard` — anyone on loopback can post | Apply `requireLocalAuth(req)` (cookie OR `X-Local-Token`) | 5 |
| 03 | Critical | `proxy.ts` matcher excludes `/login`, so a popup placed in proxy can't gate the login page itself | Place gate in `app/layout.tsx`; broaden proxy matcher with explicit bypass list | 3 |
| 04 | Critical | `DISABLE_AUTH=true` removes every gate today | Bootstrap gate runs *before* `DISABLE_AUTH` short-circuit; rename env to `DISABLE_GITHUB_OAUTH` with deprecation alias | 3, 5 |
| 05 | High | `/api/terminal/token` JWTs lack `iss`/`aud`/`cwd` — token from one tab/cwd valid in another | Add `iss: 'chainglass'`, `aud: 'terminal-ws'`, `cwd` claims; enforce in WS validator | 4 |
| 06 | High | Plan 067 `localToken` already provides the file-based local-trust pattern (`.chainglass/server.json`); CLI sidecars send it as `X-Local-Token` | Reuse — `requireLocalAuth` reads via `port-discovery.readServerInfo`. CLI flows untouched. | 5 |
| 07 | High | Plan 064 `terminal/token` route already implements the HTTP→JWT→WS pattern we need | Extend, don't replace — add bootstrap-cookie pre-check + `activeSigningSecret()` substitution | 4 |
| 08 | High | NextAuth (Auth.js v5) requires `AUTH_SECRET` for its own session JWT signing | Boot-time assertion: GitHub OAuth on + `AUTH_SECRET` unset → `process.exit(1)`; clear error | 2 |
| 09 | High | Existing instrumentation.ts has the HMR-safe boot-write pattern (`globalThis.__eventPopperServerInfoWritten`) | Mirror precisely with `__bootstrapCodeWritten`; reuse atomic temp+rename helper from `port-discovery.ts:139-160` | 2 |
| 10 | High | RootLayout has no auth gate today (`apps/web/app/layout.tsx`); ideal home for `<BootstrapGate>` since it wraps all routes including `/login` | Server component reads cookie, passes `bootstrapVerified: boolean` to client `<BootstrapGate>`; popup paints over `{children}` | 3 (stub), 6 (real) |
| 11 | High | No existing rate-limit primitive in repo (verified by grep) | Build minimal in-memory leaky-bucket inside `verify` route; do not over-engineer | 3 |
| 12 | High | Constitution Principle 4 (Fakes Over Mocks) and Principle 2 (Interface-First) apply | Generator/persistence/cookie/signing-key get interfaces in shared types; tests use real fakes (no `vi.mock`) | 1, all test phases |
| 13 | Medium | Crockford base32 alphabet doesn't collide with ADR-0003 secret-detection patterns (`sk-`, `ghp_`, `xoxb-`, etc.) | Confirmed safe; no special handling needed | 1 |
| 14 | Medium | Existing test pattern uses real fs + temp dirs (e.g. `live-monitoring-rescan` integration tests) | Reuse the pattern: per-test temp dir as `cwd`, real file IO | All test tasks |

---

## Constitution & Architecture Compliance

| Principle | Compliance | Note |
|---|---|---|
| **P1 — Clean Architecture / Dependency Direction** | ✅ | Shared package exports types and pure functions; web app consumes them. No reverse direction. |
| **P2 — Interface-First** | ✅ | `BootstrapCodeFile`, `EnsureResult`, `LocalAuthResult` types defined first; implementations follow. |
| **P3 — TDD (RED-GREEN-REFACTOR)** | ✅ | Each task is paired with test tasks; phase ordering puts unit tests before integration. |
| **P4 — Fakes Over Mocks** | ✅ | No `vi.mock()` / `vi.spyOn()`. Tests use real `node:crypto`, real fs in temp dirs. Where DI needed (e.g., HKDF source), use real fakes. |
| **P5 — Fast Feedback Loops** | ✅ | Pure-function shared modules unit-test in milliseconds; integration tests scoped to a single endpoint. |
| **P6 — DX First** | ✅ | New operator setup: cat the file, type the code. Boot-log path hint. |
| **P7 — Shared by Default** | ✅ | All reusable primitives (generator, persistence, cookie, signing key) in `packages/shared/`. |

**No principle violations expected. No deviations table required.**

### Architecture (`docs/project-rules/architecture.md`)

The new `_platform/auth` extensions stay within the existing `_platform` infrastructure layer. The `terminal` domain consumes `_platform/auth` via `activeSigningSecret()` — that's a `business → infrastructure` import, allowed. `_platform/events` similarly consumes `_platform/auth` via `requireLocalAuth` — allowed.

No layer-boundary violations.

### ADR alignment

- **ADR-0003 (Configuration System)**: Bootstrap code is *not* a secret-format collision; the chosen Crockford alphabet is distinct from the detected `sk-`, `ghp_`, etc. patterns. The code file is gitignored.
- **ADR-0004 (DI Container)**: Shared primitives are pure functions — they don't enter the DI container. Web-side accessor (`apps/web/src/lib/bootstrap-code.ts`) is a thin module-level singleton; if it gains state, it'd graduate to a DI service.

---

## Harness Strategy

- **Current Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
- **Target Maturity**: L3 (no upgrade required for this plan)
- **Boot Command**: `pnpm dev` (port 3000) — already the project default
- **Health Check**: `curl -f http://localhost:3000/api/health`
- **Interaction Model**: HTTP API (verify/forget routes) + Browser (popup) + CLI (existing `X-Local-Token` flow)
- **Evidence Capture**: HTTP responses + screenshots
- **Pre-Phase Validation**: Required at start of every phase (Boot → Interact → Observe). Phase 7 explicitly exercises the harness end-to-end.

The harness is sufficient as-is. We do not need to extend it.

---

## Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|---------------|-----------|------------|
| 1 | Shared primitives | `@chainglass/shared` | Pure functions: generator, persistence, cookie HMAC, signing-key helper | None |
| 2 | Boot integration | `_platform/auth` | `instrumentation.ts` writes the file; misconfiguration assertion; gitignore | 1 |
| 3 | Server-side gate (verify/forget + proxy + RootLayout stub) | `_platform/auth` | Cookie machinery wired end-to-end; popup stub renders when cookie missing | 1, 2 |
| 4 | Terminal sidecar hardening | `terminal` | Close silent-bypass; HKDF fallback; JWT iss/aud/cwd | 1, 2 |
| 5 | Sidecar HTTP-sink hardening + env-var rename | `_platform/events` (+ `_platform/auth`) | `requireLocalAuth`; apply to event-popper / tmux events; `DISABLE_GITHUB_OAUTH` alias | 1, 2 |
| 6 | Popup component | `_platform/auth` | Replace stub with real BootstrapGate + popup UI; accessibility; mobile rendering | 3 |
| 7 | Operator docs, migration, e2e | `_platform/auth` (+ docs) | `docs/how/auth/bootstrap-code.md`; domain.md updates; full env-var matrix e2e tests; harness exercise | 1–6 |

---

## Phase 1 — Shared Primitives

**Objective**: Build the pure-function library every other phase consumes. Zero web/runtime deps.
**Domain**: `@chainglass/shared` (auth sub-module)
**Delivers**:
- 6 source files under `packages/shared/src/auth/bootstrap-code/`
- 4 unit-test files under `test/unit/shared/auth-bootstrap-code/`
- Public surface exported via barrel
**Depends on**: None
**Key risks**: HMAC and HKDF algorithm choices — mitigated by following workshop 004 explicitly. Crockford regex precision — covered by tests. AUTH_SECRET vs HKDF cache invalidation in tests — `_resetSigningSecretCacheForTests()` provided.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Define types: `BootstrapCodeFile`, Zod schema, `BOOTSTRAP_CODE_PATTERN`, `BOOTSTRAP_COOKIE_NAME`, `BOOTSTRAP_CODE_FILE_PATH_REL` | `@chainglass/shared` | TypeScript compiles; types exported from barrel | Workshop 004 § File Format |
| 1.2 | Implement `generateBootstrapCode()` using `node:crypto.randomInt` over Crockford alphabet | `@chainglass/shared` | Returns 14-char `XXXX-XXXX-XXXX`; matches regex; 1k generations all unique | Per finding 13 |
| 1.3 | Implement `readBootstrapCode(path)` + `writeBootstrapCode(path, file)` + `ensureBootstrapCode(cwd)` with atomic temp+rename | `@chainglass/shared` | File round-trips; corrupt JSON → null; missing file → null; ensure regenerates if missing/corrupt | Per finding 09 — reuse port-discovery pattern |
| 1.4 | Implement `buildCookieValue(code, key)` + `verifyCookieValue(value, code, key)` (HMAC-SHA256, base64url, timing-safe) | `@chainglass/shared` | Round-trip works; wrong code rejected; rotation (different code → same key) rejected; constant-time | Workshop 004 § The Browser Cookie |
| 1.5 | Implement `activeSigningSecret(cwd)` with AUTH_SECRET-or-HKDF fallback, **module-level cache keyed by `cwd`**, `_resetSigningSecretCacheForTests()`. Process-lifetime cache; only invalidated by explicit reset call or process restart. **Document the cwd contract**: callers must pass a path that resolves to the project root containing `.chainglass/`; sidecars must inherit or explicitly set the same cwd as the main process or the HKDF derivation diverges. | `@chainglass/shared` | AUTH_SECRET set → returns env-derived buffer (HKDF path not invoked); unset → returns deterministic HKDF for the given cwd; same `cwd` returns identical buffer across calls; different `cwd` produces a different buffer | Per finding 01 — closes the WS silent-bypass. **Validation fix C2/H6**: cache keying explicit so async caller cost is bounded. |
| 1.6 | Barrel `index.ts` exporting public surface | `@chainglass/shared` | Importing from `@chainglass/shared/auth-bootstrap-code` resolves to all 5 contracts; `_resetSigningSecretCacheForTests` exported but documented as test-only via JSDoc tag (`@internal`) | Constitution P7 |
| 1.7 | Unit tests for all 5 modules — distribution, idempotence, HMAC, signing-key cache, regression-safe corruption recovery. **Cache discipline (validation fix C2)**: every signing-key test that varies `AUTH_SECRET` or `cwd` MUST call `_resetSigningSecretCacheForTests()` in `beforeEach`; explicit cache-survives-HMR test reloads the module and asserts the same instance returns. **Edge cases (validation fix from completeness review)**: `readBootstrapCode` covers (a) missing file, (b) zero-byte file, (c) malformed JSON, (d) JSON missing required fields, (e) JSON with invalid `code` regex — each returns `null`. | `@chainglass/shared` | All pass via `pnpm test --filter @chainglass/shared`; no `vi.mock` used | Constitution P3, P4 |

**Acceptance criteria covered**: AC-9 (boot regenerates only when missing — verified at the helper level).

---

## Phase 2 — Boot Integration

**Objective**: Wire the shared library into the server boot sequence. File on disk; assertion on misconfiguration.
**Domain**: `_platform/auth`
**Delivers**:
- `apps/web/instrumentation.ts` modifications (HMR-safe write, misconfiguration assertion)
- `.gitignore` lines
- Boot-log hint pointing to file path (no code value)
**Depends on**: Phase 1
**Key risks**: HMR double-write (mitigated by `globalThis.__bootstrapCodeWritten` flag — finding 09). Process-exit on misconfiguration (must be deterministic and informative).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add HMR-safe `__bootstrapCodeWritten` block to `instrumentation.ts`; call `ensureBootstrapCode(process.cwd())`; log absolute path | `_platform/auth` | File present after first boot; second boot reuses; HMR re-import does not regenerate | Per finding 09; **never log the code itself** (default 8) |
| 2.2 | Add boot-time assertion: GitHub OAuth on + `AUTH_SECRET` unset → log + `process.exit(1)` | `_platform/auth` | Misconfigured boot exits with code 1 and one clear log line; correctly configured boots succeed | Per finding 08 (AC-20) |
| 2.3 | Update `.gitignore`: explicit lines for `.chainglass/bootstrap-code.json` and `.chainglass/server.json` | infra | `git status` after first boot does not list either file | — |
| 2.4 | Unit tests: instrumentation idempotence (HMR safety); assertion fires under misconfiguration; passes when configured | `_platform/auth` | Tests pass with real fs in temp dir | Constitution P4 |

**Acceptance criteria covered**: AC-9 (file persists, regen on missing/corrupt), AC-17 (HMR safety), AC-20 (boot fails fast on misconfig), AC-22 (no code in logs), AC-23 (file gitignored — covered by T003).

---

## Phase 3 — Server-Side Gate (Verify/Forget + Proxy + RootLayout Stub)

**Objective**: Wire the entire server-side gate end-to-end. After this phase, a request without a valid bootstrap cookie cannot reach any sensitive route, and a request to a page surface gets through to RootLayout where a stub gate renders. Phase 6 replaces the stub with the real popup.
**Domain**: `_platform/auth`
**Delivers**:
- `POST /api/bootstrap/verify` (with rate limit) and `POST /api/bootstrap/forget`
- Rewritten `proxy.ts` with broadened matcher and `AUTH_BYPASS_ROUTES` list
- `apps/web/src/lib/bootstrap-code.ts` web-side accessor
- RootLayout integration: server component reads cookie, passes `bootstrapVerified: boolean` to a `<BootstrapGate>` client stub
- Stub `<BootstrapGate>` component (Phase 6 replaces with real popup)
**Depends on**: Phase 1 (cookie helper, signing key), Phase 2 (file on disk)
**Key risks**: Off-by-one in the proxy bypass list could lock operators out (finding 03, 04). RootLayout cookie read in server context needs Next.js 16 RSC pattern (research opportunity #1 in dossier).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Implement `apps/web/src/lib/bootstrap-code.ts` — **async** `getBootstrapCodeAndKey()` returning `Promise<{ code: string, key: Buffer }>` from shared helpers. **Cache the result** in a module-level `let` after first read; only recompute via explicit `_resetForTests()`. Caller cost on every request is then constant-time after first call. | `_platform/auth` | Returns same instance on repeated calls; throws if file missing on first call | Wraps `ensureBootstrapCode` + `activeSigningSecret`; **validation fix H6** — async signature + cache committed. **Phase 3 dossier validation 2026-05-02**: filename changed from `bootstrap.ts` (existing DI/config file) to `bootstrap-code.ts`. |
| 3.2 | Implement `POST /api/bootstrap/verify` route — JSON body `{ code }`, format check, constant-time compare, set HMAC cookie, in-memory per-IP token-bucket rate limit (5/60s). 429 response body MUST include `{ error: 'rate-limited', retryAfterMs: number }` (referenced by Phase 6 popup error UI). | `_platform/auth` | 200 + cookie on correct; 400 on format-invalid with body `{ error: 'invalid-format' }`; 401 on wrong with body `{ error: 'wrong-code' }`; 429 + `Retry-After` header + `retryAfterMs` body after 5 wrong | Default 2 |
| 3.3 | Implement `POST /api/bootstrap/forget` — clears cookie unconditionally, returns 200 | `_platform/auth` | `Set-Cookie: ...; Max-Age=0` on every call | AC-24 |
| 3.4 | Rewrite `apps/web/proxy.ts` — broaden matcher to `/((?!_next/static\|_next/image\|favicon\\.ico\|manifest\\.webmanifest).*)`; explicit final `AUTH_BYPASS_ROUTES = ['/api/health', '/api/auth', '/api/bootstrap/verify', '/api/bootstrap/forget']` and **nothing else**; cookie check before auth chain; page request → `next()` (popup paints), API request → 401. **Routes that go through proxy cookie-gate (NOT in bypass list)**: `/api/events/*` (then inline `auth()` as defence-in-depth), `/api/event-popper/*` (then `requireLocalAuth` in Phase 5), `/api/tmux/events` (same), `/api/terminal/token` (then `auth()` for session). **Validation fix H7** — exact bypass list and non-bypass disposition committed; resolves workshop-vs-plan ambiguity. | `_platform/auth` | Every excluded path reachable without cookie; every other path requires cookie or is gated by its own composite check downstream | Per findings 03, 04 |
| 3.5 | RootLayout integration: server component reads `chainglass-bootstrap` cookie, calls `verifyCookieValue`, passes `bootstrapVerified` to `<BootstrapGate>` stub | `_platform/auth` (cross-domain on `app/layout.tsx`) | Verified user sees normal layout; unverified user sees stub overlay | Stub renders "Bootstrap code required" placeholder; Phase 6 replaces |
| 3.6 | Stub `bootstrap-gate.tsx` + `bootstrap-popup.tsx` (placeholder UI sufficient to test gate behaviour) | `_platform/auth` | Placeholder renders when `bootstrapVerified=false`; renders nothing when `true` | Real implementation in Phase 6 |
| 3.7 | Integration tests: verify happy-path; verify wrong code; verify format-invalid; verify rate limit (5 attempts → 429); forget clears cookie; proxy bypass list; proxy 401 on `/api/*` without cookie; proxy pass-through on page without cookie. **Format-invalid test cases (validation fix C3)**: each must return 400 with `{ error: 'invalid-format' }` (not 401): (a) too short (`<`14 chars), (b) too long (`>`14 chars), (c) missing hyphens (`'7K2P9XQM3T8R'`), (d) lowercase only or mixed-case (`'7k2p-9xqm-3t8r'`), (e) illegal characters (`'7K2P-9XQM_3T8R'`, `'7K2P-9XQM-3T8I'` — `I` is excluded), (f) embedded whitespace (`'7K2P -9XQM-3T8R'`). **Test scaffolding (validation fix from FC review)**: export `setupBootstrapTestEnv()` helper from this file for Phase 6 to reuse, returning `{ cwd, code, verifyUrl, forgetUrl }`. | `_platform/auth` | All pass; tests use real fs + real HTTP routes | Per finding 14 (real-fs pattern) |

**Acceptance criteria covered**: AC-1 (with stub), AC-2 (with stub), AC-4, AC-5, AC-6, AC-7, AC-8, AC-10 (with stub), AC-18, AC-19, AC-24, AC-25.

---

## Phase 4 — Terminal Sidecar Hardening

**Objective**: Close the silent-bypass; switch to unified signing key; harden JWT.
**Domain**: `terminal`
**Delivers**:
- `terminal-ws.ts` no longer accepts unauthenticated connections under any env-var combination
- `/api/terminal/token` signs with `activeSigningSecret()`; binds `iss`/`aud`/`cwd`
- Defence-in-depth: token route also requires bootstrap cookie (proxy already gated, but explicit)
**Depends on**: Phase 1 (hard — `activeSigningSecret`), Phase 2 (hard — file on disk). **Phase 3 is a soft dep** (proxy cookie-gate is upstream defence-in-depth for `/api/terminal/token`); the terminal-WS hardening tasks themselves are unit-testable without Phase 3, but the AC-15 integration test does require Phase 3's verify-route to be in place to set the cookie. **Validation fix H1** — soft/hard split made explicit.
**Key risks**: Behaviour change for operators relying on silent-bypass (R-1 in spec). Caching of `activeSigningSecret()` across HMR (mitigated — `_resetSigningSecretCacheForTests()`). **Sidecar `cwd` divergence** — the WS sidecar must run with the same `cwd` as the main Next.js process or the HKDF key diverges (validation fix C5 — see task 4.1 below).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Update `apps/web/src/features/064-terminal/server/terminal-ws.ts` — replace `authEnabled = !!authSecret` with always-on; signing key from `activeSigningSecret(process.cwd())`. **Sidecar cwd contract (validation fix C5)**: add a one-line comment at the call site stating `// Signing-key derivation requires sidecar cwd === main Next.js process cwd; if forking the sidecar, inherit cwd or pass it explicitly via spawn options.` Add a startup assertion: if `bootstrap-code.json` cannot be read at sidecar startup, log a clear error pointing at cwd and exit. | `terminal` | WS rejects unauthenticated upgrade; accepts JWT signed with current active key; clear error if sidecar cwd lacks the bootstrap-code file | Per finding 01; **validation fix C5** |
| 4.2 | WS validator enforces `iss === 'chainglass'` and `aud === 'terminal-ws'`; verify `cwd` claim matches sidecar's process cwd. **Origin header check (validation fix H3)**: also enforce `req.headers.origin` is in an allowlist (default: `http://localhost:<NEXT_PORT>`, `https://localhost:<NEXT_PORT>`, plus any value from a new optional env var `TERMINAL_WS_ALLOWED_ORIGINS` for remote-dev setups). Cross-origin upgrade rejected with 4403. CSWSH residual risk thereby mitigated for default localhost binding; for `0.0.0.0` deployments, operators must whitelist explicitly. | `terminal` | JWT with wrong iss/aud/cwd rejected with 4403; cross-origin upgrade rejected with 4403; same-origin (or whitelisted-origin) upgrade with valid JWT succeeds | Per finding 05; **validation fix H3** — closes CSWSH residual risk |
| 4.3 | Update `apps/web/app/api/terminal/token/route.ts` — sign with `activeSigningSecret()`; add `iss`, `aud`, `cwd`; require bootstrap cookie | `terminal` | Returns JWT with correct claims; 401 without cookie | Per findings 05, 07 |
| 4.4 | Extend existing terminal-WS unit tests: AUTH_SECRET set (existing) + AUTH_SECRET unset (new) cases; iss/aud/cwd assertions; **Origin header tests** (whitelist match, mismatch, missing — validation fix H3) | `terminal` | Tests pass under both env-var combinations and Origin scenarios | Per finding 12 |
| 4.5 | Integration test confirming silent-bypass is **closed** (validation fix C4) — runs in **two scenarios**: **(a) AUTH_SECRET unset, cookie set**: fetch `/api/terminal/token` returns 200 + JWT signed via HKDF; WS upgrade with that JWT succeeds (HKDF path proven); **(b) AUTH_SECRET unset, NO cookie**: fetch `/api/terminal/token` returns 401 (proxy cookie-gate blocks); a hand-crafted unsigned WS upgrade is rejected (silent-bypass path proven closed). | `terminal` | Both scenarios behave as specified | AC-13 |
| 4.6 | Integration test: with `AUTH_SECRET` set, existing flows still work | `terminal` | No regression vs current shipping behaviour | AC-14 |

**Acceptance criteria covered**: AC-13 (with 2-case proof), AC-14, AC-15.

---

## Phase 5 — Sidecar HTTP-Sink Hardening + Env-Var Rename

**Objective**: Apply composite cookie-or-localToken auth to event-popper / tmux-events sinks. Rename `DISABLE_AUTH` → `DISABLE_GITHUB_OAUTH` with one-release deprecation alias.
**Domain**: `_platform/events` (sinks) + `_platform/auth` (env-var rename)
**Delivers**:
- `apps/web/src/lib/local-auth.ts` — `requireLocalAuth(req)` returning `LocalAuthResult`
- All `/api/event-popper/*` and `/api/tmux/events` routes apply `requireLocalAuth` at top
- `apps/web/src/auth.ts` accepts both env-var names; emits deprecation warning on legacy
- `apps/web/proxy.ts` already accepts both (Phase 3); this phase verifies + adds tests
**Depends on**: Phase 1, Phase 2, Phase 3 (cookie helper)
**Key risks**: Over-broad change to many route files — easy to miss one. Mitigation: explicit list (event-popper/{ask-question, list, route}, tmux/events) and grep-based audit task.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Implement `apps/web/src/lib/local-auth.ts` — `requireLocalAuth(req)` with `localhostGuard` first, then cookie via `verifyCookieValue`, then `X-Local-Token` via `port-discovery.readServerInfo`. **Use the cached `getBootstrapCodeAndKey()` from Phase 3.1** for the cookie verification path; `readServerInfo` is already cached by Plan 067 — no additional fs read on the hot path. | `_platform/events` | Returns `{ok:true,via:'cookie'}` / `{ok:true,via:'local-token'}` / `{ok:false,reason:'not-localhost'\|'no-credential'\|'bad-credential'}` | Per finding 06 |
| 5.2 | Apply `requireLocalAuth` at top of every event-popper and tmux-events route. **Explicit route enumeration (validation fix H2)** — at minimum: `apps/web/app/api/event-popper/route.ts`, `apps/web/app/api/event-popper/list/route.ts`, `apps/web/app/api/event-popper/ask-question/route.ts`, plus any sibling under `apps/web/app/api/event-popper/`. **Verification step**: run `grep -L 'requireLocalAuth' apps/web/app/api/event-popper/**/*.ts apps/web/app/api/tmux/events/route.ts` — output must be empty (zero files lacking the helper). **Default-deny pattern**: add a header comment to each new event-popper route file template: `// REQUIRED: call requireLocalAuth(req) at top of handler before any business logic.` | `_platform/events` | Every enumerated route returns 401 without credentials, 200 with either; `grep -L` audit returns zero files | Per finding 02; **validation fix H2** |
| 5.3 | Apply `requireLocalAuth` to `/api/tmux/events` (also covered by enumeration in 5.2) | `_platform/events` | Returns 401 without credentials, 200 with either | Per finding 02 |
| 5.4 | Update `apps/web/src/auth.ts` — accept `DISABLE_GITHUB_OAUTH=true`; legacy `DISABLE_AUTH=true` still works with `console.warn` deprecation | `_platform/auth` | Both env-vars trigger fake-session path; warning printed once per process | Per finding 04, default 7 |
| 5.5 | Update `apps/web/proxy.ts` (verify Phase 3 work) — both env-vars accepted | `_platform/auth` | Tests confirm parity | Per finding 04 |
| 5.6 | Unit tests for `requireLocalAuth`: cookie path; token path; both fail; non-localhost rejected even with valid cookie | `_platform/events` | All pass; no `vi.mock` | Constitution P4 |
| 5.7 | Integration tests: event-popper POST without auth → 401; with cookie → 200; with token → 200 | `_platform/events` | All pass against real route handlers | AC-16, AC-17 |

**Acceptance criteria covered**: AC-11, AC-16, AC-17, AC-21.

---

## Phase 6 — Popup Component & RootLayout Integration

**Objective**: Replace the Phase 3 stub with the real popup. Accessible, mobile-renderable, MVP scope.
**Domain**: `_platform/auth`
**Delivers**:
- Real `<BootstrapGate>` server component (replaces stub)
- Real `<BootstrapPopup>` client component with form, autoformat, error states, success → revalidate
- Accessibility pass (focus trap, ARIA, keyboard-only)
- Mobile rendering (iOS Safari + Android Chrome at standard viewports)
**Depends on**: Phase 3 (verify route, RootLayout signal)
**Key risks**: Hydration flash if server renders unprotected then client hides (R-3 in spec). Mitigation: server passes `bootstrapVerified: boolean`, client renders modal **inside** the layout tree so server already knows what to render.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Implement `bootstrap-popup.tsx` client component — input field with hyphen autoformat, submit button, error states (wrong-code, format-invalid, rate-limited) | `_platform/auth` | Submitting correct code calls verify, reloads (or revalidates) on 200 | Default 5 (MVP) |
| 6.2 | Implement `bootstrap-gate.tsx` server component — reads cookie, verifies, passes prop to client; replaces Phase 3 stub | `_platform/auth` | Verified user → no popup; unverified → modal renders over `{children}` | Per finding 10 |
| 6.3 | Wire into `apps/web/app/layout.tsx` — wrap `{children}` in `<BootstrapGate>` | `_platform/auth` | Every route shows popup when unverified | AC-1, AC-10 |
| 6.4 | Accessibility — focus trap; ARIA `role="dialog"` + `aria-modal="true"`; ESC disabled (modal); keyboard-only flow tested | `_platform/auth` | Manual + automated a11y check passes | — |
| 6.5 | Mobile rendering — iOS Safari + Android Chrome; on-screen keyboard does not break layout; safe-area padding | `_platform/auth` | Manual smoke at 375×667 + 414×896 viewports | Default 5 |
| 6.6 | Integration tests: cookie-set after submit → popup hides on next render; wrong code → popup remains with error; format error vs wrong-code error distinct | `_platform/auth` | All pass | AC-2, AC-4, AC-5 |
| 6.7 | (Optional gate) Cross-check against workshop 005 if it has been written by this phase | `_platform/auth` | Any deltas folded in | If workshop 005 not yet written, ship MVP and revisit in fast-follow |

**Acceptance criteria covered**: AC-1 (real), AC-2 (real), AC-3, AC-9 (UI side), AC-10 (real).

---

## Phase 7 — Operator Docs, Migration, End-to-End

**Objective**: Author operator-facing docs, update domain docs, ship the full env-var-matrix e2e tests, exercise the harness.
**Domain**: `_platform/auth` + cross-cutting docs
**Delivers**:
- `docs/how/auth/bootstrap-code.md` (new)
- Updates to `docs/how/auth/github-oauth-setup.md`
- Domain.md History rows for `_platform/auth`, `terminal`, `_platform/events`
- `docs/domains/domain-map.md` edge updates
- E2E test matrix exercising every reasonable env-var combination
- Harness exercise covering AC-1, AC-2, AC-13, AC-16
**Depends on**: Phases 1–6
**Key risks**: Domain.md drift if content from earlier phases isn't documented. Mitigation: this phase explicitly audits all touched domains.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | Author `docs/how/auth/bootstrap-code.md` (workshop 004 outline: what / where / how to view / how to rotate / composition with GitHub / troubleshooting) | docs | Markdown lints; all sections present | — |
| 7.2 | Update `docs/how/auth/github-oauth-setup.md` to reference the bootstrap-code as the always-on first layer | docs | Cross-references valid | — |
| 7.3 | Update `_platform/auth/domain.md` — Composition (BootstrapGate, popup, verify route, forget route, helpers), Contracts (signing key, cookie), Concepts (Verify the bootstrap code, Persist verification), Source Location, Dependencies (depends on `@chainglass/shared`), History row | `_platform/auth` | Domain doc reflects every shipped piece | Per task plan-6 v2 step 4 |
| 7.4 | Update `terminal/domain.md` History | `terminal` | One History row | — |
| 7.5 | Update `_platform/events/domain.md` — Composition (`requireLocalAuth`), History row | `_platform/events` | Domain doc reflects shipped helper | — |
| 7.6 | Update `docs/domains/domain-map.md` — add edges `terminal → _platform/auth` (signing key) and `_platform/events → _platform/auth` (cookie verification) | docs | Mermaid renders; legend correct | — |
| 7.7 | E2E test matrix: every cell of `(AUTH_SECRET=set\|unset) × (DISABLE_GITHUB_OAUTH=set\|unset)` exercised — 4 cells, **plus** the deprecation-alias cell `(AUTH_SECRET=set, DISABLE_AUTH=true legacy)` confirming AC-21 — total 5 cells. Hard-fail cell `(AUTH_SECRET=unset, GitHub OAuth on)` exercised separately as a boot-failure test. | `_platform/auth` | All 5 cells gate as specified; hard-fail cell exits with code 1 | AC-11, AC-12, AC-13, AC-14, AC-20, AC-21 |
| 7.8 | Harness exercise (L3): boot fresh worktree → cat the file → curl `/api/bootstrap/verify` → curl `/api/terminal/token` → smoke WS upgrade. Capture stdout/stderr from the entire boot + interaction flow. | `_platform/auth` | Evidence captured; AC-1/2/13/16 confirmed at the system level | Spec Q-8 |
| 7.9 | Migration runbook `docs/how/auth/migration-bootstrap-code.md` covering: **(a)** the behaviour change (terminal-WS auth always on; previously bypassed when `AUTH_SECRET` unset); **(b)** rationale (closes silent-bypass exposure hole); **(c)** required env-var actions for each existing setup combination (table); **(d)** how to confirm correctness (one-liner: `curl /api/health`, then verify popup appears at `/`, then check terminal WS connects in browser); **(e)** recovery if WS breaks (set `AUTH_SECRET` temporarily, redeploy, inspect logs); **(f)** the `DISABLE_AUTH → DISABLE_GITHUB_OAUTH` rename with the one-release deprecation horizon. **Validation fix C1** — runbook content outline now specified; not freeform. | docs | All six sections present; cross-link from `bootstrap-code.md` | Default 7 |
| 7.10 | **AC-22 log audit (validation fix H5)** — automated test in CI: spawn the dev server with a deterministic seed (override `generateBootstrapCode` to a known value like `'TEST-TEST-TEST'`), capture stdout + stderr for 60 seconds across boot + a verify-route call + a terminal-token call + a WS upgrade. Run `grep 'TEST-TEST-TEST'` over captured logs — must return zero matches. Same test asserts the file path *is* logged at boot. | `_platform/auth` | Zero matches of the code value in any captured log; file path appears exactly once at boot | AC-22 |

**Acceptance criteria covered**: AC-12, AC-21 (Phase 7.7), AC-22 (Phase 7.10 — automated audit), AC-23 (final audit), AC-26 (Phase 7.7 + runbook), domain-map updates, all docs.

---

## Acceptance Criteria — Phase Mapping

| AC | Phase(s) Where It Becomes True |
|---|---|
| AC-1 Fresh-browser gate | 3 (stub) → 6 (real) |
| AC-2 Correct-code unlock | 3 (verify route) → 6 (popup UX) |
| AC-3 Sticky unlock | 3 (cookie persistence) |
| AC-4 Wrong-code rejection | 3 (route) → 6 (popup error) |
| AC-5 Format validation | 3 (route) → 6 (popup error) |
| AC-6 Rate limit | 3 |
| AC-7 Persistence across server restart | 2 (file persists), 3 (cookie HMAC stable) |
| AC-8 Rotation invalidates cookies | 1 (HMAC depends on code), 2 (file regenerates) |
| AC-9 Boot regenerates only when missing | 1 (helper), 2 (instrumentation) |
| AC-10 Popup gates `/login` | 3 (RootLayout) → 6 |
| AC-11 GitHub OAuth disabled mode | 3 (proxy), 5 (auth.ts), 7 (e2e) |
| AC-12 GitHub OAuth enabled mode | 3 (proxy), 7 (e2e) |
| AC-13 Terminal WS without `AUTH_SECRET` | 4 |
| AC-14 Terminal WS with `AUTH_SECRET` | 4 |
| AC-15 Terminal token route gated | 4 |
| AC-16 Sidecar sinks gated | 5 |
| AC-17 CLI continues to work | 5, 7 |
| AC-18 Health probe public | 3 |
| AC-19 NextAuth callback public | 3 |
| AC-20 Hard fail on misconfiguration | 2 |
| AC-21 Deprecation alias | 5 |
| AC-22 No code in logs | 2 (boot — never log) → 7 task 7.10 (automated grep audit in CI) |
| AC-23 HMR safety | 2 |
| AC-24 Forget endpoint | 3 |
| AC-25 HttpOnly cookie | 3 |
| AC-26 `AUTH_SECRET` rotation invalidates all sessions | 7 task 7.7 (5th cell) + 7.9 (runbook documents expected behaviour) |

Every AC has at least one phase. Every phase delivers at least two ACs (or domain-doc updates in Phase 7).

---

## Risks

| Risk | Likelihood | Impact | Mitigation | Phase(s) |
|------|------------|--------|------------|----------|
| Closing terminal-WS silent-bypass surprises operators relying on it | Medium | Medium | HKDF fallback signing key keeps WS working; release notes call out behaviour change | 4, 7 |
| Proxy rewrite locks operators out via off-by-one in bypass list | Medium | High | Explicit `AUTH_BYPASS_ROUTES` array; integration test exercises every excluded path; staged rollout to staging environment | 3 |
| Next.js 16 RSC + HttpOnly + popup hydration flash | Medium | Medium | Server component reads cookie and renders gate state authoritatively; client component does not toggle visibility on mount | 3, 6 |
| 60-bit code + rate limit insufficient under network attack | Low | High | External research opportunity #2 (in dossier) validates parameters; trivially upgradable to 16-char (80 bits) | 1, 7 |
| Operator deletes `bootstrap-code.json` mid-boot, racing regen | Very Low | Low | Boot is single-process; idempotent atomic-write; corrupt-file branch regenerates | 2 |
| Cookie collides with NextAuth session cookie | Very Low | Low | Distinct names; cookie tests confirm | 3 |
| Stale `activeSigningSecret()` cache in long-running test fixtures | Low | Low | `_resetSigningSecretCacheForTests()` exported | 1 |
| Mobile cookie clearing aggressively (private mode, ITP) | Medium | Low | Re-prompt acceptable; documentation acknowledges; `localStorage` autofill deferred to v2 | 6 |
| `requireLocalAuth` missed on a sidecar route | Medium | High | Phase 5 task 5.2 enumerates routes explicitly; `grep -L 'requireLocalAuth' …` audit returns zero files; default-deny header comment on each route file | 5 |
| Domain.md drift after a phase | Medium | Low | Phase 7 explicit audit; plan-7 code review per phase catches | 7 |
| **CSWSH on terminal WS** (cross-site WebSocket hijacking from a victim already on the workspace origin) | Low | Medium | Phase 4 task 4.2 adds `Origin` header allowlist check (default: same-origin localhost); JWT `iss`/`aud`/`cwd` binding prevents token re-use across services. For `0.0.0.0` deployments operators must whitelist origins via `TERMINAL_WS_ALLOWED_ORIGINS`. WSS mandate not enforced in v1 — documented as future hardening. | 4 |
| **`AUTH_SECRET` rotation invalidates all sessions simultaneously** | Low | Medium | Documented in spec AC-26 and operator runbook (Phase 7 task 7.9) as expected behaviour, not a foot-gun. Rotation = maintenance-window event. | 7 |
| **WS sidecar `cwd` divergence from main process** (would cause HKDF key drift, breaks token validation) | Low | High | Phase 4 task 4.1 adds startup assertion + comment documenting the cwd contract; sidecar exits with clear error if it cannot read `bootstrap-code.json` from its `cwd`/`.chainglass/`. **Update 2026-05-03**: FX003 adds a `findWorkspaceRoot()` helper that resolves the cwd consistently across the main process and (when Phase 4 lands) the WS sidecar, eliminating the divergence at the substrate level. | 4 |

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX003 | 2026-05-03 | Bootstrap-code primitives walk up to workspace root via new `findWorkspaceRoot()` helper — fixes the Phase 6 dev-smoke gotcha where `pnpm dev` at `cwd=apps/web/` wrote a different `.chainglass/` file than the popup mentioned | `@chainglass/shared` (additive contract); `_platform/auth` (call-site swap) | Proposed | User-reported during Phase 6 dev smoke (2026-05-02); documented in 4 places at the time, this FX is the proper fix |

---

## Out-of-Scope (Recap)

These were considered and excluded from v1 — no implementation tasks in any phase:

- Code TTL / time-based rotation
- Per-user identity from this feature alone
- WSS mandate when `TERMINAL_WS_HOST=0.0.0.0`
- Cross-machine code distribution
- CLI command to print the code (defer; v2 candidate)
- Settings UI for "rotate code"
- Multiple concurrent codes (rotation grace)
- Audit logging of unlock attempts
- `localStorage` autofill on the popup (deferred to v2 / workshop 005)

---

## Next Steps

This is Full Mode. After plan-3 lands:

1. **`/plan-4-v2-complete-the-plan`** — readiness gate; user requested "fix all high" findings.
2. **`/validate-v2`** — multi-agent independent review per validation lenses.
3. Then: **`/plan-5-v2-phase-tasks-and-brief --phase "Phase 1: Shared Primitives" --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/auth-bootstrap-code-plan.md"`** to expand Phase 1 into a tasks dossier and start implementation.

Workshop 005 (popup UX) can run in parallel between now and Phase 6, or be folded into Phase 6 directly if scope is small.

---

## Validation Record (2026-04-30)

`/validate-v2` ran with 4 parallel agents (broad scope). Lens coverage: 12/12 (above 8-floor). Forward-Compatibility engaged (named downstream consumers C1–C9 + Test, no STANDALONE).

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Coherence | System Behavior, Domain Boundaries, Integration & Ripple | 1 HIGH fixed, 3 MEDIUM open, 1 LOW open | ⚠️ → ✅ |
| Risk | Hidden Assumptions, Deployment & Ops, Security & Privacy, Edge Cases & Failures | 2 CRITICAL fixed, 3 HIGH fixed, 2 MEDIUM open | ⚠️ → ✅ |
| Completeness | User Experience, Edge Cases & Failures, Concept Documentation, Hidden Assumptions | 2 CRITICAL fixed, 2 HIGH fixed, 2 MEDIUM open | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Technical Constraints, Concept Documentation | 1 CRITICAL fixed, 2 HIGH fixed, 4 MEDIUM open (1 covered as bonus during HIGH fix — test scaffolding) | ⚠️ → ✅ |

### Forward-Compatibility Matrix (verbatim from FC agent + post-fix verdict deltas)

| Consumer | Requirement | Mode | Pre-fix verdict | Post-fix verdict | Evidence |
|----------|-------------|------|-----------------|------------------|----------|
| C1 (Phase 1 dossier) | Stable shapes for `ensureBootstrapCode` + `activeSigningSecret` | n/a | ✅ | ✅ | Workshop 004 § File Format + Signing-Key |
| C2 (Phase 2) | Phase 1 helpers + boot-time write safe via global flag | lifecycle-ownership | ✅ | ✅ | Plan 2.1 mirrors Plan 067 pattern |
| C3 (Phase 3) | Cookie helpers + signing-key + verify route callable | shape-mismatch | ❌ | ✅ | Phase 1.5 + 3.1 now commit to async + cwd-keyed cache |
| C4 (Phase 4 WS) | `activeSigningSecret(cwd)` callable in WS sidecar with matching cwd | lifecycle-ownership | ❌ | ✅ | Phase 4.1 now documents cwd contract + adds startup assertion |
| C5 (Phase 5 sinks) | Cached helpers for hot path | technical-constraints | ❌ | ✅ | Phase 5.1 reuses Phase 3.1 cache; `readServerInfo` already cached |
| C6 (Phase 6 popup) | `bootstrapVerified` + rate-limit state delivery | shape-mismatch | ⚠️ | ✅ | Phase 3.2 commits to 429 body shape `{ retryAfterMs }`; Phase 6 reads from response |
| C7 (Workshop 005) | Phase 6 real popup revisable without breaking Phase 3 contract | lifecycle-ownership | ✅ | ✅ | Minimal prop interface; popup learns errors from route response |
| C8 (Workshop 004 alignment) | Bypass list matches workshop exactly | contract-drift | ❌ | ✅ | Phase 3.4 now lists final 4 + non-bypass dispositions |
| C9 (workshop 004 server-side enforcement matrix) | Plan satisfies workshop matrix without contradiction | contract-drift | ✅ | ✅ | No contradictions found |
| Test (cross-phase scaffolding) | Phase 3 helper reusable by Phase 6 | test-boundary | ❌ | ✅ | Phase 3.7 now exports `setupBootstrapTestEnv()` for Phase 6 |

**Outcome alignment**: The plan, as currently written, **does not fully advance the OUTCOME** — "dramatically lower the barrier to bringing up a Chainglass instance (no GitHub OAuth setup required for personal/dev use), while raising the floor of protection (closes three real exposure holes the research dossier identified)." The three holes (terminal-WS silent-bypass, event-popper loopback bypass, `DISABLE_AUTH=true` removing all gates) are addressed in concept, but forward-compatibility risks (async-function signatures, cwd assumptions, caching strategy, bypass-list ambiguity, test reuse) are not locked, creating implementation and maintenance risk that could prevent the plan from shipping without rework in later phases.

**Post-fix outcome update (synthesizer note)**: All five forward-compatibility risks named above (async signature, cwd assumption, caching strategy, bypass-list ambiguity, test scaffolding reuse) were closed by the 12 CRITICAL+HIGH fixes. The plan now advances the OUTCOME — barrier-lowering remains intact (file + popup workflow), and the three exposure holes are now closed at the *task-level* with explicit success criteria and integration tests that prove closure (Phase 4.5 two-scenario test, Phase 5.2 enumeration + grep audit, Phase 7.10 log-leak audit). Open MEDIUM/LOW items are tightening passes, not blockers.

**Standalone?**: No — concrete downstream consumers C1–C9 + cross-phase test reuse named.

### Fixes applied (CRITICAL + HIGH — `--fix-all-high` scope)

| ID | Source agent | Fix |
|---|---|---|
| C1 | Risk | Phase 7 task 7.9 — migration runbook content outline (6 sections) |
| C2 | Risk | Phase 1 tasks 1.5 + 1.7 — `cwd`-keyed cache + per-test reset discipline |
| C3 | Completeness | Phase 3 task 3.7 — explicit list of 6 format-invalid test cases |
| C4 | Completeness | Phase 4 task 4.5 — 2-scenario test (cookie set + cookie missing) proves silent-bypass closure |
| C5 | Forward-Compat | Phase 4 task 4.1 — sidecar cwd contract + startup assertion |
| H1 | Coherence | Phase 4 header — soft/hard dep split clarified |
| H2 | Risk + Completeness | Phase 5 task 5.2 — explicit route enumeration + `grep -L` audit + default-deny header comment |
| H3 | Risk | Phase 4 task 4.2 — `Origin` header allowlist closes CSWSH residual risk; new `TERMINAL_WS_ALLOWED_ORIGINS` env var |
| H4 | Risk | Spec AC-26 (new) + plan Risks table — `AUTH_SECRET` rotation invalidates all sessions, expected behaviour |
| H5 | Completeness | Phase 7 task 7.10 (new) — automated CI test grep'ing logs for the code value with deterministic seed |
| H6 | Forward-Compat | Phase 1 task 1.5 + Phase 3 task 3.1 — async + module-level cache committed |
| H7 | Forward-Compat | Phase 3 task 3.4 — exact bypass list + non-bypass dispositions |

### Open (MEDIUM/LOW — surface for user decision)

| ID | Source | Issue | Recommended action |
|---|---|---|---|
| M-Coh-2 | Coherence | Phase 6 / workshop 005 dep ambiguity | Clarify in Phase 6 header: workshop 005 = soft dep, MVP ships either way |
| M-Coh-3 | Coherence | Phase 3 stub may not validate AC-1/2/10 fully without real popup | Split AC mapping into `a` (route) and `b` (UX) parts |
| M-Risk-7 | Risk | No commit-hook to prevent accidental `bootstrap-code.json` commit | Document recovery procedure in operator guide; pre-commit hook out of scope |
| M-Comp-5 | Completeness | Phase 6 mobile testing manual-only at CS-4 | Upgrade Phase 6 task 6.5 to Playwright with screenshot comparison |
| M-Comp-6 | Completeness | RSC pattern unvalidated before Phase 3 | Add deepresearch prerequisite or workshop 005 ahead of Phase 3 |
| M-FC-5 | Forward-Compat | `bootstrapVerified` prop under-specified for Phase 6 polish | Now MITIGATED by Phase 3.2 fix (429 body shape), but consider explicit prop-shape commit |
| L-Coh-5 | Coherence | Phase 4/5 ordering coordination risk | Add handoff note (informational only) |

**Overall**: ⚠️ **VALIDATED WITH FIXES** — 12 CRITICAL+HIGH closed. 7 MEDIUM/LOW surfaced for user decision. Plan is ready for `/plan-5-v2-phase-tasks-and-brief --phase "Phase 1: Shared Primitives"`.
