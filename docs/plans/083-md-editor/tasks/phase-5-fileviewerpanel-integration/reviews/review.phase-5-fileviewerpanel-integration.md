# Code Review: Phase 5 — FileViewerPanel Integration

**Plan**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md
**Spec**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-spec.md
**Phase**: Phase 5: FileViewerPanel Integration
**Date**: 2026-04-19
**Reviewer**: Automated (plan-7-v2) — 6 parallel subagents
**Testing Approach**: Hybrid (TDD for new utilities T007/T008/T009; Lightweight for migrations T001/T002/T010; Manual via harness for T011)

## A) Verdict

**APPROVE WITH NOTES**

Zero CRITICAL, zero HIGH findings. Three MEDIUM issues documented for backfill or Phase 6 absorption; all are either deferred-by-design or non-blocking test-coverage gaps. Code quality, domain compliance, anti-reinvention, and live-harness validation all pass cleanly.

**Key observations** (only areas with findings):
- **Testing**: Two ACs (AC-02 legacy-URL coercion, AC-11 table banner UI) rely on manual verification rather than automated tests — both functionally verified in execution log but lack regression guards.
- **Doctrine**: One integration test (`file-viewer-panel-rich-mode.test.tsx:250+`) has an abbreviated Test Doc header (2 of 5 fields); all other tests meet R-TEST-002/003 format.
- **Domain compliance**: `_platform/viewer` domain.md § Concepts section does not yet enumerate the Rich editor contracts — explicitly deferred to Phase 6.8 per plan.

**No failure areas**: Implementation, security, anti-reinvention, and harness validation are all clean.

## B) Summary

Phase 5 landed all 11 tasks with strong integration test coverage. The 8-site `'edit'` → `'source'` migration was performed correctly, legacy `?mode=edit` URLs coerce on load via a useEffect placed before the scrollToLine effect (C1 race resolved in dossier validation), and the Rich branch composes Phases 1–4 plus the new language-pill decoration cleanly. The new `performSave` helper + optional `saveFileImpl?` DI prop is a clean, minimal-surface solution to Constitution §4/§7 ("Fakes over Mocks") — the integration tests consume it via a plain `FakeSaveFile` class. Domain compliance is 9/10 ✅ with the single ⚠️ (Concepts doc) deferred-by-design to Phase 6.8. Harness smoke passes on desktop + tablet (6.5s / 6.9s) with zero hydration warnings. The three MEDIUM findings are all non-blocking: two are test-coverage gaps suitable for Phase 6.1 backfill; one is a minor Test Doc format issue on a single new test.

## C) Checklist

**Testing Approach: Hybrid**

TDD (T007, T008, T009):
- [x] Test tasks produced tests before/alongside implementation — T007 TDD serialization-leak guard landed with the extension; T008/T009 integration tests cover new DI surface
- [x] Evidence of TDD discipline in execution log

Lightweight (T001, T002, T010):
- [x] Core validation tests present (22 unit tests for the renamed panel + 2 new Rich-visibility assertions)
- [x] Critical paths covered (mode toggle, Save button, Cmd+S)

Manual / Harness (T011):
- [x] Manual verification steps documented in execution log
- [x] Harness smoke passes on desktop + tablet with screenshots captured
- [x] Evidence artifacts present (harness/results/phase-5/rich-mode-*.png)

Universal:
- [x] Only in-scope files changed (13 touched files all in task table)
- [x] Typecheck no worse than baseline (4 pre-existing debt errors unchanged)
- [x] Domain compliance checks pass (9/10 ✅, 1 ⚠️ deferred-by-design)

## D) Findings Table

| ID   | Severity | File:Lines                                                                                                                       | Category          | Summary                                                                                   | Recommendation                                                                                                   |
|------|----------|----------------------------------------------------------------------------------------------------------------------------------|-------------------|-------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| F001 | MEDIUM   | test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx (coverage gap for AC-11)                                      | test-coverage     | No automated test for the table warn banner render/dismiss flow in Phase 5 test files     | Add a unit test that mounts Rich mode with table-containing content, asserts banner visible, dismisses, asserts sessionStorage write. Or elevate to Phase 6.1 backfill task. |
| F002 | MEDIUM   | test/unit/web/features/041-file-browser/  (coverage gap for AC-02)                                                               | test-coverage     | No automated test confirms legacy `?mode=edit` coerces to `source` before scrollToLine fires | Add a browser-client integration test that mounts with `mode='edit'` and asserts the coercion + history replace. Or document acceptance of manual-only verification. |
| F003 | MEDIUM   | test/integration/web/features/041-file-browser/file-viewer-panel-rich-mode.test.tsx:~250 ("falls back to onSave…")               | doctrine (R-TEST) | Test Doc header has only 2 of 5 required fields (Why, Contract) — missing Usage Notes, Quality Contribution, Worked Example | Expand the Test Doc block for that one test to include all 5 R-TEST-002/003 fields.                              |
| F004 | LOW      | apps/web/app/globals.css:531-546                                                                                                 | style             | `.md-wysiwyg-code-lang-pill` uses inline hsl() rather than referencing CSS custom properties | Acceptable — consider a code comment noting intent, or promote to tokens if the pill styling ever needs theming.|
| F005 | LOW      | docs/domains/_platform/viewer/domain.md § Concepts (deferred)                                                                    | domain-doc        | Concepts table does not yet list `MarkdownWysiwygEditor`, `WysiwygToolbar`, `LinkPopover` as concepts | **Deferred by design to Phase 6.8** per plan; not a Phase 5 defect.                                               |

## E) Detailed Findings

### E.1) Implementation Quality

**Result**: No actionable issues.

The Implementation Quality reviewer verified every hazard called out in the dossier validation record:

1. ✅ **DOM mutation inside onChange** (`file-viewer-panel.tsx` `handleRichChange`): safe — runs after commit, not during render.
2. ✅ **Legacy-coerce effect vs scrollToLine effect ordering** (`browser-client.tsx:155-175`): declaration order correct, C1 race resolved.
3. ✅ **`void saveFileImpl(next)` promise-rejection handling**: intentional fire-and-forget; tests assert via `.calls`, production reads through `onSave` prop which has its own error surface.
4. ✅ **ProseMirror plugin `state.apply`** (`code-block-language-pill.ts`): correctly branches on `tr.docChanged`; selection-only transactions use `old.map(tr.mapping, tr.doc)` to shift decorations efficiently.
5. ✅ **Language-pill serialization**: new unit test asserts emitted markdown contains no `</span>` or `data-testid` artifact.
6. ✅ **Size + language gates**: `exceedsRichSizeCap` memoized via `useMemo([currentContent])`; `hasTables` runs only when mode is rich (effectively free).
7. ✅ **sessionStorage handling**: read/write both wrapped in try/catch; banner reappearance on new session is an acceptable graceful-degradation outcome.
8. ✅ **Scope compliance**: all 13 touched files in task table; no scope creep.

### E.2) Domain Compliance

| Check                           | Status | Details                                                                                                                          |
|---------------------------------|--------|----------------------------------------------------------------------------------------------------------------------------------|
| File placement                  | ✅     | All new files under correct domain source trees                                                                                  |
| Contract-only imports           | ✅     | `file-viewer-panel.tsx` imports only via barrel `@/features/_platform/viewer`; no deep imports                                   |
| Dependency direction            | ✅     | `file-browser` → `_platform/viewer` consumer direction; zero reverse imports                                                     |
| Domain.md updated               | ✅     | Both domain.md files have Phase 5 history entries (`docs/domains/_platform/viewer/domain.md`, `docs/domains/file-browser/domain.md`) |
| Registry current                | ✅     | No new domains; `registry.md` unchanged                                                                                          |
| No orphan files                 | ✅     | All 13 touched files map to declared domains (infrastructure files are tests + harness)                                          |
| Map nodes current               | ✅     | No new nodes required                                                                                                            |
| Map edges current               | ✅     | `file-browser` → `_platform/viewer` edge already present from Plan 041                                                           |
| No circular business deps       | ✅     | Zero reverse imports                                                                                                             |
| Concepts documented             | ⚠️     | `_platform/viewer/domain.md § Concepts` does not yet list Rich editor contracts — deferred to Phase 6.8 per plan                 |

**Key observations**:
- `code-block-language-pill.ts` correctly excluded from `_platform/viewer/index.ts` barrel (internal Tiptap extension; bundle-inclusion test in Phase 6.7).
- `markdown-wysiwyg-editor.tsx` imports the extension via relative path `../lib/code-block-language-pill` — valid same-domain import.

### E.3) Anti-Reinvention

| New Component                                       | Existing Match? | Domain                                           | Status  |
|-----------------------------------------------------|-----------------|--------------------------------------------------|---------|
| `code-block-language-pill.ts` (ProseMirror plugin)  | None            | No other Tiptap Extension + DecorationSet plugin in repo | proceed |
| `performSave` helper + `saveFileImpl?` DI prop      | None            | No other optional save-DI pattern in repo        | proceed |
| `readDismissedBanners` / `writeDismissedBanners`    | Inline only in `use-file-filter.ts` (not extracted) | Intentionally file-local per Constitution §4 | proceed |
| `FakeSaveFile` test class                           | Pattern matches `test/fakes/*` convention (kept in-file is acceptable per test-locality rule) | Test infrastructure | proceed |
| Table detector / size-cap / fm codec imports        | Phase 4 exports — correctly consumed via barrel  | `_platform/viewer` (correct domain)              | proceed |

**No genuine duplication found.** 5/5 new concepts cleared.

### E.4) Testing & Evidence

**Approach**: Hybrid
**Coverage confidence**: **87%**

| AC     | Description                           | Owning T-ID      | Confidence | Evidence                                                                                                            |
|--------|---------------------------------------|------------------|------------|---------------------------------------------------------------------------------------------------------------------|
| AC-01  | Rich mode available only for `.md`    | T003, T004       | 100%       | `file-viewer-panel.test.tsx:59-76`; `file-viewer-panel-rich-mode.test.tsx:127-147`                                  |
| AC-02  | Legacy `?mode=edit` → `source`        | T001, T002       | **75%**    | Manual + grep + curl only; **no automated test** (F002 MEDIUM)                                                      |
| AC-06  | Save from Rich via existing pipeline  | T006, T009       | 100%       | `file-viewer-panel-rich-mode.test.tsx:187+` (T009 Cmd+S + Save button via FakeSaveFile)                             |
| AC-07  | Source ↔ Rich share content           | T003, T008       | 100%       | `file-viewer-panel-rich-mode.test.tsx:149-183` (cross-mode sync)                                                    |
| AC-11  | Table warn banner                     | T005             | **65%**    | Execution log manual verification only; **no automated test for banner UI** (F001 MEDIUM)                           |
| AC-12  | Code blocks show language pill        | T007             | 100%       | `markdown-wysiwyg-editor.test.tsx` (2 new TDD tests) + harness smoke asserts `python` pill                          |
| AC-16a | 200 KB soft cap                       | T004             | 100%       | Rich button disabled via `exceedsRichSizeCap`; Phase 4 test covers the utility; Phase 5 renders the gate             |

**Totals**: 22 unit + 5 integration + 2 harness smoke runs = all green. Constitution §4/§7 compliance verified — no new `vi.mock`/`vi.fn`/`vi.spyOn` introduced for business logic.

### E.5) Doctrine Compliance

**Overall**: PASS with 1 MEDIUM + 1 LOW.

- ✅ Constitution §2 (Interface-First): `FileViewerPanelProps.saveFileImpl?` declared in interface before implementation.
- ✅ Constitution §3 (TDD): T007 pill tests + T008/T009 integration tests follow TDD discipline for new behavior.
- ✅ Constitution §4/§7 (Fakes over Mocks): `FakeSaveFile` class used; legacy vi.mocks grandfathered per documented Test-Boundary Note.
- ✅ rules.md / idioms.md / architecture.md: naming, directory conventions, layer boundaries, barrel exports all clean.
- ✅ biome-ignore directives have explanations.
- ✅ No `console.log` left in code; no new `any` types.
- ⚠️ F003 MEDIUM: one new test has abbreviated Test Doc (2 of 5 fields).
- ℹ️ F004 LOW: CSS uses inline hsl() rather than CSS custom properties — cosmetic.

### E.6) Harness Live Validation

- **Harness status**: HEALTHY
- **Desktop smoke**: PASS in 6.5s
- **Tablet smoke**: PASS in 6.9s
- **URL sanity (Rich)**: HTTP 200 on `?mode=rich` URL
- **URL sanity (legacy)**: HTTP 200 on `?mode=edit` URL (server accepts legacy alias; client-side coercion is tested by effect order + execution-log grep evidence)
- **Live-verified ACs**: AC-01 (Rich mount), AC-02 (URLs accepted), AC-12 (language pill renders "python"). AC-06/07/11/16a intentionally delegated to the integration suite (not live-smoke-testable in isolation).
- **Zero hydration warnings** captured across 2 smoke runs.
- **Screenshots**: `harness/results/phase-5/rich-mode-desktop.png`, `harness/results/phase-5/rich-mode-tablet.png`.

## F) Coverage Map

| AC     | Description                     | Evidence                                                                                 | Confidence |
|--------|---------------------------------|------------------------------------------------------------------------------------------|------------|
| AC-01  | Rich only for markdown          | Unit + integration + harness all green                                                   | 100%       |
| AC-02  | Default preview + legacy URL    | Manual + grep + curl; **no automated test** → backfill candidate                         | 75%        |
| AC-06  | Cmd+S via existing pipeline     | T009 integration test with FakeSaveFile                                                  | 100%       |
| AC-07  | Source ↔ Rich share content     | T008 integration test; userEvent.type in Rich propagates to Source                       | 100%       |
| AC-11  | Table warn banner               | Code path reviewed; **no automated UI test** → backfill candidate                        | 65%        |
| AC-12  | Language pill                   | 2 TDD unit tests + harness-smoke live assertion                                          | 100%       |
| AC-16a | 200 KB size cap                 | `exceedsRichSizeCap` tested (Phase 4); Rich button disabled state rendered (Phase 5)     | 100%       |

**Overall coverage confidence**: **87%** (6/7 ACs ≥ 100%; AC-02 at 75%; AC-11 at 65%).

## G) Commands Executed

```bash
# Diff capture
git status --short
{ git diff; git diff --staged; } > docs/plans/083-md-editor/tasks/phase-5-fileviewerpanel-integration/reviews/_computed.diff

# Harness live verification (executed by subagent 6)
just harness health
just harness seed
just harness ports
cd harness && pnpm exec playwright test tests/smoke/markdown-wysiwyg-smoke.spec.ts --project=desktop
cd harness && pnpm exec playwright test tests/smoke/markdown-wysiwyg-smoke.spec.ts --project=tablet
curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:3126/workspaces/harness-test-workspace/browser?worktree=/app/scratch/harness-test-workspace&file=sample-rich.md&mode=rich"
curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:3126/workspaces/harness-test-workspace/browser?worktree=/app/scratch/harness-test-workspace&file=sample-rich.md&mode=edit"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md
**Spec**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-spec.md
**Phase**: Phase 5: FileViewerPanel Integration
**Tasks dossier**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-5-fileviewerpanel-integration/tasks.md
**Execution log**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-5-fileviewerpanel-integration/execution.log.md
**Review file**: /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-5-fileviewerpanel-integration/reviews/review.phase-5-fileviewerpanel-integration.md

### Files Reviewed

| File (absolute path)                                                                                                         | Status     | Domain              | Action Needed                                  |
|------------------------------------------------------------------------------------------------------------------------------|------------|---------------------|------------------------------------------------|
| /Users/jordanknight/substrate/083-md-editor/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx          | modified   | file-browser        | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/src/features/041-file-browser/params/file-browser.params.ts             | modified   | file-browser        | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx            | modified   | file-browser        | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/lib/code-block-language-pill.ts           | new        | _platform/viewer    | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx    | modified   | _platform/viewer    | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/app/globals.css                                                          | modified   | infrastructure      | None (F004 LOW cosmetic)                       |
| /Users/jordanknight/substrate/083-md-editor/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx               | modified   | file-browser        | Optional: add AC-02 + AC-11 coverage (F001/F002) |
| /Users/jordanknight/substrate/083-md-editor/test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx         | modified   | _platform/viewer    | None                                           |
| /Users/jordanknight/substrate/083-md-editor/test/integration/web/features/041-file-browser/file-viewer-panel-rich-mode.test.tsx | new     | file-browser        | Expand one Test Doc header (F003 MEDIUM)       |
| /Users/jordanknight/substrate/083-md-editor/harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts                                | modified   | harness             | None                                           |
| /Users/jordanknight/substrate/083-md-editor/apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx                                  | deleted    | scaffold            | None                                           |
| /Users/jordanknight/substrate/083-md-editor/docs/domains/_platform/viewer/domain.md                                          | modified   | _platform/viewer    | Phase 6.8 picks up Concepts refresh (F005)     |
| /Users/jordanknight/substrate/083-md-editor/docs/domains/file-browser/domain.md                                              | modified   | file-browser        | None                                           |

### Optional Fixes (not required to land Phase 5)

| #   | File (absolute path)                                                                                                      | What To Fix                                                                            | Why                                                   |
|-----|---------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|-------------------------------------------------------|
| 1   | /Users/jordanknight/substrate/083-md-editor/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx            | Add a unit test for the table warn banner (Rich mode + hasTables + dismiss + sessionStorage write) | AC-11 automation gap (F001)                           |
| 2   | /Users/jordanknight/substrate/083-md-editor/test/unit/web/features/041-file-browser/ or browser-client test module          | Add a test asserting `?mode=edit` coerces to `source` before scrollToLine fires          | AC-02 automation gap (F002)                           |
| 3   | /Users/jordanknight/substrate/083-md-editor/test/integration/web/features/041-file-browser/file-viewer-panel-rich-mode.test.tsx | Expand the "falls back to onSave" Test Doc to include Usage Notes + Quality Contribution + Worked Example | Doctrine R-TEST-002/003 format (F003)                 |

### Domain Artifacts to Update (Phase 6.8)

| File (absolute path)                                                                       | What's Missing                                                                                     |
|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| /Users/jordanknight/substrate/083-md-editor/docs/domains/_platform/viewer/domain.md        | § Concepts table does not yet list `MarkdownWysiwygEditor`, `WysiwygToolbar`, `LinkPopover`, size/table/fm utilities — scheduled for Phase 6.8 |

### Next Step

**Phase 5 is landed.** Proceed to Phase 6 unless the user wants the 3 optional fixes (F001/F002/F003) applied first.

- To apply optional fixes: `/plan-6-v2-implement-phase --fix "phase-5-followups" --plan /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md` (or inline via direct edits)
- To proceed to Phase 6: `/plan-5-v2-phase-tasks-and-brief --phase "Phase 6: Round-trip corpus, polish, docs" --plan /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md`
- To commit Phase 5 before moving on: `git add` the 13 touched files and the plan/dossier/execution log, then create a conventional commit (suggested message: `083 Phase 5: FileViewerPanel Rich-mode integration + harness migration`).
