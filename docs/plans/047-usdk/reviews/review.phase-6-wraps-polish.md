# Code Review: Phase 6 — SDK Wraps, Go-to-Line & Polish

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 6: SDK Wraps, Go-to-Line & Polish
**Date**: 2026-02-25
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid — Lightweight for wraps and UI

## A) Verdict

**REQUEST_CHANGES**

Four HIGH-severity findings across two areas: (1) sticky `line` URL param that bleeds across file navigation, and (2) infrastructure→business dependency in sdk-bootstrap.ts creating a circular dependency. Two additional HIGHs in testing evidence (no tests for `parseLineSuffix`, incomplete execution log).

**Key failure areas**:
- **Implementation**: Sticky `line` URL param — navigating to a new file after `path:42` scrolls that file to line 42 too. `scrollToLine` only works in `edit` mode, not the default `preview` mode.
- **Domain compliance**: `sdk-bootstrap.ts` (infrastructure `_platform/sdk`) imports from `file-browser` (business), violating dependency direction and creating a circular dependency.
- **Testing**: No unit tests for `parseLineSuffix` despite being a pure function with clear edge cases. Execution log incomplete (missing T007, no post-implementation test run).
- **Doctrine**: Clean — no issues.
- **Reinvention**: Clean — no genuine duplication found.

## B) Summary

Phase 6 successfully implements the SDK contribution pattern for file-browser and events domains, with clean domain manifests (contribution.ts) and handler bindings (register.ts) following ADR-0009. The go-to-line feature (`parseLineSuffix`, `scrollViewToLine`, URL param wiring) is architecturally sound but has a critical UX bug: the `line` URL param persists across file selections, causing unintended scrolling. The domain compliance violation in `sdk-bootstrap.ts` is structurally concerning but has a straightforward fix (extract registration wiring to an app-level module). Testing evidence is weak for a phase with testable pure functions — `parseLineSuffix` should have unit tests. Documentation (guides, ADR) is thorough and well-structured.

## C) Checklist

**Testing Approach: Hybrid — Lightweight for wraps/UI**

- [x] Core validation tests present (pre-existing file-path-handler tests pass)
- [ ] Critical paths covered — `parseLineSuffix` untested, go-to-line flow untested
- [ ] Key verification points documented — execution log incomplete

Universal:
- [ ] Only in-scope files changed — scope is correct
- [ ] Linters/type checks clean — no post-implementation evidence
- [ ] Domain compliance checks pass — 2 HIGH violations

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | browser-client.tsx:109 | correctness | `line` URL param never cleared on file navigation | Set `line: null` in all `setParams({ file })` calls |
| F002 | HIGH | browser-client.tsx:331 | correctness | `openFileAtLine` doesn't clear `line` when called without line arg | Always set `line: line ?? null` |
| F003 | HIGH | sdk-bootstrap.ts:19-20 | domain-compliance | Infrastructure `_platform/sdk` imports from business `file-browser` — dependency direction violation | Move registration calls to app-level wiring module |
| F004 | HIGH | sdk-bootstrap.ts:19-20 | domain-compliance | Circular dependency: file-browser→sdk AND sdk→file-browser via bootstrap imports | Same fix as F003 |
| F005 | HIGH | file-path-handler.ts | testing | No unit tests for `parseLineSuffix` — pure function with clear edge cases (colon, hash, timestamps) | Export and add 5-6 unit tests |
| F006 | HIGH | execution.log.md | testing | Execution log incomplete — missing T007 entry, no post-implementation `just fft` evidence | Complete log and run `just fft` |
| F007 | MEDIUM | file-viewer-panel.tsx:254 | correctness | `scrollToLine` only passed to CodeEditor in `edit` mode, not default `preview` mode | Auto-switch to edit or implement preview scroll |
| F008 | MEDIUM | contribution.ts:20-39 | scope | AC-25 requires ≥3 commands but manifest declares 2. `goToFile` exists from Phase 3 but lacks manifest entry, violating AC-27 | Add `goToFile` to fileBrowserContribution.commands |
| F009 | MEDIUM | sdk-bootstrap.ts:19-20 | contract-imports | Imports `registerXxxSDK` from internal files, not declared contracts | Declare as contracts or move wiring to app layer |
| F010 | MEDIUM | domain-map.md:32-34 | domain-md | file-browser→sdk and events→sdk still shown as dashed future arrows | Change to solid arrows, remove "future phases" comment |
| F011 | MEDIUM | domain.md (sdk) | domain-md | History table ends at Phase 4, no Phase 6 entry | Add Phase 6 row |
| F012 | MEDIUM | domain.md (file-browser) | domain-md | Missing Phase 6 history, sdk/ files in source table, sdk dependency | Update all three sections |
| F013 | MEDIUM | domain.md (events) | domain-md | Missing Phase 6 history, sdk/ files in source table, sdk dependency | Update all three sections |
| F014 | MEDIUM | file-path-handler.test.ts | testing | 10 existing tests, zero cover go-to-line (onLineDetected, path-first, colon/hash syntax) | Add 4+ tests for Phase 6 behavior |
| F015 | LOW | code-editor.tsx:75 | performance | `handleCreateEditor` not wrapped in `useCallback`, new ref each render | Wrap in `useCallback` or use ref for scrollToLine |
| F016 | LOW | register.ts (events):31 | correctness | `as` cast on `unknown` params instead of Zod parse — accepted pattern but fragile | Minor: extract `z.infer<>` type for safety |
| F017 | LOW | register.ts (file-browser):35 | correctness | `navigator.clipboard.writeText` without non-HTTPS fallback (useClipboard has one) | Consider reusing clipboard utility |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 (HIGH) — Sticky `line` URL param**: The `line` URL parameter is never cleared when navigating to a new file. `setUrlFile` only sets `{ file }`, so `?line=42` persists across file selections. Clicking file B after navigating to file A at line 42 will scroll file B to line 42.

**F002 (HIGH) — openFileAtLine doesn't clear line**: The spread `...(line != null ? { line } : {})` omits the key entirely when line is absent, so any pre-existing `?line=N` persists. Calling `openFileAtLine({ path: 'new.ts' })` after `old.ts?line=42` navigates to `new.ts?line=42`.

**F007 (MEDIUM) — scrollToLine only in edit mode**: `scrollToLine` prop is only passed to `CodeEditor` inside the `mode === 'edit'` branch of FileViewerPanel. The default mode is `preview`, so the headline feature (navigate to `file:42`) is broken in the default viewing mode.

**F008 (MEDIUM) — AC-25 command count**: The spec requires "at least 3 commands and 2 settings". The manifest declares 2 commands. `goToFile` exists from Phase 3 but is registered ad-hoc in browser-client.tsx without a manifest entry, which also violates AC-27's requirement for static contribution manifests.

**F015 (LOW) — handleCreateEditor not memoized**: Inline function creates new reference each render. Likely harmless since `@uiw/react-codemirror` only calls it once on mount, but wrapping in useCallback would be safer.

**F016-F017 (LOW)**: Type assertions and clipboard fallback are minor quality concerns, consistent with existing patterns.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files under declared domain source trees |
| Contract-only imports | ❌ | F009: sdk-bootstrap.ts imports internal `register.ts` from file-browser and events |
| Dependency direction | ❌ | F003: infrastructure (`_platform/sdk`) imports from business (`file-browser`) |
| Domain.md updated | ❌ | F011-F013: 3 domain.md files missing Phase 6 entries |
| Registry current | ✅ | All 8 domains present |
| No orphan files | ✅ | All changed files map to manifest domains |
| Map nodes current | ✅ | All domains present in domain-map.md |
| Map edges current | ❌ | F010: file-browser→sdk and events→sdk still dashed/future |
| No circular business deps | ❌ | F004: Circular via sdk-bootstrap.ts imports |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| parseLineSuffix | None | file-browser | ✅ Proceed |
| scrollViewToLine | None | file-browser | ✅ Proceed |
| registerEventsSDK (toast.show) | IUSDK.toast (intentional dual-access) | events/sdk | ✅ Proceed (DYK-P6-01) |
| registerFileBrowserSDK (copyPath) | useClipboard (same domain, different access) | file-browser | ✅ Proceed |
| SDKContribution manifests | None (first instances) | file-browser/events | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 42%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-25 | 70% | 2 commands in manifest + goToFile from Phase 3 = 3. 5 settings declared. No automated count test. |
| AC-26 | 85% | toast.show and toast.dismiss registered with correct IDs. Code inspection only. |
| AC-27 | 90% | Clear contribution.ts/register.ts separation in both domains. |
| AC-28 | 65% | Handler calls `toast[type](message)` — same as sonner direct. No equivalence test. |
| AC-29 | 60% | openFileAtLine handler navigates to file. Code review only. |
| AC-31 | 55% | scrollToLine prop wired through 4 files. No integration test. |
| AC-32 | 45% | parseLineSuffix handles :42 and #L42 but ZERO tests. |

### E.5) Doctrine Compliance

No issues found. All files follow coding standards, naming conventions, architecture layer boundaries, and constitution principles. Type assertions in SDK handlers follow established codebase pattern.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-25 | file-browser publishes ≥3 commands, ≥2 settings | 2 in manifest + goToFile (Phase 3) = 3 commands. 5 settings. Code review. | 70% |
| AC-26 | events publishes toast.show and toast.dismiss | Both registered in registerEventsSDK. Code review. | 85% |
| AC-27 | Static contribution manifest separate from handlers | contribution.ts + register.ts pattern in both domains. | 90% |
| AC-28 | toast.show produces same toast as direct toast() | Handler delegates to sonner. Code review. | 65% |
| AC-29 | openFile navigates to specified file | Replaced by openFileAtLine per DYK-P6-02. Code review. | 60% |
| AC-31 | openFileAtLine navigates + scrolls to line | Wired through 4 files. Broken in preview mode (F007). | 55% |
| AC-32 | Explorer bar accepts path:42 / path#L42 | parseLineSuffix + path-first resolution. Zero tests. | 45% |

**Overall coverage confidence**: 42%

## G) Commands Executed

```bash
git --no-pager log --oneline -20
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager diff HEAD -- ':!docs/plans/' ':!*.fltplan.md'
git --no-pager status --short -- ':!docs/plans/'
git --no-pager show --stat c786288
git --no-pager show --stat b0a5e70
cat docs/domains/registry.md
cat docs/domains/domain-map.md
# 5 parallel review subagents launched
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 6: SDK Wraps, Go-to-Line & Polish
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-6-wraps-polish/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-6-wraps-polish/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/review.phase-6-wraps-polish.md
**Fix tasks file**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/fix-tasks.phase-6-wraps-polish.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | modified | file-browser | Fix F001, F002 |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/code-editor.tsx | modified | file-browser | Fix F015 (optional) |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx | modified | file-browser | Fix F007 |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/params/file-browser.params.ts | modified | file-browser | Clean |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts | modified | file-browser | Fix F005 (add tests) |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-bootstrap.ts | modified | _platform/sdk | Fix F003, F004, F009 |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/sdk/contribution.ts | new | file-browser | Fix F008 |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/sdk/register.ts | new | file-browser | Clean |
| /home/jak/substrate/041-file-browser/apps/web/src/features/027-central-notify-events/sdk/contribution.ts | new | _platform/events | Clean |
| /home/jak/substrate/041-file-browser/apps/web/src/features/027-central-notify-events/sdk/register.ts | new | _platform/events | Clean |
| /home/jak/substrate/041-file-browser/docs/how/sdk/publishing-to-sdk.md | new | docs | Clean |
| /home/jak/substrate/041-file-browser/docs/how/sdk/consuming-sdk.md | new | docs | Clean |
| /home/jak/substrate/041-file-browser/docs/adr/adr-0013-usdk-internal-sdk-architecture.md | new (committed) | docs | Clean |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | browser-client.tsx | Clear `line: null` in all `setParams({ file })` calls and in `openFileAtLine` when line is absent | F001+F002: Line param bleeds across file navigation |
| 2 | sdk-bootstrap.ts | Extract `registerFileBrowserSDK` and `registerEventsSDK` calls to app-level wiring module | F003+F004: Infra→business dependency + circular dep |
| 3 | file-path-handler.ts | Export `parseLineSuffix`, add unit tests | F005: Pure function with zero test coverage |
| 4 | file-viewer-panel.tsx | Pass `scrollToLine` to CodeEditor in preview mode, or auto-switch to edit mode when line is set | F007: Headline feature broken in default mode |
| 5 | contribution.ts (file-browser) | Add `goToFile` command entry to manifest | F008: AC-25/AC-27 compliance |
| 6 | execution.log.md | Add T007 entry, run `just fft`, record test count | F006: Incomplete evidence |
| 7 | domain-map.md, domain.md ×3 | Update arrows to solid, add Phase 6 history/source/deps entries | F010-F013: Stale domain docs |
| 8 | file-path-handler.test.ts | Add tests for onLineDetected, path-first resolution, colon/hash syntax | F014: Go-to-line behavior untested |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Change dashed arrows to solid for file-browser→sdk and events→sdk |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | Phase 6 history entry |
| /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | Phase 6 history, sdk/ source files, sdk dependency |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/events/domain.md | Phase 6 history, sdk/ source files, sdk dependency |

### Next Step

Apply fixes from fix-tasks file, then re-run review:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md --phase "Phase 6: SDK Wraps, Go-to-Line & Polish"
```
Then: `/plan-7-v2-code-review --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md --phase "Phase 6: SDK Wraps, Go-to-Line & Polish"`
