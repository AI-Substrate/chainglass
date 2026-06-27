# Single-Click PDF Download from MD / HTML Preview

**Mode**: Simple
**Status**: Specifying
**Plan**: sub-feature of `084-random-enhancements-3`
**Created**: 2026-05-28

📚 Specification incorporates findings from `preview-pdf-download-research.md` and `external-research/pdf-library-selection.md`.

---

## Research Context

Two research artifacts back this spec:

- **`preview-pdf-download-research.md`** (8-subagent codebase study): The viewer toolbar in `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` is the one place a button belongs. Markdown preview consumes a server-rendered HTML string (`markdownHtml` prop); HTML preview lives in a **sandboxed iframe** (opaque origin) whose original source string is available in the parent before blob creation. Established patterns exist for the button (shadcn `Button` + lucide icon + Tooltip), async UX (`Loader2` spinner + `sonner` toast), and download (blob + `<a download>`). Zero PDF libraries are installed.
- **`external-research/pdf-library-selection.md`** (Perplexity deep research): Recommends **`html2pdf.js`** (~45 KB gz, client-side, lazy-loaded), with explicit, accepted fidelity tradeoffs (no selectable text, mermaid needs render-wait, wide tables need landscape). _Note: the deep research's "Shiki theme bake-in" step is **superseded** in the plan — capturing the live in-document preview node means theme/CSS colors already resolve, so no bake-in is needed for markdown (plan Finding 02)._ Rejects `paged.js` / `window.print()` (print dialog breaks single-click), `@react-pdf/renderer` (size + rebuild), and server-side Chromium (cold start) for V1.

---

## Summary

Add a single button to the file-viewer toolbar that, while a file is being **previewed** (markdown rendered, or HTML rendered), generates a PDF of that rendered view and immediately downloads it — one click, no print dialog. Generation is fully client-side via `html2pdf.js`, lazy-loaded inside the click handler so the eager bundle is untouched.

## Goals

- One-click "Download as PDF" from the markdown preview surface.
- One-click "Download as PDF" from the HTML page preview surface.
- No system print dialog; the file simply downloads as `<basename>.pdf`.
- No measurable increase to the eager (initial-load) bundle — the PDF library loads only on first click.
- PDF visually matches the on-screen preview "closely enough," including syntax-highlighted code and the active light/dark theme.
- Clear async feedback: spinner while working, success/failure toast on completion.

## Non-Goals

- Selectable / copyable text in the PDF (html2pdf rasterizes — accepted tradeoff).
- Server-side PDF generation / a `/api/.../pdf` endpoint (deferred; revisit only if client fidelity proves inadequate).
- PDF export from `[Source]` or `[Diff]` modes.
- Page-size / margin / orientation customization UI, headers/footers, watermarks.
- Multi-file or batch export.
- Perfect mermaid fidelity in V1 (see Clarifications / mermaid decision).
- New documentation (per Round 1 — the button is self-explanatory).

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `file-browser` | existing | **modify** | Add the PDF button to `FileViewerPanel`'s right-side toolbar group; add `use-pdf-export` hook, `IPdfGenerator` interface, `Html2PdfGenerator` (prod) and `FakePdfGenerator` (tests) in the feature folder. |
| `_platform/viewer` | existing | **consume** | Reuse the already-server-rendered markdown HTML (the `markdownHtml` prop the preview already receives). **No contract changes in V1** — the client path consumes the existing prop, not `renderMarkdownToHtml` directly, so no new cross-domain edge is created. |

No NEW domains. No `_platform/auth` / `_platform/file-ops` involvement in V1 (client-side only; no new server route, so no path-security surface).

## Testing Strategy

- **Approach**: **Hybrid**. TDD-style unit tests for deterministic logic; harness/manual for anything that needs a real PDF or a real download (jsdom renders neither).
- **Rationale**: PDF visual output and browser downloads cannot be asserted in jsdom. The logic *around* generation (filename derivation, theme bake-in, surface/mode gating, async state transitions, toast on success/failure) is pure and testable behind an interface.
- **Focus Areas (automated unit)**: filename derivation (`README.md → README.pdf`, fallback `document.pdf`); `isExporting` true→false transitions incl. error path; success/error toast invocation; button present/absent per surface+mode; `aria-label` + `data-testid` present; `IPdfGenerator` receives the correct `{ html, filename, theme }`.
- **Harness (L3 Playwright/CDP)**: click the button → assert `page.on('download')` fires → assert downloaded filename matches → (optional) `pdf-parse` to assert non-empty / contains expected heading text.
- **Excluded**: pixel-level PDF fidelity, Shiki color exactness, mermaid SVG correctness — verified manually during implementation, documented as known limitations where applicable.
- **Mock Usage**: **Avoid mocks entirely.** Per constitution (no `vi.mock` / `vi.spyOn` on own code). Use `FakePdfGenerator` injected via `IPdfGenerator`. Real `sonner`/DOM where feasible.

## Documentation Strategy

- **Location**: **No new documentation** (Round 1 choice).
- **Rationale**: A single, self-describing toolbar button with a tooltip; behavior is captured by acceptance criteria and the spec. The known mermaid limitation is recorded here and (if relevant) surfaced via UI affordance rather than a doc.

## Complexity

- **Score**: **CS-3 (medium)** — recorded honestly even though Simple mode was elected. The user chose Simple to keep execution single-phase by scoping V1 tightly; the underlying integration nuance (new dep, Shiki bake-in, mermaid timing, sandboxed-iframe source handling, table width) is genuinely CS-3.
- **Breakdown**: S=1, I=1, D=1, N=1, F=1, T=1 → P=6 → CS-3.
  - **S** (surface): ~5 files (new hook, interface, prod+fake generator, 1 toolbar edit, tests).
  - **I** (integration): viewer pipeline, lucide/shadcn/sonner, dynamic import, blob download, iframe source path.
  - **D** (data/state): small — `isExporting`, active-theme detection, HTML string passing.
  - **N** (novelty): first PDF capability in the codebase; Shiki theme bake-in is new.
  - **F** (non-functional): bundle-size discipline, visual fidelity, a11y.
  - **T** (testing): jsdom can't render PDFs; needs harness + Fake injection.
- **Confidence**: 0.80 (library + integration points validated by research; residual risk is mermaid timing + Shiki color fidelity in practice).
- **Assumptions**: see Risks & Assumptions.
- **Dependencies**: add `html2pdf.js` to `apps/web` deps (lazy-imported).
- **Phases**: Single phase (Simple mode). Suggested task order: (1) `IPdfGenerator` + `Html2PdfGenerator` (incl. Shiki bake-in helper) + `FakePdfGenerator`; (2) `use-pdf-export` hook with download + async state + toast; (3) toolbar button wired in `FileViewerPanel` (surface/mode-gated, a11y, `data-testid`); (4) HTML-preview source-string wiring; (5) tests (unit + harness); (6) manual fidelity pass (light/dark, code blocks, tables, a mermaid file).

## Acceptance Criteria

1. With a markdown file open in **preview** mode, a "Download as PDF" button is visible in the file-viewer toolbar's right-side action group, with an `aria-label` and tooltip.
2. Clicking it (markdown preview) downloads `<basename>.pdf` containing the rendered markdown — headings, paragraphs, lists, GFM tables, and syntax-highlighted code blocks — with no system print dialog shown.
3. With an HTML file open in **preview** mode, the same button is present and clicking it downloads `<basename>.pdf` of the rendered HTML, generated from the original HTML source string (not by reaching into the sandboxed iframe).
4. The PDF reflects the **active theme** (light or dark) as shown on screen; code-block colors match the visible preview in both themes.
5. While generating, the button shows a spinner and is disabled (`Loader2 animate-spin`); on completion a `sonner` success toast appears; on failure an error toast with a message appears and the button re-enables.
6. The button does **not** appear in `[Source]` or `[Diff]` modes.
7. The downloaded filename is the source basename with its extension replaced by `.pdf` (e.g., `notes.md → notes.pdf`, `report.html → report.pdf`); empty/untitled falls back to `document.pdf`.
8. The eager bundle for the route hosting `FileViewerPanel` does not grow — `html2pdf.js` is only fetched on first click (`await import(...)`).
9. PDF generation is exercised through an `IPdfGenerator` seam, allowing a `FakePdfGenerator` in unit tests (no `vi.mock`).
10. Mermaid diagrams: the export applies a short (~300ms) pre-capture delay so diagrams already rendered on screen are included. A diagram that has not finished rendering at click time may appear as an empty box — this is an accepted, documented V1 limitation, not a failure.

## Risks & Assumptions

- **Assumption**: `markdownHtml` (already a prop on the preview) is the correct, complete HTML to convert. — High confidence (research IA/IC).
- **Assumption**: The active theme is detectable client-side at click time (Tailwind `dark` class on a known ancestor, or a theme hook). — Needs a small lookup; low risk.
- **Risk (Shiki colors)**: dual-theme CSS variables may not resolve in a detached staging node; mitigated by a "bake computed colors to inline styles" step before capture. — Medium; validated approach in deep research.
- **Risk (mermaid timing)**: client-rendered diagrams may be incomplete at capture. — See Round 2 decision; V1 mitigation is a short pre-capture delay.
- **Risk (wide tables)**: complex/wide GFM tables can truncate in portrait. — Mitigate with `table-layout: fixed` + word-break, and/or auto-landscape when a table exceeds content width.
- **Risk (HTML assets)**: HTML files with relative asset references won't have those assets in a client-only PDF (assets are token-authed via the iframe). — V1 accepts text/layout fidelity without guaranteed remote-asset embedding; documented as a limitation.
- **Risk (no selectable text)**: html2pdf rasterizes. — Accepted, listed as Non-Goal.

## Open Questions

_All resolved in Round 2 (2026-05-28):_
- ~~Surfaces~~ → **Markdown + HTML** in V1 (Rich editor deferred).
- ~~Mermaid handling~~ → **Accept as known limitation** with a ~300ms pre-capture delay; no render-complete gating in V1.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Mermaid render-complete signal | Integration Pattern | Only needed if Round 2 chooses to gate the button on render-complete (pulls in research opportunity #2). | MutationObserver vs. render-complete callback vs. `mermaid.run()` promise? How to expose from `MarkdownPreview` without churning the hot path? |

(Skippable for V1 if mermaid is accepted as a known limitation.)

## Clarifications

### Session 2026-05-28

**Round 1 (process):**
- **Workflow Mode** → **Simple.** Single-phase, inline tasks. (User elected lean execution despite CS-3 underlying complexity; V1 scoped tightly to compensate.)
- **Testing Strategy** → **Hybrid.** TDD for logic behind an interface; harness/manual for PDF + download.
- **Mock Usage** → **Avoid / Fakes only.** Constitution forbids `vi.mock`; use `FakePdfGenerator` via `IPdfGenerator`.
- **Documentation** → **No new documentation.** Self-explanatory toolbar button.

**Round 2 (scope):**
- **Surfaces** → **Markdown + HTML.** Both preview surfaces named in the original request get the button in V1. **Implementation note:** these are two physically distinct toolbars — markdown preview uses the main `FileViewerPanel` toolbar, while HTML files render through a nested `HtmlViewer` with its **own** toolbar, so "single button" means one button on each surface (two insertion points). HTML conversion uses the **original, pre-rewrite** source string captured before the sandboxed-iframe blob is created (the iframe is opaque to the parent; the rewritten string carries a short-lived asset token that must NOT be baked into a shareable PDF). Rich/WYSIWYG export deferred to a follow-up.
- **Mermaid handling** → **Known limitation + ~300ms pre-capture stopgap.** Diagrams rendered by click time are included; an unrendered diagram may show as an empty box, documented as an accepted V1 limitation. No render-complete gating built in V1 (keeps it single-phase / Simple). The "Mermaid render-complete signal" workshop remains available if a future version wants robust gating.
