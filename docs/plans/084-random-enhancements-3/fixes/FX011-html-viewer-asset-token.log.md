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

**Companion ping**: pending — sent after commit.
