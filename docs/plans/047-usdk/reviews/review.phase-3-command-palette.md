# Code Review: Phase 3 — Command Palette

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md`
**Phase**: Phase 3: Command Palette
**Date**: 2026-02-25
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (Lightweight for UI components)

## A) Verdict

**REQUEST_CHANGES**

Three HIGH findings: (1) `openPalette()`/`focusInput()` missing `processing` guard — the critical race condition from Plan Finding 01 was not addressed, (2) `handlePaletteExecute` has no try/catch around `sdk.commands.execute()`, (3) execution log is completely empty with zero evidence for any of the 7 tasks.

**Key failure areas**:
- **Implementation**: Missing `processing` guard on `openPalette()`/`focusInput()` race condition (Plan Finding 01) and unhandled error in palette execute path
- **Testing**: Execution log is empty; no automated tests for any UI component (dropdown, stubs, palette mode) despite lightweight strategy requiring "verify rendering, basic interactions"
- **Domain compliance**: `panel-layout` imports `MruTracker` directly from SDK internal file instead of public export; both domain.md files missing Phase 3 updates

## B) Summary

The Phase 3 implementation delivers a functional command palette with correct architecture: onChange-based palette mode detection (DYK-P3-01), mouseDown blur prevention (DYK-P3-02), keyboard delegation via forwardRef (DYK-P3-03), appropriate stub handling (DYK-P3-04), and ref-based command registration (DYK-P3-05). Code quality is solid — MRU tracker is clean and well-tested (7 tests), the dropdown filter/sort logic is correct, and existing file navigation is preserved. However, the critical `processing` race condition flagged in Plan Finding 01 was not addressed, the palette execute path lacks error handling, and the execution log contains zero evidence. Domain documentation is stale for Phase 3.

## C) Checklist

**Testing Approach: Lightweight**

- [ ] Core validation tests present — MRU tracker only; command-palette-dropdown, stub-handlers, palette mode integration have zero tests
- [ ] Critical paths covered — palette filter/execute path untested
- [ ] Key verification points documented — execution log is empty

**Universal:**
- [x] Only in-scope files changed
- [ ] Linters/type checks clean — not verified (execution log empty)
- [ ] Domain compliance checks pass — 2 contract-import violations, 2 stale domain.md files

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | explorer-panel.tsx:74-90 | correctness | `openPalette()`/`focusInput()` missing `processing` guard (Plan Finding 01) | Add `if (processing) return;` guard |
| F002 | HIGH | explorer-panel.tsx:112-120 | error-handling | `handlePaletteExecute` has no try/catch around `sdk.commands.execute()` | Wrap in try/catch with toast.error |
| F003 | HIGH | execution.log.md | testing | Execution log completely empty — zero evidence for 7 tasks | Populate with per-task evidence |
| F004 | MEDIUM | command-palette-dropdown.tsx:171-195 | pattern | Missing `role="listbox"` and `role="option"` ARIA attributes | Add ARIA roles for accessibility |
| F005 | MEDIUM | explorer-panel.tsx:142-148 | correctness | Tab key swallowed in palette mode — all keys delegated then early return | Only preventDefault for handled keys |
| F006 | MEDIUM | explorer-panel.tsx:136 | scope | Search fallback uses `context.showError()` (toast.error) for informational "coming soon" | Use `toast.info()` to match stub-handlers pattern |
| F007 | MEDIUM | command-palette-dropdown.tsx:30, explorer-panel.tsx:20 | domain | `panel-layout` imports `MruTracker` from SDK internal file `@/lib/sdk/mru-tracker` | Re-export from `sdk-provider.tsx` or SDK barrel |
| F008 | MEDIUM | domain.md (panel-layout) | domain | Missing Phase 3 history, source location, composition, dependency updates | Update domain.md with Phase 3 entries |
| F009 | MEDIUM | domain.md (sdk) | domain | Missing Phase 3 history, mru-tracker source location, MruTracker/useSDKMru composition | Update domain.md with Phase 3 entries |
| F010 | MEDIUM | (missing) | testing | No tests for command-palette-dropdown.tsx (210 LOC of filter/keyboard/render logic) | Add 2-3 lightweight component tests |
| F011 | MEDIUM | (missing) | testing | No tests for stub-handlers.ts | Add 2 unit tests (# prefix intercept, non-# pass-through) |
| F012 | MEDIUM | (missing) | testing | No tests for ExplorerPanel palette mode integration | Add tests or document manual verification |
| F013 | LOW | browser-client.tsx:290 | pattern | `navigator.platform` deprecated, no comment | Add deprecation comment matching existing pattern |
| F014 | LOW | command-palette-dropdown.tsx:73-81 | performance | `mru` in useMemo deps is misleading (stable ref) | Add clarifying comment |
| F015 | LOW | domain-map.md | domain | `panels -.->` edge should be solid `-->` now that palette is implemented | Change to solid arrow |
| F016 | LOW | domain-map.md | domain | Panels node label missing CommandPaletteDropdown | Update node label |
| F017 | LOW | command-palette-dropdown.tsx:17-18 | pattern | Split imports from same `@chainglass/shared/sdk` module | Merge into single import |
| F018 | LOW | browser-client.tsx:37-38 | pattern | Split imports from same `@/lib/sdk/sdk-provider` module | Merge into single import |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 (HIGH)** — `openPalette()`/`focusInput()` missing `processing` guard
- **File**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:74-90`
- Plan Finding 01 (Critical) explicitly flagged: "The `processing` flag can trap input in focused state. Check `processing === false` before palette activation." The `handleBlur` callback correctly guards with `if (!processing)`, but neither `openPalette()` nor `focusInput()` check this flag. If a handler chain is mid-flight, opening the palette will race with handleSubmit's `setEditing(false)`.
- **Fix**: Add `if (processing) return;` at the top of both `openPalette()` and `focusInput()`.

**F002 (HIGH)** — `handlePaletteExecute` missing error handling
- **File**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:112-120`
- `sdk.commands.execute(commandId)` throws if the command ID is not registered (e.g., disposed between list render and click). The handler chain in `handleSubmit` wraps in try/finally, but the palette path does not.
- **Fix**: Wrap in try/catch. On error, show a toast. Always call `exitPaletteMode()` in a finally block.

**F004 (MEDIUM)** — Missing ARIA roles on dropdown
- **File**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx:171-195`
- Items use `aria-selected` but the container lacks `role="listbox"` and items lack `role="option"`.
- **Fix**: Add `role="listbox"` to container div, `role="option"` to each item.

**F005 (MEDIUM)** — Tab key swallowed in palette mode
- **File**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:142-148`
- All keyDown events are delegated to the dropdown then early-returned. Keys the dropdown doesn't handle (Tab, Home, End) are silently consumed.
- **Fix**: Only delegate specific keys (Escape, ArrowDown, ArrowUp, Enter) to the dropdown; let others propagate.

**F006 (MEDIUM)** — Search fallback uses error toast
- **File**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:136`
- `context.showError('Search coming soon')` produces a red error toast for an informational message. The `#` stub handler uses `toast.info()` — inconsistent.
- **Fix**: Change to `toast.info('Search coming soon')` directly, or add a `showInfo` method to `BarContext`.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All 7 files under declared domain source trees |
| Contract-only imports | ❌ | F007: `panel-layout` imports `MruTracker` from `@/lib/sdk/mru-tracker` (SDK internal) |
| Dependency direction | ✅ | business→infrastructure correct everywhere |
| Domain.md updated | ❌ | F008: panel-layout missing Phase 3 entries; F009: sdk missing Phase 3 entries |
| Registry current | ✅ | Both `_platform/sdk` and `_platform/panel-layout` listed |
| No orphan files | ✅ | All files mapped to domains |
| Map nodes current | ⚠️ | F016: panels node label missing new components |
| Map edges current | ⚠️ | F015: dashed edge should be solid |
| No circular business deps | ✅ | No cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| CommandPaletteDropdown | None | `_platform/panel-layout` | ✅ Proceed — no existing combobox/autocomplete |
| createSymbolSearchStub | None | `_platform/panel-layout` | ✅ Proceed — follows BarHandler pattern |
| MruTracker | None | `_platform/sdk` | ✅ Proceed — no existing MRU tracker |

### E.4) Testing & Evidence

**Coverage confidence**: 42%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 | 20% | Plan marks [~] (partial). Command exists but Ctrl+Shift+P binding is Phase 4. No test or log entry. |
| AC-06 | 35% | Code implements '>' prefix detection and title substring filtering. No test. No execution log. |
| AC-07 | 30% | Enter-to-execute and click handler implemented. Zod parse bug discovery suggests path was exercised. No test. |
| AC-08 | 25% | Escape handling in keyboard delegation exists. No test. No execution log. |
| AC-09 | 40% | Stub handler is 21 lines, correct by inspection. No test. |
| AC-10 | 30% | Fallback changed from "Not found" to "Search coming soon". No test. |

**Violations**:
- F003 (HIGH): Execution log completely empty
- F010 (MEDIUM): No tests for command-palette-dropdown.tsx
- F011 (MEDIUM): No tests for stub-handlers.ts
- F012 (MEDIUM): No tests for ExplorerPanel palette mode

### E.5) Doctrine Compliance

- F017 (LOW): Split imports from same `@chainglass/shared/sdk` module in command-palette-dropdown.tsx
- F018 (LOW): Split imports from same `@/lib/sdk/sdk-provider` module in browser-client.tsx

No HIGH or MEDIUM doctrine violations. All MUST-level rules satisfied (no `any`, kebab-case files, proper path aliases, correct `export type` usage, layer boundaries respected).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-05 | Ctrl+Shift+P focuses explorer bar in command mode | `sdk.openCommandPalette` command registered; Ctrl+Shift+P binding deferred to Phase 4 | 20% |
| AC-06 | `>` prefix filters commands by title | Code: onChange detection + filterAndSort in dropdown | 35% |
| AC-07 | Selecting command executes it | Code: handleSelect → onExecute → sdk.commands.execute | 30% |
| AC-08 | Escape exits command mode | Code: dropdown handleKeyDown handles Escape → onClose | 25% |
| AC-09 | `#` prefix shows stub message | Code: createSymbolSearchStub returns true with toast.info | 40% |
| AC-10 | No-prefix text shows stub message | Code: fallback path changed to "Search coming soon" | 30% |

**Overall coverage confidence**: 30%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager diff -- [phase 3 files]
# Saved to docs/plans/047-usdk/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md`
**Phase**: Phase 3: Command Palette
**Tasks dossier**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-3-command-palette/tasks.md`
**Execution log**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-3-command-palette/execution.log.md`
**Review file**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/review.phase-3-command-palette.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Modified | `_platform/panel-layout` | Fix F001, F002, F005, F006 |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Created | `_platform/panel-layout` | Fix F004, F007, F017 |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/stub-handlers.ts` | Created | `_platform/panel-layout` | Add tests (F011) |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/types.ts` | Modified | `_platform/panel-layout` | None |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/index.ts` | Modified | `_platform/panel-layout` | None |
| `/home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/mru-tracker.ts` | Created | `_platform/sdk` | None (well tested) |
| `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Modified | `file-browser` | Fix F018 |
| `/home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md` | Stale | `_platform/panel-layout` | Fix F008 |
| `/home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md` | Stale | `_platform/sdk` | Fix F009 |
| `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md` | Stale | cross-domain | Fix F015, F016 |
| `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-3-command-palette/execution.log.md` | Empty | N/A | Fix F003 |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `explorer-panel.tsx` | Add `if (processing) return;` to `openPalette()` and `focusInput()` | F001: Plan Finding 01 race condition |
| 2 | `explorer-panel.tsx` | Wrap `handlePaletteExecute` in try/catch with finally `exitPaletteMode()` | F002: Unhandled error if command disposed |
| 3 | `execution.log.md` | Populate with per-task evidence | F003: Zero evidence recorded |
| 4 | `command-palette-dropdown.tsx` | Add `role="listbox"` and `role="option"` | F004: Accessibility |
| 5 | `explorer-panel.tsx` | Only delegate ArrowUp/ArrowDown/Enter/Escape to dropdown, let others propagate | F005: Tab key swallowed |
| 6 | `explorer-panel.tsx` | Change search fallback to `toast.info()` | F006: Error toast for info message |
| 7 | `command-palette-dropdown.tsx`, `explorer-panel.tsx` | Import MruTracker via SDK public export | F007: Contract import violation |
| 8 | `domain.md` (panel-layout + sdk) | Add Phase 3 entries to History, Source Location, Composition | F008, F009 |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md` | Phase 3 history, source files, composition, SDK dependency |
| `/home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md` | Phase 3 history, mru-tracker.ts, MruTracker/useSDKMru composition |
| `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md` | Solid arrow for panels→sdk, updated node labels |

### Next Step

Apply fixes from `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/fix-tasks.phase-3-command-palette.md`, then re-run review:
```
/plan-7-v2-code-review --phase "Phase 3: Command Palette" --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
```
