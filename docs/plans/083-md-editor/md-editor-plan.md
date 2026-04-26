# WYSIWYG Markdown Editing — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-04-18
**Spec**: [md-editor-spec.md](md-editor-spec.md)
**Research Dossier**: [research-dossier.md](research-dossier.md)
**Workshop**: [workshops/001-editing-experience-and-ui.md](workshops/001-editing-experience-and-ui.md)
**Status**: DRAFT

## Summary

Add a Rich (WYSIWYG) editing mode to `FileViewerPanel` for `.md` files using Tiptap + `@tiptap/markdown`. Typing `# Hello` shows a rendered heading; a toolbar applies Bold/Italic/Strikethrough/H1-H3/Lists/Blockquote/Code/Link; images render inline read-only; YAML front-matter is preserved byte-for-byte. Existing Source (CodeMirror), Preview, and Diff modes remain unchanged. The existing save pipeline (`saveFile` server action + mtime conflict detection) is reused as-is — no server changes. Delivered across 6 phases; CS-3 complexity; workshop-001 is the authoritative UX source of truth.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `file-browser` | existing | **modify** | Extend `ViewerMode` union (`edit` → `source`, add `rich`); add Rich branch to `FileViewerPanel`; migrate URL-state callers; wire file-size gate and table-warn banner |
| `_platform/viewer` | existing | **modify** | Add `MarkdownWysiwygEditor`, `WysiwygToolbar`, `LinkPopover`, and front-matter / table-detection utilities as lazy-loaded client primitives; update `domain.md` to reflect editor ownership |
| `_platform/themes` | existing | **consume** | Use `next-themes` `resolvedTheme` — no changes to the themes domain |

No new domains. No domain-map restructure — new contracts sit inside `_platform/viewer` and are consumed by `file-browser`, matching the existing CodeEditor pattern.

## Harness Strategy

- **Current Maturity**: L3 (Boot + Browser Interaction + Structured Evidence + CLI SDK)
- **Target Maturity**: L3 (no change required — clarification session confirmed sufficiency)
- **Boot Command**: `just harness up` (per `harness/README.md`)
- **Health Check**: `just harness ports` → app port
- **Interaction Model**: Playwright / CDP browser automation
- **Evidence Capture**: JSON responses + screenshots
- **Pre-Phase Validation**: Each phase ends with an observable-outcome check via the harness (toolbar visible, keystroke produces heading, round-trip save succeeds, etc.). Phase 6 includes a Playwright smoke spec.

## Domain Manifest

Every file created or modified by this plan, mapped to its domain and classification.

### New files — `_platform/viewer` (contracts / internal)

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` | `_platform/viewer` | **contract** | Public editor component consumed by `file-browser`. Mirrors `CodeEditor`'s shape: `{ value, onChange, readOnly? }` |
| `apps/web/src/features/_platform/viewer/components/wysiwyg-toolbar.tsx` | `_platform/viewer` | internal | 16-button toolbar, driven by a Tiptap `Editor` instance from the sibling editor |
| `apps/web/src/features/_platform/viewer/components/link-popover.tsx` | `_platform/viewer` | internal | Desktop popover + mobile bottom-sheet for link insertion/edit |
| `apps/web/src/features/_platform/viewer/lib/markdown-frontmatter.ts` | `_platform/viewer` | internal | Pure utility: `splitFrontMatter(md)` / `joinFrontMatter(fm, body)` |
| `apps/web/src/features/_platform/viewer/lib/markdown-has-tables.ts` | `_platform/viewer` | internal | Pure utility: GFM table detection heuristic for warn-banner |
| `apps/web/src/features/_platform/viewer/lib/wysiwyg-extensions.ts` | `_platform/viewer` | internal | Tiptap extension configuration (StarterKit + markdown + placeholder + link + image) |
| `apps/web/src/features/_platform/viewer/lib/constants.ts` | `_platform/viewer` | internal | `RICH_MODE_SIZE_CAP_BYTES = 200_000` |

### Modified files — `file-browser`

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | `file-browser` | internal | Extend `ViewerMode`; add `rich` branch; extend `Cmd+S` handler; wire size gate and table banner |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | **cross-domain** (shared surface, consumer of viewer) | Rename `mode: 'edit'` → `'source'` (8 sites); decide legacy-URL normalization; pass new props |

### Modified files — `_platform/viewer`

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `docs/domains/_platform/viewer/domain.md` | `_platform/viewer` | internal | Align Owns/Contracts/Composition/Source Location with reality (CodeEditor is already here) and add the three new editor components |

### Modified files — infra

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `apps/web/package.json` | (infra) | internal | Add `@tiptap/*` deps: react, pm, starter-kit, markdown, extension-link, extension-placeholder, extension-image |
| `pnpm-lock.yaml` | (infra) | internal | Generated lock update |

### New files — docs

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `docs/how/markdown-wysiwyg.md` | (docs) | internal | User-facing guide: Source vs Rich, shortcuts, round-trip caveats, tables + front-matter behavior |

### New files — tests

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `test/unit/web/features/_platform/viewer/markdown-frontmatter.test.ts` | `_platform/viewer` | test | TDD target in Phase 4 |
| `test/unit/web/features/_platform/viewer/markdown-has-tables.test.ts` | `_platform/viewer` | test | TDD target in Phase 4 |
| `test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx` | `_platform/viewer` | test | Mount smoke + userEvent flows |
| `test/unit/web/features/_platform/viewer/wysiwyg-toolbar.test.tsx` | `_platform/viewer` | test | Active-state / disabled-state / shortcuts |
| `test/unit/web/features/_platform/viewer/link-popover.test.tsx` | `_platform/viewer` | test | URL sanitation, edit/unlink, submit flows |
| `test/unit/web/features/_platform/viewer/roundtrip.test.ts` | `_platform/viewer` | test | Corpus-based round-trip fidelity (AC-08, AC-09, AC-10) |
| `test/integration/web/features/041-file-browser/file-viewer-panel-rich-mode.test.tsx` | `file-browser` | test | Mode switching, `editContent` sync, `Cmd+S` |
| `test/fixtures/markdown/*.md` | (infra) | test | Synthetic edge-case fixtures (malformed front-matter, mixed list markers, long lines) |

## Key Findings

| # | Impact | Finding | Action / Phase |
|---|--------|---------|----------------|
| 01 | Critical | Save pipeline is already plain-text I/O (`saveFile` server action + mtime conflict detection + atomic write). `MarkdownWysiwygEditor` emits a plain markdown string → reuses this unchanged. **Do not touch server code.** | Reuse as-is in Phase 5 integration. Do NOT modify `saveFile`, `saveFileService`, or any file-actions. |
| 02 | Critical | `_platform/viewer/domain.md` still declares "CodeMirror editor: Does NOT Own" (§ Boundary → Does NOT Own), but `CodeEditor` was physically moved there in plan 058. The doc is stale. Adding three new editor components compounds this. | Phase 6 updates `domain.md` to own CodeEditor + WYSIWYG components; fixes the contradiction in one pass. |
| 03 | Critical | Tiptap's markdown extension does NOT understand YAML front-matter. Content must be split before Tiptap parses and rejoined on serialize. A bug here = silent data loss of front-matter. | Phase 4 TDDs `splitFrontMatter` / `joinFrontMatter` with edge cases (missing close fence, `---` inside body, nested code blocks that contain `---`, CRLF line endings, BOM). |
| 04 | High | `browser-client.tsx` has 8+ references to `mode: 'edit'` including URL param handling (`setParams({ mode: 'edit' })`, `fileNav.handleModeChange('edit')`). Bookmarked URLs with `?mode=edit` exist. | Phase 4: rename to `source` at all 8 sites; normalize legacy URLs on page load (`mode === 'edit' ⇒ source`, one-line compat bridge, noted in code as "remove after 1 release"). |
| 05 | High | Constitution §7 bans `vi.mock` / `jest.mock` / `vi.spyOn`. Spec says "mock `saveFile` server action" — must be rephrased as a Fake injection path. | Phase 5 integration tests: make `FileViewerPanel` test-friendly by injecting a `saveFile`-shaped function (constructor/prop or DI); provide a `FakeSaveFile` with `.assertCalledWith(...)`; no mocking library use. |
| 06 | High | Image URL resolution (relative-path rewriting with `rawFileBaseUrl`) already exists inside `markdown-preview.tsx`. If Rich mode renders images, it must reuse this logic — not duplicate it. | Phase 1: extract the image URL resolver to `_platform/viewer/lib/image-url.ts` and refactor `markdown-preview.tsx` to consume it; Rich editor consumes the same utility. |
| 07 | High | Plan 078 added swipe-to-navigate on mobile. Swipe gestures compete with `contenteditable` text-selection drag. Likely needs `data-swipe-ignore` or `stopPropagation` on the editor root. | Phase 6: harness-driven mobile test (375×667 viewport) — attempt selection drag; verify swipe doesn't trigger; patch wrapper if needed. |
| 08 | Medium | Constitution §2 Principle 2 — Interface-First. Every new component and utility defines its prop/function signature before implementation. | Each phase opens with a "define types" task; implementation tasks reference the types. |
| 09 | Medium | `useMarkdownViewerState` hook (`apps/web/src/hooks/useMarkdownViewerState.ts`) belongs to the *older* `MarkdownViewer` component (source/preview toggle at `components/viewers/markdown-viewer.tsx`), NOT to `FileViewerPanel`. Changing it would not help Rich mode. | Phase 4 avoids touching `useMarkdownViewerState`. Mode state for `FileViewerPanel` is owned by `browser-client.tsx` via URL params. |
| 10 | Medium | Tiptap + React 19 + Next.js App Router: requires `immediatelyRender: false` on `useEditor()` to avoid hydration mismatch. Confirmed in external research but must be validated on this specific Next.js version. | Phase 1 final task: `pnpm build` + manual mount test in the harness; smoke check for hydration warnings in console. |
| 11 | Medium | Round-trip fidelity is graded — bit-identical for un-edited files (AC-08), semantic-identical post-edit (AC-09). `MarkdownWysiwygEditor` must short-circuit: if the user never triggers an edit transaction, `onChange` is never fired, so the parent never replaces `editContent`. | Phase 1 editor component: gate `onChange` on `!transaction.docChanged === false`; add a unit test that asserts `onChange` is NOT called when switching away without edits. |
| 12 | Low | Bundle budget is 130 KB gz (raised from 120 KB to absorb image extension). Other extensions (e.g., code-block-lowlight for syntax highlighting in Rich) would blow it. | Phase 6: run `pnpm --filter @chainglass/web analyze`; verify the lazy chunk. Any additions above 130 KB require a scope ticket. |

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|----------------|--------------------|------------|
| 1 | Foundation — Editor component & deps | `_platform/viewer` | Install Tiptap; scaffold `MarkdownWysiwygEditor` as a lazy-loaded client primitive accepting markdown string in/out | None |
| 2 | Toolbar & keyboard shortcuts | `_platform/viewer` | Build 16-button toolbar with active/disabled states and the full shortcut set from workshop § 4 | Phase 1 |
| 3 | Link popover | `_platform/viewer` | Desktop popover + mobile bottom-sheet for insert/edit/unlink, with URL sanitation | Phase 1, 2 |
| 4 | Utilities (TDD) | `_platform/viewer` | TDD the front-matter split/rejoin, table-detection, and file-size gate utilities with full edge-case coverage | Phase 1 |
| 5 | FileViewerPanel integration | `file-browser` | Rename `edit`→`source`, add `rich` branch, migrate callers, wire gate + banner + language pill, extend `Cmd+S` | Phases 1–4 |
| 6 | Round-trip tests, polish, docs, domain.md | `_platform/viewer` + `file-browser` | Corpus round-trip tests, mobile/a11y/error-fallback polish, bundle verification, user guide, domain.md alignment | Phases 1–5 |

Total: 6 phases, no Phase 0 (harness L3 sufficient).

---

### Phase 1: Foundation — Editor Component & Dependencies

**Objective**: Install Tiptap and scaffold a lazy-loaded `MarkdownWysiwygEditor` client component that takes `value: string` / `onChange: (md: string) => void` and renders Tiptap with StarterKit + markdown + placeholder + read-only image extensions.
**Domain**: `_platform/viewer`
**Delivers**:
- Tiptap deps installed and pinned
- `MarkdownWysiwygEditor` client component (no toolbar yet — bare editing area with placeholder)
- Theme sync via `next-themes` → `prose dark:prose-invert`
- Read-only image display using shared URL resolver (Finding 06)
- Front-matter passthrough (bodies only parsed by Tiptap; front-matter rejoined in `onChange`) — uses utilities from Phase 4 (stub for now; full TDD in P4)
- Lazy-loaded via `dynamic({ ssr: false })`
- Types defined first (Finding 08)
**Depends on**: None
**Key risks**: React 19 / App Router hydration (Finding 10); bundle size starts here (Finding 12)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 1.1 | Define `MarkdownWysiwygEditorProps` type and extension-config interface in `_platform/viewer/lib/wysiwyg-extensions.ts` | `_platform/viewer` | Types compile; no implementation yet | Interface-first (Principle 2) |
| 1.2 | Add dependencies to `apps/web/package.json`: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image`. Run `pnpm install`. | (infra) | `pnpm install` succeeds; `pnpm build` succeeds | Pin to versions confirmed working with React 19 |
| 1.3 | Extract image URL resolver from `markdown-preview.tsx` into `_platform/viewer/lib/image-url.ts`; refactor `markdown-preview.tsx` to consume it. Unit-test the extracted utility. | `_platform/viewer` | `markdown-preview.tsx` still passes its existing tests; new utility has its own unit tests | Finding 06 |
| 1.4 | Implement `MarkdownWysiwygEditor` client component (`markdown-wysiwyg-editor.tsx`) with `useEditor({ immediatelyRender: false, extensions: [...] })`, placeholder, image, and theme sync. Value prop initializes via `editor.commands.setContent(parseMarkdown(value))`; onChange fires `serializeToMarkdown(editor)` **only when `transaction.docChanged`**. | `_platform/viewer` | Component mounts; renders an empty paragraph with "Start writing…" placeholder; typing characters emits `onChange`; mounting with same `value` does NOT emit `onChange`; dark mode swaps `prose` class | Finding 11 |
| 1.5 | Create `MarkdownWysiwygEditorLazy` wrapper using `dynamic(() => import(...), { ssr: false })` with CodeMirror-style skeleton fallback. | `_platform/viewer` | Importing the lazy wrapper does not pull Tiptap into the initial bundle (verify via `pnpm analyze`) | Mirrors `code-editor.tsx:50` pattern |
| 1.6 | Smoke-test in the harness: open the app, navigate to a demo surface that mounts `MarkdownWysiwygEditorLazy` with sample markdown containing one image; verify editor renders, image displays, no hydration warnings in console. | `_platform/viewer` | Clean console, image visible, `<p>` + `<img>` nodes present | Finding 10; uses harness L3 Playwright capability |

**Acceptance Criteria (Phase 1)**:
- [ ] Tiptap family installed, production build succeeds
- [ ] `MarkdownWysiwygEditor` mounts in isolation with a provided markdown string
- [ ] Placeholder "Start writing…" visible when `value === ''`
- [ ] Existing markdown images render inline (read-only) via shared URL resolver
- [ ] Dark mode toggles `prose-invert` class correctly
- [ ] Switching `value` prop updates editor content
- [ ] No `onChange` emission without a user transaction
- [ ] No Next.js hydration warnings in browser console

**Risks (Phase 1)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tiptap + React 19 hydration edge case | Medium | Medium | `immediatelyRender: false`; harness smoke in 1.6; fall back to Lexical (Plan B from external research) if unresolvable |
| Shared image URL resolver extraction breaks `MarkdownPreview` | Low | Medium | Refactor under existing test coverage in 1.3; run `pnpm -F web test` before continuing |

---

### Phase 2: Toolbar & Keyboard Shortcuts

**Objective**: Build the `WysiwygToolbar` component with 16 buttons in 5 logical groups, active-state via `editor.isActive()`, disabled-state inside code blocks, and the full keyboard-shortcut set from workshop § 4.
**Domain**: `_platform/viewer`
**Delivers**:
- `WysiwygToolbar` component (stateless, driven by `editor` prop)
- Button component using shadcn `Button` + lucide icons
- Dividers and horizontal overflow wrapper
- Full shortcut coverage (Tiptap defaults + `⌘Alt+C` code block + `⌘K` hook for link)
- A11y: `aria-label`, `aria-pressed`, tooltips with shortcuts
**Depends on**: Phase 1
**Key risks**: Tiptap's `@tiptap/markdown` may not wire all expected keymaps; verify each shortcut manually

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 2.1 | Define `WysiwygToolbarProps` and `ToolbarAction` types; enumerate the 16 buttons in a config array | `_platform/viewer` | Types compile | Interface-first |
| 2.2 | Implement `WysiwygToolbar` rendering the button array with shadcn `Button variant="ghost" size="sm"` + lucide icons; dividers between groups; horizontal overflow wrapper (`overflow-x-auto no-scrollbar`) | `_platform/viewer` | Unit test: all 16 buttons render with correct `aria-label`s | Per workshop § 2.3 |
| 2.3 | Wire active-state: each toggle button subscribes via `editor.on('transaction', …)` (or uses the hook Tiptap provides); renders with `aria-pressed` and `variant="secondary"` when active | `_platform/viewer` | Unit test: setting editor content to `**bold**` and moving caret inside → Bold button reports `aria-pressed="true"` | Workshop § 2.3 |
| 2.4 | Wire disabled-state: when caret is inside a code block, disable `bold`/`italic`/`strike`/`code`/`link`/`h1-3` | `_platform/viewer` | Unit test: caret inside `` ``` `` block → those buttons are `disabled` with `aria-disabled="true"` | Workshop § 2.4 |
| 2.5 | Bind each button's onClick to `editor.chain().focus().<command>().run()` and register the `⌘Alt+C` custom shortcut for code block (Tiptap ships most shortcuts in StarterKit; `⌘K` is handled by the link popover in Phase 3) | `_platform/viewer` | Manual test: every button toggles its format; every shortcut in workshop § 4 produces the expected change | — |
| 2.6 | Add `@tiptap/extension-placeholder` first-paragraph styling to CSS (`is-editor-empty` rule from workshop § 6.2) | `_platform/viewer` | Placeholder visible in empty doc and disappears on first keystroke | — |
| 2.7 | Integration test with the Phase 1 editor: mount editor + toolbar together, simulate keyboard + click events using `userEvent`, assert DOM changes | `_platform/viewer` | `test/unit/web/features/_platform/viewer/wysiwyg-toolbar.test.tsx` green | Constitution: no `vi.mock` |

**Acceptance Criteria (Phase 2)**:
- [ ] All 16 toolbar buttons render and trigger the documented action
- [ ] Active-state reflects current caret context
- [ ] Disabled-state fires correctly in code blocks
- [ ] All keyboard shortcuts from workshop § 4 work (except `⌘K` which is owned by Phase 3)
- [ ] `aria-label`, `aria-pressed`, and `title` (tooltip) attributes set on every button
- [ ] Toolbar horizontally scrolls on narrow viewports

**Risks (Phase 2)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A Tiptap default shortcut collides with the existing `⌘S` capture | Low | Low | Workshop resolved: parent `handleEditModeKeyDownCapture` fires on capture phase before Tiptap sees the event; verify in 2.5 |
| Toolbar re-renders on every keystroke causing perf jank | Low | Low | Tiptap provides `useEditorState()` selector or re-render throttling; measure in 2.7 if perceptible |

---

### Phase 3: Link Popover

**Objective**: Build `LinkPopover` for inserting, editing, and removing links. Desktop uses shadcn `Popover`; narrow viewports (`≤ 768 px`) use shadcn `Drawer` bottom-sheet. `⌘K` opens it; URL is sanitized (javascript: rejected; scheme-less URLs get `https://`).
**Domain**: `_platform/viewer`
**Delivers**:
- `LinkPopover` component with `Text` and `URL` inputs
- Desktop/mobile layout switch
- URL sanitation helper (`sanitizeLinkHref`)
- `⌘K` keyboard binding integrated into the editor's keymap
- Edit vs insert states (caret inside existing link → pre-fill + Unlink button)
**Depends on**: Phases 1, 2
**Key risks**: Mobile keyboard behavior pushing the sheet off-screen

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 3.1 | Define `LinkPopoverProps` type and `SanitizedHref` discriminated union (ok vs rejected reason) | `_platform/viewer` | Types compile | Interface-first |
| 3.2 | Implement `sanitizeLinkHref(raw: string)`: trim; reject `javascript:*`; allow `mailto:`, `http(s):`, `/…`, `#…`, `./…`; else prepend `https://`. TDD (contract tests cover each branch). | `_platform/viewer` | 12+ unit tests, all green | Constitution TDD + fakes-over-mocks |
| 3.3 | Implement `LinkPopover` — desktop `Popover` anchored to caret; mobile `Drawer` bottom-sheet; auto-focus URL field; `Enter` submits; `Esc` closes | `_platform/viewer` | Renders both variants; keyboard submit / cancel wired | Workshop § 5 |
| 3.4 | Wire to toolbar's Link button and to `⌘K` keybinding: extend `@tiptap/extension-link` with a custom keymap handler that opens the popover | `_platform/viewer` | `⌘K` opens the popover; with a selection, the URL field is focused and the selected text pre-fills the Text field | Workshop § 5.1 |
| 3.5 | Edit/Unlink flow: if caret sits inside an existing link, popover pre-fills `Text` and `URL` and shows an `Unlink` button that calls `editor.chain().focus().unsetLink().run()` | `_platform/viewer` | Manual test + userEvent integration test | Workshop § 5.3 |
| 3.6 | A11y: popover focus trap, `role="dialog"`, `aria-label`, inputs labeled | `_platform/viewer` | Keyboard-only flow: Tab traps inside popover; Esc closes and returns focus to toolbar Link button | Workshop § 12 |

**Acceptance Criteria (Phase 3)**:
- [ ] `⌘K` opens popover; typing a URL + Enter inserts a link
- [ ] Scheme-less URL gets `https://` prepended; `javascript:foo` is rejected silently
- [ ] Caret in existing link → popover pre-fills + shows Unlink
- [ ] Mobile viewport renders as bottom-sheet with URL input auto-focused
- [ ] All interactive elements keyboard-reachable

**Risks (Phase 3)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mobile keyboard covers the bottom-sheet | Medium | Low | shadcn `Drawer` handles this; verify on real device in Phase 6 |
| URL sanitation miss allows a dangerous scheme | Low | High | Allow-list rather than deny-list; unit-tested with adversarial inputs |

---

### Phase 4: Utilities (TDD)

**Objective**: Build pure utilities — front-matter split/rejoin, GFM table detection, and file-size gate constants — via strict TDD. Zero UI in this phase.
**Domain**: `_platform/viewer`
**Delivers**:
- `splitFrontMatter(md: string): { frontMatter: string; body: string }`
- `joinFrontMatter(frontMatter: string, body: string): string`
- `hasTables(md: string): boolean` — GFM table syntax detection
- `RICH_MODE_SIZE_CAP_BYTES = 200_000` + helper `exceedsRichSizeCap(content: string)`
- Comprehensive unit test coverage, including edge cases
**Depends on**: Phase 1 (the editor stubs these in P1; they get real implementations here)
**Key risks**: Front-matter edge cases that silently drop data (Finding 03)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 4.1 | Write failing tests for `splitFrontMatter`: happy path; no front-matter; malformed (open without close); `---` inside fenced code in body; CRLF line endings; leading BOM; front-matter-only file; empty file | `_platform/viewer` | Test file exists with 12+ failing cases | RED |
| 4.2 | Implement `splitFrontMatter`: detect leading `/^---\r?\n/`; scan for closing `^---\r?\n` on line boundary, cap search at 500 lines; return body unchanged if no valid close fence | `_platform/viewer` | All tests from 4.1 pass | GREEN |
| 4.3 | Write failing tests for `joinFrontMatter`: empty fm → body unchanged; fm + body → concatenated with single `\n` between close fence and body; round-trip property (`joinFrontMatter(split) === original`) | `_platform/viewer` | Test file covers round-trip property | RED |
| 4.4 | Implement `joinFrontMatter`; verify round-trip property holds via `fc` / `fast-check` property test on a handful of realistic samples | `_platform/viewer` | Property test + unit tests green | GREEN |
| 4.5 | Write failing tests for `hasTables`: true on `\| a \| b \|\n\| - \| - \|`; false on plain text; false on tables inside fenced code; true on table after front-matter | `_platform/viewer` | RED state | — |
| 4.6 | Implement `hasTables` — scan for two consecutive lines matching `/^\s*\|.*\|\s*$/` with the second line being a header-separator row (`|---|---|`) outside fenced code | `_platform/viewer` | All tests green | GREEN |
| 4.7 | Implement `exceedsRichSizeCap(content: string): boolean` returning `Buffer.byteLength(content, 'utf8') > RICH_MODE_SIZE_CAP_BYTES`; trivial unit test | `_platform/viewer` | Unit test green | — |
| 4.8 | Wire utilities into Phase 1's editor component (replace stubs): front-matter split on `setContent`; rejoin on `onChange`; sanity-check no data loss in a round-trip manual test | `_platform/viewer` | Editor now preserves front-matter byte-for-byte across mount/unmount | Finding 03 |

**Acceptance Criteria (Phase 4)**:
- [ ] `splitFrontMatter` round-trips cleanly on all realistic cases
- [ ] `joinFrontMatter(splitFrontMatter(md).frontMatter, splitFrontMatter(md).body) === md` for the corpus files
- [ ] `hasTables` matches GFM tables, ignores tables in fenced code
- [ ] `exceedsRichSizeCap` returns correct boolean for byte-length thresholds
- [ ] All Phase 4 tests green; constitution Test Doc format followed

**Risks (Phase 4)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Exotic front-matter format (YAML with embedded `---`) evades detection | Low | High | Scope search to first 500 lines; scan line-by-line not substring; fuzz with property test |
| `hasTables` false-positive on text with pipe characters | Medium | Low | Require two-row match (table + separator); the banner is dismissible |

---

### Phase 5: FileViewerPanel Integration

**Objective**: Wire the WYSIWYG editor into `FileViewerPanel`: rename `edit` → `source`, add a `rich` mode branch, migrate all callers (TypeScript-enforced), wire the file-size gate and table warn banner, extend `Cmd+S`, and add the read-only code-block language pill.
**Domain**: `file-browser`
**Delivers**:
- Updated `ViewerMode` union and `FileViewerPanel`
- Migrated `browser-client.tsx` callers + URL legacy-mode normalization
- File-size gate disables `Rich` button with tooltip above 200 KB
- Table warn banner rendered on Rich entry if `hasTables(content)`
- Extended `⌘S` handler covers `rich` mode
- Language pill overlay on code blocks in Rich editor
- Integration tests for mode switching and save pipeline (no mocks; Fake save action)
**Depends on**: Phases 1–4
**Key risks**: URL legacy compat; tests needing a non-mocked save path (Finding 05)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 5.1 | Update `ViewerMode` union in `file-viewer-panel.tsx`: `'source' \| 'rich' \| 'preview' \| 'diff'`. Let TypeScript surface all callers. | `file-browser` | `pnpm -F web typecheck` fails at each caller site | Finding 04 |
| 5.2 | Migrate `browser-client.tsx`: 8 occurrences of `'edit'` → `'source'`; update URL param reads to accept `'edit'` as a legacy alias that normalizes to `'source'` with a TODO-remove comment | `file-browser` | `pnpm -F web typecheck` clean; bookmark with `?mode=edit` still loads Source | Finding 04 |
| 5.3 | Add `rich` branch to `FileViewerPanel`'s mode switch: render `<MarkdownWysiwygEditorLazy value={currentContent} onChange={onEditChange} />` inside a flex wrapper, with `<WysiwygToolbar editor={editor} />` above it, inside a scrollable container | `file-browser` | Rich mode renders when selected; editing updates `editContent` via `onEditChange` | Workshop § 15.3 |
| 5.4 | Gate Rich button rendering: show only for `.md` files (`language === 'markdown'`), and disable with tooltip `"File too large for Rich mode — use Source"` when `exceedsRichSizeCap(content)` | `file-browser` | Non-markdown files: no Rich button. Large `.md` file: button visible but disabled; tooltip shows | AC-16a |
| 5.5 | Render table warn banner on Rich mode entry if `hasTables(content)`: dismissible per-file (sessionStorage); above the toolbar; matches existing conflict-banner style | `file-browser` | Opening a table-file in Rich shows banner; clicking × dismisses; re-opening in same session: no banner; closing tab and re-opening: banner returns | AC-11 |
| 5.6 | Extend `handleEditModeKeyDownCapture` guard from `mode !== 'edit'` to `(mode !== 'source' && mode !== 'rich')` | `file-browser` | `⌘S` saves from both Source and Rich modes | Workshop § 4 |
| 5.7 | Add language pill to code blocks in Rich editor via a Tiptap decoration plugin: for each `codeBlock` node with a non-empty `language` attr, insert a read-only `<span>` in the top-right. CSS positions it absolutely. | `_platform/viewer` | Code block with `` ```python `` shows `python` pill; pill is not editable; language attr preserved on save | AC-12 |
| 5.8 | Integration test: mount `FileViewerPanel` with `mode='source'`, switch to `rich`, type `# Heading`, switch back to `source`, assert `editContent` contains `# Heading`. Mode state owned by test wrapper. | `file-browser` | Integration test green; no `vi.mock` / `vi.spyOn` used | Finding 05 |
| 5.9 | Integration test: mount `FileViewerPanel` with a `FakeSaveFile` injected; in Rich mode press `⌘S`; assert `FakeSaveFile.assertCalledWith(content, expectedMtime)`. Requires a test-only prop or DI point on `FileViewerPanel` that defaults to the real `saveFile` action. | `file-browser` | Integration test green | Finding 05; Constitution Principle 4 |
| 5.10 | Update `test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx` for renamed mode; all existing assertions should still pass | `file-browser` | Green | — |
| 5.11 | **Migrate harness smoke off the dev route** (didyouknow #2): port `harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` to drive `FileViewerPanel` at a real `.md` file URL (using the test workspace fixtures already set up for the harness), preserving every Phase 1 + Phase 2 + Phase 3 assertion. **Preserve testids in FileViewerPanel's Rich-mode render path**: `[data-testid="md-wysiwyg-root"]` on the editor wrapper and `[data-testid="toolbar-<id>"]` on each of the 16 toolbar buttons — these are Phase 2 T008's load-bearing selectors (see Phase 2 dossier Forward-Compatibility Matrix). If FileViewerPanel's rendered DOM doesn't already expose them via the composed `MarkdownWysiwygEditor` + `WysiwygToolbar`, add them explicitly. Then **delete** `apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx` (and its route folder). `grep -r "markdown-wysiwyg-smoke"` across the repo should return only the harness spec afterward. | `file-browser` + (harness) | Spec passes against the real file-browser surface using the preserved testids; dev route deleted; `pnpm -F web build` succeeds with no reference to the deleted route | Avoids parallel-surface drift. Testid preservation is the explicit contract that makes the port drop-in rather than a rewrite. |

**Acceptance Criteria (Phase 5)**:
- [ ] `.md` file opens with 4 mode buttons `[Source] [Rich] [Preview] [Diff]`
- [ ] Non-markdown file shows 3 mode buttons (no Rich)
- [ ] Rich button disabled above 200 KB with tooltip
- [ ] Table warn banner shows once per session when opening table files in Rich
- [ ] `⌘S` saves from Rich mode via the existing pipeline
- [ ] Code blocks show a read-only language pill
- [ ] Content sync across Source ↔ Rich preserves edits without saving
- [ ] Legacy `?mode=edit` URL still loads Source (normalization works)
- [ ] Integration tests green (no `vi.mock` usage)

**Risks (Phase 5)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A forgotten caller of `ViewerMode = 'edit'` breaks at runtime despite TypeScript | Very Low | Medium | TypeScript exhaustively covers this; also grep for `'edit'` string literals in `file-browser/**` and `app/**/browser/**` |
| Injecting `saveFile` fake into `FileViewerPanel` without over-engineering | Medium | Low | Keep it small — optional prop `saveFileImpl?: typeof saveFile` defaulting to the real action; used only in tests |
| Language-pill decoration rerenders on every keystroke | Low | Low | Tiptap decoration plugins are efficient; measure once with a 5000-line file |

---

### Phase 6: Round-trip Tests, Polish, Docs, Domain.md

**Objective**: Ship the round-trip test corpus and a Playwright smoke test via the harness; complete accessibility, mobile, and error-fallback polish; verify bundle size; update `_platform/viewer/domain.md`; write the user guide.
**Domain**: `_platform/viewer` + `file-browser` + docs
**Delivers**:
- Round-trip test (AC-08, AC-09, AC-10) against the pinned corpus
- Harness smoke test: open app → file browser → `.md` file → toggle Rich → type → Cmd+S → reload → verify
- Mobile test: toolbar horizontal scroll verified at 375×667; swipe-gesture conflict checked
- Accessibility audit: `aria`, contrast, keyboard-only navigation
- Tiptap-init error fallback UI
- Bundle-size verification (≤ 130 KB gz)
- Updated `docs/domains/_platform/viewer/domain.md`
- `docs/how/markdown-wysiwyg.md` user guide
**Depends on**: Phases 1–5
**Key risks**: Bundle-size overshoot; mobile gesture conflict (Finding 07)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 6.1 | Pin the three corpus files in a test-fixtures module: `docs/plans/083-md-editor/md-editor-spec.md`, an ADR with YAML front-matter (pin the exact path at this time), `docs/plans/083-md-editor/research-dossier.md`. Add 2 synthetic fixtures under `test/fixtures/markdown/`: `tables-only.md`, `frontmatter-weird.md` | (infra) | Files exist; paths exported from a fixtures module | AC-08; spec §§ Clarifications Q9 |
| 6.2 | Write round-trip test `test/unit/web/features/_platform/viewer/roundtrip.test.ts`: for each corpus file, load as string → `splitFrontMatter` → parse via Tiptap → re-serialize → `joinFrontMatter` → assert byte-identity (when no edits). Add a with-edit test: apply one `toggleBold` to a known token, assert diff is exactly `**<token>**` | `_platform/viewer` | Both tests green for all 5 files (3 corpus + 2 synthetic) | AC-08, AC-09, AC-10 |
| 6.3 | Harness Playwright smoke spec: boot app → open a `.md` file → click Rich → type `# Smoke` → press `⌘S` → reload page → verify content still `# Smoke\n…`. Save screenshot evidence. | `file-browser` | `harness` CLI returns exit 0; screenshot attached to phase output | Harness L3 |
| 6.4 | Mobile smoke: set viewport to 375×667 → open a `.md` file → open Rich → scroll toolbar horizontally → verify all 16 buttons reachable; open link popover → verify bottom-sheet layout; attempt text selection → verify selection works without triggering swipe | `file-browser` | Manual + harness; patch `data-swipe-ignore` on editor wrapper if swipe conflict found | Finding 07, AC-14 |
| 6.5 | Accessibility audit using `@axe-core/playwright` (if available) or manual VoiceOver/NVDA pass: tab through toolbar; verify `aria-pressed` state announced; verify color contrast in both themes | `_platform/viewer` | No axe violations at "serious" or higher | AC-17 |
| 6.6 | Tiptap-init error fallback: wrap `useEditor` initialization in try/catch or an error boundary; on failure, render a panel with `"Rich mode couldn't load this file. [Switch to Source mode]"` + error details | `_platform/viewer` | Manually provoke by feeding deliberately malformed markdown; fallback renders; button calls `onModeChange('source')` | AC-18 |
| 6.7 | Bundle-size verification: run `pnpm --filter @chainglass/web analyze` (or equivalent webpack/turbopack analysis); extract the lazy chunk that contains `@tiptap/*`; confirm gzipped size ≤ 130 KB | (infra) | Documented in phase artifacts | AC-16, Finding 12 |
| 6.8 | Update `docs/domains/_platform/viewer/domain.md`: add `MarkdownWysiwygEditor`, `WysiwygToolbar`, `LinkPopover` to Owns; add contracts entry for `MarkdownWysiwygEditor`; add Composition rows; add Source Location rows; **fix the "Does NOT Own: CodeMirror editor" line** since CodeEditor has lived in this domain since Plan 058 | `_platform/viewer` | Doc accurately reflects current code; registry unchanged (same domain) | Finding 02 |
| 6.9 | Write `docs/how/markdown-wysiwyg.md`: Source vs Rich, when to pick each, toolbar summary, keyboard shortcuts, markdown input rules, round-trip caveats, tables + front-matter behavior, the 200 KB cap | (docs) | Doc present; links from spec + domain.md to this guide | Spec § Documentation Strategy |
| 6.10 | Final regression sweep: `just test`, `just typecheck`, `just lint`, `just build` all green | (infra) | Constitution § 3.4 quality gates pass | Definition of Done |

**Acceptance Criteria (Phase 6)**:
- [ ] Round-trip tests green on all 5 fixtures (AC-08, AC-09, AC-10)
- [ ] Harness Playwright smoke passes (AC-03, AC-06 observed end-to-end)
- [ ] Mobile toolbar horizontal scroll verified; swipe conflict resolved or absent
- [ ] Accessibility audit clean (no serious+ violations)
- [ ] Error fallback UI renders on forced failure
- [ ] Lazy bundle ≤ 130 KB gz
- [ ] `_platform/viewer/domain.md` up to date
- [ ] `docs/how/markdown-wysiwyg.md` written and linked
- [ ] `just test` + `just typecheck` + `just lint` + `just build` all green

**Risks (Phase 6)**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundle chunk exceeds 130 KB | Medium | Medium | Drop read-only image extension and defer images to a scope ticket; re-measure |
| Mobile swipe fights contenteditable selection | Medium | Low | `data-swipe-ignore` attribute on wrapper; stopPropagation on touchstart inside editor |
| Corpus files change during implementation and round-trip breaks | Low | Low | Use commit-pinned snapshots of corpus in fixtures rather than live paths if stability is an issue |

---

## Acceptance Criteria (Plan-level — traced to spec)

Every spec-level AC is covered by at least one phase:

- AC-01 availability gating → 5.4
- AC-02 default mode → 5.1, 5.2
- AC-03 markdown input rules → 1.4, 2.5 (StarterKit defaults) + 6.3 smoke
- AC-04 toolbar toggles → 2.2, 2.3, 2.5
- AC-05 keyboard shortcuts → 2.5, 3.4
- AC-06 save pipeline reuse → 5.6, 5.9
- AC-07 cross-mode content sync → 5.3, 5.8
- AC-08 round-trip no edits → 6.2
- AC-09 round-trip with edits → 6.2
- AC-10 front-matter preservation → 4.1–4.4, 6.2
- AC-11 table warn banner → 4.5, 4.6, 5.5
- AC-12 code blocks + language pill → 5.7
- AC-12a image inline display → 1.3, 1.4
- AC-13 link insertion → 3.2–3.5
- AC-14 mobile toolbar → 2.2, 3.3, 6.4
- AC-15 lazy loading → 1.5, 6.7
- AC-16 bundle ≤ 130 KB → 6.7
- AC-16a file-size gate → 4.7, 5.4
- AC-16b placeholder → 1.4, 2.6
- AC-17 accessibility → 2.2 (a11y props), 3.6, 6.5
- AC-18 error fallback → 6.6
- AC-19 AgentEditor unchanged → (no task touches `058-workunit-editor/*`; covered by TypeScript scope)
- AC-20 Source/Preview/Diff regression-free → existing tests continue to pass (5.10); harness smoke in 6.3

## Risks (Plan-level)

Consolidated from phase risks. See each phase for mitigations.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| React 19 / App Router hydration issue with Tiptap | Medium | Medium | Phase 1 smoke; Lexical fallback plan |
| Front-matter edge-case data loss | Low | High | TDD Phase 4 with 12+ cases + property tests |
| Bundle exceeds 130 KB | Medium | Medium | Defer image extension if needed; Phase 6 gate |
| Constitution test-rule violation (mocks) | Low | Medium | Design tests fakes-first from Phase 4 onward |
| Mobile swipe conflict | Medium | Low | `data-swipe-ignore` fallback |
| Stale domain.md increases tech debt | Certainty | Low | Fixed in Task 6.8 |

## Dependencies External to This Plan

- shadcn `Button`, `Popover`, `Drawer` components (present)
- `next-themes` (present)
- `lucide-react` (present)
- Tiptap npm packages (new — Phase 1 Task 1.2)
- No changes required to `packages/shared/` or `apps/cli/`
- No server-side / API / database changes

## Constitution Compliance Summary

| Principle | How this plan complies |
|-----------|------------------------|
| 1. Clean Architecture | Editor is a UI primitive in `_platform/viewer`; consumed by `file-browser`; no reverse dependency |
| 2. Interface-First | Every phase opens with a types-definition task (1.1, 2.1, 3.1, 4.1 via test-first, 5.1 via union edit) |
| 3. TDD | Phase 4 fully test-first; Phase 3 sanitation test-first; Phases 1, 2, 3, 5 have smoke/integration tests |
| 4. Fakes Over Mocks | `FakeSaveFile` in 5.9; no `vi.mock` anywhere; Finding 05 explicit |
| 5. Fast Feedback | All unit tests co-located under `test/unit/`; Vitest parallelism unchanged |
| 6. DX First | No setup changes; `just dev` still boots |
| 7. Shared by Default | All new code is in `apps/web/` because it's UI-specific (SSR-only). Shared types (`ViewerFile`) unchanged. |

## Deviations

None. No deviations from constitution or architecture rules required.

---

**Next steps**: Run **/plan-4-complete-the-plan** to validate readiness.
After validation: **/plan-5-v2-phase-tasks-and-brief** per phase (start with Phase 1).
