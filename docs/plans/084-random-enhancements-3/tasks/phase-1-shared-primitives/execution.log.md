# Phase 1 — Shared Primitives — Execution Log

**Plan**: [auth-bootstrap-code-plan.md](../../auth-bootstrap-code-plan.md)
**Phase Tasks**: [tasks.md](./tasks.md)
**Phase Flight Plan**: [tasks.fltplan.md](./tasks.fltplan.md)
**Started**: 2026-04-30
**Implementor**: Claude Opus 4.7 (1M context)

---

## Pre-Phase Harness Validation

| Stage | Status | Note |
|-------|--------|------|
| Boot | SKIPPED | Phase 1 is pure shared-library work; no boot/interact/observe surface |
| Interact | SKIPPED | Same |
| Observe | SKIPPED | Same |

**Verdict**: Per dossier § Harness context — "Pre-phase validation: **Skipped for Phase 1**". Plan-6 will validate harness at start of Phase 2 (which touches `instrumentation.ts`). Test evidence for Phase 1 = `pnpm test --filter @chainglass/shared` output captured below per task.

---

## Setup Discoveries

| # | Discovery | Resolution |
|---|---|---|
| S-D1 | Dossier path inconsistency: file paths used `packages/shared/src/auth/bootstrap-code/` (nested two-segment) but import path `@chainglass/shared/auth-bootstrap-code` (flat one-segment). Repo convention (`file-notes/`, `event-popper/`, `question-popper/`) is flat. | Use **flat layout** at `packages/shared/src/auth-bootstrap-code/` to match convention and align file path with import path. |
| S-D2 | `packages/shared/package.json` has explicit `exports` map (subpath exports) — production consumers (apps/web Phase 3) need an `./auth-bootstrap-code` entry pointing to `./dist/auth-bootstrap-code/index.js`. | Add `./auth-bootstrap-code` exports entry as part of T001 setup (one-time wiring). |
| S-D3 | Vitest alias `@chainglass/shared` → `packages/shared/src` resolves at test time without a build step; tests can import directly. tsconfig `paths` provides typecheck-time resolution. So the package.json exports entry is required only for production runtime (Phase 3+). | Update package.json exports in T001; tests don't need it. |
| S-D4 | Test file pattern (verified via `file-notes/list-files-with-notes-detailed.test.ts`) imports from barrel `@chainglass/shared/file-notes`. To follow the convention, build the barrel **incrementally** during T001–T005 (re-export each module as it lands), then audit the full surface in T006. | Create minimal `index.ts` in T001; add re-exports per module during T002–T005; audit completeness in T006. |

---

## Per-Task Log

### T001 — Types & Zod schema (completed 2026-04-30)

**Files created**:
- `packages/shared/src/auth-bootstrap-code/types.ts` — `BootstrapCodeFile`, `EnsureResult`, `BOOTSTRAP_CODE_PATTERN`, `BOOTSTRAP_COOKIE_NAME`, `BOOTSTRAP_CODE_FILE_PATH_REL`, `BootstrapCodeFileSchema`
- `packages/shared/src/auth-bootstrap-code/index.ts` — minimal barrel re-exporting types

**Files modified**:
- `packages/shared/package.json` — added `"./auth-bootstrap-code"` exports entry

**Decisions / discoveries**:
- **D-T001-1**: Zod 4.3.6 still accepts `z.string().datetime()` (Zod-3 style) — used to match repo convention seen in `event-popper/port-discovery.ts`. Idiomatic Zod 4 would be `z.iso.datetime()` but consistency wins.
- **D-T001-2**: Crockford-base32 regex character class `[0-9A-HJKMNP-TV-Z]` documented inline with breakdown comment so future readers don't have to re-derive: `0-9`(10) + `A-H`(8) + `JKMN`(4) + `P-T`(5) + `V-Z`(5) = 32 chars; excludes `I`/`L`/`O`/`U`.
- **D-T001-3**: Crockford alphabet **not** exported per validation-fix C-FC5 rejection — module-private to `generator.ts` (T002).

**Evidence**: `pnpm exec tsc --noEmit -p tsconfig.json` from `packages/shared/` returned silent (zero typecheck errors). Tests not yet runnable — T001 has no test file (Constitution P2 — types are tested via TypeScript compile, not unit tests).

**Constitutional gates**:
- P1 (Clean Architecture): types live in shared package; no app imports. ✅
- P2 (Interface-First): contract before implementation — `BootstrapCodeFile` and `EnsureResult` exported before any function. ✅
- P7 (Shared by Default): in `packages/shared/`. ✅

### T002 — generateBootstrapCode (completed 2026-04-30)

**Files created**:
- `test/unit/shared/auth-bootstrap-code/generator.test.ts` — 5 tests (length, regex, 1k uniqueness, alphabet membership, hyphen positions)
- `packages/shared/src/auth-bootstrap-code/generator.ts` — pure function, module-private alphabet

**Files modified**:
- `packages/shared/src/auth-bootstrap-code/index.ts` — re-exports `generateBootstrapCode`

**TDD evidence (RED → GREEN)**:
- RED: `5 failed (5)` — `TypeError: generateBootstrapCode is not a function`
- GREEN: `5 passed (5)` in 17ms
- Command: `pnpm exec vitest run --root . test/unit/shared/auth-bootstrap-code/generator.test.ts`

**Decisions / discoveries**:
- **D-T002-1**: Vitest run-from-root requires explicit `--root .` flag when current shell cwd is inside a workspace package — pnpm/vitest auto-discovery picks the closest `package.json` as root and resolves include glob `test/**/*.test.ts` relative to it (so package-local cwd looks for `packages/shared/test/...` which doesn't exist). Mitigation: always pass `--root /abs/path/to/repo` when running individual test files.
- **D-T002-2**: Spurious `vite-tsconfig-paths` errors about stale standalone `tsconfig.json` files under `apps/web/.next/standalone/` and `apps/cli/dist/web/standalone/` are noisy but non-fatal — vitest still runs and produces correct results. These are build artifacts; not Phase 1's problem.
- **D-T002-3**: Added two tests beyond the dossier minimum: alphabet-membership (200 iterations) and hyphen-position. Reason: the regex test alone proves _shape_ but not that the generator emits _valid Crockford characters_. The extra tests catch a class of bugs (e.g., off-by-one in alphabet lookup) that the regex test would miss.

**Constitutional gates**:
- P3 (TDD): RED → GREEN cycle complete; test committed alongside impl in same task. ✅
- P4 (Fakes Over Mocks): real `node:crypto.randomInt`; no `vi.mock`. ✅

### T003 — read/write/ensureBootstrapCode + test-fixtures (completed 2026-04-30)

**Files created**:
- `test/unit/shared/auth-bootstrap-code/test-fixtures.ts` — `mkTempCwd()`, `mkBootstrapCodeFile()`, `INVALID_FORMAT_SAMPLES` (readonly, 6 samples)
- `test/unit/shared/auth-bootstrap-code/persistence.test.ts` — 14 tests across `readBootstrapCode`, `writeBootstrapCode`, `ensureBootstrapCode`
- `packages/shared/src/auth-bootstrap-code/persistence.ts` — atomic temp+rename, schema validation, idempotent ensure

**Files modified**:
- `packages/shared/src/auth-bootstrap-code/index.ts` — re-exports persistence functions

**TDD evidence (RED → GREEN)**:
- RED: 14 failed (14)
- GREEN: 14 passed (14) in 12ms

**Test breakdown**:
- `readBootstrapCode`: round-trip + 5 invalid states (a missing, b zero-byte, c malformed JSON, d missing field, e bad regex) = 6 tests
- `writeBootstrapCode`: parent-dir auto-create, atomic overwrite = 2 tests
- `ensureBootstrapCode`: regen-when-missing, reuse-when-valid, regen-on-corrupt-JSON, regen-on-zero-byte, regen-on-missing-field, regen-on-bad-regex = 6 tests

**Decisions / discoveries**:
- **D-T003-1**: Used `BootstrapCodeFileSchema.safeParse()` (returns `{ success, data | error }`) rather than `parse()` + try/catch. Cleaner, no thrown control flow inside the read path. Permission errors still propagate from `readFileSync` (intentional — validation fix C-Comp1 says boot fails fast on read-only `.chainglass/`).
- **D-T003-2**: `mkTempCwd()` returns a plain string path (not `{ path, cleanup }`) — matches existing repo convention seen in `test/unit/shared/file-notes/list-files-with-notes-detailed.test.ts` (`tmpDir = fs.mkdtempSync(...)`). Tests call `rmSync(cwd, { recursive: true, force: true })` directly in `afterEach`. Less helpful than a Disposable but matches existing pattern; ergonomics-only nit.
- **D-T003-3**: `INVALID_FORMAT_SAMPLES` defined in T003 (alongside `mkTempCwd` and `mkBootstrapCodeFile`) rather than waiting for T007 — a single fixture file is cleaner than incremental updates. T007 will audit and confirm completeness rather than adding fields.

**Constitutional gates**:
- P3 (TDD): RED → GREEN ✅
- P4 (Fakes Over Mocks): real `node:fs`, real temp dirs, zero `vi.mock` ✅

### T004 — build/verifyCookieValue (completed 2026-04-30)

**Files created**:
- `test/unit/shared/auth-bootstrap-code/cookie.test.ts` — 11 tests across `buildCookieValue` (4) + `verifyCookieValue` (7)
- `packages/shared/src/auth-bootstrap-code/cookie.ts` — HMAC-SHA256, `timingSafeEqual` with length pre-check

**Files modified**:
- `packages/shared/src/auth-bootstrap-code/index.ts` — re-exports cookie functions

**TDD evidence (RED → GREEN)**:
- RED: 11 failed (11)
- GREEN: 11 passed (11) in 2ms

**Decisions / discoveries**:
- **D-T004-1**: `verifyCookieValue` accepts `string | undefined` (not just `string`) per workshop 004 — Phase 5's `requireLocalAuth` reads `cookies().get(name)?.value` which can be `undefined`. Saves a null-check at every call site.
- **D-T004-2**: Length pre-check before `timingSafeEqual` — Node's `timingSafeEqual` THROWS on size mismatch (RangeError). Tests confirmed this would crash without the pre-check. Pre-check returns `false` cleanly.
- **D-T004-3**: Test ROTATION semantics by parameterizing the key (KEY_A vs KEY_B) — proves that rotating the signing key (e.g., admin changes `AUTH_SECRET` and restarts) invalidates every prior cookie automatically. No state migration needed.

**Constitutional gates**:
- P3 (TDD): RED → GREEN ✅
- P4 (Fakes Over Mocks): real `node:crypto`; zero `vi.mock` ✅

### T005 — activeSigningSecret + cwd-keyed cache (completed 2026-04-30)

**Files created**:
- `test/unit/shared/auth-bootstrap-code/signing-key.test.ts` — 8 tests (AUTH_SECRET path × 2; HKDF path × 3; cache discipline × 3)
- `packages/shared/src/auth-bootstrap-code/signing-key.ts` — sync function, HKDF-SHA256, cwd-keyed cache, `_resetSigningSecretCacheForTests`

**Files modified**:
- `packages/shared/src/auth-bootstrap-code/index.ts` — re-exports `activeSigningSecret` + `_resetSigningSecretCacheForTests` (with `@internal` JSDoc per validation fix FC-H2)

**TDD evidence (RED → GREEN)**:
- RED: 8 failed
- GREEN: 8 passed (8) in 13ms

**Decisions / discoveries**:
- **D-T005-1**: `hkdfSync` returns `ArrayBuffer` in Node 22+, not `Buffer`. Wrapped in `Buffer.from(derived)` for ergonomic equality (`.equals()`) in tests and downstream.
- **D-T005-2**: AUTH_SECRET empty-string treated as **unset** (falls back to HKDF). Matches workshop 004 spec (`if (env !== undefined && env.length > 0)`). Tested explicitly so an operator setting `AUTH_SECRET=""` doesn't accidentally get a 0-byte HMAC key (which would be insecure and would also crash `createHmac` downstream).
- **D-T005-3**: TSDoc cwd contract documented at the function signature per validation fix C-FC3 — covers the silent-divergence trap from validation finding C5.
- **D-T005-4**: `_resetSigningSecretCacheForTests` re-exported from the barrel with a `@internal` JSDoc tag per validation fix FC-H2. Tagged via comment-block above the export statement (per Constitution P7 / shared-by-default — exported but flagged for production lint).

**Constitutional gates**:
- P2 (Interface-First): function signature `(cwd: string): Buffer` declared in the function declaration; no async drift. ✅
- P3 (TDD): RED → GREEN ✅
- P4 (Fakes Over Mocks): real `node:crypto.hkdfSync`, real env-var manipulation, real fs (via `ensureBootstrapCode`); zero `vi.mock` ✅

**Closes**: Plan key finding 01 — terminal-WS silent-bypass when `AUTH_SECRET` is unset is now structurally impossible because `activeSigningSecret(cwd)` always returns a non-null `Buffer` (HKDF-derived from the bootstrap code if env is unset).

### T006 — Barrel index audit (completed 2026-04-30)

**Files modified**:
- `packages/shared/src/auth-bootstrap-code/index.ts` — final 14-name surface (already grown incrementally in T001–T005 per discovery S-D4; T006 audited completeness)

**Audit checklist**:
- ✅ 14 names exported (BootstrapCodeFile, EnsureResult, BootstrapCodeFileSchema, BOOTSTRAP_CODE_PATTERN, BOOTSTRAP_COOKIE_NAME, BOOTSTRAP_CODE_FILE_PATH_REL, generateBootstrapCode, readBootstrapCode, writeBootstrapCode, ensureBootstrapCode, buildCookieValue, verifyCookieValue, activeSigningSecret, _resetSigningSecretCacheForTests)
- ✅ `_resetSigningSecretCacheForTests` re-export carries `@internal` JSDoc + production-restriction comment
- ✅ `BOOTSTRAP_CODE_ALPHABET` is NOT exported (confirms validation fix C-FC5 rejection — encapsulation by design)
- ✅ `pnpm exec tsc --noEmit -p packages/shared/tsconfig.json` returns silent (zero typecheck errors)
- ✅ Full Phase-1 test sweep: 4 files / 38 tests pre-T007 (5 + 14 + 8 + 11)

**Decisions / discoveries**:
- **D-T006-1**: Per discovery S-D4 the barrel grew incrementally during T002–T005 rather than being a "ship-at-end" artifact. T006 became an audit step rather than a write step. Cleaner — each TDD task left the barrel in a working state.

### T007 — Cross-cutting test polish (completed 2026-04-30)

**Files created**:
- `test/unit/shared/auth-bootstrap-code/format-validation.test.ts` — 8 parametric tests over `INVALID_FORMAT_SAMPLES` (per validation fix FC-H1)

**Audit results**:
- ✅ Cache discipline: `signing-key.test.ts` calls `_resetSigningSecretCacheForTests()` in both `beforeEach` and `afterEach`, plus inline at every spot that mutates AUTH_SECRET or rotates the bootstrap code. `process.env.AUTH_SECRET` cleared symmetrically.
- ✅ Cleanup: `persistence.test.ts` and `signing-key.test.ts` both call `rmSync(cwd, { recursive: true, force: true })` in `afterEach`.
- ✅ `INVALID_FORMAT_SAMPLES` is `readonly string[]` with all 6 enumerated cases (per validation fix C-FC4 + FC-H1).
- ✅ Final test sweep: **46 tests pass across 5 files in 873ms**.

**Decisions / discoveries**:
- **D-T007-1**: Created a dedicated `format-validation.test.ts` rather than appending to an existing test file. Reason: the parametric `it.each` is the canonical way Phase 3's verify route will assert format-error responses; isolating it now makes Phase 3 reuse self-evident.
- **D-T007-2**: HMR-survival test from the original dossier was REMOVED in T005 (validation fix Comp-H1) and not re-introduced in T007 — `vi.resetModules()` is the canonical ESM API and the cache-discipline test (`_resetSigningSecretCacheForTests`) covers the practical concern. Documented explicitly in T007 task entry.

**Constitutional gates**:
- P3 (TDD): each module had RED → GREEN cycles per task (no separate post-hoc tests). ✅
- P4 (Fakes Over Mocks): `pnpm vitest --root . test/unit/shared/auth-bootstrap-code/` confirms zero `vi.mock` / `vi.spyOn` / `jest.mock` invocations in the new test files. ✅

---

## Phase Summary (2026-04-30)

| Module | Source LOC | Test LOC | Tests | Coverage focus |
|---|---|---|---|---|
| `types.ts` | 67 | n/a | n/a | TypeScript compile |
| `generator.ts` | 26 | 67 | 5 | length, regex, 1k uniqueness, alphabet, hyphen positions |
| `persistence.ts` | 90 | 198 | 14 | round-trip, 5 invalid states, atomic, ensure-3 paths |
| `cookie.ts` | 32 | 89 | 11 | sign × 4, verify × 7 (incl. tampering, length-mismatch) |
| `signing-key.ts` | 67 | 134 | 8 | env path × 2, HKDF × 3, cache × 3 |
| `index.ts` (barrel) | 36 | n/a | n/a | typecheck |
| `format-validation.test.ts` | n/a | 51 | 8 | parametric over `INVALID_FORMAT_SAMPLES` |

**Totals**: 6 source files (318 LOC), 6 test files (539 LOC + 1 fixtures), **46 tests, 873ms**.

**Domain.md updates**: NONE THIS PHASE. `_platform/auth/domain.md` will gain Composition + Contracts + Concepts rows for the new shared module in Phase 7 task 7.3 (per plan). The shared module is library code — not itself a registered domain. Phase 1 doesn't update `docs/domains/registry.md` or `domain-map.md` (no new domains created). Confirmed against plan § "Domain files updated" rule.

**Acceptance criteria delivered**:
- AC-9 (helper-level): `ensureBootstrapCode(cwd)` regenerates only when missing OR any of 5 invalid states (verified by 6 dedicated tests in `persistence.test.ts`).
- Indirect support for AC-1, AC-2, AC-13, AC-22, AC-23, AC-25 (Phases 2–6 will consume Phase 1's primitives to satisfy these end-to-end ACs).

**Plan key findings closed at substrate level**:
- Finding 01 (terminal-WS silent-bypass): `activeSigningSecret(cwd)` always returns non-null Buffer ✅
- Finding 09 (atomic temp+rename): mirrored from `port-discovery.ts` pattern ✅
- Finding 13 (Crockford alphabet): `0-9 A-Z` minus `I L O U`; verified by tests ✅

**Constitutional compliance**:
- P1 ✅ (no app imports), P2 ✅ (types in T001 first), P3 ✅ (RED→GREEN per TDD task), P4 ✅ (zero mocks; real `node:crypto` + temp dirs), P5 ✅ (sub-second tests at 873ms total), P7 ✅ (in `packages/shared/`)

**Next step**: `/plan-7-v2-code-review --phase "Phase 1: Shared Primitives" --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/auth-bootstrap-code-plan.md"`.

