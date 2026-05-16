# Execution Log: FX011 — HtmlViewer asset token

**Fix**: [FX011-html-viewer-asset-token.md](./FX011-html-viewer-asset-token.md)
**Started**: 2026-05-16
**Companion**: code-review-companion, run `2026-05-16T13-56-40-619Z-3f9f`

---

## Per-Task Log

### FX011-1 — Asset-token primitives (TDD)

**Status**: completed

**Approach**: TDD red → green.

1. Wrote `test/unit/shared/auth-bootstrap-code/asset-token.test.ts` with 22 test cases organised into 6 describe blocks: `buildAssetToken` (5 cases), happy path (1), undefined/null/malformed (7), expiry boundary triad (3), worktree binding (2), key rotation (1), length-mismatch/tampering (3). Mirrors the `cookie.test.ts` style (KEY_A/KEY_B fixtures, real `node:crypto`, no mocks).
2. Ran vitest — 22/22 failed with `buildAssetToken is not a function` (expected red).
3. Wrote `packages/shared/src/auth-bootstrap-code/asset-token.ts` with `buildAssetToken` + `verifyAssetToken`. Token shape: `<expSecs>.<base64url(HMAC-SHA256(key, "asset:" + worktree + ":" + expSecs))>`. Verifier guards: empty/null check → indexOf dot → reject 3+ parts → reject empty halves → reject non-decimal expSecs → reject negative/non-finite → expiry check (`now >= expSecs` is expired) → recompute HMAC → length pre-check → `timingSafeEqual`. Mirrors `cookie.ts` structure.
4. Added export to `packages/shared/src/auth-bootstrap-code/index.ts:31` alongside the existing `buildCookieValue`/`verifyCookieValue` export.
5. Re-ran vitest — 22/22 pass.

**Evidence**: `pnpm vitest run test/unit/shared/auth-bootstrap-code/asset-token.test.ts` → Tests 22 passed (22) in 217ms.

**Files**:
- `packages/shared/src/auth-bootstrap-code/asset-token.ts` (NEW)
- `packages/shared/src/auth-bootstrap-code/index.ts` (MODIFY — line 31 added)
- `test/unit/shared/auth-bootstrap-code/asset-token.test.ts` (NEW)

**Companion ping**: sent (sha 56eae005, msgId 01KRQF1Y28AT51W7FTNQ0PCB07). No findings as of FX011-2 start.

---

### FX011-2 — Mint endpoint (TDD)

**Status**: completed

**Approach**: TDD red → green. **Deviation from dossier**: dossier called for Zod validation, but apps/web doesn't depend on Zod and sibling `bootstrap/verify` route uses manual `typeof` validation. Adopted manual validation for consistency with siblings, avoiding a new dependency.

1. Wrote `test/unit/web/api/bootstrap/asset-token.test.ts` — 8 tests: 200 happy-path with round-trip verification under the same `activeSigningSecret(cwd)` key, 400 cases (missing field / empty / relative / dot-relative / non-string / malformed JSON), and 200 on path that does not exist on disk (mint validates shape only, not existence). Mirrors verify.test.ts fixture style with `mkTempCwd` + cache resets.
2. Ran vitest — failed (no route file). Expected red.
3. Wrote `apps/web/app/api/bootstrap/asset-token/route.ts` — POST handler, manual body validation (`typeof body.worktree === 'string'` + non-empty + `startsWith('/')`), 400 on shape failure, 503 on bootstrap-code failure, 200 with `buildAssetToken(worktree, key, 600)`.
4. Added regression-lock rows to `test/unit/web/proxy.test.ts`: `isBypassPath('/api/bootstrap/asset-token')` is `false`, and `evaluateCookieGate(...)` returns `cookie-missing-api` for cookie-less requests. Locks the contract that this route is intentionally cookie-gated.
5. Re-ran both test files: 60/60 pass.

**Evidence**: `pnpm vitest run test/unit/web/proxy.test.ts test/unit/web/api/bootstrap/asset-token.test.ts` → Tests 60 passed (60).

**Files**:
- `apps/web/app/api/bootstrap/asset-token/route.ts` (NEW)
- `test/unit/web/api/bootstrap/asset-token.test.ts` (NEW)
- `test/unit/web/proxy.test.ts` (MODIFY — added 2 regression-lock rows)

**Companion ping**: sent (sha d73ce31d, msgId 01KRQF7JPEZFER1E0H08Q8JNE0). No findings.

---

### FX011-3 — Proxy + raw-route token recognition (TDD)

**Status**: completed

**Approach**: TDD red → green for both layers + integration test.

1. **Helper module** (`apps/web/src/lib/asset-token-gate.ts`): wrote `test/unit/web/lib/asset-token-gate.test.ts` with 15-case `it.each` table. Red → wrote implementation with regex literal `/^\/api\/workspaces\/[^/]+\/files\/raw$/`. Green: 15/15.

2. **Proxy short-circuit** (`apps/web/proxy.ts`): inserted at line 38 (immediately after `isBypassPath` return, before X-Local-Token check). Calls `isAssetTokenEligiblePath` → reads `_at` + `worktree` query → loads key via `getBootstrapCodeAndKey()` → `verifyAssetToken` → on `true` return `'bypass'`, on `false` silent fallthrough (mirrors X-Local-Token shape). 30-line doc block explains scope discipline + silent-fallthrough rationale.

3. **Proxy unit tests**: appended `bootstrapCookieStage — FX011 asset-token short-circuit` describe block to `test/unit/web/proxy.test.ts` with 6 cases: valid-token bypass, expired-token fallthrough → 401, wrong-worktree fallthrough → 401, valid-token+valid-cookie still bypass (token wins), ineligible-path token-ignored → 401, no-token+no-cookie 401 (existing behavior preserved). All pass.

4. **Raw-route handler** (`apps/web/app/api/workspaces/[slug]/files/raw/route.ts`): replaced unconditional `await auth()` with **three-branch** logic per the dossier: `_at` present + valid → skip auth; `_at` present + INVALID → 401 EXPLICIT (does NOT fall back to `auth()` — closes the `DISABLE_GITHUB_OAUTH=true` fake-session bypass); `_at` absent → call `auth()` as before. Imports `getBootstrapCodeAndKey` + `verifyAssetToken`.

5. **Build regression**: HMR caught a build break — Next.js was reading from `packages/shared/dist/` which had stale exports. Ran `pnpm build` in shared to regenerate dist with `buildAssetToken`/`verifyAssetToken`. (Implementor note for future: shared-package exports require a rebuild.)

6. **Integration test** (`test/integration/web/raw-file-asset-token.integration.test.ts`): real mint→fetch flow. 6 tests including the CRITICAL regression-lock under `DISABLE_GITHUB_OAUTH=true` proving mangled tokens still 401 (not fake-session bypass). One test was dropped — the "no `_at`, no session → 401" branch can't be exercised in vitest because Next.js `auth()` requires a real request scope; that branch is upstream-covered by `proxy.test.ts`. **Env-var bleed gotcha**: local shell has `DISABLE_AUTH=true` set, which leaks into vitest. Added cleanup of `DISABLE_AUTH` + `DISABLE_GITHUB_OAUTH` + `AUTH_SECRET` in beforeEach.

**Evidence**: full FX011 sweep — `npx vitest run` of all 5 test files → **109 passed (109)** in 3.18s. Includes the critical `under DISABLE_GITHUB_OAUTH=true, mangled token still rejects (no fake-session bypass)` assertion.

**Files**:
- `apps/web/src/lib/asset-token-gate.ts` (NEW)
- `apps/web/proxy.ts` (MODIFY — line 36-67 region)
- `apps/web/app/api/workspaces/[slug]/files/raw/route.ts` (MODIFY — three-branch auth)
- `test/unit/web/lib/asset-token-gate.test.ts` (NEW)
- `test/unit/web/proxy.test.ts` (MODIFY — append FX011 describe block)
- `test/integration/web/raw-file-asset-token.integration.test.ts` (NEW)
- `packages/shared/dist/auth-bootstrap-code/*` (rebuild artifact, not committed — generated by `pnpm build` in shared)

**Companion ping**: sent (sha c48757a6, msgId 01KRQFJFDVN2TV2HTN6WRFV5RY). No findings.

---

### FX011-4 — HtmlViewer fetches + splices token (TDD)

**Status**: completed (harness manual verification pending in separate step)

**Approach**: TDD red → green for the rewriter; manual-verification step deferred to harness Playwright check.

1. Wrote `test/unit/web/features/041-file-browser/html-viewer-rewrite.test.ts` with 10 assertions: token presence on every rewritten URL, untouched absolute / protocol-relative / data: / anchor / root-relative URLs, src + href both rewritten, URL-encoding of tokens with reserved chars, absolute-URL output (includes origin). 10/10 fail (rewriter not exported).
2. Refactored `html-viewer.tsx`: exported `rewriteRelativeUrls` with new required `token: string` param appending `&_at=${encodeURIComponent(token)}` per rewrite. Added `extractWorktree(src)` helper that parses the worktree out of the raw-file URL's query string. Replaced the `useEffect` `.then()` chain with an `async loadAndRewrite()` sub-function for sequential ordering: mint token FIRST via `POST /api/bootstrap/asset-token` with `credentials: 'same-origin'`, set error state + return early on mint failure (so iframe never renders with broken sub-resources). HTML fetch comes second and only runs on successful mint. Stored token in local `let` (used once); state holds `blobUrl`/`error` (which trigger the iframe render).
3. **Sandbox immutability** (AC #9): `sandbox="allow-scripts"` at line 200 — preserved verbatim; grep-verified.
4. Re-ran rewriter tests: 10/10 green.
5. Final FX011 sweep across all 6 test files: **119/119 passing**.

**Evidence**: `npx vitest run` of all 6 FX011 test files → Tests 119 passed (119) in 3.45s.

**Files**:
- `apps/web/src/features/041-file-browser/components/html-viewer.tsx` (MODIFY — sequential fetch, token splice, sandbox unchanged)
- `test/unit/web/features/041-file-browser/html-viewer-rewrite.test.ts` (NEW)

**Companion ping**: pending — sent after commit.

**Harness manual verification**: ✅ completed. `harness/tests/features/fx011-html-asset-token.spec.ts` — Playwright via L3 harness CDP at `:3107`. Test HTML with relative `./images/red.png` ref, mounted at `/app/scratch/harness-test-workspace/fx011/test.html` via `just harness seed`. Test PASSED (7.0s) with screenshot at `harness/results/fx011-html-rendered.png` showing red 64×64 square rendered + iframe-internal JS reporting `IMAGE LOADED (64x64)`. Network-layer assertions: mint endpoint 200, every tokened raw-file request 200, `red.png` specifically fetched via token path 200, `sandbox="allow-scripts"` regression-lock verified.

---

### Companion review (run `2026-05-16T13-56-40-619Z-3f9f`) — farewell envelope reconciliation

**Companion verdict**: completed cleanly. 1491s duration, 125 tool calls, 7524 events. 5 tasks received (1 briefing + 4 review-requests + 1 drain ping). **No HIGH/CRITICAL findings.** Load-bearing security posture verified intact (sandbox=`allow-scripts`, AUTH_BYPASS_ROUTES unchanged, three-branch auth, type-tagged HMAC).

**Findings reconciliation table** (ackOf → main commit → resolution):

| ID | Severity | ackOf | Main commit | Disposition |
|---|---|---|---|---|
| F001 | LOW | `01KRQF1Y28...` (FX011-1) | `56eae00` | **Deferred / declined**. The type signature mismatch (`string \| undefined` vs `URLSearchParams.get()` returns `string \| null`) is cosmetic — runtime narrowing handles `null` correctly. Cost > value; documented here for posterity. |
| F002 | MEDIUM | `01KRQF7J...` (FX011-2) | `d73ce31` | **Fixed in follow-up** — added 503-on-bootstrap-failure unit test (file corruption + chmod, same pattern as proxy F004 block). Envmatrix-vs-proxy.test.ts placement preserved (regression IS locked, just in a different file — documented in dossier task notes). |
| F003 | MEDIUM | `01KRQFJF...` (FX011-3) | `c48757a` | **Fixed in follow-up** — rewrote § Authoritative Validation Layer in the dossier to distinguish proxy-layer fallthrough from raw-route handler precedence; added explicit integration test `handler precedence: invalid _at rejects 401 even with a bootstrap cookie attached` that locks the behaviour. |
| F004 | LOW | `01KRQFQD...` (FX011-4) | `a4fe60e` | **Fixed in follow-up** — added `if (controller.signal.aborted) return;` guard before the `setError(true)` call in HtmlViewer's `loadAndRewrite().catch(...)` tail. |

**Companion magicWand** (target: `coordination` — minih harness itself, NOT this codebase):
> "Make the coordination state schema and prompt vocabulary share one generated source so `state_transition({to:'reviewing'})` either validates or the prompt never asks for that status."

Filed as upstream issue: **https://github.com/AI-Substrate/minih/issues/31**

**Companion retrospective notes**:
- Worked well: per-commit pings with explicit hazards made each layer reviewable independently
- Confusing: minih's coordination MCP rejected documented status values; companion fell back to inbox-only progress (still functional, hence the upstream issue rather than a session-blocker)
- Severity of MH-001: `degrading` (not failing)

**Local lesson captured for future companion runs**: `minih outside inbox list` shows messages keyed by `sender: 'outside'` (from us) and `sender: 'inside'` (from the companion's *live* responses). **Findings sent via the SDK's structured output land in the run's `output/report.json` farewell envelope, NOT the inbox.** When skimming the inbox between tasks, also peek at the latest farewell-shaped output OR wait for `control:stop` → farewell to surface findings. (Earlier `select(.sender == "inside")` filter returned 0 messages and gave a false "no findings" signal.)

---

### Follow-up commit: companion F002 + F003 + F004

**Status**: completed

Three of the four companion findings addressed; F001 declined as cosmetic. Total: ~30 LoC code + ~50 LoC tests + dossier doc rewrite.

**Files**:
- `test/unit/web/api/bootstrap/asset-token.test.ts` (MODIFY — +1 test for 503 branch)
- `apps/web/src/features/041-file-browser/components/html-viewer.tsx` (MODIFY — abort guard in catch tail)
- `test/integration/web/raw-file-asset-token.integration.test.ts` (MODIFY — +1 test for handler precedence with cookie)
- `docs/plans/084-random-enhancements-3/fixes/FX011-html-viewer-asset-token.md` (MODIFY — § Authoritative Validation Layer rewrite)

**Evidence**: Full FX011 sweep → **121 tests passing** (up from 119). No regressions.
