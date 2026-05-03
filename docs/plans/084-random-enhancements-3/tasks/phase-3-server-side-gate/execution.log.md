# Phase 3 — Execution Log

**Phase**: Phase 3: Server-Side Gate (Verify/Forget + Proxy + RootLayout Stub)
**Started**: 2026-05-02
**Companion**: code-review-companion runId `2026-05-02T13-27-13-854Z-784a` (briefed via outside inbox `01KQKBNFP88KXVQ5GKEH3371QQ`)

---

## Pre-Phase Harness Validation

| Stage | Result | Duration | Evidence |
|-------|--------|----------|----------|
| Boot | ✅ HEALTHY (already running) | ~0s | `curl /api/health` → `{"status":"ok"}` |
| Interact | ⏭️ deferred — implementation uses NextRequest construction in unit/integration tests; live HTTP not required | — | — |
| Observe | ⏭️ deferred — same | — | — |

**Verdict**: ✅ HEALTHY. Standard test path is `pnpm exec vitest run --root .` from repo root (Phase 1/2 D-T002-1 discovery).

---

## Task Log

### T001 — `getBootstrapCodeAndKey()` accessor + tests (LANDED)

**TDD evidence**:
- RED: `pnpm exec vitest run --root . test/unit/web/lib/bootstrap-code.test.ts` → "Failed to resolve import ... Does the file exist?" (impl not yet written)
- GREEN: same command after impl → 5/5 pass in 7ms
- Tests cover: (a) happy path returns matching code + 32-byte HKDF key, (b) cache identity on repeated calls, (c) `_resetForTests()` invalidates, (d) IO failure → `[bootstrap-code]`-prefixed error mentioning cwd, (e) AUTH_SECRET branch returns raw secret bytes (not 32 — discovery)

**Files**:
- NEW `apps/web/src/lib/bootstrap-code.ts` (66 LOC) — exports `BootstrapCodeAndKey`, `getBootstrapCodeAndKey()`, `_resetForTests()`. Renamed from plan's `bootstrap.ts` (DI/config file collision). Includes JSDoc on cwd contract + cache lifecycle per validation fix FC-M1.
- NEW `test/unit/web/lib/bootstrap-code.test.ts` (5 cases, 116 LOC)

**Discovery — D-T001-1**: `activeSigningSecret` returns the **raw `AUTH_SECRET` bytes** (`Buffer.from(AUTH_SECRET, 'utf-8')`) when set, NOT a 32-byte HKDF-derived key. Only the HKDF fallback path returns 32 bytes. Initial test (e) expected 32 bytes for the env-derived branch and failed — corrected to assert `key.toString('utf-8') === secret`. The HMAC code path doesn't care (HMAC-SHA256 keys are arbitrary length). Phase 4 / Phase 5 callers must NOT assume 32-byte length when AUTH_SECRET is set. Documented in shared package's signing-key.ts:25–39 already; not a code bug, just a test expectation calibration.

**Discovery — D-T001-2**: vitest config in this repo emits a `tsconfigFile: '.next/standalone/...'` warning + `environmentMatchGlobs deprecated` warning at startup. Same as Phase 1/2; non-blocking. Stale tsconfig in `.next/standalone` is the source.

### T002 — `POST /api/bootstrap/verify` route + tests (LANDED)

**TDD evidence**:
- RED: import `POST` + `_resetRateLimitForTests` failed pre-impl
- GREEN: 14/14 pass in 23ms
- Tests: 200 (cookie attrs incl. no-Max-Age + no-Expires), 401 wrong-code, 400×8 (6 INVALID_FORMAT_SAMPLES + malformed JSON + empty body + missing field), 429 with `Retry-After` header + `{ error: 'rate-limited', retryAfterMs }` body (exactly 2 fields), 429 separate-IP independence, 503 unavailable

**Files**:
- NEW `apps/web/app/api/bootstrap/verify/route.ts` (~155 LOC) — handler + leaky-bucket rate limit + sweep + `_resetRateLimitForTests` + `dynamic = 'force-dynamic'`
- NEW `test/unit/web/api/bootstrap/verify.test.ts` (14 cases, ~170 LOC)

**Decisions**:
- Rate limit checked **before** body parse (so a flood of malformed bodies can't burn file IO).
- `Retry-After` header value rounds up via `Math.ceil(retryAfterMs / 1000)` so a 12s `retryAfterMs` becomes `Retry-After: 12`.
- Sweep runs O(n) at start of every request — bounded by attack rate within the 60s window; acceptable for this dev-tool threat model.
- Cookie body returned via `NextResponse.json(body, { status, headers: { 'Set-Cookie': ... } })` rather than the cookies API — keeps Set-Cookie literal verifiable in tests.
- 429 body fields locked at exactly two (`error`, `retryAfterMs`) — test asserts `Object.keys(body).sort()` equals `['error', 'retryAfterMs']` to catch accidental field additions in future edits (Phase 6 contract guard).

### T003 — `POST /api/bootstrap/forget` route + tests (LANDED)

**TDD evidence**: 3/3 tests pass in 6ms. Cookie clear with `Max-Age=0` + HttpOnly + SameSite=Lax + Path=/. Idempotent across 3 calls. No body required.

**Files**:
- NEW `apps/web/app/api/bootstrap/forget/route.ts` (~25 LOC)
- NEW `test/unit/web/api/bootstrap/forget.test.ts` (3 cases)

### T004 — Proxy rewrite + cookie-gate helper (LANDED)

**TDD evidence**: 30/30 tests pass in 2ms.

**Files**:
- NEW `apps/web/src/lib/cookie-gate.ts` (~60 LOC) — pure `evaluateCookieGate(req, codeAndKey): GateDecision` helper + `AUTH_BYPASS_ROUTES` const + `isBypassPath` predicate
- REWRITE `apps/web/proxy.ts` (was 23 lines → now ~58 lines) — `auth()` callback now: try `getBootstrapCodeAndKey()` (503 on fail for API, fall-through for page), then `evaluateCookieGate`, then existing `DISABLE_AUTH` + `req.auth` chain
- NEW `test/unit/web/proxy.test.ts` (30 cases)

**Decision — D-T004-1**: extracted pure `evaluateCookieGate` helper rather than testing the full `auth()`-wrapped proxy. Constitution P4 forbids `vi.mock`; the proxy default export is `auth(callback)` from Auth.js v5 which requires real env to invoke. The helper is what's worth testing — translating each `GateDecision` into a `NextResponse` is mechanical.

**Decision — D-T004-2**: `isBypassPath` uses **exact-or-prefix-segment match** (`pathname === prefix || pathname.startsWith(prefix + '/')`). This means `/api/healthx` does NOT bypass (would have if we used loose `startsWith`). Tested explicitly.

**Decision — D-T004-3**: bootstrap-file unavailable at request time (e.g. operator deletes the file mid-process) → API request returns 503 `{ error: 'bootstrap-unavailable' }`; page request returns `next()` so the user sees an error UI rather than a redirect loop. Documented in proxy.ts comment.

**Layering proof — case (e1)**: `/api/events` with valid cookie → `evaluateCookieGate` returns `cookie-valid` → proxy callback breaks out of switch → falls through to existing `DISABLE_AUTH` + `req.auth` chain. This is the contract Phase 5 inherits — the proxy gates the cookie, downstream handlers do their own composite check (`requireLocalAuth` in Phase 5).

### T005 + T006 — `<BootstrapGate>` + `<BootstrapPopup>` stub + RootLayout wire-up (LANDED)

**Files**:
- NEW `apps/web/src/features/063-login/components/bootstrap-popup.tsx` (~70 LOC) — `'use client'`, named export `BootstrapPopupProps` (locked Phase 6 contract), `<dialog role="dialog" aria-modal="true">` overlay with stub form posting to `/api/bootstrap/verify`
- NEW `apps/web/src/features/063-login/components/bootstrap-gate.tsx` (~50 LOC) — server component, exports pure helper `computeBootstrapVerified`, reads `cookies()` from `next/headers`, swallows errors → unverified rather than crashing layout
- MODIFY `apps/web/app/layout.tsx` — added import + wrapped `{children}` in `<BootstrapGate>` between `<Providers>`. 2-line diff (additive — `<ThemeProvider>` and CSS imports unchanged)
- NEW `test/unit/web/features/063-login/bootstrap-gate.test.ts` — 4 cases for `computeBootstrapVerified` (missing/valid/tampered/empty), 4/4 pass in 1ms

**Decision — D-T005-1**: BootstrapPopup is a true client component (`'use client'` directive). The dossier called for `<dialog>` overlay; using HTML `<dialog open>` rather than React's `<dialog>` ref-based `showModal()` because the stub renders deterministically based on a prop rather than imperatively. Phase 6 may switch to `showModal()` for proper ESC/focus-trap semantics.

**Decision — D-T005-2**: `computeBootstrapVerified` is a NAMED export from `bootstrap-gate.tsx` (NOT inline-only). The dossier suggested either inline-export or `@/lib`; chose inline-export so the component file stays self-contained and the test imports from a single canonical location.

**Decision — D-T006-1**: `<BootstrapGate>` swallows errors from `getBootstrapCodeAndKey()` and falls through to `bootstrapVerified=false`. Rationale: the proxy already returns 503 / next() based on file availability; if a transient error somehow reached RootLayout, painting the popup is the operator-friendly degradation (vs crashing the whole layout tree).

### T007 — Integration tests + `setupBootstrapTestEnv()` (LANDED)

**Files**:
- NEW `test/helpers/auth-bootstrap-code.ts` (~70 LOC) — exports `BootstrapTestEnv` interface + `setupBootstrapTestEnv()` factory. Resets all 3 caches (bootstrap-code, signing-key, rate-limit) before generating; cleanup restores process.cwd, resets caches, removes temp dir.
- NEW `test/integration/web/auth-bootstrap-code.integration.test.ts` (~190 LOC, 7 cases) — 7 named scenarios from dossier T007 (1+2+3 generate→verify→cookie→proxy decision; 4 no cookie; 5 forget; 6 all 6 INVALID_FORMAT_SAMPLES; 7 rate limit; 8 rotation invalidation) + smoke test for the helper itself.

**Decision — D-T007-1**: scenario (8) rotation test deliberately calls `_resetBootstrapCache()` and `_resetSigningSecretCacheForTests()` after writing the new code file. This simulates the operator workflow of restart-after-rotate. Without the manual reset, the cached old key would still validate the old cookie even after the file was rewritten — which is the documented contract.

**Decision — D-T007-2**: dossier called for 8 scenarios; landed 7 + 1 smoke test. The 8 ACs all map to the 7 scenarios because (1+2+3) is realistically one composite test (generate→verify→proxy decision). Same total coverage; simpler to read.

**Regression sweep**: 1952/1952 pass + 13 skipped across `test/unit/web/`, `test/integration/web/`, `test/unit/shared/auth-bootstrap-code/`, `test/unit/web/auth-bootstrap/` in 99s. **Zero regressions** vs Phase 2 baseline (60/60 in 1.32s).

### Companion review fixes (post-LANDED) — 2026-05-02

Companion `code-review-companion` (run `2026-05-02T13-27-13-854Z-784a`) reviewed each task and returned 1 HIGH + 1 MEDIUM + 3 LOW findings. All applied:

- **F004 (HIGH) — proxy bypass-before-accessor**: original `proxy.ts` called `getBootstrapCodeAndKey()` BEFORE the `isBypassPath` check, so a missing `bootstrap-code.json` would return 503 even for `/api/health`, `/api/auth/*`, `/api/bootstrap/verify`, `/api/bootstrap/forget`. That's the recovery path itself — blocking it would brick operator recovery. Fixed by short-circuiting `isBypassPath()` before the accessor in a new exported helper `bootstrapCookieStage()`. Added 8 new proxy tests proving (a) all 4 bypass routes return `null` (proceed) when the file is missing/unreadable; (b) non-bypass `/api/events` returns 503 when the file is unreadable; (c) non-bypass `/dashboard` returns `next()` (no redirect loop); (d) `/api/auth/callback/github` is bypass even when accessor would throw. Now 38/38 in proxy.test.ts (was 30/30).
- **F005 (MEDIUM) — popup form**: original stub form posted `application/x-www-form-urlencoded` to the JSON-only verify route, so a user typing the code into the stub and clicking Unlock would see a misleading 400 response. Replaced the form with informational text directing operators to `.chainglass/bootstrap-code.json` + the operator runbook. Phase 6 owns the actual unlock UX with proper client-side fetch.
- **F001 (LOW) — key length comment**: `BootstrapCodeAndKey.key` JSDoc said "32-byte" unconditionally; updated to spell out the two branches (raw `AUTH_SECRET` bytes vs 32-byte HKDF) and the explicit warning that Phase 4 must NOT assume fixed length.
- **F002 + F003 (LOW × 2) — production-Secure tests**: added one test each in verify.test.ts and forget.test.ts that sets `process.env.NODE_ENV = 'production'` (with try/finally restore) and asserts `Set-Cookie` includes `Secure`. Discovery D-T004-1 — `Object.defineProperty(process.env, ...)` fails in vitest 3 ("only accepts a configurable, writable, and enumerable data descriptor"); use direct assignment instead.

**Final post-fix counts**: 82/82 Phase 3 tests pass; 60/60 Phase 1+2 still green; 142/142 total auth-bootstrap-code surface.

**Companion verdict (initial)**: REQUEST_CHANGES.

### F004 — full fix (post-companion-farewell)

The companion's farewell envelope (durationMs 2492054, eventCount 10560, toolCallCount 249) made it explicit: F004's first-pass fix was incomplete. Bypass routes returned `null` → fell through to the existing Auth.js `auth()` chain, which then 401's `/api/health` (no session). The original (pre-Phase-3) `proxy.ts` matcher excluded those paths so the middleware never even ran for them; my broadened matcher delegates the same exclusion to `AUTH_BYPASS_ROUTES`, so the bypass list MUST also short-circuit the Auth.js chain.

**Real fix**: changed `bootstrapCookieStage()` return type from `NextResponse | null` to `'bypass' | 'proceed' | NextResponse`. The proxy callback now:
- `'bypass'` → returns `NextResponse.next()` immediately (skips both the cookie gate AND the Auth.js chain — `/api/health` and friends remain reachable)
- `NextResponse` → returns it directly (401 / 503 / fall-through-page)
- `'proceed'` → falls through to `DISABLE_AUTH` + `req.auth` chain

Added/updated tests: 9 cases for `bootstrapCookieStage` (was 8) — all 4 bypass routes now assert literal `'bypass'`, non-bypass `/api/events` with valid cookie asserts literal `'proceed'` (proves layering), 503 + cookie-missing-page paths still return `NextResponse`. **39/39** in proxy.test.ts (was 38). Full Phase 3 sweep: **83/83** in 2.93s. The companion's primary blocker is now structurally addressed in code AND test.

The companion's `magicWand` suggestion (treat `control:stop` notes as first-class stop events with `type: control` in `wait_for_any` results) is filed as a coordination protocol idea; not actionable in this plan. Difficulties MH-001 (`control:stop` not a typed message) and MH-002 (vitest tsconfig-paths warnings) noted.


