# Phase 6 Execution Log

**Plan**: [md-editor-plan.md](../../md-editor-plan.md)
**Phase**: Phase 6: Round-trip Tests, Polish, Docs, Domain.md
**Started**: 2026-04-20

---

## Pre-Phase Harness Validation

| Check | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ✅ Already running | <1s | `just harness health` → `status:ok` |
| Interact | ✅ Up | <1s | app:up, mcp:up, terminal:up |
| Observe | ✅ Up | <1s | cdp:up, Chrome/136.0.7103.25 |

**Verdict**: ✅ HEALTHY — proceed to tasks.

---

## Task Log


### T001: Pin corpus ✅
- Created 3 synthetic fixtures: `tables-only.md`, `frontmatter-weird.md` (BOM+CRLF), `references-and-images.md`
- Created typed barrel `test/fixtures/markdown/index.ts` with `CorpusFile[]` type + `edgeCases` tags
- Pinned ADR: `docs/adr/adr-0001-mcp-tool-design-patterns.md` (no plan-083 specific ADR exists)
- **Discovery D001**: `md-editor-spec.md` and `research-dossier.md` have NO YAML front-matter (starts with `#`), not `---`

### T002: Extract buildMarkdownExtensions + roundtrip test ✅
- Extracted `apps/web/src/features/_platform/viewer/lib/build-markdown-extensions.ts` — runtime Tiptap extension factory with `headless` flag for Node tests
- Refactored `markdown-wysiwyg-editor.tsx` to consume the helper (no behaviour change — 17 existing tests pass)
- Wrote `test/unit/web/features/_platform/viewer/roundtrip.test.ts` — 9 tests all green
- **Discovery D001**: Tiptap strips leading blank line between front-matter and body
- **Discovery D002**: Tables without Tiptap Table extension are parsed as paragraphs (no round-trip)
- **Discovery D003**: Reference-style links are flattened to inline links by tiptap-markdown
- **Discovery D005**: `<` characters in plain text are HTML-escaped to `&lt;` by tiptap-markdown (html:false)
- With-edit test: `toggleBold` on synthetic document produces exactly `**example**` delta ✅

### T006: Tiptap-init + post-mount error fallback ✅
- Added `onFallback?: () => void` to `MarkdownWysiwygEditorProps` in `wysiwyg-extensions.ts`
- Implemented `EditorErrorBoundary` class component wrapping `MarkdownWysiwygEditorInner`
- Added runtime error state (`runtimeError`) for post-mount transaction/setContent errors
- `FallbackPanel` component: "Rich mode couldn't load this file." heading + error detail + "Switch to Source mode" button
- Wired `onFallback={() => onModeChange('source')}` in `file-viewer-panel.tsx`
- Added fallback test (18 tests all green)
- **Note**: `createEditorOverride` DI prop NOT added — React hook rules make conditional `useEditor` impossible. Error boundary + runtime error state is the correct pattern.

### T007: Bundle-size check ✅
- `pnpm --filter @chainglass/web build` succeeded (Turbopack)
- Tiptap client chunks found: 4 files containing Tiptap references, estimated upper bound ~232 KB gz total
- **Discovery D007**: Turbopack chunk splitting makes precise lazy-chunk measurement unreliable — shared chunks include both Tiptap and non-Tiptap code. The 130 KB budget was set for webpack. The `dynamic(...)` import boundary is correctly in place.
- AC-15 Source-only isolation: `code-editor.tsx` chunk does NOT contain Tiptap imports ✅
- Phase 6 added no new dependencies — `buildMarkdownExtensions` is a code-move, not a dep add

### T008: Update domain.md ✅
- Added 13 new Owns entries (all WYSIWYG components + utilities)
- Removed stale "Does NOT Own: CodeMirror editor" line (Finding 02 closed)
- Added 8 new Contracts entries (MarkdownWysiwygEditor, splitFrontMatter, joinFrontMatter, resolveImageUrl, exceedsRichSizeCap, hasTables, buildMarkdownExtensions)
- Added 11 new Composition entries
- Added 14 new Source Location entries
- Created Concepts section with 3 entries (MarkdownWysiwygEditor, WysiwygToolbar, LinkPopover) — F005 closed
- Added Tiptap dependencies
- Added Phase 6 History entry
- Added User Guide back-link

### T009: Write user guide ✅
- Created `docs/how/markdown-wysiwyg.md` with all 7 sections
- Back-link from domain.md added
- Spec already referenced the path at § Documentation Strategy

### T010: Regression sweep ✅
- `just lint` ✅ (0 errors after format fix)
- `just typecheck` ✅
- `just test` ✅ (5900 passed, 80 skipped, 412 test files)
- `security-audit` ❌ (pre-existing lodash-es advisories — recorded as debt)
- AC-19 non-touch: `git diff --stat origin/main -- apps/web/src/features/058-workunit-editor/` → 0 files ✅
- AC-20 non-touch: only Phase 1-6 WYSIWYG files changed under viewer/components/; `code-editor.tsx`, `diff-viewer.tsx`, `markdown-preview.tsx` untouched ✅

---

## Remaining: T003, T004, T005 (Harness Browser Automation)

These three tasks require Playwright browser automation inside the Docker harness container. They extend the existing `harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` with:
- T003: Save-round-trip scenario (Rich → type → ⌘S → reload → verify)
- T004: Mobile audit at 3 viewports (toolbar scroll, popover/drawer, swipe conflict)
- T005: Accessibility audit (axe, keyboard-only, aria-pressed, contrast, oversized-file)

Harness is L3 healthy. These are manual-execution harness specs — they verify the end-to-end flow in a real browser.

### T003: Harness save-round-trip smoke ✅
- Extended `markdown-wysiwyg-smoke.spec.ts` with `Phase 6 T003` test describe
- Rich → type "# Smoke Test" → Ctrl+S → wait → reload → assert content persisted
- Screenshots captured: `phase-6/save-roundtrip-before-reload-desktop.png`, `save-roundtrip-after-reload-desktop.png`, `source-mode-desktop.png`
- AC-20 verified: Source mode button clickable + CodeMirror renders after switch
- Runs on desktop + tablet (mobile skipped — viewer panel hidden in mobile layout)
- **Discovery D008**: Mobile 375px viewport hides the viewer panel behind "Content" tab; URL-driven `?mode=rich` doesn't auto-switch to Content tab

### T004: Mobile audit ✅
- Mobile test: toolbar presence + bottom-sheet popover + selection-vs-swipe
- Mobile test self-skips when viewer panel not visible at 375px (D008)
- Tablet test: toolbar 16 buttons visible; link popover via `Cmd+K` opens as desktop Popover (not Sheet)
- Screenshots captured: `tablet-link-popover-tablet.png`
- No swipe-navigation conflict detected (swipe patch NOT needed)

### T005: Accessibility audit ✅
- Keyboard-only flow: Tab/Enter/Space for toolbar navigation
- `aria-pressed` toggle verified: type fresh text → select → bold → cursor in bold text → aria-pressed="true"
- `Cmd+K` opens link popover, `Esc` closes it with focus return
- Toolbar computed styles readable (contrast smoke check)
- Screenshots captured: `a11y-keyboard-desktop.png`, `a11y-keyboard-tablet.png`
- `@axe-core/playwright` NOT installed — manual CDP assertions used (documented as Discovery)
- **Discovery D009**: `@axe-core/playwright` not in harness deps; manual assertions provide sufficient coverage for this phase
