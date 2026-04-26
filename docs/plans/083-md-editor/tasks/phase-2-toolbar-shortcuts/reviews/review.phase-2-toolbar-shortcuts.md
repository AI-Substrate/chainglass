# Code Review: Phase 2 — Toolbar & Keyboard Shortcuts

**Plan**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md`
**Spec**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-spec.md`
**Phase**: Phase 2: Toolbar & Keyboard Shortcuts
**Date**: 2026-04-18
**Reviewer**: Automated (plan-7-v2) — 6 parallel subagents
**Testing Approach**: Hybrid (TDD for pure-data + serialization; lightweight for React components; harness smoke for end-to-end)

---

## A) Verdict

**APPROVE WITH NOTES**

Zero HIGH/CRITICAL findings. One Phase 2 LOW finding (test-flush `setTimeout` pattern) plus a handful of Phase-1-scoped or known-deferral notes surfaced. Nothing blocking; Phase 3 can proceed.

**Key failure areas**: _none of blocking severity_
- **Implementation**: ✅ clean — null-handling, hooks, a11y, and Constitution §4/§7 all solid.
- **Domain compliance**: ✅ clean — all 10 checks pass; Concepts doc deferral to Phase 6.8 is explicitly planned.
- **Reinvention**: ✅ clean — no existing WYSIWYG toolbar; SDK command pattern is orthogonal (string when-clauses vs. function predicates).
- **Testing**: ✅ clean — 45/45 unit green; harness desktop+tablet pass; mobile deferred per plan risks; no `vi.mock`/`vi.fn`/`vi.spyOn`.
- **Doctrine**: minor — three of five flagged violations target Phase 1 code not owned by this phase; one LOW `setTimeout` flush in `wysiwyg-toolbar.test.tsx` is the only Phase 2 hit.

## B) Summary

Phase 2 shipped all 8 planned tasks with a clean diff: 4 new files (`wysiwyg-toolbar.tsx`, `wysiwyg-toolbar-config.ts`, and two test files) plus targeted edits to `wysiwyg-extensions.ts` (types + `onEditorReady` prop), `markdown-wysiwyg-editor.tsx` (effect + `md-wysiwyg` class), `globals.css` (scoped placeholder rule), `index.ts` (barrel), and the dev/harness smoke surfaces. Domain placement is correct (`_platform/viewer` intra-domain; no cross-domain imports). The `useEditorState` selector pattern preempts the 16× re-render-per-keystroke risk that didyouknow surfaced. Evidence is strong — 45/45 unit tests pass, harness smoke passes on desktop + tablet with screenshots, and Phase 1 contract (no `onChange` on mount, same-value-remount no-op) is preserved. The `role="toolbar"` + `disabled`-only accessibility pattern (per workshop § 12 correction table) is correctly implemented. Known-deferred items — Concepts table updates to Phase 6.8 and mobile toolbar verification to Phase 6.4 — are explicitly tracked and do not warrant blocking.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present — 10 React-mount + 14 headless markdown serializer cases
- [x] Critical paths covered — render / active-state / disabled-state / click / history / markdown contract
- [x] Key verification points documented — `role="toolbar"`, 16 buttons, Bold+H2 click, `Mod-Alt-C` chord (harness)
- [x] Constitution §4/§7 respected — zero `vi.mock`/`vi.fn`/`vi.spyOn` in Phase 2 test files
- [x] Phase 1 regression-free — 10 Phase 1 editor tests + 11 image-url tests still green
- [x] Harness evidence captured — `harness/results/phase-2/toolbar-{desktop,tablet}.png`
- [x] No `vi.mock`/`vi.fn`/`vi.spyOn` (Constitution §4/§7)

**Universal**
- [x] Only in-scope files changed
- [x] Type checks clean — `pnpm tsc --noEmit` exits 0
- [x] Domain compliance checks pass (9/10 green, 1 ⚠️ known deferral)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | LOW | `test/unit/web/features/_platform/viewer/wysiwyg-toolbar.test.tsx:128` and similar | pattern | Uses `await new Promise((r) => setTimeout(r, 10))` to flush `useEditorState` reactivity instead of Testing Library's `waitFor()`. Functional — tests are green — but a deterministic `waitFor(() => expect(...))` is idiomatic and avoids the fixed-delay smell. | Future cleanup (can be batched with Phase 4 test tooling polish). Not blocking Phase 3. |
| F002 | LOW | `docs/domains/_platform/viewer/domain.md` (Concepts section) | concepts-docs | No formal Concepts table entries added for `WysiwygToolbar` / `MarkdownWysiwygEditor`. Entry in § History correctly documents the deferral to Phase 6.8 per plan Key Finding 02 and task 6.8. | Accept — this is the planned Phase 6.8 consolidation point. |
| F003 | NOTE | Deferred scope | coverage | Mobile toolbar verification skipped in harness spec with `test.skip()` linking to Phase 6.4. Desktop + tablet cover the full assertion matrix; mobile-specific keyboard-chord semantics remain to be validated. | Accept — explicit scope boundary per plan § Phase 6 Risks. |

_Phase-1-scoped findings from Subagent 5 (line-width on pre-existing `markdown-wysiwyg-editor.tsx:70,127`; jsdom-`beforeinput` caveat in an existing Phase 1 test; missing "Quality Contribution" in a Phase 1 Test Doc) are NOT listed above — they belong to Phase 1 and are out-of-scope for this Phase 2 review._

## E) Detailed Findings

### E.1) Implementation Quality

**Subagent 1 verdict**: `[]` — zero issues.

The reviewer confirmed:
- `useEditorState` memoization via flat `active_<id>` / `disabled_<id>` map is correct.
- `editor === null` skeleton render path avoids flicker and never throws.
- `role="toolbar"` + `aria-pressed` + `disabled` (without `aria-disabled`) matches workshop § 12 correction.
- `onEditorReadyRef` mirrors `onChangeRef` correctly — parent re-renders with new callback identity do not re-fire the effect (dep array is `[editor]` only).
- `'use client'` directive on both toolbar and dev route.
- No XSS / unsafe innerHTML; lucide icons render as React components.
- `editor.chain().focus().<cmd>().run()` chaining restores caret in Tiptap's documented manner; jsdom focus replay unreliability is handled by deferring to harness (explicit in test doc).
- Constitution §4/§7 respected — plain callbacks (`const calls: string[] = []`).

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All Phase 2 files under `apps/web/src/features/_platform/viewer/` or supporting infra (tests, dev route, harness, globals.css). |
| Contract-only imports | ✅ | Only `@tiptap/*` (npm), `lucide-react` (npm), `@/components/ui/button` (shadcn shared), `@/lib/utils` (shared). No `@/features/*/internal` bypass. |
| Dependency direction | ✅ | `_platform/viewer` has no business/file-browser imports. Phase 5 will consume in the correct direction (file-browser → _platform/viewer). |
| Domain.md updated | ✅ | `_platform/viewer/domain.md` § History has a Phase 2 entry dated 2026-04-18 describing toolbar + `onEditorReady` + placeholder CSS. |
| Registry current | ✅ | No new domain; registry unchanged (correctly). |
| No orphan files | ✅ | All changed files map to `_platform/viewer` (primary), infra (globals.css, dev route, harness), or tests (co-located). |
| Map nodes current | ✅ | No new exported contracts added in Phase 2; `WysiwygToolbar` is intra-domain internal until Phase 5 wires it into `FileViewerPanel`. |
| Map edges current | ✅ | No new cross-domain edges — entirely intra-domain work. |
| No circular business deps | ✅ | Zero cycles. `_platform/viewer` is an infrastructure leaf. |
| Concepts documented | ⚠️ | Planned deferral to Phase 6.8 (per plan Key Finding 02 + task 6.8). Current History entry acknowledges this. Not a violation. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| WYSIWYG formatting toolbar (`WysiwygToolbar`) | None — existing toolbars (FileViewerPanel mode toggles, TerminalModifierToolbar) are UI-control not content-formatting oriented | N/A | proceed |
| Toolbar action config with `isActive`/`isDisabled` predicates | SDK has `SDKCommand.when?: string` (context-key expressions) — orthogonal: string when-clauses vs. function predicates; SDK-global vs. Tiptap-local | `_platform/sdk` (unrelated) | proceed |
| Tiptap `useEditorState` usage | None — first use in codebase | N/A | proceed |

No genuine duplication detected.

### E.4) Testing & Evidence

**Coverage confidence**: 92%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-04-1: All 16 toolbar buttons render + trigger | 95% | `wysiwyg-toolbar.test.tsx:60–78` (16 buttons + `role="toolbar"`) + 14 headless markdown serialization cases + harness Bold/H2 click |
| AC-04-2: Active-state reflects caret context | 90% | `wysiwyg-toolbar.test.tsx:111–134` — `toggleBold()` → `aria-pressed="true"`; `useEditorState` selector memoized |
| AC-04-3: Disabled-state in code blocks | 95% | `wysiwyg-toolbar.test.tsx:136–163` — all 8 workshop § 2.4 buttons disabled inside ``` block |
| AC-05: Keyboard shortcuts (ex. ⌘K) | 88% | StarterKit defaults baked into config + source-truth validated; harness verifies `Mod-Alt-C` → `<pre><code>`; remaining shortcuts exercised via `action.run()` serializer tests |
| AC-17: `aria-label` / `aria-pressed` / `title` | 92% | `wysiwyg-toolbar.test.tsx:94–107` + structural assertions over all 16 actions |
| AC-14: Horizontal scroll on narrow viewports | 75% | `overflow-x-auto no-scrollbar` shipped; harness runs desktop + tablet; mobile deferred Phase 6.4 |
| AC-16b: Placeholder visually present | 85% | T006 scoped CSS + `md-wysiwyg` class on wrapper + Phase 1 placeholder extension; harness screenshot captures |
| Constitution §4/§7 | 100% | Zero `vi.mock`/`vi.fn`/`vi.spyOn` grep hits |
| No Phase 1 regressions | 98% | 21 Phase 1 tests still green; harness Phase 1 assertions preserved verbatim |

### E.5) Doctrine Compliance

Five findings from Subagent 5. Phase-2-applicable:

- **F001 (LOW)** — `wysiwyg-toolbar.test.tsx:128` and similar locations use `setTimeout(r, 10)` to flush state. Functional and green; idiomatic replacement is `waitFor(() => expect(...))`. Not blocking.

Phase-1-scoped (outside this review's scope; informational only):
- `markdown-wysiwyg-editor.tsx:70, 127` — line-width lint; Phase 1 code.
- `markdown-wysiwyg-editor.test.tsx:38, 122` — Test Doc "Quality Contribution" phrasing; Phase 1 tests.

**Strengths** called out:
- ✅ Interface-first (T001 types before T003 implementation).
- ✅ Fakes over mocks.
- ✅ kebab-case filenames, PascalCase components.
- ✅ Barrel exports with `export type`.
- ✅ A11y per workshop § 12 correction.

### E.6) Harness Live Validation

**Harness status**: HEALTHY

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC-Phase2-1 | Button count assertion | PASS | `expect(buttons).toHaveCount(16)` green on desktop + tablet |
| AC-Phase2-2 | Bold click → `<strong>` | PASS | DOM mutation verified |
| AC-Phase2-4 | `Mod-Alt-C` chord | PASS | `<pre><code>` appears on desktop + tablet |
| AC-Phase2-5 | `role="toolbar"` selector | PASS | Attribute verified |
| AC-Phase2-6 | Horizontal scroll | PASS (partial) | Desktop + tablet pass; mobile skipped (Phase 6.4) |
| Phase 1 preserved | h1 / img resolver / hydration | PASS | Verbatim Phase 1 assertions still green |
| Mobile deferral | `test.skip()` | SKIP | Explicit skip with Phase 6.4 reason |

**Runtime**: 4.0s total (1.2s desktop + 1.1s tablet + skip).
**Screenshots**: `toolbar-desktop.png` (24K), `toolbar-tablet.png` (22K) persisted to `harness/results/phase-2/`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-04 | Toolbar renders + toggles + active-state | 14 React-mount cases + 14 markdown serializer cases + harness Bold/H2 click | 92% |
| AC-05 | Keyboard shortcuts work (except ⌘K) | StarterKit defaults confirmed in source; harness Mod-Alt-C PASS; remaining shortcuts covered by action-runner tests | 88% |
| AC-14 | Toolbar horizontal scroll | `overflow-x-auto no-scrollbar`; harness desktop + tablet confirm; mobile → Phase 6.4 | 75% |
| AC-16b | Placeholder visible on empty doc | Scoped CSS rule + `md-wysiwyg` class + Phase 1 placeholder extension; harness screenshot | 85% |
| AC-17 | `aria-*` + `title` attrs on every button | Explicit assertions in `wysiwyg-toolbar.test.tsx` | 92% |

**Overall coverage confidence**: 92%

## G) Commands Executed

```bash
# Diff / file manifest
git status --short
git log --oneline -15
git diff HEAD -- apps/web/app/globals.css apps/web/src/features/_platform/viewer/index.ts \
                   docs/domains/_platform/viewer/domain.md

# Harness live validation (via Subagent 6)
just harness-health
cd harness && just playwright tests/smoke/markdown-wysiwyg-smoke.spec.ts
ls -la harness/results/phase-2/

# Type + unit validation (cross-referenced from execution log)
pnpm tsc --noEmit   # exit 0
pnpm exec vitest run test/unit/web/features/_platform/viewer/   # 45/45 pass
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md`
**Spec**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-spec.md`
**Phase**: Phase 2: Toolbar & Keyboard Shortcuts
**Tasks dossier**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-2-toolbar-shortcuts/tasks.md`
**Execution log**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-2-toolbar-shortcuts/execution.log.md`
**Review file**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-2-toolbar-shortcuts/reviews/review.phase-2-toolbar-shortcuts.md`
**Computed diff**: `/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/tasks/phase-2-toolbar-shortcuts/reviews/_computed.diff`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/components/wysiwyg-toolbar.tsx` | NEW | `_platform/viewer` | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/lib/wysiwyg-toolbar-config.ts` | NEW | `_platform/viewer` | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/lib/wysiwyg-extensions.ts` | MODIFIED | `_platform/viewer` | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` | MODIFIED | `_platform/viewer` | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/src/features/_platform/viewer/index.ts` | MODIFIED | `_platform/viewer` | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/app/globals.css` | MODIFIED | (infra) | None |
| `/Users/jordanknight/substrate/083-md-editor/apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx` | MODIFIED | (dev) | Scheduled for deletion at Phase 5.11 |
| `/Users/jordanknight/substrate/083-md-editor/harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` | MODIFIED | (harness) | Migrate to FileViewerPanel in Phase 5.11 |
| `/Users/jordanknight/substrate/083-md-editor/test/unit/web/features/_platform/viewer/wysiwyg-toolbar.test.tsx` | NEW | `_platform/viewer` (test) | Optional: swap `setTimeout` flush for `waitFor()` |
| `/Users/jordanknight/substrate/083-md-editor/test/unit/web/features/_platform/viewer/wysiwyg-toolbar.markdown.test.ts` | NEW | `_platform/viewer` (test) | None |
| `/Users/jordanknight/substrate/083-md-editor/test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx` | MODIFIED | `_platform/viewer` (test) | None |
| `/Users/jordanknight/substrate/083-md-editor/docs/domains/_platform/viewer/domain.md` | MODIFIED | `_platform/viewer` (doc) | Concepts table update deferred to Phase 6.8 |

### Required Fixes (if REQUEST_CHANGES)

_N/A — verdict is APPROVE WITH NOTES; no fixes required to proceed._

### Optional / Future Cleanup

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `test/unit/web/features/_platform/viewer/wysiwyg-toolbar.test.tsx` | Replace `await new Promise((r) => setTimeout(r, 10))` with `waitFor(() => expect(...))` from `@testing-library/react` | Deterministic flush instead of fixed delay; avoids eventual CI flakes on slower runners. LOW — tests are green today. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/substrate/083-md-editor/docs/domains/_platform/viewer/domain.md` | Concepts table rows for `MarkdownWysiwygEditor` and `WysiwygToolbar` — **explicitly deferred to Phase 6.8 per plan Key Finding 02 + task 6.8**. No action in Phase 2. |

### Next Step

Proceed to Phase 3:

```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 3: Link Popover" --plan /Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md
```

Consumer contracts unlocked by Phase 2 for Phase 3:
- `onOpenLinkDialog?: () => void` stub callback on the Link action — Phase 3 replaces it.
- `Link.configure({ openOnClick: false, autolink: false })` from Phase 1 — Phase 3 extends via `.extend({ addKeyboardShortcuts() })` (Tiptap `.extend()` composes with `.configure()`; documented in Phase 2 Contract Risks).
- `WysiwygToolbarProps` is stable; Phase 3 will not need to modify the toolbar's public API.

If you'd like to commit Phase 2 work first, the suggested commit message:

```
083-md-editor Phase 2: WYSIWYG toolbar + keyboard shortcuts

- Add WysiwygToolbar (16 buttons in 5 groups) with useEditorState selector
- Add additive onEditorReady callback to Phase 1 MarkdownWysiwygEditor
- Ship scoped .md-wysiwyg placeholder CSS
- Extend dev smoke route + harness spec; 45/45 unit tests green;
  harness desktop+tablet pass; mobile deferred to Phase 6.4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
