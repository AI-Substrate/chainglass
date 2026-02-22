# Phase 2: Deep Linking & URL State – Tasks & Alignment Brief

**Spec**: [file-browser-spec.md](../../file-browser-spec.md)
**Plan**: [file-browser-plan.md](../../file-browser-plan.md)
**Date**: 2026-02-22

---

## Executive Briefing

### Purpose
This phase installs nuqs for type-safe URL state management and creates the workspace URL kit that all subsequent phases depend on. Without this, no page state can be bookmarked, deep-linked, or restored from a URL.

### What We're Building
- `NuqsAdapter` wired inside `Providers` component for app-wide URL state sync (DYK-P2-04)
- `workspaceHref()` — a URL builder with flat options object for workspace-scoped links (DYK-P2-03)
- `workspaceParams` — shared `worktree` param definition in `src/lib/params/` (cross-cutting, DYK-P2-02)
- `fileBrowserParams` — file browser params (dir, file, mode, changed) with server-side cache
- Server pages use idiomatic `await params` + `cache.parse(await searchParams)` — no custom wrapper (DYK-P2-01)

### User Value
Every page state becomes a URL. Users can bookmark `/workspaces/my-proj/browser?file=utils.ts&mode=edit` and return to exactly that state. Different workspaces in different browser tabs, all pinnable in browser favorites.

### Example
```
workspaceHref('my-proj', '/browser', { worktree: '/path/to/worktree', file: 'README.md', mode: 'preview' })
→ '/workspaces/my-proj/browser?worktree=%2Fpath%2Fto%2Fworktree&file=README.md&mode=preview'
```

---

## Target Domain

**`_platform/workspace-url`** — [domain.md](../../../../domains/_platform/workspace-url/domain.md)

This phase delivers the core contracts of this infrastructure domain: `workspaceHref()`, `workspaceParams`, `workspaceParamsCache`, and NuqsAdapter wiring. The `fileBrowserParams` definition is plan-scoped (not part of this domain) but composes `workspaceParams` from it.

---

## Objectives & Scope

### Objective
Install nuqs and create the deep linking infrastructure specified in AC-16 through AC-19. This is pure infrastructure — no UI components, no page changes (except wiring NuqsAdapter).

### Goals

- ✅ Install `nuqs` and verify Next.js 16 + Turbopack compatibility (Critical Finding 07)
- ✅ Wire `NuqsAdapter` inside `Providers` component (DYK-P2-04: no layout.tsx cross-plan edit)
- ✅ Create `workspaceHref()` URL builder with flat options object (DYK-P2-03)
- ✅ Create `workspaceParams` in `src/lib/params/` (DYK-P2-02: cross-cutting, not plan-scoped)
- ✅ Create `fileBrowserParams` in plan-scoped `features/041-file-browser/params/`
- ✅ Create `createSearchParamsCache` for server-side param parsing
- ✅ Export all param definitions from feature barrel

### Non-Goals

- ❌ Migrating existing pages to use `workspaceHref()` (opportunistic, per workshop § 6)
- ❌ Building any UI components (Phase 3+)
- ❌ Client-side `useQueryStates()` integration (that happens when components use params in Phase 3/4)
- ❌ Agent chat params (future feature adds its own param definition)
- ❌ Worktree picker URL interaction (Phase 3)

---

## Pre-Implementation Audit

### Summary

| # | File | Action | Origin | Recommendation |
|---|------|--------|--------|----------------|
| 1 | `apps/web/src/lib/workspace-url.ts` | Create | — | **reuse-existing** — retire `buildWorktreeUrl()` from `workspace-nav.tsx` |
| 2 | `apps/web/src/lib/params/workspace.params.ts` | Create | — | **cross-cutting** (DYK-P2-02: used by all workspace pages) |
| 3 | `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | Create | — | plan-scoped |
| 4 | `apps/web/src/features/041-file-browser/params/index.ts` | Create | — | plan-scoped |
| 5 | `test/unit/web/lib/workspace-url.test.ts` | Create | — | keep-as-is |
| 6 | `test/unit/web/lib/params/workspace-params.test.ts` | Create | — | **cross-cutting** (DYK-P2-02) |
| 7 | `test/unit/web/features/041-file-browser/params.test.ts` | Create | — | plan-scoped |
| 8 | `apps/web/src/components/providers.tsx` | Modify | Plans 015 | NuqsAdapter inside Providers (DYK-P2-04) |
| 9 | `apps/web/src/features/041-file-browser/index.ts` | Modify | Plan 041 Phase 1 | keep-as-is |

### Per-File Detail

#### `apps/web/src/lib/workspace-url.ts` — Duplication Finding
`workspace-nav.tsx:81-85` has an inline `buildWorktreeUrl()` that does the same thing as `workspaceHref()`. Additionally, `workunit-toolbox.tsx` manually builds workspace URLs. When implementing `workspaceHref()`, also update `workspace-nav.tsx` to import it — prevents two URL builders diverging.

### Compliance Check
No violations found. All files match PlanPak classifications (cross-cutting for URL kit, plan-scoped for params).

---

## Requirements Traceability

### Coverage Matrix

| AC | Description | Flow Summary | Files in Flow | Tasks | Status |
|----|-------------|-------------|---------------|-------|--------|
| AC-16 | URL-encoded page state via type-safe nuqs params | package.json → providers.tsx → param definitions → barrel | 7 | T001,T006,T007 | ✅ Complete |
| AC-17 | Bookmark URL restores exact page state | Emergent from AC-16 param system | same as AC-16 | T004,T005,T006 | ✅ Complete |
| AC-18 | `workspaceHref()` builds workspace-scoped URLs | workspace-url.ts → consumers | 1 core | T002,T003 | ✅ Complete |
| AC-19 | NuqsAdapter wired in Providers component | package.json → providers.tsx | 2 | T001 | ✅ Complete |

### Gaps Found
None — all 4 ACs have complete file coverage.

### Notes
- AC-18 says "used consistently across all link construction" — Phase 2 creates the helper; migrating existing pages is opportunistic per workshop § 6
- AC-17 is an emergent property of the param definitions + nuqs — no additional files needed

---

## Architecture Map

### Component Diagram

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style Install fill:#F5F5F5,stroke:#E0E0E0
    style URLKit fill:#F5F5F5,stroke:#E0E0E0
    style Params fill:#F5F5F5,stroke:#E0E0E0
    style Verify fill:#F5F5F5,stroke:#E0E0E0

    subgraph Install["Install & Wire"]
        T001["T001: Install nuqs + NuqsAdapter in Providers ✓"]:::completed
    end

    subgraph URLKit["URL Kit"]
        T002["T002: Test workspaceHref ✓"]:::completed
        T003["T003: Impl workspaceHref ✓"]:::completed

        T002 --> T003
    end

    subgraph Params["Param Definitions"]
        T004["T004: Test workspaceParams ✓"]:::completed
        T005["T005: Test fileBrowserParams ✓"]:::completed
        T006["T006: Impl param defs + caches ✓"]:::completed

        T004 --> T006
        T005 --> T006
    end

    subgraph Verify["Verification"]
        T007["T007: Export + barrel update ✓"]:::completed
        T008["T008: Verify existing pages ✓"]:::completed
        T009["T009: Full test suite ✓"]:::completed

        T003 --> T007
        T006 --> T007
        T007 --> T008
        T008 --> T009
    end

    T001 --> T002
    T001 --> T004
```

### Task-to-Component Mapping

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | nuqs Install | providers.tsx, package.json | ✅ Complete | Integration spike per Finding 07. NuqsAdapter inside Providers (DYK-P2-04). |
| T002 | URL Kit Tests | workspace-url.test.ts | ✅ Complete | RED: workspaceHref() tests (flat options API, DYK-P2-03) |
| T003 | URL Kit Impl | workspace-url.ts, workspace-nav.tsx | ✅ Complete | GREEN: workspaceHref() + retire buildWorktreeUrl |
| T004 | Param Tests | workspace-params.test.ts | ✅ Complete | RED: workspaceParams server cache (cross-cutting, DYK-P2-02) |
| T005 | Param Tests | params.test.ts | ✅ Complete | RED: fileBrowserParams server cache (plan-scoped) |
| T006 | Param Impl | workspace.params.ts, file-browser.params.ts, params/index.ts | ✅ Complete | GREEN: param definitions + caches |
| T007 | Barrel Export | index.ts (feature) | ✅ Complete | Export params from feature barrel |
| T008 | Verification | (manual) | ✅ Complete | Existing pages unaffected |
| T009 | Validation | (all) | ✅ Complete | `just fft` green |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|--------------|-------------------|------------|----------|-------|
| [x] | T001 | Install `nuqs` in apps/web, wire `NuqsAdapter` inside the `Providers` component (DYK-P2-04: keeps layout.tsx untouched). Import from `nuqs/adapters/next/app`. Verify `pnpm build` passes and `pnpm dev` starts without errors. This is the integration spike for Critical Finding 07 — if nuqs is incompatible with Next.js 16 + Turbopack, fall back to custom hooks. | 2 | Setup | – | `/home/jak/substrate/041-file-browser/apps/web/src/components/providers.tsx`, `/home/jak/substrate/041-file-browser/apps/web/package.json` | `pnpm add nuqs` succeeds. `pnpm build` passes. Dev server starts. No hydration errors on `/` and `/workspaces`. | – | per Finding 07, DYK-P2-04 |
| [x] | T002 | Write tests for `workspaceHref()` with flat options API (DYK-P2-03). Tests: basic workspace URL, with worktree in options, with feature params (file, mode), omits empty/false/undefined params, encodes worktree paths with slashes, handles slug encoding. Signature: `workspaceHref(slug, subPath, options?)`. | 2 | Test | T001 | `/home/jak/substrate/041-file-browser/test/unit/web/lib/workspace-url.test.ts` | Tests written and FAIL (RED) | – | cross-cutting |
| [x] | T003 | Implement `workspaceHref()` with flat options API. Build workspace-scoped URLs: base path `/workspaces/{slug}{subPath}`, worktree is just another key in the options object (sorted first in URL output). Omit empty/false/undefined values. Also update `workspace-nav.tsx` to import `workspaceHref` instead of using inline `buildWorktreeUrl()`. | 2 | Core | T002 | `/home/jak/substrate/041-file-browser/apps/web/src/lib/workspace-url.ts`, `/home/jak/substrate/041-file-browser/apps/web/src/components/workspaces/workspace-nav.tsx` | All tests from T002 pass (GREEN). `workspace-nav.tsx` uses `workspaceHref`. | – | cross-cutting, reuse-existing, DYK-P2-03 |
| [x] | T004 | Write tests for `workspaceParams` server-side cache (DYK-P2-02: cross-cutting in `src/lib/params/`). Tests: empty params → worktree defaults to `''`, populated worktree parsed correctly, non-string worktree ignored. | 1 | Test | T001 | `/home/jak/substrate/041-file-browser/test/unit/web/lib/params/workspace-params.test.ts` | Tests written and FAIL (RED) | – | cross-cutting, DYK-P2-02 |
| [x] | T005 | Write tests for `fileBrowserParams` server-side cache (combined with workspaceParams). Tests: defaults (dir='', file='', mode='preview', changed=false), all params populated, invalid mode falls back to 'preview', boolean 'changed' parses correctly. | 2 | Test | T001 | `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/params.test.ts` | Tests written and FAIL (RED) | – | plan-scoped |
| [x] | T006 | Implement param definitions and server-side caches. Create `workspaceParams` (worktree via `parseAsString`) in `src/lib/params/workspace.params.ts` (DYK-P2-02: cross-cutting). Create `fileBrowserParams` (dir, file, mode via `parseAsStringLiteral`, changed via `parseAsBoolean`) in plan-scoped params folder. Create `workspaceParamsCache` and `fileBrowserPageParamsCache` (combined workspace + file browser). Export from params barrels. | 2 | Core | T004,T005 | `/home/jak/substrate/041-file-browser/apps/web/src/lib/params/workspace.params.ts`, `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/params/file-browser.params.ts`, `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/params/index.ts` | All tests from T004-T005 pass (GREEN). | – | DYK-P2-02 |
| [x] | T007 | Update feature barrel `apps/web/src/features/041-file-browser/index.ts` to re-export param definitions from `./params/`. Export `fileBrowserParams`, `fileBrowserPageParamsCache`. Also create `apps/web/src/lib/params/index.ts` barrel to export `workspaceParams`, `workspaceParamsCache`. | 1 | Integration | T003,T006 | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/index.ts`, `/home/jak/substrate/041-file-browser/apps/web/src/lib/params/index.ts` | Params importable from `@/features/041-file-browser` and `@/lib/params`. | – | DYK-P2-02 |
| [x] | T008 | Verify existing pages work with NuqsAdapter. Navigate to 5+ existing pages: `/`, `/workspaces`, `/workspaces/[slug]`, `/workspaces/[slug]/worktree`, `/workspaces/[slug]/agents`. No errors in console. | 1 | Verification | T007 | – | All pages render without errors. | – | – |
| [x] | T009 | Run full test suite and quality checks. `just fft` must pass. Verify no regressions. | 1 | Validation | T008 | – | `just fft` exits 0. Zero test regressions. | – | – |

---

## Alignment Brief

### Prior Phase Review

**Phase 1: Data Model & Infrastructure** (COMPLETE)

Phase 1 delivered:
- `WorkspacePreferences` type (emoji, color, starred, sortOrder) on the Workspace entity
- `DEFAULT_PREFERENCES` constant, `withPreferences()` immutable update
- Curated palettes: 30 emojis, 10 colors with light/dark hex variants
- Atomic write (tmp+rename) in registry adapter
- `update()` on adapter interface + `updatePreferences()` on service with palette validation
- `updateWorkspacePreferences` server action
- PlanPak feature folder at `apps/web/src/features/041-file-browser/`

Key learnings:
- Formal v1→v2 migration unnecessary — spread-with-defaults handles superset schemas (DYK-P1-02)
- Server action testing skipped (no-mocks rule) — service layer tests cover logic
- Biome rejects `any` — use `as unknown as T` pattern
- Barrel file gaps caught by requirements flow — fold into related implementation tasks

**Phase 2 dependency on Phase 1**: None. Phase 2 is purely about nuqs + URL helpers. The feature barrel at `features/041-file-browser/index.ts` (created in Phase 1) is the only shared artifact — Phase 2 adds params exports to it.

### Critical Findings Affecting This Phase

| Finding | Title | Constraint | Tasks |
|---------|-------|-----------|-------|
| 07 | nuqs + Next.js 16 Compatibility Unverified | First task must be integration spike. If nuqs fails with Turbopack, fall back to custom hooks. | T001 |
| 03 | No Conflicts in Provider Chain for nuqs | Existing provider chain is clean. NuqsAdapter wraps inside `<Providers>`. | T001 |

### ADR Decision Constraints

- **ADR-0004: DI Container Architecture** — N/A for Phase 2. No DI registrations — pure functions + nuqs parsers.

### PlanPak Placement Rules

- **Cross-cutting**: `apps/web/src/lib/params/workspace.params.ts` — workspace params used by all workspace pages (DYK-P2-02)
- **Plan-scoped**: `apps/web/src/features/041-file-browser/params/` — file browser params serve only this plan
- **Cross-cutting**: `apps/web/src/lib/workspace-url.ts` — URL kit used by all workspace pages
- **No cross-plan edit**: `apps/web/src/components/providers.tsx` — NuqsAdapter added inside existing Providers (DYK-P2-04)

### Invariants & Guardrails

- `NuqsAdapter` must not break existing pages (T008 verifies)
- `workspaceHref()` must omit params with empty/false/undefined values (clean URLs)
- Param defaults must match: `mode='preview'`, `changed=false`, `dir=''`, `file=''`, `worktree=''`
- `fileBrowserParams` mode must be a string literal union `['edit', 'preview', 'diff']`

### System Flow Diagram

```mermaid
flowchart LR
    subgraph Root["Root Layout"]
        TP["ThemeProvider"]
        PR["Providers (QueryClient + NuqsAdapter)"]
    end

    subgraph URLKit["URL Kit (cross-cutting)"]
        WH["workspaceHref(slug, path, opts?)"]
    end

    subgraph CrossCutParams["Params (cross-cutting)"]
        WP["workspaceParams<br>(worktree)"]
        WPC["workspaceParamsCache<br>(server)"]
    end

    subgraph PlanParams["Params (plan-scoped)"]
        FP["fileBrowserParams<br>(dir, file, mode, changed)"]
        FPC["fileBrowserPageParamsCache<br>(server, combines workspace+browser)"]
    end

    TP --> PR
    PR --> |"provides context"| FP
    PR --> |"provides context"| WP
    WP --> WPC
    WP --> FPC
    FP --> FPC
```

### Sequence Diagram — URL State Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser as Browser URL Bar
    participant Next as Next.js Router
    participant nuqs as NuqsAdapter
    participant SC as Server Component
    participant CC as Client Component

    User->>Browser: Navigate to bookmarked URL<br>/workspaces/my-proj/browser?file=utils.ts&mode=edit
    Browser->>Next: Request with searchParams
    Next->>SC: page({ params, searchParams })
    SC->>SC: fileBrowserPageParamsCache.parse(searchParams)<br>→ { worktree:'', dir:'', file:'utils.ts', mode:'edit', changed:false }
    SC->>CC: Pass parsed state as props
    CC->>nuqs: useQueryStates(fileBrowserParams)<br>→ initializes from URL
    Note over CC: State restored from bookmark

    CC->>nuqs: setParams({ file: 'other.ts' })
    nuqs->>Browser: History API pushState<br>(no server round-trip)
    Note over Browser: URL updated to ?file=other.ts&mode=edit
```

### Test Plan (Full TDD, No Mocks)

| Test File | Named Tests | Fixtures | Expected Output |
|-----------|-------------|----------|-----------------|
| `workspace-url.test.ts` | `builds basic workspace URL`, `includes worktree in options`, `includes feature params`, `omits empty/false/undefined params`, `encodes worktree paths` | None (pure functions) | Correct URL strings |
| `workspace-params.test.ts` | `workspaceParams defaults`, `workspaceParams populated`, `non-string worktree ignored` | None (nuqs parsers) | Correct parsed param objects |
| `params.test.ts` | `fileBrowserParams defaults`, `fileBrowserParams all populated`, `invalid mode falls back`, `changed boolean parses`, `combined cache parses all` | None (nuqs parsers) | Correct parsed param objects |

### Implementation Outline

1. **T001** — `pnpm add nuqs`, wire NuqsAdapter inside Providers, verify build
2. **T002** — Write workspaceHref() tests with flat options API (RED)
3. **T003** — Implement workspaceHref(), retire inline buildWorktreeUrl (GREEN)
4. **T004** — Write workspaceParams cache tests in `src/lib/params/` (RED)
5. **T005** — Write fileBrowserParams cache tests (RED)
6. **T006** — Implement param definitions + server caches (GREEN)
7. **T007** — Update barrel exports (feature + lib/params)
8. **T008** — Verify existing pages work
9. **T009** — `just fft` green

### Commands to Run

```bash
# Install nuqs
cd apps/web && pnpm add nuqs

# Run specific test files during TDD
pnpm vitest run test/unit/web/lib/workspace-url.test.ts
pnpm vitest run test/unit/web/features/041-file-browser/params.test.ts

# Watch mode
pnpm vitest watch test/unit/web/lib/workspace-url.test.ts

# Full quality gate
just fft
```

### Risks & Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| nuqs incompatible with Next.js 16 / Turbopack | High | T001 is integration spike — verify before building on it. Fallback: custom hooks per Finding 07. |
| NuqsAdapter conflicts with existing providers | Medium | Test hydration on existing pages (T008). Workshop confirms clean provider chain (Finding 03). |
| nuqs `createSearchParamsCache` API may differ in latest version | Low | Check nuqs docs during T006. API is stable (5k+ stars). |

### Ready Check

- [x] ADR constraints mapped — ADR-0004 N/A for Phase 2
- [x] Critical findings mapped — Finding 07 → T001, Finding 03 → T001
- [x] Prior phase reviewed — Phase 1 complete, no dependency
- [x] Pre-implementation audit — no compliance violations
- [x] Requirements traceability — all 4 ACs covered, no gaps
- [ ] **GO / NO-GO**: Awaiting human approval

---

## Phase Footnote Stubs

_Populated by plan-6 during implementation. Do not create footnote tags during planning._

| Footnote | Phase | Task | Description | Impact |
|----------|-------|------|-------------|--------|
| | | | | |

---

## Evidence Artifacts

- **Execution log**: `docs/plans/041-file-browser/tasks/phase-2-deep-linking-url-state/execution.log.md`
- **Supporting files**: Placed in `docs/plans/041-file-browser/tasks/phase-2-deep-linking-url-state/`

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-02-22 | Pre-impl | decision | DYK-P2-01: `parseWorkspacePageProps()` duplicates nuqs cache functionality | Dropped entirely. Pages use idiomatic `await params` + `cache.parse(await searchParams)` — two lines, fully typed, no wrapper. | /didyouknow |
| 2026-02-22 | Pre-impl | decision | DYK-P2-02: `workspaceParams` is cross-cutting but was placed in plan-scoped folder | Moved to `src/lib/params/workspace.params.ts`. File browser params remain plan-scoped. | /didyouknow |
| 2026-02-22 | Pre-impl | decision | DYK-P2-03: `workspaceHref()` 4-arg positional API has poor ergonomics | Flattened to `workspaceHref(slug, subPath, options?)` — worktree is just another key in options object. | /didyouknow |
| 2026-02-22 | Pre-impl | decision | DYK-P2-04: NuqsAdapter should go inside existing `Providers` not layout.tsx | Wire NuqsAdapter inside Providers component. Layout.tsx stays untouched — no cross-plan edit. | /didyouknow |
| 2026-02-22 | Pre-impl | decision | DYK-P2-05: T007/T008 removed, phase reduced from 11 to 9 tasks | Follows from DYK-P2-01. Simpler dependency graph, same functionality. | /didyouknow |
| 2026-02-22 | T001 | insight | nuqs 2.8.8 fully compatible with Next.js 16 + Turbopack | Critical Finding 07 resolved — no fallback needed | log#task-t001 |
| 2026-02-22 | T002 | gotcha | vitest has no `toStartWith` matcher | Use `toMatch(/^.../)` regex instead | log#task-t002 |
| 2026-02-22 | T002 | gotcha | URLSearchParams encodes spaces as `+` not `%20` | Both valid per spec; adjusted test expectations | log#task-t002 |
| 2026-02-22 | T009 | gotcha | Biome organizeImports wants alphabetical order | vitest imports must come after app imports; auto-fixable | log#task-t009 |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Layout

```
docs/plans/041-file-browser/
  ├── file-browser-plan.md
  ├── file-browser-spec.md
  ├── research.md
  ├── workshops/
  │   ├── deep-linking-system.md
  │   ├── ux-vision-workspace-experience.md
  │   └── workspace-preferences-data-model.md
  └── tasks/
      ├── phase-1-data-model-infrastructure/
      │   ├── tasks.md
      │   ├── tasks.fltplan.md
      │   └── execution.log.md
      └── phase-2-deep-linking-url-state/
          ├── tasks.md                    ← this file
          ├── tasks.fltplan.md            # generated by /plan-5b
          └── execution.log.md            # created by /plan-6
```
