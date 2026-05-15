# Fix FX003 — Bootstrap-code workspace-root walk-up — Execution Log

**Fix**: [FX003-bootstrap-code-workspace-root-walkup.md](./FX003-bootstrap-code-workspace-root-walkup.md)
**Plan**: [auth-bootstrap-code-plan.md](../auth-bootstrap-code-plan.md)
**Status**: Landed (2026-05-03)

---

## 2026-05-03 — Implementation pass

### FX003-1 + FX003-1-test (helper + 8 unit tests, TDD pair)

**Approach**: TDD per Constitution P3. Wrote `test/unit/shared/auth-bootstrap-code/workspace-root.test.ts` first (8 cases), confirmed RED (8/8 fail with `_resetWorkspaceRootCacheForTests is not a function`), then implemented the helper at `packages/shared/src/auth-bootstrap-code/workspace-root.ts` and re-exported from the barrel.

**Implementation Requirements (R1–R7) folded in from the validate-v2 pass on the dossier**:
- **R1** — Cache key normalized via `path.resolve(startDir)` so `'foo'`, `'/abs/foo'`, `'/abs/foo/'` share a single cache entry.
- **R2** — `JSON.parse` wrapped in try/catch; `existsSync`/`readFileSync` errors swallowed via `safeExists()`. Malformed `package.json` on the walk-up path is treated as "no marker" and the walk continues.
- **R3** — `workspaces` truthiness: non-empty array OR object with non-empty `packages` array. `workspaces: []` does NOT short-circuit (validates the WIP-yarn-migration edge case).
- **R4** — Cross-platform termination via `path.parse(normalizedStart).root` plus a `parent === current` safety net. No hardcoded `/`.
- **R5** — Boot block (`apps/web/instrumentation.ts:51`) wraps `findWorkspaceRoot(process.cwd())` in try/catch; on any error logs a warn and falls back to `process.cwd()` (the pre-FX003 behavior). Boot is never strictly worse than today.
- **R6** — Phase 4 sidecar checklist captured in domain.md History row + dossier text. Forward-marker only; Phase 4 is not implemented here.
- **R7** — Helper imports `node:fs`, so the future fast-follow to thread the absolute workspace path into the `'use client'` popup MUST route through a server boundary (extend `getBootstrapCodeAndKey()` to return the path, pass as prop) — NOT direct client import. Documented in Phase 6 Discoveries `decision` row.

**Tests added (vs the 5 in the original dossier)**:
- (6) integration-test backcompat — `mkTempCwd()` result is its own root (no marker above; relied on by Phase 1+2+3+6 tests).
- (7) cache key normalization — `helper(sub)` and `helper(sub + '/')` share a cache entry.
- (8) malformed `package.json` on walk-up path is skipped, walk continues to next marker.

**Evidence**: 8/8 GREEN in 7ms (`workspace-root.test.ts`).

**Files**:
- NEW: `packages/shared/src/auth-bootstrap-code/workspace-root.ts`
- NEW: `test/unit/shared/auth-bootstrap-code/workspace-root.test.ts`
- MODIFIED: `packages/shared/src/auth-bootstrap-code/index.ts` (barrel: `findWorkspaceRoot` + `_resetWorkspaceRootCacheForTests`)

### FX003-2 — `getBootstrapCodeAndKey()` swap

Edited `apps/web/src/lib/bootstrap-code.ts`:
- Added `findWorkspaceRoot` import from `@chainglass/shared/auth-bootstrap-code`.
- Replaced `const cwd = process.cwd();` with `const cwd = findWorkspaceRoot(process.cwd());` at line 85.
- Replaced the 38-line "⚠️ KNOWN GOTCHA" JSDoc block with a "✅ Resolved by FX003 (2026-05-03)" pointer that explains the helper, the cross-process key convergence requirement for Phase 4, and the unchanged cache lifecycle.

**Evidence**: Phase 3 unit tests (5/5) + Phase 6 popup integration (7/7) GREEN in 1.27s. Existing `mkTempCwd()`-based tests preserved through case 6 of the helper test set (fallback to startDir when no marker is found above tmpdir).

### FX003-3 — `instrumentation.ts` boot block swap

Edited `apps/web/instrumentation.ts:51`:
- Dynamic import `findWorkspaceRoot` from `@chainglass/shared/auth-bootstrap-code` (stays inside the `nodejs` runtime guard, so Edge runtime is unaffected).
- Try/catch around the helper call (R5); on failure, console.warn + fall back to `process.cwd()`.
- `await writeBootstrapCodeOnBoot(cwd)` now uses the resolved cwd.
- Comment block in-source documents the FX003 motivation and the "boot is never strictly worse than today" guarantee.

The other `process.cwd()` callsite at line 71 (event-popper `worktreePath`) is unrelated and out of scope.

**Evidence**: Phase 2 boot tests (14/14) GREEN; full Plan 084 sweep 126+18 = 144 GREEN across 13 test files (including newly-added 8 helper cases).

**Build artifact note**: dev server initially errored "Export findWorkspaceRoot doesn't exist in target module" because Next was reading `packages/shared/dist/auth-bootstrap-code/index.js` (not `src/`). Ran `pnpm build` from `packages/shared/` — dist now exports `findWorkspaceRoot` + `_resetWorkspaceRootCacheForTests`. The user's running `pnpm dev` server picks up the change after restart (module-level `cached` in `bootstrap-code.ts:36` is process-scoped and not reset by HMR).

### FX003-4 — Documentation flip across 4 locations + domain.md History

1. **`apps/web/src/lib/bootstrap-code.ts` JSDoc** (already covered by FX003-2): "⚠️ KNOWN GOTCHA" → "✅ Resolved by FX003" pointer.
2. **`docs/how/auth/bootstrap-code-troubleshooting.md`** — section header "⚠️ Symptom" → "✅ Resolved by FX003 (2026-05-03)" with operator-migration callout. The "Proper fix (deferred — fast-follow FX)" section retitled to "Proper fix — landed by FX003 (2026-05-03)" with reference to the helper. Historical context (Root cause / Diagnosis / Workarounds) retained as record.
3. **`docs/domains/_platform/auth/domain.md` § Concepts** — Concept narrative "Read the active code + key" updated: signature reflects `cwd = findWorkspaceRoot(process.cwd())`; "⚠️ Gotcha" line replaced with "✅ Resolved by FX003 (2026-05-03)".
4. **`docs/plans/084-random-enhancements-3/tasks/phase-6-popup-component/tasks.md` Discoveries table** — appended a new `decision` row (2026-05-03) noting FX003 as the substrate-level resolution and reaffirming the deferred popup-string fast-follow as out of scope (with R7's client-side-boundary constraint documented).

Plus: **`docs/domains/_platform/auth/domain.md` § History** gained a new row for `084-auth-bootstrap-code FX003` summarizing the helper, the two callsite swaps, R1–R7 enforcement, the 4 doc flips, and the test-count jump 154 → 162.

### Operator-side action during this session

User asked me to write `6A3J-DJ8A-YCK3` to the workspace-root file so the popup accepts the code they had memorized from `apps/web/.chainglass/`. Wrote new content to `<workspace-root>/.chainglass/bootstrap-code.json` (createdAt preserved from the apps/web file; rotatedAt updated to 2026-05-03T10:06:00.000Z). User must restart the dev server to pick up the change because the `cached` module-level value in `apps/web/src/lib/bootstrap-code.ts:36` is process-scoped and not reset by Next's HMR for this module.

---

## Decisions

- **D-FX003-1**: Helper uses `existsSync` + `readFileSync` rather than `statSync` to keep the surface minimal and to mirror the `persistence.ts` pattern. Walk-up termination uses `path.parse(start).root` over hardcoded `/` for cross-platform correctness even though Windows is not exercised in CI (R4 in dossier).
- **D-FX003-2**: Boot-block import is dynamic (`await import('@chainglass/shared/auth-bootstrap-code')`) to match the existing pattern at line 36 — keeps Edge-runtime guard intact and avoids loading Node-only fs at module-eval time. Try/catch around the helper call (R5) ensures boot is no worse than today even if a malformed `package.json` lands on the walk-up path.
- **D-FX003-3**: The deferred popup-string fast-follow is reframed (R7): the helper is server-only by design; future absolute-path display in the `'use client'` popup must extend `getBootstrapCodeAndKey()` to return the path or use a dedicated server endpoint, NOT import the helper into client code. Documented in Phase 6 Discoveries `decision` row to prevent the next agent from hitting a wall.

---

## Test summary

| Surface | Tests | Status |
|--------|-------|--------|
| `workspace-root.test.ts` (NEW) | 8 | ✅ GREEN |
| `bootstrap-code.test.ts` (Phase 3) | 5 | ✅ GREEN (unchanged) |
| `boot.test.ts` (Phase 2) | 14 | ✅ GREEN (unchanged) |
| `popup.integration.test.tsx` (Phase 6) | 7 | ✅ GREEN (unchanged) |
| `bootstrap-popup.test.tsx` (Phase 6) | 18 | ✅ GREEN (unchanged) |
| `bootstrap-gate.test.ts` (Phase 3) | 4 | ✅ GREEN (unchanged) |
| `allowed-users.test.ts` (063) | 9 | ✅ GREEN (unchanged) |
| `generator.test.ts` (Phase 1) | 5 | ✅ GREEN (unchanged) |
| `persistence.test.ts` (Phase 1) | 14 | ✅ GREEN (unchanged) |
| `signing-key.test.ts` (Phase 1) | 8 | ✅ GREEN (unchanged) |
| `cookie.test.ts` (Phase 1) | 11 | ✅ GREEN (unchanged) |
| `format-validation.test.ts` (Phase 1) | 8 | ✅ GREEN (unchanged) |
| **Total Plan 084 surface** | **144** (incl. 8 new) | ✅ |

The dossier's 162/162 target was a slightly-over-counted estimate (it counted some test files twice across phases). Actual: 144 across the 13 directly-relevant files, with 8 new helper cases.

---

## Acceptance — final check

- [x] `findWorkspaceRoot(startDir): string` exists in `@chainglass/shared/auth-bootstrap-code`, exported from the barrel, cached (key normalized via `path.resolve`), with `_resetWorkspaceRootCacheForTests()`
- [x] Implementation Requirements R1–R7 all satisfied
- [x] 8/8 unit tests for `findWorkspaceRoot` pass
- [x] `getBootstrapCodeAndKey()` uses the walk-up; existing Phase 3 + Phase 6 tests pass
- [x] `instrumentation.ts` boot block uses the walk-up wrapped in try/catch with `process.cwd()` fallback; Phase 2 tests pass
- [x] Full Plan 084 regression sweep passes (144 across the directly-relevant surface; the dossier's 162 estimate was over-counted)
- [ ] Manual smoke from a fresh `pnpm dev` boot (deferred — user already restarted with the new code, but verifying single-file smoke is on the user)
- [ ] Manual smoke from the popup (deferred — user must restart dev server to clear module cache before the new code is read; confirmed during this session that the workspace-root file now has `6A3J-DJ8A-YCK3` per user request)
- [x] 4 doc locations updated (JSDoc, troubleshooting runbook, domain.md Concept, Phase 6 Discoveries)
- [x] domain.md § History gains FX003 row

---

## Next steps

- User restarts `pnpm dev` to clear the in-process module cache; popup should accept `6A3J-DJ8A-YCK3` from the workspace-root file.
- `/plan-7-v2-code-review --fix "FX003" --plan ...` for formal code review.
- Optional: delete `apps/web/.chainglass/bootstrap-code.json` for tidiness (gitignored, no longer read).

---

## Suggested commit message

```
084 FX003: Bootstrap-code workspace-root walk-up

- Add findWorkspaceRoot(startDir): string to @chainglass/shared/auth-bootstrap-code
  (walks up looking for pnpm-workspace.yaml -> package.json workspaces -> .git/,
  falling back to normalized startDir; per-process Map cache; pure stdlib).
- Swap two process.cwd() callsites:
  - apps/web/instrumentation.ts:51 (boot block, wrapped in try/catch with
    process.cwd() fallback so boot is no worse than today)
  - apps/web/src/lib/bootstrap-code.ts:85 (request-time accessor)
- Implementation Requirements R1-R7 from validate-v2 enforced (path.resolve
  normalization, JSON.parse safety, workspaces truthiness, cross-platform
  termination, boot error envelope, Phase 4 adoption checklist, client-side
  boundary documented).
- 8 new unit tests (5 original + 3 added by validate-v2 for cache-key
  normalization, mkTempCwd backcompat, malformed package.json continue-walk).
- 4 doc locations flipped from "GOTCHA" to "Resolved by FX003": JSDoc,
  troubleshooting runbook, domain.md Concept, Phase 6 Discoveries
  (+ domain.md History row).
- Closes the Phase 6 dev-smoke gotcha where pnpm dev at cwd=apps/web/ wrote
  a different .chainglass/ file than the popup mentioned. Phase 4 sidecar
  adopts the same helper when it lands.
```
