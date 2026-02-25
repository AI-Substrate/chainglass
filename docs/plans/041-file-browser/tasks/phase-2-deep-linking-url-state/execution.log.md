# Phase 2: Deep Linking & URL State — Execution Log

**Plan**: [file-browser-plan.md](../../file-browser-plan.md)
**Dossier**: [tasks.md](./tasks.md)
**Started**: 2026-02-22T23:09Z
**Testing Approach**: Full TDD (RED → GREEN → REFACTOR)
**Mock Policy**: No mocks — fakes only
**Domain**: `_platform/workspace-url`

---

## Task T001: Install nuqs + NuqsAdapter in Providers
**Started**: 2026-02-22T23:09Z
**Status**: ✅ Complete
**Plan Task**: 2.1 | **Dossier Task**: T001 | **Footnotes**: [^11] [^12]

### What I Did
- Installed `nuqs@^2.8.8` in apps/web via `pnpm add nuqs`
- Wired `NuqsAdapter` from `nuqs/adapters/next/app` inside the existing `Providers` component (DYK-P2-04)
- Provider chain: `QueryClientProvider` → `NuqsAdapter` → `{children}`

### Evidence
```
pnpm add nuqs → + nuqs ^2.8.8
pnpm build → Tasks: 7 successful, 7 total (0 failures)
```
Critical Finding 07 resolved: nuqs is compatible with Next.js 16 + Turbopack.

### Files Changed
- `apps/web/package.json` — Added nuqs dependency
- `apps/web/src/components/providers.tsx` — Added NuqsAdapter import + wrapper

**Completed**: 2026-02-22T23:12Z
---

## Task T002: Test workspaceHref() — RED
**Started**: 2026-02-22T23:12Z
**Status**: ✅ Complete
**Plan Task**: 2.2 | **Dossier Task**: T002 | **Footnotes**: [^13]

### What I Did
Wrote 13 tests for `workspaceHref()` covering: basic URLs, worktree in options, feature params, omit empties, encoding, slug encoding, worktree-first ordering, empty options.

### Evidence
```
Test Files  1 failed (1) — module @/lib/workspace-url not found (RED confirmed)
```

### Files Changed
- `test/unit/web/lib/workspace-url.test.ts` — Created with 13 tests

### Discoveries
- `toStartWith` doesn't exist in vitest — use `toMatch(/^.../)` instead
- URLSearchParams encodes spaces as `+` not `%20` — both valid per spec, adjusted test expectations

**Completed**: 2026-02-22T23:12Z
---

## Task T003: Implement workspaceHref() — GREEN
**Started**: 2026-02-22T23:12Z
**Status**: ✅ Complete
**Plan Task**: 2.3 | **Dossier Task**: T003 | **Footnotes**: [^13] [^14]

### What I Did
- Created `apps/web/src/lib/workspace-url.ts` with `workspaceHref()` using flat options API (DYK-P2-03)
- Worktree sorted first in output URL for readability
- Omits empty/false/undefined/null values
- Retired inline `buildWorktreeUrl()` from `workspace-nav.tsx` — replaced with `workspaceHref()` import

### Evidence
```
Test Files  1 passed (1)
     Tests  13 passed (13)
```

### Files Changed
- `apps/web/src/lib/workspace-url.ts` — Created (workspaceHref)
- `apps/web/src/components/workspaces/workspace-nav.tsx` — Replaced buildWorktreeUrl with workspaceHref import

**Completed**: 2026-02-22T23:13Z
---

## Tasks T004 + T005: Test workspaceParams + fileBrowserParams — RED
**Started**: 2026-02-22T23:13Z
**Status**: ✅ Complete
**Plan Tasks**: 2.4, 2.5 | **Dossier Tasks**: T004, T005 | **Footnotes**: [^15] [^16]

### What I Did
- T004: Wrote 3 tests for `workspaceParamsCache` (defaults, populated, array handling)
- T005: Wrote 5 tests for `fileBrowserPageParamsCache` (defaults, all populated, invalid mode fallback, boolean parsing, diff mode)

### Evidence
```
Test Files  2 failed (2) — modules not found (RED confirmed)
```

### Files Changed
- `test/unit/web/lib/params/workspace-params.test.ts` — Created with 3 tests
- `test/unit/web/features/041-file-browser/params.test.ts` — Created with 5 tests

**Completed**: 2026-02-22T23:14Z
---

## Task T006: Implement param definitions + caches — GREEN
**Started**: 2026-02-22T23:14Z
**Status**: ✅ Complete
**Plan Task**: 2.6 | **Dossier Task**: T006 | **Footnotes**: [^17] [^18] [^19]

### What I Did
- Created `apps/web/src/lib/params/workspace.params.ts` — cross-cutting (DYK-P2-02): `workspaceParams` + `workspaceParamsCache`
- Created `apps/web/src/features/041-file-browser/params/file-browser.params.ts` — plan-scoped: `fileBrowserParams` + `fileBrowserPageParamsCache` (composes workspaceParams)
- Created `apps/web/src/features/041-file-browser/params/index.ts` — barrel

### Evidence
```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

### Files Changed
- `apps/web/src/lib/params/workspace.params.ts` — Created
- `apps/web/src/features/041-file-browser/params/file-browser.params.ts` — Created
- `apps/web/src/features/041-file-browser/params/index.ts` — Created

**Completed**: 2026-02-22T23:14Z
---

## Task T007: Export + barrel update
**Started**: 2026-02-22T23:14Z
**Status**: ✅ Complete
**Plan Task**: (part of 2.6) | **Dossier Task**: T007 | **Footnotes**: [^19]

### What I Did
- Created `apps/web/src/lib/params/index.ts` — barrel for cross-cutting params
- Updated `apps/web/src/features/041-file-browser/index.ts` — re-exports fileBrowserParams + cache

### Evidence
```
Test Files  3 passed (3)
     Tests  21 passed (21)
```

### Files Changed
- `apps/web/src/lib/params/index.ts` — Created (barrel)
- `apps/web/src/features/041-file-browser/index.ts` — Updated to export params

**Completed**: 2026-02-22T23:15Z
---

## Task T008: Verify existing pages
**Started**: 2026-02-22T23:15Z
**Status**: ✅ Complete
**Plan Task**: 2.9 | **Dossier Task**: T008

### What I Did
- Verified `/` (200, no hydration errors)
- Verified `/workspaces` (200, loads workspace list)
- Verified `/workspaces/chainglass-main` (200)
- Used browser automation (Playwright headless) to check console errors
- Only error: `favicon.ico 404` (pre-existing, unrelated)

### Evidence
```
Browser: http://localhost:3000/ → Page Title: Chainglass, Console: 1 error (favicon.ico 404 only)
Browser: http://localhost:3000/workspaces → Renders workspace list, no errors
curl: All 3 routes return HTTP 200
```

**Completed**: 2026-02-22T23:16Z
---

## Task T009: Full test suite validation
**Started**: 2026-02-22T23:16Z
**Status**: ✅ Complete
**Plan Task**: (validation) | **Dossier Task**: T009

### What I Did
- Fixed 5 import order lint violations (biome organizeImports)
- Ran `just fft` — lint, format, typecheck, test all pass

### Evidence
```
just fft → exit code 0
Test Files  280 passed | 9 skipped (289)
     Tests  4064 passed | 71 skipped (4135)
     Duration  98.77s
```

### Discoveries
- Biome organizeImports wants alphabetical imports — vitest imports must come after app imports

### Files Changed
- 5 files: import order fixes (auto-applied by biome)

**Completed**: 2026-02-22T23:18Z
---

## Post-Review Fixes
**Started**: 2026-02-22T23:57Z
**Status**: ✅ Complete
**Review**: [review.phase-2-deep-linking-url-state.md](../../reviews/review.phase-2-deep-linking-url-state.md)

### V6: workspaceHref null omission (TDD)
- RED: Added test `omits null params` — `workspaceHref('proj', '/browser', { worktree: null })` should return clean URL
- GREEN: Changed `!== undefined` to `!= null` (covers both null and undefined) in worktree branch
- 14 tests pass

### V7: Strengthen array worktree assertion
- Updated test from `expect(typeof result.worktree).toBe('string')` to `expect(result.worktree).toBe('a')`
- Discovery: nuqs `parseAsString` takes first array element, not default

### V1: Plan↔dossier progress sync
- Updated plan Phase 2 task table: all statuses `[x]`, tasks 2.7/2.8 marked REMOVED (DYK-P2-01/P2-05)
- Updated plan Phase Completion Checklist: Phase 2 → COMPLETE
- Updated plan AC checkboxes: AC-16 through AC-19 checked
- Added log links to all plan tasks

### V2: Phase Footnote Stubs
- Populated 10 footnote entries ([^11] through [^20]) in dossier Phase Footnote Stubs table

### V3: Change Footnotes Ledger
- Added 10 entries ([^11] through [^20]) covering all Phase 2 changed files

### V4: Task↔Log backlinks
- Added `Plan Task` / `Dossier Task` / `Footnotes` metadata line to every log entry

### V5: Domain docs scope justification
- Added scope note in Discoveries table: domain extraction is a project-level activity concurrent with feature delivery
- Added [^20] footnote referencing domain docs with scope justification

**Completed**: 2026-02-23T00:00Z
---
