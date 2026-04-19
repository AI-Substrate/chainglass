# WYSIWYG Markdown Editing

**Mode**: Full

📚 This specification incorporates findings from [research-dossier.md](research-dossier.md), external research [wysiwyg-markdown-libraries.md](external-research/wysiwyg-markdown-libraries.md), and workshop [001-editing-experience-and-ui.md](workshops/001-editing-experience-and-ui.md).

## Research Context

The app already renders markdown beautifully in a Preview pane (server-rendered via `react-markdown` + `remark-gfm` + Shiki + Mermaid) and lets users edit the raw source in a CodeMirror-based editor. Two surfaces edit `.md` content today: `FileViewerPanel` (file browser) and `AgentEditor` (plan 058, agent prompts). The research dossier picked **Tiptap + `@tiptap/markdown`** as the WYSIWYG library — ProseMirror foundation, ~80–90 KB gz lazy-loaded, clean round-trip via per-extension render handlers, headless toolbar that fits the existing shadcn/Tailwind aesthetic. Alternatives (Milkdown, BlockNote, MDXEditor, Lexical, CodeMirror live-preview) were evaluated and rejected for specific reasons (React 19/StrictMode incompatibility, bundle size, semantic-model fragility). Workshop 001 took that library decision and specified the entire end-user experience: a four-mode toggle (`Source / Rich / Preview / Diff`), a 16-button toolbar, 13 markdown input rules, full keyboard shortcut set, front-matter preservation, mobile adaptation, round-trip fidelity rules, and a test corpus.

## Summary

**WHAT**: Add a "Rich" editing mode to `FileViewerPanel` that edits markdown *as rendered text* — typing `# Hello` immediately shows a heading, selections can be toggled Bold/Italic/Strikethrough/etc. via a toolbar, and content saves back as plain markdown through the existing save pipeline. Source, Rich, Preview, and Diff modes all share one in-memory markdown string so users can switch freely.

**WHY**: Editing `.md` files today requires knowing markdown syntax. That's fine for power users but creates friction for everyone else — writing notes, drafting plan specs, editing READMEs all feel unnecessarily technical. A WYSIWYG mode removes that friction without removing the Source escape hatch. Preview mode already proves users want rendered output; Rich mode lets them edit *in* that output. This is the kind of polish that separates "a tool devs tolerate" from "a tool devs enjoy."

## Goals

- Users editing a `.md` file can toggle into a Rich mode where typing and formatting behave like a document editor (Google Docs / Notion feel).
- Typing markdown shortcuts (`# `, `**bold**`, `- `, etc.) auto-renders the corresponding rich element inline — no preview pane needed.
- A toolbar above the editor lets users apply headings (H1–H3), Bold, Italic, Strikethrough, Inline code, Lists (bulleted / ordered), Blockquote, Code block, Horizontal rule, Link, Undo, Redo — using either mouse or keyboard shortcuts.
- Saving from Rich mode produces clean, valid markdown that can be opened in Source mode and re-opened in Rich mode without corruption.
- Existing markdown image links (`![alt](url)`) render inline as read-only images in Rich mode so users can *see* the document as it will look in Preview.
- Fenced code blocks in Rich mode show a small read-only language label (e.g. `python`, `bash`) so the authored language is visible at a glance.
- Existing Source editing continues to work unchanged for users who prefer it (including for non-markdown files where Rich is not offered).
- YAML front-matter at the top of files is preserved byte-for-byte across mode switches.
- The Rich mode is lazy-loaded — users who never use it pay zero bundle cost.

## Non-Goals

- Image **upload**, drag-drop, or paste to upload. (Images from existing `![alt](url)` markdown DO render inline — see Goals — but dragging or pasting an image file to embed new images is out of scope; use Source mode and reference a URL.)
- Table editing with row/column controls. Tables in source are preserved but users are warned that Rich mode may reformat them.
- Footnotes, definition lists, and other GFM-plus extensions beyond the core set.
- Collaborative / multi-user editing or annotation overlays.
- Syntax-highlighted code blocks inside Rich mode (Shiki stays server-side in Preview only).
- Live Mermaid diagram rendering inside the editor (only in Preview).
- Rich mode for `AgentEditor` (agent prompts contain template variables `{{var}}` that WYSIWYG would obscure).
- Spell check beyond browser defaults.
- Custom / user-extensible syntax (no plugin system exposed to users).
- Find-and-replace, full document outline, AI rewriting, export-to-PDF/Word — all out of scope.
- Per-user "default to Rich mode" preference. Rich is always opt-in on a per-file basis for v1.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `file-browser` | existing | **modify** | Extend `ViewerMode` union (`edit` → `source`, add `rich`); add Rich branch to `FileViewerPanel`; update all callers of the renamed mode; preserve existing save, conflict, and externally-changed pipelines. |
| `_platform/viewer` | existing | **modify** | Add `MarkdownWysiwygEditor`, `WysiwygToolbar`, and `LinkPopover` as lazy-loaded client components alongside the existing `CodeEditor`. |
| `_platform/themes` | existing | **consume** | Use `next-themes` `resolvedTheme` to toggle the editor's `prose` / `prose-invert` class. No changes to the themes domain. |

No new domains are needed. `_platform/viewer` already hosts shared editor infrastructure (`CodeEditor` was extracted there in plan 058); Rich mode fits cleanly alongside it. `file-browser` already owns all mode switching in `FileViewerPanel` — Rich becomes a fourth mode.

### Domain Map Impact

- **New contract**: `_platform/viewer` exposes `MarkdownWysiwygEditor` as a shared editor primitive that accepts `value: string` / `onChange: (markdown: string) => void`. Semantically identical to `CodeEditor`'s interface — by design, so future editor surfaces can swap them.
- **Changed contract in `file-browser`**: `ViewerMode` union changes. All call sites of `FileViewerPanel` must migrate `'edit'` → `'source'` — TypeScript enforces this.
- **Unchanged contracts**: save pipeline (`saveFile()` server action, mtime conflict detection, atomic write), `externallyChanged` signal, file-size and binary-file guards, Preview rendering pipeline, Diff viewer.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=0, F=1, T=1
- **Confidence**: 0.80
- **Assumptions**:
  - Tiptap + `@tiptap/markdown` + `@tiptap/extension-link` + `@tiptap/extension-placeholder` lazy-load under 120 KB gzipped combined, per bundle estimates from external research.
  - Tiptap's markdown extension round-trips the MVP syntax set (headings, emphasis, strike, inline code, lists, blockquote, code block, hr, link) without data loss when configured with `indentation: { style: 'space', size: 2 }` and GFM mode.
  - Existing `handleEditModeKeyDownCapture` handler can be extended to cover `rich` mode alongside `source` with a one-line guard change — no re-architecture of save keyboard handling.
  - Tiptap works under React 19 / Next.js 15 App Router with `immediatelyRender: false` (confirmed in research but must be validated on this specific Next.js version at implementation time).
- **Dependencies**:
  - External npm packages: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image` (read-only display).
  - Requires shadcn `Drawer` / `Popover` / `Button` components (already in the codebase).
  - Blocks nothing upstream; no other in-flight plans claim `FileViewerPanel` (plan 041 is shipped).
- **Risks**:
  - Round-trip normalization of edge-case markdown (mixed list markers, 4-space indents, setext headings) may surprise power users — mitigated by keeping Source as default and warning about tables.
  - Front-matter handling adds state complexity; a parsing bug there could silently drop YAML on save. Requires explicit unit tests.
  - Plan 078's swipe navigation on mobile may conflict with `contenteditable` text selection. Needs integration-test validation.
  - Bundle size could balloon if future additions (image display, syntax-highlighted code) are bolted on casually. Gate via bundle-size budget in CI if possible.
- **Phases** (indicative, for `/plan-3-architect` to refine):
  1. **Foundation**: install deps; scaffold `MarkdownWysiwygEditor` client component with StarterKit + markdown + placeholder; lazy-load wrapper.
  2. **Toolbar & shortcuts**: build `WysiwygToolbar` (16 buttons, 5 groups) + active-state wiring + keyboard shortcuts.
  3. **Link popover**: desktop popover + mobile bottom-sheet, URL sanitation, edit/unlink flow.
  4. **FileViewerPanel integration**: rename `edit` → `source`, add `rich` branch, migrate all callers, extend `Cmd+S` handler.
  5. **Front-matter & round-trip**: split/rejoin logic, round-trip test corpus (3 files), table warn banner.
  6. **Polish**: mobile toolbar overflow, accessibility audit, Tiptap-init error fallback, bundle-size verification.

### Complexity Rationale

- **S=1**: Modifies two domains (`file-browser`, `_platform/viewer`) but each change is confined; ~4 new files, ~3 modified files, plus call-site renames enforced by TypeScript.
- **I=1**: One external ecosystem (Tiptap + ProseMirror) introduced; mature and widely used but new to this codebase.
- **D=1**: No schema changes. In-memory state gains a front-matter split/rejoin concern; no persistence migration.
- **N=0**: Workshop 001 resolved the design questions. Remaining open questions are scope decisions, not unknowns.
- **F=1**: Bundle size target (≤ 120 KB gz), SSR/hydration correctness, WCAG accessibility, dark-mode parity with Preview. Moderate non-functional bar.
- **T=1**: Integration-level round-trip tests with a real file corpus; no feature-flag rollout or staged release needed.

## Acceptance Criteria

1. **AC-01: Rich mode is available only for `.md` files** — Opening a `.md` file in `FileViewerPanel` shows four mode buttons in order: `[Source] [Rich] [Preview] [Diff]`. Opening any non-markdown file shows only three: `[Source] [Preview] [Diff]`.

2. **AC-02: Default mode unchanged** — Opening a `.md` file for the first time lands in `Source` mode, preserving existing behavior. Switching to `Rich` is explicit and per-file.

3. **AC-03: Typing markdown shortcuts renders rich elements** — In Rich mode, typing `# ` at the start of a line produces an H1 block containing the rest of the line. The same works for `## ` (H2), `### ` (H3), `- ` / `* ` (bulleted list), `1. ` (ordered list, starting at the typed number), `> ` (blockquote), and ` ``` ` + Enter (fenced code block). Inline shortcuts `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)` convert when the closing delimiter is typed.

4. **AC-04: Toolbar toggles formatting** — Clicking each of the 16 toolbar buttons performs the documented action on the current selection or block. Active buttons visibly indicate their state (`aria-pressed="true"` and a distinct visual treatment) when the caret is inside a matching mark or node.

5. **AC-05: Keyboard shortcuts work** — The full shortcut set from workshop 001 § 4 is functional: `⌘B / Ctrl+B` bold, `⌘I / Ctrl+I` italic, `⌘Shift+X` strike, `⌘E` inline code, `⌘Alt+1/2/3` H1/H2/H3, `⌘Shift+8` UL, `⌘Shift+7` OL, `⌘Shift+B` blockquote, `⌘Alt+C` code block, `⌘K` open link popover, `⌘Z` / `⌘Shift+Z` undo/redo.

6. **AC-06: Save from Rich works via existing pipeline** — Pressing `⌘S / Ctrl+S` while in Rich mode triggers the same `onSave` flow as Source mode: server action, mtime conflict check, atomic write. No new server code is introduced. Conflict and externally-changed banners behave identically in Rich and Source.

7. **AC-07: Source and Rich share in-memory content** — Editing in Rich mode and switching to Source shows the just-edited content as plain markdown. Editing in Source and switching to Rich shows the same content rendered. Switching between modes does not save; the edit remains dirty until the user saves explicitly.

8. **AC-08: Round-trip fidelity — no edits** — Opening each file in the test corpus and switching back to Source without edits produces a `editContent` string equal to the original file contents. Saving this unchanged state produces a file that is byte-identical to the original on disk. **The test corpus is exactly these three files:**
   - `docs/plans/083-md-editor/md-editor-spec.md` (or another plan spec file if this one changes during implementation) — prose + headings + lists + tables
   - `docs/adr/<pick-one-with-frontmatter>.md` — exercises YAML front-matter preservation
   - `docs/plans/083-md-editor/research-dossier.md` — tables-heavy, exercises the table warning banner
   The exact ADR path is pinned in the test fixtures file at implementation time (Phase 5).

9. **AC-09: Round-trip fidelity — with edits** — Opening a prose-only `.md` file in Rich mode, toggling one word to bold, saving: the resulting file diff shows only the added `**…**` markers around that word. All other content, whitespace, and formatting are unchanged.

10. **AC-10: YAML front-matter preserved** — For files that begin with a `---\n…\n---\n` YAML front-matter block, switching between Source and Rich mode, editing the body in Rich, and saving produces output whose front-matter block is byte-identical to the original. The front-matter is not exposed to Tiptap for editing.

11. **AC-11: Tables trigger a warning banner** — Opening a `.md` file containing GFM table syntax in Rich mode displays a dismissible banner explaining that tables may reformat and recommending Source mode for table edits. The banner does not block editing.

12. **AC-12: Code blocks and Mermaid are preserved opaquely** — Fenced code blocks with any language (including `mermaid`) display as plain monospace text in Rich mode with no syntax highlighting. When the block has a language identifier (e.g. ```` ```python ````), a small read-only label appears in the top-right of the block showing the language name. The language identifier is preserved on save. Switching to Preview mode renders syntax highlighting and Mermaid diagrams as before.

12a. **AC-12a: Images render inline, read-only** — Markdown image links `![alt](url)` render as inline `<img>` elements in Rich mode using the same URL-resolution logic as Preview (relative image paths resolve via the same rewriting pipeline that `MarkdownPreview` uses, so images work identically in both modes). Users cannot drag, paste, or upload new images in Rich mode; to add an image they switch to Source. Clicking an image selects it; Delete/Backspace removes the image and its source markdown.

13. **AC-13: Link insertion works** — With a text selection, pressing `⌘K` or clicking the Link toolbar button opens a popover pre-filled with the selection as link text. Entering a URL and confirming (Enter or Insert button) inserts a markdown link. With the caret inside an existing link, the popover pre-fills current text and URL and offers an Unlink action. URLs without a scheme get `https://` prepended; `javascript:` schemes are rejected.

14. **AC-14: Mobile toolbar is fully reachable** — On viewports ≤ 768 px, the Rich toolbar horizontally scrolls to keep all 16 buttons reachable without hiding or collapsing any. Touch targets are ≥ 36 × 36 px. The link popover appears as a bottom-sheet with the URL field auto-focused.

15. **AC-15: Rich mode is lazy-loaded** — Loading a `.md` file and leaving it in Source mode does NOT fetch Tiptap's JS bundle. Switching to Rich mode triggers the dynamic import; during the fetch, a skeleton placeholder is shown. A Network-tab inspection of the Source-only path confirms no `@tiptap/*` chunks are loaded.

16. **AC-16: Bundle size target met** — The lazy-loaded Rich bundle (Tiptap core + markdown extension + link extension + placeholder extension + image extension + our wrapper and toolbar) is ≤ **130 KB gzipped** (raised from 120 KB to absorb the image extension). Verified via a production build analysis.

16a. **AC-16a: File-size soft cap on Rich mode** — For `.md` files larger than **200 KB** on disk (roughly 5000 lines), the Rich mode button is rendered but disabled with a tooltip `"File too large for Rich mode — use Source"`. Below the cap, Rich works normally. The cap is a single constant in code (easy to adjust).

16b. **AC-16b: Empty-state placeholder** — When a file has no body content (empty, or only YAML front-matter), the Rich editor shows a greyed-out generic placeholder `"Start writing…"` in the first paragraph. The placeholder disappears on the first keystroke.

17. **AC-17: Accessibility baseline** — Every toolbar button has a unique `aria-label`, correct `aria-pressed` state, a `title` tooltip with its keyboard shortcut, and is reachable via keyboard Tab navigation. The editor content area is announced as a multiline textbox. Color contrast in the editor text passes WCAG AA in both light and dark mode.

18. **AC-18: Error fallback** — If Tiptap fails to initialize (e.g., an unparsable document), the Rich mode area renders a fallback panel with an error message and a "Switch to Source mode" button that calls `onModeChange('source')`. The app does not crash.

19. **AC-19: Existing `AgentEditor` unchanged** — Agent prompt editing in `apps/web/src/features/058-workunit-editor/components/agent-editor.tsx` continues to use CodeMirror exclusively. No `rich` mode toggle is exposed on that surface.

20. **AC-20: Existing Source, Preview, Diff modes unchanged** — CodeMirror editing behavior, server-side preview rendering with Shiki + Mermaid, and the git-diff viewer all behave identically to before this change. Regression tests for these paths continue to pass.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tiptap's markdown extension normalizes whitespace / list style in ways that surprise power users on round-trip | Medium | Low | Document normalizations in a Limitations note; keep Source as default mode; corpus tests catch regressions |
| YAML front-matter parser has an edge case (e.g., fenced block in front-matter that mimics the closing `---`) | Low | High (data loss) | Explicit unit tests for malformed / edge-case front-matter; safeguard: if close-fence not found in first 200 lines, treat as body |
| React 19 / StrictMode / App Router `dynamic` interaction surfaces a runtime error Tiptap didn't ship a fix for | Low | Medium | Validate at Foundation phase; fallback UI covers init failures; well-trafficked integration per external research |
| Bundle size creeps above 120 KB as extensions accrete | Medium | Low | Budget check in CI; avoid optional extensions unless scope explicitly expands |
| Plan 078 swipe-to-navigate interferes with `contenteditable` selection on mobile | Medium | Medium | Integration test on phone viewport; use `data-swipe-ignore` / `stopPropagation` as needed |
| Users lose Rich-mode edits when switching modes mid-edit because they misunderstand dirty-state behavior | Low | Low | Dirty state is preserved across mode switches (Source/Rich share `editContent`); existing conflict / externally-changed banners already handle cross-tab scenarios |
| Tables in Rich mode get corrupted despite warning banner | Low | Medium | Banner is prominent and persistent on first load; consider a follow-up plan to add a table-aware node that round-trips |

### Assumptions

- The existing save pipeline (`saveFile()` server action, mtime conflict detection, atomic write) is a plain-text interface and requires no changes. ✓ Verified via research dossier finding EL-09.
- Workshop 001 accurately captures desired UX — the decisions tagged `RESOLVED` in its Open Questions are not up for re-litigation in this plan.
- No other in-flight plan is modifying `FileViewerPanel` or `ViewerMode`. ✓ None found on recent branches.
- The four remaining `OPEN` questions in workshop 001 (image display, table UX specifics, placeholder text, file-size gate) will be resolved in `/plan-2-v2-clarify` before architecture.
- Shadcn/ui Drawer + Popover + Button already cover the UI primitives needed for the link popover (desktop + mobile variants).

## Open Questions

All workshop-level open questions were resolved during `/plan-2-v2-clarify` (see `## Clarifications` below). No remaining blockers before `/plan-3-architect`.

## Testing Strategy

- **Approach**: **Hybrid** — TDD for the algorithmic / correctness-critical code, lightweight tests for UI plumbing, manual verification for visual polish.
- **TDD (tests-first)**:
  - YAML front-matter split/rejoin utility — edge cases around malformed front-matter, missing close fence, escaped `---` inside content.
  - Markdown round-trip serialization helpers (parse → doc → re-emit).
  - Table-detection heuristic used by the warning banner.
  - File-size gate threshold logic.
- **Lightweight (test-after)**:
  - `MarkdownWysiwygEditor` React component — mount smoke test + a handful of `userEvent` toolbar clicks and keystrokes.
  - `WysiwygToolbar` — active-state toggling, disabled-state inside code blocks.
  - `LinkPopover` — URL sanitation, unlink path, keyboard submit.
  - `FileViewerPanel` integration — mode switching keeps `editContent` in sync; `⌘S` saves from Rich.
- **Manual**:
  - Mobile layout (toolbar horizontal scroll, bottom-sheet link popover) on a real phone viewport via the harness.
  - Dark-mode visual parity between Rich and Preview.
  - Image URL resolution for relative paths.
  - Tiptap-init error fallback UI.
- **Mock Usage Policy**: **Avoid mocks — real fixtures.** Use real `.md` files from the repo (plus a small `test/fixtures/markdown/` tree for edge cases) for round-trip tests. Use real Tiptap in component tests. Mock only the `saveFile` server action when testing `FileViewerPanel` in isolation — that's an external boundary per the policy.
- **Focus Areas**: front-matter preservation, round-trip fidelity on the pinned corpus, ⌘S pipeline reuse, bundle-size budget.
- **Excluded**: Cross-browser visual regression tests (rely on Playwright smoke in the harness); collaborative editing (out of scope); performance benchmarks on files under 200 KB (not a concern at this size).

## Documentation Strategy

- **Location**: **`docs/how/markdown-wysiwyg.md`** (new).
- **Rationale**: A short user-facing guide is the right weight for this feature. In-app tooltips cover immediate discoverability (button labels, keyboard shortcuts); the `docs/how/` guide covers the non-obvious: mode model, round-trip fidelity rules, what to do with tables, front-matter behavior, and when to pick Source vs Rich.
- **Top-level `README.md` not changed** — this is not a top-level capability change; it's a UI refinement inside an existing surface.
- **Inline code comments** will remain minimal per the project's code-style rules — explain *why*, not *what*.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Editing experience & features, UI | UI / Interaction Design | Central user-facing design decision with many branching concerns (mode model, toolbar, shortcuts, input rules, mobile, accessibility, round-trip rules) | All covered in workshop 001 | ✅ **Complete** — [`workshops/001-editing-experience-and-ui.md`](workshops/001-editing-experience-and-ui.md) |

No additional workshops are proposed. Workshop 001 covers the entire design surface for this feature. Front-matter handling and round-trip normalization rules are specified inside workshop 001 and do not justify separate workshops; they are implementation details for the architect phase.

## Clarifications

### Session 2026-04-18

**Q1: Workflow Mode** → **Full**.
Rationale: CS-3 complexity, multiple phases, round-trip fidelity requirements justify formal dossiers and gates.

**Q2: Testing Strategy** → **Hybrid**.
TDD for front-matter split/rejoin, round-trip serialization, table-detection, file-size gate; lightweight tests for UI components; manual for visual polish. See `## Testing Strategy` above.

**Q3: Mock Usage** → **Avoid mocks — real fixtures only**.
Round-trip tests use real `.md` files; Tiptap is used unmocked; only the `saveFile` server action is mocked in `FileViewerPanel` integration tests because it's an external boundary.

**Q4: Documentation Strategy** → **`docs/how/markdown-wysiwyg.md`** guide (new).
One user-facing guide is the right weight; README unchanged; inline code comments minimal per project style.

**Q5: Harness Readiness** → **L3 is sufficient as-is**.
Existing Playwright / browser interaction / structured evidence / CLI SDK capabilities cover mode switching, toolbar interaction, and round-trip verification. No harness changes needed.

**Q6: Domain Review** → **Confirmed**.
`file-browser` (modify), `_platform/viewer` (modify), `_platform/themes` (consume). No new domains. Boundaries as drafted.

**Q7: Safety rails for tables and large files** → **Warn banner on tables; 200 KB soft cap on Rich mode**.
- Tables: dismissible banner on open, no hard lock — user can still edit prose above/below table sections.
- Large files: Rich button disabled with tooltip above 200 KB (~5000 lines). AC-16a pins the threshold.

**Q8a: Image display** → **Display only, no upload**.
Existing markdown image links render inline read-only; no drag-drop / paste upload. Added to Goals and AC-12a. Non-Goals updated to clarify that "no images" was about *upload*, not display.

**Q8b: Empty-state placeholder** → **Generic "Start writing…"**.
Pinned in AC-16b.

**Q8c: Code-block language pill** → **Show read-only pill** (e.g. `python`).
Pinned in AC-12.

**Q9: Round-trip test corpus** → **Plan spec + ADR with front-matter + research dossier (tables-heavy)**.
Exact ADR path to be pinned in the test fixtures file at Phase 5 implementation time. AC-08 updated.

### Impact on spec

- Goals: added image-display goal and code-block language-pill goal.
- Non-Goals: narrowed the "no images" line to "no image *upload*".
- Acceptance Criteria: AC-08 pinned corpus; AC-12 adds language pill; AC-12a added for image display; AC-16 bundle target raised from 120 → 130 KB gz to absorb image extension; AC-16a added file-size soft cap; AC-16b added placeholder.
- Open Questions: all resolved.
- Testing Strategy section added.
- Documentation Strategy section added.

### Impact on workshop 001

Q5 (images), Q6 (tables), Q7 (placeholder), Q9 (file-size gate), Q8 (language pill) — previously marked OPEN — are now RESOLVED in line with the decisions above. Workshop stays as-is (working reference); readers should treat these clarifications as the source of truth if they diverge from the workshop doc.
