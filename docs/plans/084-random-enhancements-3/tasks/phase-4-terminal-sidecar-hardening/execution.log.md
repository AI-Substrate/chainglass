# Phase 4 — Terminal Sidecar Hardening — Execution Log

**Phase**: Phase 4 — Terminal Sidecar Hardening
**Started**: 2026-05-03
**Landed**: 2026-05-03
**Outcome**: ✅ All 7 tasks completed; 46/46 Phase 4 tests + 344/344 regression sweep green; user-reported Next.js bundling error resolved by extracting `terminal-auth.ts` from `terminal-ws.ts`.

---

## Pre-Phase Harness Validation

| Stage | Status | Note |
|-------|--------|------|
| Boot | ✅ Already running | `curl /api/health` → `{"status":"ok"}` |
| Interact | ✅ HTTP 200 | Health endpoint reachable |
| Observe | ✅ JSON response captured | n/a beyond health |

Harness L3 — sufficient as-is for Phase 4 unit + integration scope.

---

## Task-by-Task

### T001 — WS RED tests

- Extended `test/unit/web/features/064-terminal/terminal-ws.test.ts` with **24 new failing scenarios** under `describe('Phase 4 — auth surface')`:
  - JWT shape constants exposed (`TERMINAL_JWT_ISSUER`, `TERMINAL_JWT_AUDIENCE`).
  - `validateTerminalJwt` cases: HKDF accept (AUTH_SECRET unset), wrong iss/aud/cwd → 4403, **MISSING iss/aud/cwd → 4403** (typeof string presence checks; closes the validate-v2 finding), wrong-key forgery → 4403, malformed → 4403, AUTH_SECRET parity.
  - `parseAllowedOrigins` — comma-split + trim + null-on-blank.
  - `buildDefaultAllowedOrigins` — both `localhost` AND `127.0.0.1` enumerated; IPv6 NOT default; https opt-in.
  - `authorizeUpgrade` — Origin missing / `null` / cross-origin → 4403; valid → accept; missing token → 4401.
  - `assertBootstrapReadable` — silent on success; on failure, error contains cwd path but never the bootstrap CODE (AC-22 audit).
- Added `// @vitest-environment node` directive — server-side test, jsdom env breaks jose's cross-realm `Uint8Array instanceof` check.
- **RED confirmed**: 24 fail (`assertBootstrapReadable is not a function`, etc.); 13 existing tests still pass.

### T002 — WS GREEN

- Added module-level pure-function exports to `terminal-ws.ts`: `TERMINAL_JWT_ISSUER`, `TERMINAL_JWT_AUDIENCE`, `validateTerminalJwt`, `parseAllowedOrigins`, `buildDefaultAllowedOrigins`, `discoverNextPort`, `authorizeUpgrade`, `assertBootstrapReadable`.
- Refactored factory:
  - `cwd = findWorkspaceRoot(process.cwd())` (FX003 R6 — sidecar adopts walk-up).
  - Removed `authEnabled` / `authSecret` / `authKey` factory state. `validateToken(token)` rewritten to delegate to `validateTerminalJwt` with cached `activeSigningSecret(cwd)`.
  - `start()` — adds startup assertion (try/catch around `assertBootstrapReadable`; FATAL log + `process.exit(1)` on throw); builds allowedOrigins via `parseAllowedOrigins(env) ?? buildDefaultAllowedOrigins(discoverNextPort(cwd), httpsEnabled)`; `wss.on('connection')` calls `authorizeUpgrade(req, opts)` and converts the result to `ws.send` + `ws.close`.
- Periodic `msg.type === 'auth'` reconnect handler — kept active (always-on auth).
- **GREEN confirmed**: 37/37 in `terminal-ws.test.ts` (all 13 prior + 24 new).

### T003 — Token route RED

- Created `test/unit/web/api/terminal/token.test.ts` (6 cases under `// @vitest-environment node`):
  - 401 when no cookie / cookie tampered / cookie signed for different code.
  - 200 + JWT with correct `iss/aud/cwd/sub/iat/exp` claims when both cookie + DISABLE_AUTH session present.
  - HKDF-path Buffer-direct signing (no TextEncoder re-wrap) verified against the same Buffer.
  - AUTH_SECRET parity scenario.
- Session faking via `process.env.DISABLE_AUTH = 'true'` — production-proven `auth.ts:36–54` short-circuit; no test seam added.
- **RED confirmed**: 5/6 fail (current route returns 503 due to `AUTH_SECRET` unset path + lacks cookie pre-check + lacks claim embedding).

### T004 — Token route GREEN

- Rewrote `apps/web/app/api/terminal/token/route.ts`:
  - Header JSDoc enumerates the JWT shape contract for Phase 7 docs + future maintainers.
  - GET handler: NextAuth `auth()` pre-check (preserves prior 401 behaviour) → bootstrap-cookie pre-check via `req.cookies.get(BOOTSTRAP_COOKIE_NAME)` + `verifyCookieValue(value, code, key)` → `findWorkspaceRoot(process.cwd())` → `SignJWT(...).sign(key)` (Buffer-direct, no `TextEncoder`).
  - 401 paths: missing session, missing cookie, tampered cookie, wrong-code cookie. 503 only when bootstrap unavailable (file IO fails).
- **One assertion fix during run**: macOS `/var → /private/var` symlink — test computed `expectedCwd = findWorkspaceRoot(cwd)` but the route uses `findWorkspaceRoot(process.cwd())` which returns the resolved (symlink-followed) path. Test updated to match.
- **GREEN confirmed**: 6/6 in `token.test.ts`.

### T005 + T006 — Integration tests

- Created `test/integration/web/features/064-terminal/terminal-bootstrap.integration.test.ts` (3 cases):
  - **AC-13 (a)**: `AUTH_SECRET` unset + cookie set → token route 200 + JWT (HKDF) → `authorizeUpgrade` accepts.
  - **AC-13 (b)**: `AUTH_SECRET` unset + NO cookie → token route 401; attacker hand-crafts JWT signed with wrong key → `authorizeUpgrade` rejects with 4403 (silent-bypass closure proven from both sides).
  - **AC-14**: `AUTH_SECRET` set + cookie set → end-to-end parity.
- WS upgrade simulated by calling exported `authorizeUpgrade(req, opts)` directly — no real WS server stand-up; pure-function design pays off.
- **GREEN**: 3/3.

### Mid-flight discovery — Next.js bundling regression

The user reported `Module not found: Can't resolve '../../065-activity-log/lib/activity-log-writer.js'` from the bundled token route. Root cause: token route imported `TERMINAL_JWT_ISSUER` etc. from `@/features/064-terminal/server/terminal-ws`, which transitively pulled `ws`, `node-pty`, and the activity-log writer (sidecar-only deps) into the Next.js bundle.

**Fix** (logged as `decision`): Extract the pure auth surface into a new module `apps/web/src/features/064-terminal/server/terminal-auth.ts`. `terminal-auth.ts` imports only `jose`, `@chainglass/shared/auth-bootstrap-code`, `@chainglass/shared/event-popper` (`readServerInfo`). The route imports from `terminal-auth.ts` directly. `terminal-ws.ts` re-exports the same names so existing tests don't have to change. Verified clean: route.ts → terminal-auth.ts → (no ws/node-pty/activity-log).

User confirmed surface restart resolved it.

### T007 — Domain doc updates

- `docs/domains/terminal/domain.md`:
  - History row added for `084 Phase 4`.
  - Dependencies table — new `_platform/auth` row enumerating the consumed primitives.
- `docs/domains/_platform/auth/domain.md`:
  - History row added for `084-auth-bootstrap-code Phase 4` (full delta, includes terminal-auth.ts module split, validate-v2 fix folds, test count).
- `docs/domains/domain-map.md`:
  - New labelled edge `terminal --> auth` with the four consumed contracts.

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-05-03 | T001 | gotcha | jose 6.x rejects Buffer in jsdom env (`payload instanceof Uint8Array` fails — cross-realm Uint8Array) — but only when vitest's `environmentMatchGlobs` routes the file to jsdom. | Add `// @vitest-environment node` directive to all server-side terminal tests (terminal-ws, token, integration). Standalone Node REPL with same Buffer + jose works fine. | vitest.config.ts:42 |
| 2026-05-03 | T004 | gotcha | macOS tmpdir `/var/folders/...` is a symlink to `/private/var/folders/...`; `mkdtempSync` returns the unresolved path but `process.cwd()` after `chdir` returns the resolved path. `findWorkspaceRoot()` walks up from each starting at different prefixes. | Test computes `expectedCwd = findWorkspaceRoot(process.cwd())` so the route and the test agree. | token.test.ts:108 |
| 2026-05-03 | T004 (mid-flight) | decision | Importing `TERMINAL_JWT_ISSUER` from `terminal-ws.ts` into a route handler pulled the entire sidecar (`ws`, `node-pty`, activity-log writer) into the Next.js bundle, causing `Module not found` for `.js` ESM imports under Turbopack. | Extracted pure auth surface to new `terminal-auth.ts`; route imports from there. `terminal-ws.ts` re-exports for backward-compat with existing tests. Forward-compat note: future route additions consuming terminal auth primitives MUST import from `terminal-auth.ts`, not `terminal-ws.ts`. | terminal-auth.ts (new, ~190 LOC) |
| 2026-05-03 | T002 | insight | The factory-scoped `validateToken` helper survives because `msg.type === 'auth'` periodic refresh from the client still funnels through it. With always-on auth, the path is unconditional now. Cost is one cached `activeSigningSecret(cwd)` Map lookup per refresh — negligible. | n/a — preserved as-is. | terminal-ws.ts |

---

## Test Summary

| Suite | Files | Tests | Pass |
|-------|-------|-------|------|
| Phase 4 — Direct | 3 | 46 | 46 ✅ |
| Phase 1+2+3+6+FX003 — Regression | 27 | 298 + 1 skipped | 298 ✅ |
| **Total Phase 4 acceptance scope** | **30** | **344 + 1 skipped** | **344 ✅** |

Direct Phase 4 breakdown:
- `test/unit/web/features/064-terminal/terminal-ws.test.ts` — 37 (13 prior + 24 new)
- `test/unit/web/api/terminal/token.test.ts` — 6
- `test/integration/web/features/064-terminal/terminal-bootstrap.integration.test.ts` — 3

---

## Acceptance Criteria

- [x] AC-13 — Terminal WS rejects unauthenticated upgrades when `AUTH_SECRET` unset (HKDF path proves auth, two-scenario integration test passes).
- [x] AC-14 — `AUTH_SECRET=set` flows continue to work end-to-end (parity test passes).
- [x] AC-15 — `/api/terminal/token` returns 401 without bootstrap cookie even when NextAuth session is present.
- [x] WS validator enforces `iss === 'chainglass'`, `aud === 'terminal-ws'`, `payload.cwd === sidecar cwd`, with explicit `typeof === 'string'` presence guards.
- [x] WS validator rejects upgrades whose `Origin` is missing, `null`, or not in the allowlist.
- [x] Sidecar uses `findWorkspaceRoot(process.cwd())` for its signing-key derivation cwd (FX003 R6).
- [x] Sidecar fails fast with a clear error when `bootstrap-code.json` cannot be read at startup; bootstrap CODE never logged (AC-22 honoured at the WS layer).
- [x] All existing terminal-ws tests continue to pass (13/13 prior cases preserved).

---

## Suggested Commit Message

```
084 Phase 4: Terminal sidecar hardening — close silent-bypass + JWT iss/aud/cwd

- terminal-ws.ts: authEnabled = true always; signing key from
  activeSigningSecret(findWorkspaceRoot()) (FX003 R6 — sidecar adopts walk-up
  so HKDF keys converge with main Next process). Origin allowlist (default
  localhost + 127.0.0.1 variants for the active Next port discovered via
  Plan 067 server.json; opt-in via TERMINAL_WS_ALLOWED_ORIGINS for remote dev).
  Origin: null and missing/cross-origin all 4403. Startup assertion: missing
  bootstrap-code.json → console.error + process.exit(1). Bootstrap CODE never
  logged (AC-22).

- New apps/web/src/features/064-terminal/server/terminal-auth.ts with the
  pure auth surface (constants, validateTerminalJwt, parseAllowedOrigins,
  buildDefaultAllowedOrigins, discoverNextPort, authorizeUpgrade,
  assertBootstrapReadable). Keeps Next.js route handlers free of ws/node-pty/
  activity-log sidecar deps. terminal-ws.ts re-exports for backward-compat.

- /api/terminal/token: keep NextAuth auth() pre-check, ADD bootstrap-cookie
  pre-check (defence-in-depth on top of proxy gate), sign with shared key
  Buffer-direct to jose (no TextEncoder re-wrap), embed
  iss=chainglass / aud=terminal-ws / cwd claims (5-min expiry). Header JSDoc
  documents the JWT shape contract.

- Tests: 24 new WS unit cases + 6 new token-route unit cases + 3 integration
  scenarios (AC-13 silent-bypass-closed two-scenario + AC-14 AUTH_SECRET
  parity). // @vitest-environment node where required (jose 6.x has
  cross-realm Uint8Array friction in jsdom).

- Domain docs: terminal/domain.md History row + Dependencies table; auth
  domain.md History; domain-map.md edge `terminal -> auth`.

Closes AC-13, AC-14, AC-15. validate-v2 11 issues folded into task spec
before implementation. Phase 4 / 7 tasks (T001–T007) all green;
46/46 Phase 4 tests + 344/344 regression sweep.
```
