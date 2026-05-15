# Always-On Bootstrap-Code Auth (with Optional GitHub OAuth)

📚 This specification incorporates findings from [`auth-bootstrap-code-research.md`](./auth-bootstrap-code-research.md) and design decisions from [`workshops/004-bootstrap-code-lifecycle-and-verification.md`](./workshops/004-bootstrap-code-lifecycle-and-verification.md).

---

## Research Context

The web app currently gates access with GitHub OAuth (Auth.js v5, allowlist file, JWT cookie) and a `proxy.ts` matcher. `DISABLE_AUTH=true` short-circuits the entire stack, returning a fake session and a pass-through proxy. The Plan 064 workshop on terminal-WS auth already established the pattern of "HTTP route mints a short-lived JWT, sidecar validates with a shared secret"; Plan 067 / Plan 076 already established the pattern of "write a per-instance secret to a gitignored file at boot, processes read it as a local-trust bearer." This feature composes those patterns into a popup-fronted always-on gate that does not depend on GitHub at all and that closes three concrete holes the research surfaced:

- the terminal-WS sidecar silently degrades to no-auth when `AUTH_SECRET` is unset,
- two sidecar HTTP sinks (`/api/event-popper/*`, `/api/tmux/events`) are protected only by `localhostGuard` and accept arbitrary forged events from anything on loopback,
- `DISABLE_AUTH=true` removes every gate, so a developer with that flag set has zero protection.

---

## Summary

Anyone visiting the web app — first page, every device, every browser, every fresh session — must enter a locally-generated bootstrap code before any UI renders or any data leaves the server. The code is generated automatically at server boot and lives in a known gitignored file at the repo root, so the operator can read it whenever they need it. Once a browser submits the correct code, that browser remembers and is never prompted again until the operator rotates the code. The same gate protects the terminal endpoint and other local-process sinks, even when GitHub OAuth is disabled. GitHub OAuth becomes a layered, optional second factor for installations that want it.

The user value: dramatically lower the barrier to bringing up a Chainglass instance (no GitHub OAuth setup required for personal/dev use), while raising the floor of protection (closes three real exposure holes the research dossier identified).

---

## Goals

- **Default-deny on every page.** No page renders interactive UI to a visitor who hasn't entered the bootstrap code — including `/login` itself.
- **One-prompt UX.** A user who enters the right code on a given browser is not prompted again until the operator rotates the code.
- **Saveable code.** The code persists across server restarts; the operator can read it from a known on-disk file at any time.
- **Always-on terminal protection.** The terminal WS endpoint and its token-issuing HTTP route refuse all unauthenticated traffic regardless of how GitHub OAuth is configured.
- **Sidecar sinks gated.** `/api/event-popper/*` and `/api/tmux/events` accept only requests that prove possession of either the bootstrap code (browser cookie) or the existing CLI local-token (`X-Local-Token` header).
- **Optional GitHub OAuth.** Operators who want GitHub OAuth keep it; operators who don't can switch it off cleanly. The bootstrap gate runs identically in both modes.
- **Discoverable rotation.** The operator can rotate the code without learning a CLI command (delete the file + restart), and the rotation invalidates every existing browser cookie automatically.
- **Fail loudly on misconfiguration.** If GitHub OAuth is enabled but its required environment variables are missing, the server logs one clear error and exits — no silent degradation.

---

## Non-Goals

- **No multi-user identity model from this feature alone.** Per-user identity remains anchored to GitHub OAuth when enabled; without GitHub, all gated traffic is treated as one anonymous "the operator". (No users database, no roles.)
- **No second factor beyond GitHub OAuth.** No TOTP, no magic links, no SMS.
- **No code expiry.** The code rotates only on operator action, not on a timer.
- **No cross-machine code distribution.** Each Chainglass instance has its own code; teams who share a deployment share the code by sharing the file.
- **No recovery without filesystem access.** If you can't read the file, you can't enter the app. By design — that's the trust boundary.
- **No CLI command to print the code in v1.** The cat-the-file workflow is the only operator path. A future CLI is fair game for v2.
- **No popup-design changes for mobile-specific UX.** The popup must render correctly on mobile (no regressions), but mobile-specific polish belongs in a follow-on workshop.
- **No custom rate-limit infrastructure.** A simple in-memory per-IP token bucket is acceptable; no Redis, no shared store.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/auth` | existing | **modify** | Becomes the home of the bootstrap-code generator, verify/forget endpoints, popup component, and cookie machinery. Existing GitHub OAuth pieces become a sub-feature inside it. |
| `terminal` | existing | **modify** | Token-issuing HTTP route and WS sidecar consume the new unified signing-secret helper; silent-bypass branch closed; JWT gains issuer/audience/cwd binding. |
| `_platform/events` | existing | **modify** | Sidecar HTTP sinks (`/api/event-popper/*`, `/api/tmux/events`) gain a composite `requireLocalAuth(req)` check that accepts the bootstrap cookie or the existing `X-Local-Token`. |
| `@chainglass/shared` | existing (package) | **modify** | New module `auth-bootstrap-code/` for code generation, file IO, cookie HMAC, signing-secret helper. Per Constitution Principle 7 (shared by default). |
| `_platform/sdk` | existing | **consume** | Optional future "rotate bootstrap code" command surface (out of scope for v1). |

No new domains created — the feature deliberately extends the existing `_platform/auth` ownership rather than fragmenting it.

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**: S=2, I=1, D=1, N=1, F=2, T=1 → P=8

- **S=2** — Cross-cutting: `proxy.ts`, `instrumentation.ts`, two new API routes, terminal-WS server, terminal-token route, two sidecar-sink routes, RootLayout, env-var matrix, shared package. ≥10 files.
- **I=1** — Internal-only. NextAuth interaction is constrained to the existing `auth.ts` wrapper and one env-var rename.
- **D=1** — One new on-disk file with a small schema, one new cookie format. Atomic-write helper already exists (Plan 067). No migrations.
- **N=1** — Research dossier and workshop have resolved most ambiguity. A small set of clarify-tier decisions remain (rate-limit numbers, CLI scope, mobile UX nuance).
- **F=2** — Security-critical feature with a real threat model. Closes three exposure holes; introduces one cookie + one HMAC. Behaviour change for installations relying on the silent-bypass.
- **T=1** — Integration tests required (proxy + sidecar composition, WS auth-on-restart). No staged-rollout or feature-flag complexity.

**Confidence**: 0.80 — workshop pinned the design hard; main residual risk is the Next.js 16 RSC popup wiring (deepresearch opportunity #1 in the dossier).

**Recommended Mode**: **Full** (CS-4 with security stakes warrants phased delivery and code review per phase).

**Assumptions**:
- The Plan 064 token-exchange pattern is a stable foundation (it shipped and tests still pass).
- Operators have filesystem access to the host running the server; that is the authentication anchor.
- 60 bits of entropy plus a per-IP rate limit is adequate for a single-host developer tool. (External-research opportunity #2 in the dossier validates this; surfaces final numbers.)
- Closing the terminal-WS silent-bypass is acceptable as a behaviour change for the small population of operators relying on it. Documentation calls it out.

**Dependencies**:
- None external. Reuses `node:crypto`, `jose` (already in `apps/web` deps), and Auth.js v5 (already wired).
- Coordinates with workshop 005 for popup UX (separate deliverable, runs in parallel or sequentially).

**Risks** (complexity-related):
- The proxy rewrite expands the matcher to "everything" with explicit bypass list; an off-by-one in the bypass list locks operators out. Test coverage for every excluded path is essential.
- The `activeSigningSecret()` helper caches per-process; operator rotation must restart the server. If a caller forgets to clear the cache in tests, results can mislead.
- HMR safety in the boot-path: if the bootstrap-code module is imported transitively before the global flag check runs, double-write is possible. The existing pattern (Plan 027 / 067) handles this; we just have to follow it precisely.

**Suggested Phases** (to be refined by `/plan-3-v2-architect`):
- **Phase 1** — Shared primitives in `packages/shared/src/auth/bootstrap-code/`: types, generator, file IO (atomic temp+rename), cookie sign/verify, `activeSigningSecret()` helper. Pure unit tests; no UI; no integration.
- **Phase 2** — Boot integration: `instrumentation.ts` writes the file via the shared helper; boot-time assertion for GitHub-OAuth-enabled-but-no-`AUTH_SECRET` configurations; `.gitignore` lines.
- **Phase 3** — Verify/forget routes + proxy rewrite: `POST /api/bootstrap/verify`, `POST /api/bootstrap/forget`, broadened proxy matcher with explicit bypass list, page-vs-API cookie-missing behaviour. RootLayout signal for the popup (component delivered in Phase 6).
- **Phase 4** — Terminal sidecar hardening: WS validator switches to `activeSigningSecret()`, silent-bypass branch removed, token-route JWT gains `iss`/`aud`/`cwd`, WS validator enforces them.
- **Phase 5** — Sidecar HTTP-sink hardening: `requireLocalAuth(req)` helper; apply to event-popper and tmux-events routes; preserve `localhostGuard` as defence-in-depth; deprecation alias `DISABLE_AUTH` → `DISABLE_GITHUB_OAUTH`.
- **Phase 6** — Popup component & RootLayout integration: depends on workshop 005 outcome. Cookie autofill UX, error states, accessibility, mobile rendering.
- **Phase 7** — Operator docs, migration notes, deprecation timeline, end-to-end tests across realistic env-var combinations.

---

## Acceptance Criteria

Each criterion is independently testable; the implementation is "done" when every one passes in CI plus harness (where applicable).

1. **Fresh-browser gate.** A browser with no `chainglass-bootstrap` cookie navigating to any path under the app (including `/`, `/workspaces/...`, `/dashboard/...`, and `/login`) sees the bootstrap-code popup and cannot interact with the underlying page until it submits the correct code.

2. **Correct-code unlock.** Submitting the code shown in `.chainglass/bootstrap-code.json` to the popup dismisses the popup, sets a cookie, and reveals the requested page. No reload is required (a same-page revalidation is acceptable).

3. **Sticky unlock.** After a successful unlock, navigating to any other page within the same browser does not re-prompt. Closing the browser tab and re-opening (without clearing cookies) does not re-prompt. Closing the browser entirely and re-opening (without clearing cookies) does not re-prompt.

4. **Wrong-code rejection.** Submitting a code that does not match the file returns a clear error in the popup, does not set a cookie, and does not reveal the page.

5. **Format validation.** Submitting a syntactically invalid code (wrong length, illegal characters, missing hyphens) returns a format-error response distinct from "wrong code".

6. **Rate limit.** After a tunable number of consecutive incorrect submissions from a single IP within a tunable window, further attempts return a rate-limit response with a retry-after hint, and the popup surfaces a meaningful message. [NEEDS CLARIFICATION: final numbers — research dossier proposed 5/min/IP with leaky-bucket; operators may want stricter or looser]

7. **Persistence across server restart.** Stopping and restarting the server without deleting `.chainglass/bootstrap-code.json` preserves cookie validity for already-unlocked browsers.

8. **Rotation invalidates cookies.** Deleting `.chainglass/bootstrap-code.json` and restarting causes every previously-valid `chainglass-bootstrap` cookie across every browser to fail validation and re-prompt.

9. **Boot regenerates only when missing.** If the file exists and parses to the expected schema, server boot does not modify it. If the file is missing or corrupt, boot generates a new code and writes it.

10. **Popup also gates `/login`.** A direct navigation to `/login` shows the popup. The "Sign in with GitHub" affordance is not interactive while the popup is on screen.

11. **GitHub OAuth optional and disabled.** With GitHub OAuth disabled (via `DISABLE_GITHUB_OAUTH=true` or the legacy `DISABLE_AUTH=true`), an unlocked user reaches dashboard pages without seeing or interacting with `/login`.

12. **GitHub OAuth optional and enabled.** With GitHub OAuth enabled and configured (`AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` all set), an unlocked user is redirected to `/login` for the GitHub flow exactly as before — the bootstrap gate runs first, GitHub second.

13. **Terminal WS protected without `AUTH_SECRET`.** With GitHub OAuth disabled and `AUTH_SECRET` unset, the terminal WS sidecar refuses an unauthenticated WebSocket upgrade and refuses an upgrade with a JWT signed by anything other than the bootstrap-derived signing key.

14. **Terminal WS protected with `AUTH_SECRET`.** With `AUTH_SECRET` set, the existing terminal-WS behaviour is preserved (JWT signed with `AUTH_SECRET`).

15. **Terminal token route gated.** `GET /api/terminal/token` returns 401 when no bootstrap cookie is present, regardless of any other auth configuration.

16. **Sidecar sinks gated.** `POST /api/event-popper/*` and `POST /api/tmux/events` return 401 to a request from loopback that has neither a valid `chainglass-bootstrap` cookie nor a valid `X-Local-Token` header. Either credential individually unlocks the route.

17. **CLI continues to work.** A request to a sidecar-sink route bearing the `localToken` from `.chainglass/server.json` in `X-Local-Token` succeeds without any browser cookie. (Existing CLI flows are not regressed.)

18. **Health probe stays public.** `GET /api/health` returns 200 with no cookie and no token, suitable for load-balancer probes.

19. **NextAuth callback URL stays public.** `/api/auth/*` routes serve the OAuth callback and signin/signout endpoints without requiring the bootstrap cookie. (Required for GitHub OAuth to function at all.)

20. **Hard fail on misconfiguration.** Booting with GitHub OAuth enabled and `AUTH_SECRET` unset logs one clear actionable error and exits with non-zero status. Booting with GitHub OAuth disabled and `AUTH_SECRET` unset succeeds.

21. **Deprecation alias.** Setting `DISABLE_AUTH=true` produces the same gating behaviour as `DISABLE_GITHUB_OAUTH=true` and emits a deprecation warning to the server log naming the new variable.

22. **Code never appears in logs.** Server boot and routine operation produce no log line containing the bootstrap code value. The boot log instead points to the on-disk file path.

23. **HMR safety.** Editing a server file during `pnpm dev` does not regenerate the bootstrap code (idempotent boot). The popup state in an open browser is unaffected by HMR-triggered server module reloads.

24. **Forget endpoint.** `POST /api/bootstrap/forget` clears the cookie unconditionally and returns 200, restoring the popup on the next page navigation.

25. **HttpOnly cookie.** The `chainglass-bootstrap` cookie is not readable by JavaScript on any page (verifiable via DevTools / `document.cookie`).

26. **`AUTH_SECRET` rotation invalidates everything (added by validation fix H4).** If an operator changes the `AUTH_SECRET` env var and restarts the server, every `chainglass-bootstrap` cookie *and* every active terminal-WS JWT becomes invalid simultaneously. The first request from any browser re-prompts the popup, and any open terminal-WS sessions disconnect (next refresh re-issues a token). This is the documented expected behaviour — `AUTH_SECRET` rotation is treated as a hard invalidation event and operators are expected to schedule it during a maintenance window.

---

## Risks & Assumptions

| # | Risk / Assumption | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Closing the terminal-WS silent-bypass surprises operators relying on `DISABLE_AUTH=true` + no `AUTH_SECRET` to work locally | Medium | Medium | HKDF-derived fallback signing key means WS keeps working without `AUTH_SECRET`; release notes call out the change explicitly; the new behaviour is *more* secure, not less functional |
| R-2 | The proxy rewrite (broaden matcher + explicit bypass list) introduces an off-by-one that locks operators out of `/login` or `/api/health` | Medium | High | Test every excluded path explicitly; staged rollout to staging environment before main; document recovery (`rm .chainglass/bootstrap-code.json` is not a recovery — operator-must-restart-with-`DISABLE_AUTH-true` is also not, since bootstrap is always-on; recovery is `git revert + restart`) |
| R-3 | Next.js 16 RSC + HttpOnly cookie + client popup wiring has subtleties around hydration flash | Medium | Medium | External research (deepresearch opportunity #1 in dossier) validates the canonical pattern before workshop 005 finalises |
| R-4 | 60-bit code with rate limit may be insufficient against a future networked-attacker scenario | Low | High | External research opportunity #2 validates parameters; if insufficient, increase to 16-char base32 (80 bits) — purely a constant change |
| R-5 | Operator deletes `.chainglass/bootstrap-code.json` mid-boot, racing the regen | Very Low | Low | Boot is single-process; idempotent atomic-write helper; corrupt-file branch already regenerates |
| R-6 | Cookie collision with NextAuth session cookie | Very Low | Low | Distinct names (`chainglass-bootstrap` vs `next-auth.session-token`) and distinct paths; cookie tests confirm |
| R-7 | Cache in `activeSigningSecret()` returns a stale value in long-running test fixtures | Low | Low | Test-only `_resetSigningSecretCacheForTests()` exported; CI uses fresh process per suite where needed |
| R-8 | Mobile browsers losing cookie aggressively (private mode, iOS Safari ITP) | Medium | Low | Treated as expected; popup re-prompts; documentation acknowledges; `localStorage` autofill (workshop 005) softens UX |

**Foundational assumptions** (not enumerated as risks because we have evidence):
- The atomic temp+rename file-write pattern from Plan 067 is robust on macOS/Linux dev machines (proven shipping for months).
- The Plan 064 token-exchange pattern composes with our additional cookie-gate-upstream layer (architectural reasoning + workshop sequence diagrams).
- Filesystem access on the host is the trust boundary (consistent with Plan 067/076 explicit assumption; Constitution and ADR-0003 have not flagged this as a problem).

---

## Open Questions

These are decisions worth surfacing in `/plan-2-v2-clarify`. Most are about parameter tuning or scope-edge calls; none are foundational design choices.

1. **Rate-limit policy.** [NEEDS CLARIFICATION: per-IP attempts/window — workshop proposed 5/60s leaky-bucket; final operator-tunable defaults?]

2. **Code length / entropy.** [NEEDS CLARIFICATION: 12-char (60 bits) Crockford base32 vs 16-char (80 bits) — workshop proposes 12; deepresearch confirms or revises]

3. **CLI command in v1.** [NEEDS CLARIFICATION: ship `cg auth show-code` or defer to v2? Current default: defer]

4. **Popup UX scope for v1.** [NEEDS CLARIFICATION: minimum-viable popup only, or include localStorage autofill, animated reveal, mobile keyboard handling? Workshop 005 territory; spec recommends MVP for v1, polish in fast-follow]

5. **Logout / forget UX.** [NEEDS CLARIFICATION: where does the user discover `/api/bootstrap/forget`? Settings panel? Account menu? Out-of-band-only?]

6. **Migration grace period for `DISABLE_AUTH` alias.** [NEEDS CLARIFICATION: one release? two? deprecation warning only, or hard removal scheduled?]

7. **Boot-time hint.** [NEEDS CLARIFICATION: should the boot log print the absolute path to the bootstrap-code file (yes — workshop says yes for discoverability), or also pretty-print "see `.chainglass/bootstrap-code.json`" with a one-line cat hint?]

8. **Testing scope vs harness scope.** [NEEDS CLARIFICATION: integration tests cover most of this; do we also exercise via the L3 agent harness for AC-1 / AC-2 / AC-13 / AC-16? Recommended: yes, given security stakes]

---

## Workshop Opportunities

| # | Topic | Type | Status | Why Workshop | Key Questions |
|---|---|---|---|---|---|
| 1 | Bootstrap-code lifecycle and server-side verification | Storage Design + Integration Pattern | ✅ **Complete** ([004](./workshops/004-bootstrap-code-lifecycle-and-verification.md)) | File format, generation, persistence, cookie HMAC, sidecar protection layering, env-var matrix | Resolved: file format, persistence policy, cookie shape, HKDF fallback, env-var rename |
| 2 | Popup UX & RootLayout integration | Integration Pattern | **Recommended** | Hydration flash, RSC ↔ client component handoff, mobile/keyboard handling, localStorage autofill, accessibility | RSC pattern for HttpOnly-cookie-gated render; popup component placement; mobile keyboard / safe-area; failure-mode UX (server has rotated) |
| 3 | Operator UX and recovery | CLI Flow + State Machine | Optional | Discoverability of "rotate the code", troubleshooting workflows, log hints, migration messaging | Boot-log hint shape; rotation runbook; misconfiguration error wording; future CLI surface |

**Recommendation**: Run workshop #2 before `/plan-3-v2-architect`. Workshop #3 is small and can be merged into plan-3 outputs (operator docs phase) without a dedicated workshop pass.

---

## Out-of-Scope Considerations Documented for Future Reference

These came up in research/workshop and were deliberately excluded from v1 scope. Recording them so they're not rediscovered later:

- **Code TTL / time-based rotation.** Could add `Max-Age` to the cookie or auto-rotate the file periodically. Deferred — operator-driven rotation is enough for the threat model.
- **Per-user bootstrap codes.** Out of scope — this is a single-instance gate, not an identity system. GitHub OAuth provides identity when needed.
- **Sharing the code across team members on a shared deployment.** Operator policy. Out of scope (we provide the file; how operators distribute it is their problem).
- **WSS enforcement when `TERMINAL_WS_HOST=0.0.0.0`.** Mentioned in research; not enforced in v1. Workshop 004 notes the WS layer is genuinely auth'd now (was effectively open under silent-bypass) — improvement, but not a TLS mandate.
- **Audit logging of unlock attempts.** Could log every verify attempt (success/fail) with IP. Out of scope for v1; rate-limit logging is the closest we get.
- **Settings UI for "rotate code".** Belongs in `_platform/sdk` if/when added; v1 ships rm-and-restart only.
- **Multiple concurrent codes (rotation grace period).** Could keep the previous code valid for N minutes after rotation. Out of scope — the simpler model (rotation is hard cutover) is acceptable.

---

## Cross-References (for plan-3-v2-architect)

- **Domain-map updates expected**: an edge from `_platform/auth` → `terminal` representing the signing-key dependency (the WS sidecar consumes `activeSigningSecret()`). Possibly an edge from `_platform/auth` → `_platform/events` for the same reason. Confirm during architect pass.
- **Domain-registry updates**: no new domain. `_platform/auth`, `terminal`, `_platform/events` History rows.
- **Constitution alignment**: shared primitives go to `packages/shared/src/auth/bootstrap-code/` per Principle 7.
- **ADR alignment**: ADR-0003 secret-detection patterns avoided by Crockford base32 alphabet (workshop 004 notes).
- **Harness**: AC-1, AC-2, AC-10, AC-13, AC-16 are good harness-exercise candidates given the security stakes. Plan-3 to confirm.
