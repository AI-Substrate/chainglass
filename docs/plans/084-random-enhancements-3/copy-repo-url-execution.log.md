# Execution Log: copy-repo-url FX007

**Plan**: [copy-repo-url-plan.md](./copy-repo-url-plan.md)
**Started**: 2026-05-09
**Skill**: `/plan-6-v2-implement-phase-companion`
**Companion run**: `2026-05-09T13-11-12-883Z-35ae` (slug: code-review-companion)

---

## Pre-Phase Harness Validation

| Stage | Status | Note |
|-------|--------|------|
| Boot | ⏭ Skipped | Manual UI verification deferred to T007 (per plan); harness used only for T007 screenshots. Unit + lightweight tests for T002–T006 do not require harness. |
| Interact | n/a | — |
| Observe | n/a | — |

L3 harness available; will boot and capture screenshots in T007.

## Companion Findings Disposition

| Finding ID | ackOf | Severity | Status | Action |
|-----------|-------|----------|--------|--------|
| _(none yet)_ | | | | |

## Per-Task Log

### T001 — Create _platform/git sub-domain skeleton

**Started**: 2026-05-09

**Files created/modified**:
- `docs/domains/_platform/git/domain.md` — NEW. Sections: Purpose, Boundary, Contracts, Composition, Source Location, Concepts, Dependencies, History.
- `apps/web/src/features/_platform/git/index.ts` — NEW. Public re-exports stubbed; pulls `parseRemote`, `buildFileUrl`, types from `./lib/repo-url` (T002), CLI wrappers + `RepoInfo` from `./lib/git-cli` (T003). File compiles only after T002+T003 land — acceptable per plan (placeholder).
- `apps/web/src/features/_platform/git/lib/` — directory created (empty until T002).
- `test/unit/web/features/_platform/git/` — directory created (empty until T002).
- `docs/domains/registry.md` — added row `| Git | _platform/git | infrastructure | _platform | Plan 084 FX007 | active |`.
- `docs/domains/domain-map.md` — added `gitPlatform` node under infrastructure (orange "new" class) with full contract list; added two edges `fileBrowser --consumes--> gitPlatform` and `prView --consumes--> gitPlatform`; added Domain Health Summary row.

**Done When** evidence:
- `domain.md` exists with all required sections — ✅
- `index.ts` exists (placeholder) — ✅ (broken imports until T002/T003 — expected)
- `registry.md` has new row — ✅
- `domain-map.md` shows `_platform/git` infrastructure node + both consumer edges — ✅

### T002 — TDD URL builder (parseRemote + buildFileUrl)

**Started**: 2026-05-09

**TDD log**:
- RED: `pnpm vitest run test/unit/web/features/_platform/git/repo-url.test.ts` failed with module-not-found (`./lib/repo-url` missing).
- GREEN: created `apps/web/src/features/_platform/git/lib/repo-url.ts` with `parseRemote` + `buildFileUrl` + types. Re-ran: 18/18 tests pass.
- Stub `git-cli.ts` (T003 placeholder with throw-not-implemented bodies + `RepoInfo` type definition) added so the public surface (`index.ts`) compiles.

**Files**:
- `apps/web/src/features/_platform/git/lib/repo-url.ts` — pure URL builder. Strips embedded credentials in `parseRemote`. Per-segment encoding in `buildFileUrl` preserves slashes.
- `apps/web/src/features/_platform/git/lib/git-cli.ts` — stub. T003 fills bodies.
- `test/unit/web/features/_platform/git/repo-url.test.ts` — 18 tests across `parseRemote` (9), `buildFileUrl GitHub` (5), `buildFileUrl ADO` (4). Includes credential-strip case (Plan 084 finding 12).

**Done When** evidence: All listed plan fixtures covered. `pnpm vitest run test/unit/web/features/_platform/git/repo-url.test.ts` → 18 passed.

**Discovery**: Public surface coupling — when the test imports through `@/features/_platform/git`, the `index.ts` re-exports require BOTH `lib/repo-url.ts` and `lib/git-cli.ts` to compile. Stub for `git-cli.ts` added with `RepoInfo` type + throw-not-implemented bodies. T003 will fill the bodies.
