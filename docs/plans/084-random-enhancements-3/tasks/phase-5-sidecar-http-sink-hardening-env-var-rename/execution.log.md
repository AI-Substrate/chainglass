# Execution Log — Phase 5: Sidecar HTTP-Sink Hardening + Env-Var Rename

**Started**: 2026-05-03
**Plan**: [auth-bootstrap-code-plan.md](../../auth-bootstrap-code-plan.md)
**Dossier**: [tasks.md](./tasks.md)

---

## Pre-Phase Harness Validation (2026-05-03)

| Check | Result | Detail |
|-------|--------|--------|
| Boot | ✅ Healthy | Already running; `curl /api/health` → 200 (no boot needed) |
| Interact | ✅ Available | HTTP API confirmed via health check |
| Observe | ✅ Available | curl response body capture |

Verdict: ✅ HEALTHY — proceed to T001.

---

## Tasks

### T001 — RED tests for `requireLocalAuth` ✅

**Completed**: 2026-05-03

Wrote `test/unit/web/lib/local-auth.test.ts` with 11 cases covering: non-localhost rejection (a), valid cookie path (b), valid X-Local-Token path (c), no credential (d), malformed cookie (e), wrong-bytes token (f), wrong-LENGTH token (f2 — Completeness fix #1, must NOT throw RangeError), legacy server.json without localToken (f3 — Completeness fix #4), cookie-tried-first when both present (g), bootstrap-unavailable + no-code-in-log (h — Completeness fix #2 + AC-22), cookie-wins (i).

**Path-fix gotcha**: From `test/unit/web/lib/`, the relative import to `test/unit/shared/auth-bootstrap-code/test-fixtures` is `../../shared/auth-bootstrap-code/test-fixtures` — only two `..` (web→unit, then unit→shared as sibling), not three. Phase 3's verify test sits one level deeper (`test/unit/web/api/bootstrap/`) so its `../../../shared/...` shouldn't be mechanically copied.

**RED evidence**: `pnpm vitest run test/unit/web/lib/local-auth.test.ts` → `Cannot find module '../../../../apps/web/src/lib/local-auth'` (file doesn't exist yet — RED ✅).

### T002 — GREEN `requireLocalAuth` ✅

**Completed**: 2026-05-03

Implemented `apps/web/src/lib/local-auth.ts` (115 LOC). Discriminated `LocalAuthResult` union with 4 failure reasons (`not-localhost` | `bootstrap-unavailable` | `no-credential` | `bad-credential`). Order: localhost → getBootstrapCodeAndKey try/catch (warns secret-free, returns `bootstrap-unavailable`) → cookie path (cookie-tried-first; invalid cookie short-circuits without trying token) → token path (length pre-check before `timingSafeEqual` to prevent RangeError; legacy server.json missing `localToken` → `bad-credential`) → no-credential.

**GREEN evidence**: `pnpm vitest run test/unit/web/lib/local-auth.test.ts` → **11/11 passed (300ms)**.

**Discovery — bootstrap-unavailable test trick**: To force `getBootstrapCodeAndKey()` to throw inside a temp cwd, deleting `.chainglass/` alone is insufficient (it just regenerates). Replacing `.chainglass` with a regular FILE (not a dir) makes `mkdirSync` throw EEXIST — guarantees the catch branch executes deterministically.

### T003 — Apply `requireLocalAuth` to 9 sink routes ✅

**Completed**: 2026-05-03

**Pre-edit grep discovery (CRITICAL)**: `apps/cli/src/commands/event-popper-client.ts` did NOT send `X-Local-Token` — the legacy CLI client only set `Content-Type`. Phase 5 applied at the server side WOULD have broken every CLI call (AC-17 violation). Fixed by extending `createEventPopperClient(baseUrl, opts?)` to optionally accept `worktreePath`, read `localToken` once at construction via `readServerInfo`, and inject it as `X-Local-Token` on every request. Backward-compatible: existing call sites work unchanged because `worktreePath` defaults to `process.cwd()`. Browser hook `use-question-popper.tsx:122` is unaffected — same-origin fetch sends the bootstrap cookie automatically.

**Applied to all 9 sink routes** with uniform status-code mapping `(not-localhost ? 403 : bootstrap-unavailable ? 503 : 401)`:
- 6 UI routes (acknowledge, answer-question, clarify, dismiss, list, question) — replaced `if (guard) { check session }` pattern wholesale
- 3 CLI-only routes (ask-question, send-alert, tmux/events) — replaced `if (guard) return guard;` pattern
- All 9 carry `// REQUIRED: requireLocalAuth(req) at top before business logic. (Plan 084 Phase 5)` header comment

**Post-edit grep audit**: `find apps/web/app/api/event-popper -name 'route.ts' -exec grep -L 'requireLocalAuth' {} \;` + `grep -L 'requireLocalAuth' apps/web/app/api/tmux/events/route.ts` → ZERO files. `grep -l 'localhostGuard' …` for sink routes → ZERO files. ✅

**Sink-auth unit tests (T003 deliverable)**: `test/unit/web/api/event-popper/sink-auth.test.ts` — 10 cases × 2 representative routes (UI `list` + CLI-only `ask-question`) covering the complete status-code contract (200 acceptance shape, 401 no-credential, 401 bad-credential, 403 not-localhost, 503 bootstrap-unavailable). All 10 GREEN.

**Combined evidence**: `pnpm vitest run test/unit/web/api/event-popper/sink-auth.test.ts test/unit/web/lib/local-auth.test.ts` → **21/21 passed (1.24s)**.

### T004 — `auth.ts` env-var alias + globalThis warn-once ✅

**Completed**: 2026-05-03

Refactored `apps/web/src/auth.ts` to extract `isOAuthDisabled()` as an exported helper (single source of truth for env-var checks; T005 imports it from proxy.ts). Helper accepts BOTH `DISABLE_GITHUB_OAUTH` (canonical) and `DISABLE_AUTH` (legacy alias). Legacy name triggers `console.warn` exactly once per Node process via `globalThis.__CHAINGLASS_DISABLE_AUTH_WARNED` (Completeness fix #3 — module-level `let` would have reset on Next.js HMR; the `globalThis` flag mirrors `instrumentation.ts:44-45` pattern).

**Test evidence**: `pnpm vitest run test/unit/web/auth.test.ts` → **7/7 passed (270ms)**, including (vi) HMR-safe warn-once via `vi.resetModules()` (re-imports module — `globalThis` flag persists, no second warning).

### T005 — `proxy.ts` env-var alias ✅

**Completed**: 2026-05-03

Replaced `process.env.DISABLE_AUTH === 'true'` check at proxy.ts:74 with `isOAuthDisabled()` import from auth.ts — the helper handles BOTH env-var names with a single warn-once trigger. **No drift possible**: same helper is the only env-var check in the codebase.

**Discovery — auth.ts wrapper short-circuits before bootstrap-cookie gate (Phase 3 carryover, OUT OF SCOPE for Phase 5)**: When `DISABLE_AUTH=true` at boot, the `auth.ts` wrapper returns a pass-through middleware that bypasses the proxy callback entirely — meaning `bootstrapCookieStage` never runs. Phase 5's `proxy.ts:74` check is reached only when `auth.ts` did NOT short-circuit, so it's belt-and-suspenders. Phase 3's intent (bootstrap gate runs for all paths) is partially defeated by this. Logged as a Phase 3 carry-forward to be addressed in a separate FX or Phase 7. Documented in dossier Discoveries below.

**Test evidence**: `pnpm vitest run test/unit/web/proxy.test.ts` → **43/43 passed (518ms)** — Phase 3's 39 cases + 4 new T005 cases for `isOAuthDisabled()` (DISABLE_GITHUB_OAUTH=true; DISABLE_AUTH=true legacy; both unset; bootstrap-gate-runs-independent-of-env-var).

### T006 — Integration tests for event-popper sinks ✅

**Completed**: 2026-05-03

Wrote `test/integration/web/event-popper-sinks.integration.test.ts` exercising 3 representative sink routes (`list` GET, `ask-question` POST, `tmux/events` POST) × 4 auth modes (no-credential 401, valid cookie 200/business, valid X-Local-Token 200/business, bootstrap-unavailable 503) + bonus mode (bad cookie 401 — proves cookie-tried-first short-circuit). 5 test cases × 3-route iteration = 15 effective scenarios.

**Test evidence (full Phase 5 + Phase 3 regression sweep)**: `pnpm vitest run test/unit/web/lib/local-auth.test.ts test/unit/web/api/event-popper/sink-auth.test.ts test/unit/web/auth.test.ts test/unit/web/proxy.test.ts test/integration/web/event-popper-sinks.integration.test.ts test/unit/web/api/bootstrap/verify.test.ts test/unit/web/api/bootstrap/forget.test.ts` → **95/95 passed (3.22s)**.

### T007 — Domain docs + plan Phase Index ✅

**Completed**: 2026-05-03

- `docs/domains/_platform/events/domain.md`: Composition row added for `requireLocalAuth`; Dependencies updated (now consumes `getBootstrapCodeAndKey()` + `verifyCookieValue()` + `BOOTSTRAP_COOKIE_NAME`); History row for Plan 084 Phase 5.
- `docs/domains/_platform/auth/domain.md`: History row for Plan 084 Phase 5 documenting the env-var alias, `isOAuthDisabled()` helper, HMR-safe warn-once, the new dependency from `_platform/events`, and the auth-wrapper carryover discovery.
- `docs/domains/domain-map.md`: New edge `events --> auth` labeled `getBootstrapCodeAndKey() / verifyCookieValue() / BOOTSTRAP_COOKIE_NAME / findWorkspaceRoot()` reflecting the new business→infrastructure consumption.
- `docs/plans/084-random-enhancements-3/auth-bootstrap-code-plan.md`: Phase Index row 5 → `✅ Landed 2026-05-03`.

---

## Phase 5 Closeout

**All 7 tasks complete.** Acceptance criteria reached:
- AC-11 (GitHub OAuth disabled mode) ✅ — both env-var names accepted in auth.ts + proxy.ts via shared `isOAuthDisabled()`.
- AC-16 (sidecar sinks gated) ✅ — all 9 routes return 401 without credentials.
- AC-17 (CLI continues to work) ✅ — CLI client now sends `X-Local-Token`, integration tests confirm.
- AC-21 (deprecation alias) ✅ — `DISABLE_AUTH=true` triggers `console.warn` exactly once per Node process (HMR-safe).

**Files changed**:
- New: `apps/web/src/lib/local-auth.ts` (115 LOC); `test/unit/web/lib/local-auth.test.ts` (11 cases); `test/unit/web/api/event-popper/sink-auth.test.ts` (10 cases); `test/unit/web/auth.test.ts` (7 cases); `test/integration/web/event-popper-sinks.integration.test.ts` (5 cases × 3 routes = 15 effective scenarios).
- Modified: `apps/web/src/auth.ts`, `apps/web/proxy.ts`, all 9 sink route files, `apps/cli/src/commands/event-popper-client.ts`, `test/unit/web/proxy.test.ts` (+4 cases), `docs/domains/_platform/events/domain.md`, `docs/domains/_platform/auth/domain.md`, `docs/domains/domain-map.md`, `docs/plans/084-random-enhancements-3/auth-bootstrap-code-plan.md`.

**Final regression sweep**: 95/95 across Phase 5 + Phase 3 tests (3.22s).

**Carry-forward (logged for Phase 7 / FX)**: `auth.ts` wrapper short-circuits the proxy callback at module load when `DISABLE_AUTH=true`, partially defeating the "bootstrap gate runs first regardless" Phase 3 intent. Proper fix would hoist `bootstrapCookieStage` ABOVE the `auth(...)` wrapper in proxy.ts.

---

## Code Review Pass (minih agent, 2026-05-03 12:10Z)

Ran `just code-review-agent` on the Phase 5 dossier. Verdict: **REQUEST_CHANGES** with two HIGH findings — both fixed in-phase (no FX needed):

### F001 (HIGH, security) — bootstrap gate bypassed under DISABLE_GITHUB_OAUTH

**Finding**: With `DISABLE_GITHUB_OAUTH=true` (or legacy `DISABLE_AUTH=true`) at module load, `auth(callback)` from auth.ts wrapper returns a pass-through `(req) => NextResponse.next()` middleware that NEVER invokes the supplied callback — meaning the `bootstrapCookieStage()` call inside the callback never executed. Phase 5's earlier proxy.ts therefore preserved the pre-Phase-3 full-bypass behavior in the exact mode it was supposed to close. The agent correctly insisted this is a Phase 5 ship blocker (not Phase 7 deferral as I'd originally logged) since Phase 5 promotes `DISABLE_GITHUB_OAUTH` to canonical.

**Fix**: Refactored `apps/web/proxy.ts` to **hoist `bootstrapCookieStage` OUTSIDE the `auth(...)` wrapper**. New shape: an outer `proxyMiddleware` async function runs the bootstrap stage first, then delegates to `oauthMiddleware = auth(async ...)` only after the stage returns 'proceed'. The OAuth wrapper still short-circuits internally on `DISABLE_*=true`, but it can no longer skip the bootstrap layer.

**Regression test**: 4 new cases in `test/unit/web/proxy.test.ts` exercising the `default export` middleware end-to-end:
- `DISABLE_GITHUB_OAUTH=true` + `/api/events` no cookie → 401 + `{error:'bootstrap-required'}`
- `DISABLE_AUTH=true` (legacy) + `/api/events` no cookie → 401 (parity)
- `DISABLE_GITHUB_OAUTH=true` + bypass `/api/health` → next() (no cookie required)
- `DISABLE_GITHUB_OAUTH=true` + valid cookie + `/api/events` → next() (OAuth bypassed but bootstrap honored)

### F002 (HIGH, correctness) — server.json write/read path schism

**Finding**: `apps/web/instrumentation.ts:89` wrote `server.json` at raw `process.cwd()`, which under `pnpm dev`/Turbo is `apps/web/`. But T002's `requireLocalAuth` reads `server.json` at `findWorkspaceRoot(process.cwd())` (= repo root post-FX003). The two paths diverge → CLI sends `X-Local-Token` from one file, server checks against another → 401 `bad-credential`, breaking AC-17 in default dev layout.

**Fix**:
1. `apps/web/instrumentation.ts:89` now writes at `findWorkspaceRoot(process.cwd())` (paired with `bootstrap-code.json` per FX003), with `process.cwd()` fallback if walk-up fails.
2. CLI's `discoverServerUrl` and `createEventPopperClient` extended to read at `cwd` first, then `findWorkspaceRoot(cwd)`, then legacy `apps/web` fallback (back-compat).
3. `requireLocalAuth` already correct (no change needed).

Both write and read sides now converge on `findWorkspaceRoot()` — single canonical `.chainglass/server.json` location, mirroring the FX003 contract for `bootstrap-code.json`.

### Final Regression Sweep

`pnpm vitest run` across `test/unit/shared/auth-bootstrap-code/` + Phase 5 unit + Phase 5 integration + Phase 3 verify/forget + Phase 4 terminal-WS = **313/313 passed (8.37s)** — +4 over the pre-F001-fix sweep due to the new F001 regression cases.

