# Fix FX003: Bootstrap-code workspace-root walk-up

**Created**: 2026-05-03
**Status**: Landed (2026-05-03)
**Plan**: [auth-bootstrap-code-plan.md](../auth-bootstrap-code-plan.md)
**Source**: User-reported bug surfaced during Phase 6 dev smoke (2026-05-02). Documented at the time in Phase 6 dossier Discoveries (`gotcha` row), `apps/web/src/lib/bootstrap-code.ts` JSDoc "KNOWN GOTCHA" block, `docs/domains/_platform/auth/domain.md` § Concepts warning, and operator runbook `docs/how/auth/bootstrap-code-troubleshooting.md`. This FX is the proper fix mentioned in all four locations.
**Domain(s)**: `@chainglass/shared` (auth-bootstrap-code — additive new export); `_platform/auth` (consumer call-site updates)

---

## Problem

`pnpm dev` (and `pnpm turbo dev`) starts the Next.js process with `process.cwd()` set to `apps/web/` rather than the workspace root. Plan 084's bootstrap-code primitives — `ensureBootstrapCode(cwd)` and `activeSigningSecret(cwd)` — interpret their `cwd` argument as "the directory whose `.chainglass/` subdir holds the active code file". Two upstream call-sites currently pass `process.cwd()` verbatim:

- `apps/web/instrumentation.ts:51` — boot-time write via `writeBootstrapCodeOnBoot(process.cwd())`
- `apps/web/src/lib/bootstrap-code.ts:85` — request-time accessor `getBootstrapCodeAndKey()` (the JSDoc "KNOWN GOTCHA" block sits at lines 38–82)

When the dev server runs at `cwd=apps/web/`, both call-sites land at `apps/web/.chainglass/bootstrap-code.json` instead of the workspace-root `.chainglass/bootstrap-code.json` that the popup tells the operator to read. Result: typing the workspace-root code into the popup yields "Wrong code — try again" because the dev server is reading a different file. This footgun is reproducible on every fresh worktree and surfaced live during Phase 6 smoke testing.

A second consequence is HKDF key divergence — the terminal-WS sidecar (Phase 4) computes its signing key from `activeSigningSecret(process.cwd())`. If the sidecar is launched with a different cwd from the main Next process (which is the default behaviour of Next 16's `next dev` / turbo wrapper), the two derive different keys and a token issued by `/api/terminal/token` won't validate at the WS upgrade. This is silent until Phase 4 lands and someone tries the terminal — Phase 6 doesn't expose it but it's the same root cause.

## Proposed Fix

Add an additive helper `findWorkspaceRoot(startDir): string` to `@chainglass/shared/auth-bootstrap-code` that walks up from a starting directory looking for one of (in priority order): `pnpm-workspace.yaml`, a `package.json` containing a top-level `workspaces` field, or `.git/`. Falls back to `startDir` if no marker is reachable before `/`. Result is cached per-process via a `Map<string, string>` keyed by the starting directory.

Two consumer call-sites swap `process.cwd()` for `findWorkspaceRoot(process.cwd())`:
- `apps/web/instrumentation.ts:51` (Phase 2 boot-time write)
- `apps/web/src/lib/bootstrap-code.ts` `getBootstrapCodeAndKey()` (Phase 3 accessor; itself calls `ensureBootstrapCode` + `activeSigningSecret` with the resolved cwd)

Phase 4's terminal-WS sidecar adopts the same helper when it lands. Phase 1 + Phase 2 unit tests are unaffected — they pass explicit temp-dir `cwd` values straight into `ensureBootstrapCode` without going through the helper. The helper itself gets a new 5-case unit test file.

The four documentation locations that flag this gotcha are updated to "Resolved by FX003 (2026-05-03)": `apps/web/src/lib/bootstrap-code.ts` JSDoc, `docs/domains/_platform/auth/domain.md`, `docs/how/auth/bootstrap-code-troubleshooting.md`, and the Phase 6 dossier's Discoveries log gains a resolution row.

The popup string `.chainglass/bootstrap-code.json` becomes accurate again after the fix because `process.cwd()` walks up to the workspace root before `.chainglass/` is appended. No popup-string change required (the optional debt row in Phase 6 Discoveries about threading the absolute path to the popup remains a future polish; not in scope here).

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `@chainglass/shared` (auth-bootstrap-code) | **modify (additive contract)** | New file `workspace-root.ts` exporting `findWorkspaceRoot(startDir): string`; barrel re-exports it. No existing exports change. Cache + reset helper for tests. |
| `_platform/auth` | **modify (call-site swap)** | Two `process.cwd()` callsites in `apps/web/` swap to `findWorkspaceRoot(process.cwd())`. JSDoc on `getBootstrapCodeAndKey` gets the "GOTCHA" section replaced with a "RESOLVED BY FX003" pointer. |
| `terminal` (future, not in scope) | consume | When Phase 4 lands, sidecar calls the same helper. Mentioned here as a forward-marker; no Phase 4 code is touched in this fix. |

**Risk callout**: shared package contract changes (additive only). Existing callers that pass an explicit `cwd` to `ensureBootstrapCode` / `activeSigningSecret` are unaffected — the helper is opt-in. The behaviour change for opt-in callers is: file moves from `apps/web/.chainglass/bootstrap-code.json` to workspace-root `.chainglass/bootstrap-code.json` after the fix lands. Operator migration is documented (one line: delete the stale `apps/web/.chainglass/` file after upgrading; or just ignore it — first boot at the new cwd regenerates if missing).

## Implementation Requirements (added 2026-05-03 by `/validate-v2`)

The `findWorkspaceRoot()` implementation in FX003-1 MUST satisfy these requirements (all surfaced by validation; folding them in here so they aren't lost during plan-6 implementation):

**R1 — Normalize cache key**: First line of the helper does `const normalizedStart = path.resolve(startDir);`. The cache `Map<string, string>` is keyed by `normalizedStart`, and the walk-up loop starts from `normalizedStart`. Without this, callers passing `'apps/web'` vs `'/abs/.../apps/web'` vs `'/abs/.../apps/web/'` get separate cache entries and the cache discipline test (FX003-1-test case 5) is misleading.

**R2 — Wrap `JSON.parse` in try/catch**: When inspecting a `package.json` for a `workspaces` field, parse failures (malformed JSON during a developer's WIP edit) MUST NOT throw. Treat parse errors and `fs.readFileSync` errors (EACCES, EISDIR, ENOENT) as "no marker at this level" and continue walking. Mirror the pattern in `packages/shared/src/auth-bootstrap-code/persistence.ts:42-45`.

**R3 — `workspaces` truthiness**: A `package.json` qualifies as a marker only if its parsed `workspaces` is a non-empty array OR an object whose `packages` field is a non-empty array. Skip `"workspaces": []` (intermediate yarn-migration state); do NOT short-circuit the walk on it.

**R4 — Cross-platform termination**: Loop terminates when `current === path.parse(normalizedStart).root` (not hardcoded `'/'`). Matches the pattern already in use at `apps/web/src/lib/project-config.ts`. Out-of-scope statement: deliberate Windows-equivalence verification is NOT in scope (no Windows CI), but the termination guard MUST NOT infinite-loop on any platform.

**R5 — Boot block error envelope**: FX003-3 wraps the `findWorkspaceRoot(process.cwd())` call inside `instrumentation.ts:51` with a try/catch. On any thrown error: log a warn, fall back to `process.cwd()`, continue boot. The fix MUST NOT make boot strictly worse than today (today's `process.cwd()` cannot throw; the swap must preserve that property at the call-site even if the helper itself can throw).

**R6 — Phase 4 adoption checklist**: When Phase 4 (terminal-WS sidecar) is dossier'd, its Pre-Implementation Check MUST include the line: "Confirm sidecar startup calls `findWorkspaceRoot(process.cwd())` before passing cwd to `activeSigningSecret()`; key convergence between Next process and sidecar depends on both processes resolving the same workspace root via this helper." Add this as a forward-marker to `auth-bootstrap-code-plan.md` Phase 4 Task 4.1 description (already references cwd assertion; this tightens it to "use the helper", not "assert manually").

**R7 — Client-side boundary documented**: The deferred fast-follow noted in Phase 6 Discoveries (threading the absolute workspace-root path to the popup string) CANNOT be implemented by importing `findWorkspaceRoot` into `apps/web/src/features/063-login/components/bootstrap-popup.tsx` — that file is `'use client'` and the helper imports `node:fs`. The fast-follow design must route through a server boundary: either (a) the existing `getBootstrapCodeAndKey()` server accessor returns the absolute path alongside the code, and the layout passes it to the popup as a prop; OR (b) a dedicated server endpoint exposes the path. FX003 does NOT design the fast-follow — but FX003 MUST NOT promise direct client import of the helper. The Phase 6 Discoveries debt row should be amended (in FX003-4) to reference this server-boundary constraint.

**Test coverage additions** (FX003-1-test): the 5-case test set above is the floor; add `(6) walk-up under a `mkdtempSync` system tmpdir falls back to `startDir` (validates the integration-test backwards-compat claim)`; `(7) cache key normalization — `helper('/foo/bar')` and `helper('/foo/bar/')` return identical strings AND are the same cache entry`; and `(8) malformed `package.json` on the walk-up path is treated as "no marker" and the walk continues`. New test count target: **8/8** (was 5/5). Acceptance and total-test-count targets below updated accordingly.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX003-1 | **Implement `findWorkspaceRoot(startDir): string` helper** in shared package. New file with: (a) per-process `Map<string, string>` cache keyed by `startDir`; (b) walk-up loop checking each ancestor for marker files in priority order — first `pnpm-workspace.yaml` (most authoritative for a pnpm monorepo), then any `package.json` whose parsed JSON has a top-level `workspaces` field (npm/yarn workspaces), then `.git/` (git repo root, fallback for non-workspace repos); (c) terminate at filesystem root (`/`) and fall back to `startDir` if no marker found; (d) `_resetWorkspaceRootCacheForTests()` `@internal` test-only export. Re-export from barrel `@chainglass/shared/auth-bootstrap-code`. **Pure stdlib only** (`node:fs`, `node:path`) — no new package deps. JSDoc documents the precedence and fallback. | `@chainglass/shared` (auth-bootstrap-code) | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth-bootstrap-code/workspace-root.ts` (NEW); `/Users/jordanknight/substrate/084-random-enhancements-3/packages/shared/src/auth-bootstrap-code/index.ts` (MODIFY — barrel export) | Helper exists, exported from barrel, cached, with `@internal` test-reset; package compiles; barrel re-export verified by a smoke import. | Constitution P4 (Fakes Over Mocks): tests use real fs in temp dirs, no `vi.mock`. |
| [x] | FX003-1-test | **Unit tests for `findWorkspaceRoot()`**. 5 cases under `test/unit/shared/auth-bootstrap-code/workspace-root.test.ts` (NEW): (1) returns dir containing `pnpm-workspace.yaml` (priority over other markers); (2) returns dir containing `package.json` with `workspaces` field when no `pnpm-workspace.yaml` exists; (3) returns dir containing `.git/` when no workspace markers exist; (4) falls back to `startDir` when no marker is found before `/`; (5) cache discipline — same `startDir` returns identical string across calls; `_resetWorkspaceRootCacheForTests()` invalidates. Use `mkTempCwd()` from Phase 1 fixtures + nested-dir creation. Real fs, no mocks. | `@chainglass/shared` (auth-bootstrap-code) | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/shared/auth-bootstrap-code/workspace-root.test.ts` (NEW) | All 5 cases pass; no `vi.mock`; `_resetWorkspaceRootCacheForTests()` invalidates between cases. | Constitution P3 (TDD RED→GREEN). |
| [x] | FX003-2 | **Switch `getBootstrapCodeAndKey()` to use the walk-up**. Edit `apps/web/src/lib/bootstrap-code.ts`: replace `const cwd = process.cwd();` with `const cwd = findWorkspaceRoot(process.cwd());`. Update JSDoc — replace the "⚠️ KNOWN GOTCHA — pnpm dev via turbo runs Next at cwd=`apps/web/`" block with a "RESOLVED BY FX003 (2026-05-03)" note that explains the helper now resolves the workspace root automatically. Existing 5 `bootstrap-code.test.ts` cases continue to pass (they use `process.chdir(temp)` so the walk-up will find the temp dir's markers — verify in test run). | `_platform/auth` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/bootstrap-code.ts` (MODIFY) | `getBootstrapCodeAndKey()` resolves `cwd` via `findWorkspaceRoot`; JSDoc updated; Phase 3's existing 5 unit tests + 7 integration scenarios still pass; integration test continues to land its temp `.chainglass/` at the temp `cwd` (the temp dir from `mkdtempSync` won't have any workspace markers, so it falls back to `startDir` — backwards-compatible for tests). | Closes the gotcha documented at `bootstrap-code.ts:38-77`. |
| [x] | FX003-3 | **Switch `instrumentation.ts` boot block to use the walk-up**. Edit `apps/web/instrumentation.ts:51`: replace `await writeBootstrapCodeOnBoot(process.cwd());` with `await writeBootstrapCodeOnBoot(findWorkspaceRoot(process.cwd()));`. Add the import at the top of the file. Phase 2's 14 unit tests for `boot.ts` continue to pass (they pass explicit `cwd` to the helper, no walk-up dependency). Document in instrumentation.ts comment: "// FX003: walk up to workspace root so the file lands at `<workspace-root>/.chainglass/`, not `apps/web/.chainglass/`." | `_platform/auth` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/instrumentation.ts` (MODIFY) | Boot block uses walk-up; full Phase 1+2+3+6 regression sweep still 154/154 GREEN; manual smoke confirms file now lands at workspace-root `.chainglass/bootstrap-code.json` after `pnpm dev` boot from any cwd. | The other `process.cwd()` callsite at line 71 is unrelated (workflow execution worktree path; out of scope). |
| [x] | FX003-4 | **Update documentation** — flip the four "GOTCHA" warnings to "RESOLVED BY FX003": (a) `apps/web/src/lib/bootstrap-code.ts` JSDoc (already covered by FX003-2's JSDoc rewrite); (b) `docs/how/auth/bootstrap-code-troubleshooting.md` — add a "## Resolved (2026-05-03)" callout at the top of the cwd-divergence symptom section noting FX003 is the fix and the symptom should no longer reproduce after upgrading; (c) `docs/domains/_platform/auth/domain.md` § Concepts "Read the active code + key" — replace the `⚠️ Gotcha` line with a `✅ Resolved by FX003` pointer; (d) Phase 6 dossier `tasks.md` Discoveries table — add a third row: type=`decision`, "FX003 resolves the cwd-divergence gotcha + the popup-path-string debt is acknowledged out of scope (separate fast-follow if surfaced again)". Also update `_platform/auth/domain.md § History` with one new row: `\| 084-auth-bootstrap-code FX003 \| Bootstrap-code primitives now resolve workspace root via `findWorkspaceRoot()` walk-up (pnpm-workspace.yaml / package.json workspaces / .git priority); fixes Phase 6 dev-smoke gotcha where `pnpm dev` at `cwd=apps/web/` wrote a different `.chainglass/` file than the popup mentioned \| 2026-05-03 \|`. | docs (cross-cutting) | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/how/auth/bootstrap-code-troubleshooting.md`; `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/auth/domain.md`; `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/tasks/phase-6-popup-component/tasks.md` | All four documentation locations show the fix is landed; markdown lints; no broken cross-references. | Per `/plan-6-v2-implement-phase` step 4 — domain.md history row + concept narrative refresh. |

**Total**: 4 implementation tasks (FX003-1, FX003-2, FX003-3, FX003-4) + 1 paired test task (FX003-1-test). CS estimate: each task CS-1 (trivial) to CS-2 (small); fix total CS-2.

## Workshops Consumed

None. Workshop 004 (`docs/plans/084-random-enhancements-3/workshops/004-bootstrap-code-lifecycle-and-verification.md`) covers the cookie + verify-route design but doesn't specify cwd resolution. The fix supersedes the implicit "use process.cwd() raw" assumption with the explicit "find workspace root" rule. No workshop edits.

## Acceptance

- [ ] `findWorkspaceRoot(startDir): string` exists in `@chainglass/shared/auth-bootstrap-code`, exported from the barrel, cached (key normalized via `path.resolve`), with test-reset helper
- [ ] R1–R7 from Implementation Requirements section all satisfied (path normalization, JSON parse safety, workspaces truthiness, cross-platform termination, boot error envelope, Phase 4 adoption checklist added, client-side boundary documented)
- [ ] 8/8 unit tests for `findWorkspaceRoot` pass
- [ ] `getBootstrapCodeAndKey()` uses the walk-up; existing Phase 3 + Phase 6 tests (29 + 5 = 34 directly-affected cases) still pass
- [ ] `instrumentation.ts` boot block uses the walk-up wrapped in try/catch with `process.cwd()` fallback; Phase 2 unit tests still pass
- [ ] Full Plan 084 regression sweep (Phase 1+2+3+6 + new FX003-1-test cases) passes — target: 154 prior + 8 new = **162/162 GREEN**
- [ ] Manual smoke from a fresh `pnpm dev` boot: `find . -name "bootstrap-code.json"` returns exactly one file, at the workspace root
- [ ] Manual smoke from the popup: typing the workspace-root code unlocks the workspace
- [ ] Four doc locations show the fix is landed (JSDoc, troubleshooting, domain.md Concept, Phase 6 Discoveries)
- [ ] domain.md History gains a new row referencing FX003

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

---

## Cross-references

- Source bug record: `apps/web/src/lib/bootstrap-code.ts:38-82` JSDoc "KNOWN GOTCHA" block (Phase 6 land, 2026-05-02)
- Operator runbook: `docs/how/auth/bootstrap-code-troubleshooting.md` (Phase 6 land, 2026-05-02)
- Domain warning: `docs/domains/_platform/auth/domain.md` § Concepts "Read the active code + key" (Phase 6 land)
- Phase 6 Discoveries log: `docs/plans/084-random-enhancements-3/tasks/phase-6-popup-component/tasks.md` (the row dated 2026-05-02 with type=`gotcha`)

After this fix lands, all four cross-references are updated to point at the resolution.

## Migration note for operators

If an operator is upgrading an existing checkout that has both `<worktree>/.chainglass/bootstrap-code.json` AND `<worktree>/apps/web/.chainglass/bootstrap-code.json`, the workspace-root file becomes the authoritative one after FX003 lands. The dev server's module-level cache holds the old (apps/web) code until restart, so:

1. Pull / rebase to a commit including FX003.
2. Restart the dev server (`pkill -f next-server` then `pnpm dev`).
3. The workspace-root `.chainglass/bootstrap-code.json` is the active file. Read the popup-required code from there.
4. The stale `apps/web/.chainglass/bootstrap-code.json` is harmless — gitignored, ignored at runtime — but can be deleted for tidiness.

This migration is documented in `docs/how/auth/bootstrap-code-troubleshooting.md` as part of FX003-4.

---

## Validation Record (2026-05-03)

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth | Hidden Assumptions, Concept Documentation, Technical Constraints | 2 MEDIUM (line drift) — fixed | ✅ |
| Cross-Reference | Integration & Ripple, Concept Documentation, Domain Boundaries | 0 | ✅ |
| Completeness | Edge Cases & Failures, Hidden Assumptions, Security & Privacy, Deployment & Ops | 2 HIGH + 4 MEDIUM + 3 LOW — HIGH+MED folded into Implementation Requirements R1–R6; LOW open | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Technical Constraints, Deployment & Ops | 1 HIGH (Consumer 6 client-side block) + 1 MEDIUM (Phase 4 enforcement) — folded into R6/R7 | ⚠️ → ✅ |

**Lens coverage**: 9/12 (above the 8-floor). Missing: User Experience, System Behavior, Performance & Scale (all genuinely N/A for a server-side path-resolution helper).

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `apps/web/instrumentation.ts:51` boot block | sync callable, returns string, must not throw at boot | shape mismatch | ✅ (after R5) | R5 mandates try/catch envelope at the call-site |
| `apps/web/src/lib/bootstrap-code.ts:85` accessor | sync callable, cached on hot path | encapsulation lockout | ✅ (after R1) | R1 mandates path.resolve normalization so cache hits land |
| Phase 4 terminal-WS sidecar (future) | both processes converge on same root | lifecycle ownership | ⚠️ → ✅ (after R6) | R6 mandates Phase 4 Task 4.1 explicitly call the helper |
| Existing Phase 1+2+3+6 tests (154 cases) | fallback-to-startDir preserves backcompat | contract drift | ✅ | tmpdir-under-`/var/folders` walk-up hits no marker → falls back to startDir; new test case 6 explicitly validates this |
| Operator runbook | popup-string `.chainglass/bootstrap-code.json` accurate | contract drift | ✅ | After fix, write-side and read-side both resolve the same workspace root |
| Future popup-string fast-follow | client-side path display in `'use client'` component | encapsulation lockout | ❌ → ⚠️ (R7 documents) | R7 reframes the deferred work to route through a server boundary; helper stays server-only by design |

**Outcome alignment** *(verbatim from Forward-Compatibility agent)*: By resolving `process.cwd()` to the workspace root via the walk-up helper in both the boot block (`instrumentation.ts:51`) and the accessor (`bootstrap-code.ts`), both write-side (file generation) and read-side (file verification) converge on `<workspace-root>/.chainglass/bootstrap-code.json`, advancing the OUTCOME such that the popup's instruction to read the workspace-root file and the dev server's actual file location are synchronized — **pending Phase 4 adopts the same pattern and Consumer 6's future client-side path is addressed via a separate server RPC rather than a direct import**.

**Standalone?**: No — six concrete downstream consumers named with specific requirements (boot block, accessor, Phase 4 sidecar, existing tests, operator runbook, future fast-follow).

**Open (LOW — user decision; not blocking implementation)**:
- L1 — Symlink resolution: `realpathSync` not addressed; if a parent of `apps/web/` is a symlink, callers passing the symlink path vs realpath get separate cache entries. Workaround: don't symlink the workspace; or normalize via `realpathSync` (adds an fs call per first lookup).
- L2 — Security boundary on shared volumes: walk-up may stat `package.json` files in directories above the intended workspace boundary in container/CI mounts. Low concern in practice; one-line JSDoc note would close it.
- L3 — Cross-platform JSDoc: explicit "macOS/Linux only" note vs. fully cross-platform implementation. R4's `path.parse(startDir).root` covers termination correctness; the LOW is purely about JSDoc clarity.

**Overall**: ⚠️ VALIDATED WITH FIXES — HIGH and MEDIUM issues folded into a new Implementation Requirements section (R1–R7) plus updated Acceptance + line-number corrections. Three LOW items left open for the implementer's call. Ready for `/plan-6-v2-implement-phase --fix "FX003" --plan ...` once user approves.
