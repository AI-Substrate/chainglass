# Single-Click PDF Download from MD / HTML Preview — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-28
**Spec**: [preview-pdf-download-spec.md](./preview-pdf-download-spec.md)
**Flight Plan**: [preview-pdf-download.fltplan.md](./preview-pdf-download.fltplan.md)
**Status**: In Progress

## Complexity & Rollback

- **Overall Complexity**: **CS-3** by surface (S=1, I=1, D=1, N=1, **F=2** for untrusted-HTML security, T=1 → P=7), but the **HTML/XSS path is handled with CS-4-level rigor** (explicit DOMPurify config + attack-vector tests in T002, sanitize-then-stage ordering, off-screen in-document staging, asset-token exclusion, rollback plan, and an optional disable-gate) because an incorrect sanitizer config could silently ship an XSS hole. Two independent validators flagged the security weight; the mitigations below satisfy R-EST-004 regardless of the CS-3/CS-4 label.
- **Rollback plan**: The feature is purely additive. To revert: remove the two component edits (the markdown button in `file-viewer-panel.tsx` and the HTML button + state in `html-viewer.tsx`), delete `lib/pdf-generator.ts` + `hooks/use-pdf-export.ts` + their tests, and drop the `html2pdf.js` / `dompurify` deps. Behaviour reverts cleanly to "no PDF button." No data, schema, or server state is touched.
- **Optional disable-gate**: The untrusted-HTML capture path (HTML files) can be gated behind a simple constant/env flag so it can be disabled without a redeploy if the sanitization path ever proves risky; the markdown path (trusted, server-rendered) needs no gate.

## Summary

Add a single toolbar button that converts the current rendered preview into a downloaded PDF — one click, no print dialog. Generation is fully client-side via `html2pdf.js`, lazy-loaded inside the click handler so the eager bundle is untouched. The feature lives entirely in the `file-browser` domain and reuses the markdown HTML the viewer already renders. Findings below come from the research dossier, the Perplexity library-selection deep research, **and direct inspection of the actual viewer code** — which revised several assumptions (two separate toolbars, live-DOM capture beats detached staging, untrusted-HTML sanitization required for the HTML path).

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `file-browser` | existing | **modify** | Add the PDF button (two surfaces), the `use-pdf-export` hook, and the `IPdfGenerator` seam (`Html2PdfGenerator` + `FakePdfGenerator`). |
| `_platform/viewer` | existing | **consume** | Capture the **live preview DOM** rendered by `MarkdownViewer` inside file-browser's own `FileViewerPanel`. **No new public contract** on `_platform/viewer` (`markdownHtml` is a prop, not a named viewer contract); the `fileBrowser → viewer` edge already exists in the domain map, so **no new edge**. |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/package.json` | (config) | config | Add `html2pdf.js` + `dompurify` (+ `@types/dompurify`) as direct deps. (App-level config artifact, not a domain contract.) |
| `apps/web/src/features/041-file-browser/lib/pdf-generator.ts` | file-browser | internal | `IPdfGenerator` interface + `Html2PdfGenerator` (real) + `FakePdfGenerator` (tests). |
| `apps/web/src/features/041-file-browser/hooks/use-pdf-export.ts` | file-browser | internal | Hook: orchestrates export, async state, toast, blob download, filename, mermaid delay. |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | file-browser | internal | Add markdown PDF button to the main toolbar + ref on the preview wrapper. |
| `apps/web/src/features/041-file-browser/components/html-viewer.tsx` | file-browser | internal | Store fetched HTML source in state; add HTML PDF button to its toolbar. |
| `test/unit/web/features/041-file-browser/pdf-generator.test.ts` | file-browser | test | Unit-test the generator seam with the Fake. |
| `test/unit/web/features/041-file-browser/use-pdf-export.test.ts` | file-browser | test | Unit-test hook logic (filename, async state, toast, request shape). |
| `docs/domains/file-browser/domain.md` | file-browser | docs | Update History + Composition + Concepts after implementation. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | **Critical** | **Two separate toolbars → two button locations.** Markdown/code preview uses the main `FileViewerPanel` toolbar (`file-viewer-panel.tsx:354-394`); HTML files route through the nested `BinaryFileView` → `HtmlViewer`, which has its **own** toolbar (`html-viewer.tsx:181-191`). One insertion point will not cover both. | Implement the markdown button in the main toolbar (gated `mode==='preview' && isMarkdown && markdownHtml`); implement the HTML button inside `HtmlViewer`'s toolbar. |
| 02 | **High** | **Capture the LIVE markdown preview node, not a detached HTML string.** The in-document preview node already contains rendered mermaid SVGs (portals) and correctly-resolved Shiki/theme colors (real CSS). This supersedes the deep-research "stage the `markdownHtml` string + bake CSS variables" sketch — that detached approach would lose mermaid and need a color bake-in step. | Put a ref on the preview wrapper (`file-viewer-panel.tsx:502`) and pass the element to `html2pdf().from(element)`. No theme bake-in needed for markdown. |
| 03 | **Critical** | **HTML file content is UNtrusted.** The sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) exists precisely to isolate it. Staging that HTML into a non-sandboxed node in the app origin for `html2canvas` capture reintroduces XSS (`<img onerror>`, inline handlers, `<svg onload>`, `javascript:`/`data:` URLs). | **Sanitize-THEN-stage** (never assign untrusted HTML to `innerHTML` before sanitizing). The generator's HTML path owns the `DOMPurify.sanitize()` call with an **explicit config** (forbid scripts/event-handlers/unknown protocols — see T002), then stages the sanitized result in an **off-screen but in-document** container (NOT a detached node — html2canvas needs it in the document to resolve styles; see Finding 10), captures, and removes it. Add `dompurify` as a direct dep (present transitively today, not declared — unreliable to import under pnpm). |
| 10 | **High** | **Staging container must be in-document, not detached.** Finding 02's whole point is that a detached node loses CSS resolution; html2canvas also requires the node to be attached to compute styles. So the HTML path's staging container must be appended to `document.body` but positioned off-screen (`position:fixed; left:-99999px`), captured, then removed in a `finally`. HTML files carry their own `<style>`/inline styles, so the app's Tailwind/dark theme does NOT apply to them (this scopes AC-4 to the markdown path). | Use an off-screen in-document container; remove it in `finally` even on error. Scope the "active theme" criterion to markdown; HTML renders its own embedded styles. |
| 11 | **High** | **Asset-token leakage into shared PDFs.** `HtmlViewer` rewrites asset URLs with a short-lived `&_at=<token>` (FX011) for the iframe. If the PDF is generated from the *rewritten* HTML, that token is baked into a portable, shareable file. | T005 must capture the **original, pre-rewrite** `html` (the `bodyRes.text()` value), NOT the `rewritten` string. Add a test asserting the exported HTML contains no `&_at=`/token. |
| 04 | **High** | **`HtmlViewer` does not expose its fetched HTML.** The source string is local to the effect (`html-viewer.tsx:143`); the iframe is opaque so we cannot read rendered DOM. | Store the fetched HTML in component state so the PDF button handler can pass it to the generator's HTML path. |
| 05 | **High** | **Toolbar idiom is a raw `<button>`, not shadcn `Button`.** The research's pattern findings suggested shadcn `Button`/`Tooltip`; the actual toolbars use raw `<button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label=...>`. `Loader2` is already imported in `file-viewer-panel.tsx:21`. | Match the local raw-button idiom for visual consistency; reuse `Loader2 animate-spin` for the loading state. |
| 06 | **High** | **Two new dependencies.** `html2pdf.js` (~45 KB gz; ships its own types or needs a local `declare module`) and `dompurify` + `@types/dompurify`. AC-8 requires the eager bundle stays flat. | Add both to `apps/web`; `await import('html2pdf.js')` **inside** the click handler so it never enters the eager chunk. |
| 07 | Medium | **Mermaid timing.** Live-capture + a ~300ms pre-capture delay covers the common case; an unrendered diagram appears as an empty box (accepted V1 limitation per spec). | Apply a ~300ms delay on the element-capture path only. Document the limitation; no render-gating in V1. |
| 08 | Medium | **No `vi.mock` (constitution).** PDF generation + real download can't run in jsdom. | Generate behind `IPdfGenerator`; unit-test with `FakePdfGenerator`; verify real downloads via the L3 harness (`page.on('download')`). |
| 09 | Medium | **`IPdfGenerator` must NOT register with the tsyringe DI container.** `docs/adr/adr-0013-usdk-internal-sdk-architecture.md` states the DI container is server-side and "React hooks can't resolve from the DI container"; this matches existing file-browser practice (`apps/web/src/features/041-file-browser/hooks/use-clipboard.ts`, `services/file-actions.ts` take deps as params, no DI). | Use a plain hook-level default (`new Html2PdfGenerator()`) with an optional injected `IPdfGenerator` param for tests. No container registration. ADR-aligned. |

## Agent Harness Strategy

- **Current Maturity**: L3 (per `docs/project-rules/harness.md` — Boot + browser interaction via Playwright/CDP + structured evidence + CLI SDK).
- **Target Maturity**: L3 (no change needed). L3 is sufficient — `page.on('download')` verifies the real download + filename, which is the one thing jsdom can't.
- **Boot Command**: `just dev` (Next.js + terminal WS sidecar).
- **Health Check**: dev server responds; `data-testid="md-wysiwyg-root"`-style selector waits (do NOT use `networkidle` — HMR keeps the network busy; prior learning PL-07).
- **Interaction Model**: Browser (Playwright/CDP).
- **Evidence Capture**: `page.on('download')` events + downloaded filename assertions; optional `pdf-parse` for non-empty/text checks.
- **Pre-Phase Validation**: Boot → open a markdown file in preview → confirm the PDF button renders, before implementing.

## Implementation

**Objective**: Ship a single-click "Download as PDF" button on both the markdown preview and HTML preview surfaces, client-side, with no eager-bundle cost.

**Testing Approach**: **Hybrid** (from spec), **test-first for the testable logic**. The generator seam (T002) and the hook (T003) follow **RED-GREEN-REFACTOR** — write the `FakePdfGenerator`-backed failing tests first, then implement. UI-render gating tests (T006) necessarily follow the components they assert. Real PDF + download and visual fidelity go to the L3 harness (T007) + manual (T008). **No `vi.mock`** — a `FakePdfGenerator` is injected via `IPdfGenerator`. Every promoted test carries the project's **5-field Test Doc** (Why / Contract / Usage Notes / Quality Contribution / Worked Example), and the generator-seam tests state WHY a fake is used (`html2pdf`/`html2canvas` cannot execute in jsdom — R-TEST-007). Fake↔real parity for `IPdfGenerator` is verified by the L3 harness (the real adapter can't run in jsdom) — the intentional substitute for an in-process contract-test factory (R-TEST-008).

### Tasks

> Ordering note: tests-first for pure logic (T002, T003) honours RED-GREEN-REFACTOR; component DOM-gating assertions (T006) come after the components exist because they assert rendered output.
>
> Line-number note: the file:line references below (`file-viewer-panel.tsx:354-394` / `:502`, `html-viewer.tsx:143` / `:181-191`) were verified accurate **as of 2026-05-28**. They are insertion hints, not contracts — if the files have drifted, locate the target by context (the toolbar's right-side action group; the `mode==='preview'` `<div className="p-4">` wrapper; the `bodyRes.text()` value; the HtmlViewer toolbar) rather than trusting the number.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Add deps: `html2pdf.js` + `dompurify` to apps/web. (No `@types/dompurify` — dompurify 3.x ships own types; no shim — html2pdf 0.14 ships `type.d.ts`. dompurify range `>=3.3.2` matches the `pnpm.overrides` security pin.) | file-browser | `apps/web/package.json` | `pnpm install` succeeds; both ship bundled `.d.ts`. | CS-1. Finding 06. ✅ |
| [x] | T002 | ✅ **RED→GREEN done** (15 tests). First wrote failing `FakePdfGenerator`-backed tests for the generator contract (each with a 5-field Test Doc, incl. WHY-fake) **plus DOMPurify attack-vector tests** (see Done When). Then implement `IPdfGenerator` + `Html2PdfGenerator` + `FakePdfGenerator`. `generate(req)` where `req.source` is `{kind:'element', element}` or `{kind:'html', html}`. Element path: `html2pdf().from(element)`. HTML path (owns sanitization): `DOMPurify.sanitize(html, cfg)` with `cfg = { FORBID_TAGS:['script','style','iframe','object','embed'], FORBID_ATTR:['onerror','onload','onclick',…all on*], ALLOW_UNKNOWN_PROTOCOLS:false, ALLOW_DATA_ATTR:false }` → append sanitized markup to an **off-screen in-document** container (`document.body`, `position:fixed; left:-99999px`) → `html2pdf().from(node)` → remove node in `finally`. Both `html2pdf` **and** `dompurify` dynamically imported inside `generate` (keep eager bundle flat). Plain module export — **no DI-container registration** (Finding 09). | file-browser | `apps/web/src/features/041-file-browser/lib/pdf-generator.ts`, `test/unit/web/features/041-file-browser/pdf-generator.test.ts` | Failing tests first, then pass; element + sanitized-html paths return a `Blob`; **attack-vector test proves `<script>`, `<img onerror>`, `<svg onload>`, `<iframe>`, `javascript:`/`data:text/html` are all stripped**; staging node is removed even on error. | CS-2. Findings 02, 03, 06, 09, 10. |
| [x] | T003 | ✅ **RED→GREEN done** (14 tests). First wrote failing tests (5-field Test Doc) for filename derivation incl. fallback, `isExporting` true→false incl. error path, toast success/error, the `req.source` kind passed to the generator, **the ~300ms delay applied on the element path (via fake timers), re-entrancy (second call ignored while `isExporting`), and no setState after unmount** — all via `FakePdfGenerator`. Then implement `use-pdf-export` (file starts with `'use client'`): `exportElement(el, filePath)` (~300ms pre-capture delay for mermaid) and `exportHtml(html, filePath)`; `isExporting` guard prevents re-entrancy; an `AbortController`/mounted-ref guards setState-after-unmount (mirror the FX011 pattern in `html-viewer.tsx:163-176`); `sonner` toast; download via blob + `<a download>` (mirror `use-clipboard.ts:108-139`); filename = basename with ext → `.pdf`, fallback `document.pdf`; optional `IPdfGenerator` param (default `new Html2PdfGenerator()`). | file-browser | `apps/web/src/features/041-file-browser/hooks/use-pdf-export.ts`, `test/unit/web/features/041-file-browser/use-pdf-export.test.ts` | Failing tests first, then pass; hook drives the generator and triggers a download; double-click does not double-export; unmount mid-export produces no setState warning. | CS-2. Findings 07, 08. |
| [ ] | T004 | Markdown button: add a raw `<button>` to the main toolbar right group, gated `mode==='preview' && isMarkdown && markdownHtml`; `aria-label="Download as PDF"`, `title`, `data-testid="file-viewer-download-pdf"`, `Loader2 animate-spin` while exporting + disabled. Add a `previewRef` to the preview wrapper (`:502`) and call `exportElement(previewRef.current, filePath)`. | file-browser | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Button appears only in markdown preview; click downloads `<basename>.pdf` of the rendered markdown incl. code blocks + theme. | CS-2. Findings 01, 02, 05. |
| [ ] | T005 | HTML button: store the **original, pre-rewrite** `html` (the `bodyRes.text()` value at `html-viewer.tsx:143`, NOT the token-rewritten string — Finding 11) in `HtmlViewer` state; add a raw `<button>` to its toolbar (next to "Open in new tab"); `aria-label`, `data-testid="html-viewer-download-pdf"`, `Loader2` while exporting; call `exportHtml(originalHtml, currentFilePath ?? <name from src>)`. | file-browser | `apps/web/src/features/041-file-browser/components/html-viewer.tsx` | Button appears in the HTML viewer; click downloads a sanitized `<basename>.pdf`; **the captured HTML contains no `&_at=` asset token** (Finding 11). | CS-2. Findings 01, 03, 04, 05, 11. |
| [ ] | T006 | Component DOM-gating + wiring tests (after components exist; 5-field Test Doc, Fake, no `vi.mock`): button present/absent per mode + surface, `aria-label` + `data-testid` present, disabled/spinner state while exporting, **and the `onClick` handler calls `exportElement`/`exportHtml` with the correct source kind + filePath** (verify via the injected `FakePdfGenerator.lastCall`). | file-browser | `test/unit/web/features/041-file-browser/use-pdf-export.test.ts` (+ component test if warranted) | Tests pass; route coverage stays ≥ the 50% CI threshold. | CS-2. Finding 08. |
| [ ] | T007 | Harness verification (L3): boot, open a markdown file → click PDF → assert `page.on('download')` fires + filename; repeat for an HTML file. Confirms fake↔real `IPdfGenerator` parity (R-TEST-008 substitute). **Bundle check**: take a baseline of the route's eager chunk before T002 and confirm after T005 that `html2pdf`/`dompurify` are NOT in the eager chunk (AC-8) — e.g. `next build` chunk inspection or a grep of the route chunk for the module names. | file-browser | (harness + build output; no source change) | Both surfaces download with the expected filename; eager chunk does not contain `html2pdf`/`dompurify`. | CS-2. PL-07: no `networkidle` wait. |
| [ ] | T008 | Manual fidelity pass (light + dark): headings/lists/GFM table/highlighted code; a wide table; a mermaid file (record empty-box behaviour); confirm code-block theme colours match via **live-DOM capture** (no bake-in step — Finding 02). Then update `docs/domains/file-browser/domain.md` — History row, Composition (`usePdfExport`, `PdfGenerator`), Concepts ("Export preview to PDF"). | file-browser | `docs/domains/file-browser/domain.md` | Manual checks recorded in spec/exec log; domain.md updated. | CS-1. |

### Acceptance Criteria

- [ ] "Download as PDF" button visible in markdown **preview** mode with `aria-label` + tooltip; absent in `[Source]`/`[Diff]`.
- [ ] Clicking it (markdown) downloads `<basename>.pdf` with rendered headings, lists, GFM tables, highlighted code — no print dialog.
- [ ] "Download as PDF" button visible in the HTML preview; clicking downloads a sanitized `<basename>.pdf` of the HTML, and the captured HTML contains no `&_at=` asset token (Finding 11).
- [ ] **Markdown** PDF reflects the active light/dark theme; code-block colors match the visible preview. (HTML files render their own embedded styles — the app theme does not apply to them; Finding 10.)
- [ ] Spinner + disabled button while generating; success/error toast on completion.
- [ ] Filename = source basename with extension replaced by `.pdf`; empty → `document.pdf`.
- [ ] Eager bundle for the browser route does not grow — `html2pdf.js` fetched only on first click.
- [ ] PDF generation is exercised through `IPdfGenerator` with a `FakePdfGenerator` in unit tests (no `vi.mock`).
- [ ] Mermaid: ~300ms pre-capture delay applied; unrendered diagrams may show as empty boxes (documented limitation).

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Untrusted HTML executes in app origin during capture | Medium | **High** (XSS) | DOMPurify-sanitize before staging (Finding 03); never `allow-same-origin` on any capture surface. |
| Mermaid not rendered at capture → empty box | Medium | Medium | Live-DOM capture + 300ms delay; documented V1 limitation. |
| Wide GFM tables truncate in portrait | Medium | Medium | `table-layout: fixed` + word-break; auto-landscape when a table exceeds content width. |
| `html2pdf.js` ships no TS types | Medium | Low | Local `declare module 'html2pdf.js'` shim (T001). |
| html2canvas rasterizes → no selectable PDF text | High | Low | Accepted non-goal; documented. |
| HTML files with relative assets won't embed client-side | Medium | Low | Accept text/layout fidelity; documented limitation. |
| Eager bundle grows if import isn't lazy | Low | Medium | `await import()` inside the handler (both html2pdf + dompurify); bundle check in T007. |
| Untrusted HTML sanitizer misconfigured → silent XSS | Low | **High** | Explicit DOMPurify config + attack-vector tests (T002); sanitize-then-stage; off-screen in-document staging removed in `finally` (Findings 03, 10). |
| Asset token baked into shared PDF | Medium | **High** | Capture original pre-rewrite HTML, never the token-rewritten string; no-`&_at=` test (Finding 11, T005). |
| Double-click / unmount-during-export | Medium | Low | `isExporting` re-entrancy guard + FX011-style abort/mounted guard (T003). |

---

## Validation Record (2026-05-28)

### Validation Thesis

**Raison d'être**: Make the single-click PDF feature buildable in one Simple-mode phase with library, placement, capture strategy, and security mitigations already decided — so plan-6 builds without re-deciding.

**Value claim**: Implementation becomes cheaper and safer; the implementer doesn't re-litigate library/placement/capture/testing; the reviewer gets acceptance criteria + rollback.

**Artifact promise**: Following the 8 tasks in order yields the working feature without re-deciding library/placement/capture/tests.

**Intended beneficiaries**: the plan-6 implementer, the reviewer, future maintainers.

**Proof target**: Implementation.

**Evidence standard**: accurate source claims (verified), testable acceptance criteria, research-backed library decision, explicit untrusted-HTML mitigation.

**Thesis source**: `preview-pdf-download-spec.md` + `external-research/pdf-library-selection.md` + `preview-pdf-download-research.md` + user request.

**Thesis verdict**: Partially advanced → **Advanced after fixes** (the under-specified security/capture constraints are now explicit).

**Main thesis risk**: untrusted-HTML handling was under-specified and hard-coded line numbers could rot — both now mitigated (explicit DOMPurify config + token exclusion + off-screen in-document staging; line numbers tagged "as of" with context-search fallback).

---

| Agent | Lenses Covered | Thesis Axes | Issues | Verdict |
|-------|---------------|-------------|--------|---------|
| Coherence & Domain | System Behavior, Integration & Ripple, Domain Boundaries | Implementation Readiness | 2 (down-graded to MED/LOW) + clarity nits, fixed | ✅ after fixes |
| Source-Truth & Evidence | Evidence Sufficiency, Proof-Level Fit, Technical Constraints, Concept Docs | Evidence Sufficiency | **0 — all file/line claims verified accurate** | ✅ |
| Risk & Security | Security & Privacy, Edge Cases, Deployment & Ops, Hidden Assumptions | Safety to Change | 1 HIGH + 4 MED + 4 LOW; HIGH + security MEDs fixed | ✅ after fixes |
| Thesis & Forward-Compat | Thesis Alignment, Forward-Compatibility, UX | Thesis, Downstream Usefulness | 5 MED + 2 LOW forward-compat; substantive ones fixed | ⚠️ → ✅ after fixes |

**Lens coverage**: 14/15. Forward-Compatibility engaged (not STANDALONE — plan-6 + source files + domain.md consume this plan).

### Forward-Compatibility Matrix (post-fix)

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| plan-6 implementer | accurate task table + paths + entrance criteria | shape mismatch | ✅ (was ⚠️) | line-number "as of" note + context-search fallback added; sanitization/token/staging now explicit in T002/T005 |
| `file-viewer-panel.tsx` | `:502` preview wrapper + main toolbar `354-394`, raw-button idiom | encapsulation lockout | ✅ | verified accurate by Source-Truth agent; rot mitigated by context-search note |
| `html-viewer.tsx` | original HTML source available + own toolbar `181-191` | shape mismatch | ✅ | verified accurate; T005 now specifies original pre-rewrite source + no-token test |
| `docs/domains/file-browser/domain.md` | History + Composition + Concepts updated | contract drift | ✅ | T008 owns the update |
| spec → plan contract | implementer doesn't re-decide library/placement/capture/testing | contract drift | ✅ | library research-backed; two-toolbar + theme scoping + capture strategy now explicit in spec + plan |

**Thesis alignment**: Value claim advanced at the Implementation proof target; the one HIGH (XSS config) and the security-relevant MEDIUMs (asset-token leakage, detached-staging theme loss, abort safety) are now resolved in-plan, so the implementer can build without re-deciding.

**Outcome alignment**: "Today there is no way to get a shareable, portable copy of a rendered doc out of the app. This closes that gap with the lightest possible footprint." — the plan, executed against the now-hardened 8-task table, ships single-click PDF for both markdown and HTML previews in one Simple phase with no eager-bundle cost, and (post-fix) without leaking an asset token into the shareable file.

**Standalone?**: No — plan-6 implementation, the two source files, and domain.md all consume this plan.

**Overall**: ⚠️ VALIDATED WITH FIXES
