# Flight Plan: WYSIWYG Markdown Editing

**Plan**: [md-editor-spec.md](md-editor-spec.md)
**Research**: [research-dossier.md](research-dossier.md)
**Workshop**: [workshops/001-editing-experience-and-ui.md](workshops/001-editing-experience-and-ui.md)
**Generated**: 2026-04-18
**Status**: **Ready** (spec clarified; implementation plan drafted; ready for `/plan-4-complete-the-plan` validation)

**Plan**: [md-editor-plan.md](md-editor-plan.md)

---

## Mission Summary

Add a Rich (WYSIWYG) editing mode to `FileViewerPanel` for `.md` files using **Tiptap + `@tiptap/markdown`**. Users type `# Hello` and see a heading; a 16-button toolbar applies H1/H2/H3, Bold, Italic, Strikethrough, inline code, lists, blockquote, code block, HR, link, and undo/redo. Source, Rich, Preview, and Diff modes share one in-memory markdown string. The existing save pipeline — mtime conflict detection, atomic write, externally-changed banner — is reused unchanged.

**Complexity**: CS-3 (medium) — S=1, I=1, D=1, N=0, F=1, T=1. Confidence 0.80.

## Before → After

### Before

```
FileViewerPanel modes: [Save] [Edit] [Preview] [Diff]
  Edit mode → <CodeEditor> (CodeMirror 6)

_platform/viewer/components/
  code-editor.tsx           ← CodeMirror 6 wrapper

file-browser/components/
  file-viewer-panel.tsx     ← mode switcher
  markdown-preview.tsx      ← server-rendered preview
```

### After

```
FileViewerPanel modes: [Save] [Source] [Rich *.md only] [Preview] [Diff]
  Source mode → <CodeEditor>                    (unchanged, renamed from Edit)
  Rich mode   → <MarkdownWysiwygEditor>         (new, lazy-loaded Tiptap)

_platform/viewer/components/
  code-editor.tsx                      ← unchanged
  markdown-wysiwyg-editor.tsx          ← NEW (Tiptap + markdown + placeholder + link extensions)
  markdown-wysiwyg-toolbar.tsx         ← NEW (16 buttons, 5 groups, active-state)
  link-popover.tsx                     ← NEW (desktop popover + mobile bottom-sheet)

file-browser/components/
  file-viewer-panel.tsx     ← ViewerMode union extended; rich branch added; Cmd+S handler extended
  markdown-preview.tsx      ← unchanged
```

## Phases (Indicative — architect will refine)

- [x] **Phase 1 — Foundation** (2026-04-18): Tiptap 2.27 + tiptap-markdown installed; `MarkdownWysiwygEditor` + lazy wrapper shipped; shared `resolveImageUrl` extracted to `_platform/viewer/lib/`; 20 unit tests + 1 harness smoke green. [Dossier](tasks/phase-1-foundation/tasks.md).
- [x] **Phase 2 — Toolbar & shortcuts** (2026-04-18): `WysiwygToolbar` (5 groups / 16 actions) shipped with `useEditorState` selector, `role="toolbar"` + a11y, scoped placeholder CSS, and additive `onEditorReady` on Phase 1 editor. 45/45 unit tests pass; harness smoke green on desktop + tablet. [Dossier](tasks/phase-2-toolbar-shortcuts/tasks.md).
- [x] **Phase 3 — Link popover** (2026-04-19): `LinkPopover` (desktop Popover + mobile Sheet, PopoverAnchor virtualRef); `sanitizeLinkHref` allow-list with `%XX`/fullwidth-Unicode guards; `Mod-k` keybinding via Tiptap Link extension + `isAllowedUri` defense-in-depth; 87/87 unit tests pass; harness smoke green on desktop + tablet. [Dossier](tasks/phase-3-link-popover/tasks.md).
- [x] **Phase 4 — Utilities (TDD)** (2026-04-19): Three pure utilities — `splitFrontMatter`/`joinFrontMatter` (YAML codec with BOM+CRLF, setext-safe, forward+reverse round-trip invariant); `hasTables` (GFM detector with fence-type pairing); `exceedsRichSizeCap` + `RICH_MODE_SIZE_CAP_BYTES`. Editor stubs replaced with real codec + lifecycle-safety test. 148/148 unit tests pass (59 new); harness smoke green with fm-round-trip assertions on desktop + tablet. [Dossier](tasks/phase-4-utilities/tasks.md).
- [x] **Phase 5 — FileViewerPanel integration** (2026-04-19): `ViewerMode` renamed `edit → source` + `rich` added; params literal extended with `'edit'` legacy alias + `useEffect` coercion in `browser-client.tsx`; Rich branch composes `MarkdownWysiwygEditorLazy` + `WysiwygToolbar` + `LinkPopover` inside a single `.md-wysiwyg-editor-mount` wrapper (Phase 6.6 boundary + Phase 6.2 `data-emitted-markdown` affordance); `ModeButton` extended with `disabled?` + `title?`; size-cap gate (200 KB soft cap), markdown-only visibility gate, table warn banner (sessionStorage-dismissible with quota/security try/catch), Cmd+S handler widened for both editable modes, unified `performSave` helper + optional `saveFileImpl?` DI prop (backward-compat); Tiptap `CodeBlockLanguagePill` widget-decoration extension (internal to viewer, widget placed as descendant of `<pre>` with `side:-1`, CSS positioning scoped to `.md-wysiwyg`). Tests: 22 unit + 5 integration green (integration uses `FakeSaveFile` class + real Tiptap, zero `vi.mock` on business logic); harness smoke rewritten onto real file-browser surface (desktop + tablet green, 6.2s/6.3s); dev `/dev/markdown-wysiwyg-smoke` route deleted. [Dossier](tasks/phase-5-fileviewerpanel-integration/tasks.md).
- [ ] **Phase 6 — Round-trip corpus, polish, docs**: pinned corpus round-trip tests (AC-08/09/10); mobile toolbar scroll + a11y audit; Tiptap-init error fallback; bundle-size verification (≤ 130 KB gz); `docs/how/markdown-wysiwyg.md` user guide; domain.md final alignment.

## Key Constraints

- **Additive change**: Source mode must remain at parity — no regression in CodeMirror editing or non-markdown files.
- **No server changes**: Tiptap emits plain markdown; the existing `saveFile()` server action and mtime conflict pipeline is unchanged.
- **Front-matter byte-preserved**: YAML front-matter at the top of a file is split before Tiptap sees it and rejoined on save.
- **Bundle target**: Rich bundle ≤ 130 KB gzipped (raised from 120 KB to absorb read-only image extension), lazy-loaded; zero cost if the user never opens Rich mode.
- **Round-trip semantic equivalence**: Source → Rich → Source is lossless for MVP syntax. Normalizations (e.g., setext → ATX headings, `__bold__` → `**bold**`) are documented and acceptable.
- **No `AgentEditor` changes**: plan 058's prompt editor stays on CodeMirror — template variables don't belong in WYSIWYG.

## Validation (early smoke tests)

```bash
pnpm install                      # pull Tiptap family
pnpm build                         # production build succeeds, App Router happy
pnpm --filter @chainglass/web analyze  # bundle size of rich chunk ≤ 120 KB gz
```

- Manual: open a `.md` file → toggle Rich → type `# Heading` → observe rendered H1 → toggle Source → observe `# Heading` text → save → re-open → confirm identical.
- Automated: round-trip test suite against the three corpus files.

## Open Questions

All 6 open questions resolved in `/plan-2-v2-clarify` (2026-04-18):

1. Images — **display only** (inline, read-only; no upload)
2. Tables — **warn banner, no hard lock**
3. Placeholder — **generic "Start writing…"**
4. File-size gate — **200 KB soft cap** (button disabled with tooltip above)
5. Language pill — **show read-only pill** on code blocks
6. Round-trip corpus — **plan spec + ADR (with front-matter) + research dossier**

See spec `## Clarifications → Session 2026-04-18` for full rationale.

## Status Transitions

| Status | Trigger | Next |
|---|---|---|
| Specifying | Spec drafted, workshop 001 complete, research dossier complete | → Clarifying |
| Clarifying | `/plan-2-v2-clarify` resolved 8 questions | → Architecting |
| Architecting | `/plan-3-v2-architect` produced 6-phase plan with 55 tasks | → Ready |
| **Ready** (current) | Plan drafted, traced to all 20+ ACs, constitution-compliant | → Validated |
| Validated | `/plan-4-complete-the-plan` gates pass | → In-Flight |
| In-Flight | Phases executing via `/plan-6` | → Review |
| Review | `/plan-7-code-review` per phase | → Complete |
