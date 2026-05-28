# External Research: PDF Library Selection

**Source**: Perplexity Sonar Deep Research (`mcp__perplexity__perplexity_research`)
**Date**: 2026-05-28
**Reasoning Effort**: high
**Research opportunity**: #1 from `preview-pdf-download-research.md`
**Question**: Which PDF generation library should we use for single-click MD/HTML preview → PDF download in a Next.js 15/16 + React 19 app with strict bundle-size limits, given an existing remark/rehype/Shiki/mermaid pipeline?

---

## TL;DR — Recommendation

**Use `html2pdf.js`** (lazy-loaded inside the click handler). It is the single library among the eight candidates that satisfies all hard constraints:

- ~45 KB gzipped (well under the 120 KB Tiptap-era ceiling) — lazy-loadable via dynamic import
- Client-side only — no Chromium binary, no serverless cold-start penalty, deploys cleanly on Vercel/Cloudflare/Netlify
- Compatible with React 19 + Next 15/16 App Router (operates at DOM level; no React-internal coupling)
- Maintained through 2025; healthy issue resolution velocity
- Test-injectable behind a `PdfGenerator` interface for our Fakes-not-mocks rule

**Accept these fidelity tradeoffs explicitly**:
- **Shiki dual-theme** (`--shiki-light` / `--shiki-dark` CSS variables) — requires a preprocessing step before capture to "bake in" the active theme as inline styles. Without it, CSS-variable syntax may leak through into the output.
- **Mermaid** — must wait for client-side render to complete before capture (no completion callback exists today; needs a MutationObserver or render-ready flag). Forcing `scale: 5` on html2canvas significantly improves SVG quality.
- **GFM tables** — complex tables with merged cells or wide content can truncate. Mitigate with explicit container widths and landscape orientation when needed.
- **Selectable text** — html2pdf rasterizes content via html2canvas. The PDF will not have selectable text. If selectable text is a hard requirement, this lib is wrong.

**Second-choice fallback**: **`jspdf` + `html2canvas` directly** — same fidelity envelope as html2pdf.js, ~50 KB gz, more boilerplate, but finer-grained control. Useful if html2pdf's wrapper abstracts away a knob we need.

**Hard NO**:
- `@react-pdf/renderer` — ~350 KB min (~120 KB gz, at the ceiling), requires re-implementing the rendering pipeline as `<Page><Text>…</Text></Page>` components (won't accept our pre-rendered HTML), open React 19 compat issues, maintenance slowing.
- `paged.js` — beautiful CSS-paged-media fidelity, but explicitly does not produce a PDF; it prepares HTML for the browser's "Save as PDF" dialog. Fails the single-click requirement.
- `window.print()` — same dialog problem. The proposed `window.print({ saveAsPDF: true })` is still experimental as of 2026 (whatwg/html #7946).
- Puppeteer / Playwright + `@sparticuz/chromium` — possible on Vercel (~50 MB binary fits the 250 MB function cap) but adds 5–15 s cold start, higher memory tier, and is round-trip-blocking. Reserve for V2 if client-side fidelity proves inadequate.
- `wkhtmltopdf` — system binary; not viable on serverless.

---

## Decision Matrix

| Library | Bundle (gz) | Shiki | Mermaid | GFM tables | Dark mode | Maintenance | React 19 / Next 15-16 | Serverless | Test inject. | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **html2pdf.js** | ~45 KB | Medium (needs theme bake-in) | Medium (needs render-wait + `scale: 5`) | Medium (width tweaks) | Medium (theme bake-in) | Active 2025 | Yes (DOM-level) | Excellent (client-only) | Adequate (wrap in interface) | **RECOMMEND** |
| jspdf + html2canvas direct | ~50 KB | Medium | Medium (better tuning) | Medium | Medium | Active (html2canvas slowing) | Yes | Excellent | Adequate | Fallback |
| paged.js | ~12 KB | Medium-High | Medium (SVG only) | **High** | Medium (print CSS dup) | Active w/ GitLab→GitHub friction | Yes | Excellent | Adequate | **NO** — requires browser print dialog |
| @react-pdf/renderer | ~120 KB | **Low** | **Low** | **Low** | **Low** (parallel theming) | Slowing | Open issues (React 19 concurrent) | Excellent | Excellent | **NO** — wrong model + size |
| Puppeteer + @sparticuz/chromium | ~50 MB binary | **High** | **High** | **High** | **High** | Active | Yes (server) | Complex (250 MB cap; 5–15 s cold start) | Excellent (HTTP boundary) | V2 only |
| Playwright headless | ~50 MB binary | **High** | **High** | **High** | **High** | Active | Yes (server) | Complex | Excellent | V2 only |
| wkhtmltopdf | System binary | High | Medium | High | Medium | Stagnant | Yes (server) | Impractical | Adequate | **NO** |
| window.print() + @media print | 0 KB | High | High (if rendered) | High | High | Native | Native | Native | Adequate | **NO** — print dialog blocks single-click |

---

## Implementation Sketch (recommended path)

### Dynamic import inside the click handler

```ts
// apps/web/src/features/041-file-browser/hooks/use-pdf-export.ts
'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface PdfExportInput {
  /** Already-rendered HTML string (from renderMarkdownToHtml for MD, or raw source for HTML files) */
  html: string;
  /** Source file path — used to derive the PDF filename */
  filePath: string;
  /** Active theme at click time — needed for the Shiki/dark-mode bake-in step */
  theme: 'light' | 'dark';
}

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPdf = useCallback(async ({ html, filePath, theme }: PdfExportInput) => {
    setIsExporting(true);
    try {
      // Lazy-load the heavy bits only when the user clicks
      const { default: html2pdf } = await import('html2pdf.js');

      // Off-DOM staging container — non-sandboxed, so html2canvas can read it
      const stage = document.createElement('div');
      stage.style.position = 'fixed';
      stage.style.left = '-99999px';
      stage.style.top = '0';
      stage.style.width = '8.5in';            // letter page width
      stage.className = `prose dark:prose-invert max-w-none ${theme === 'dark' ? 'dark' : ''}`;
      stage.innerHTML = html;
      document.body.appendChild(stage);

      // Bake CSS variables into inline styles (Shiki dual-theme fix)
      // bakeShikiTheme(stage, theme);  // see "Required preprocessing" below

      // (Optional) Wait for any mermaid SVGs to finish rendering inside the stage
      // await waitForMermaidComplete(stage);

      const filename = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'document';

      const blob: Blob = await html2pdf()
        .from(stage)
        .set({
          margin: [0.5, 0.5, 0.5, 0.5],         // inches
          filename: `${filename}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 5, useCORS: true, logging: false },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        })
        .outputPdf('blob');

      document.body.removeChild(stage);

      // Trigger download via the established pattern (use-clipboard.ts:108-139)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF downloaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`PDF export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportToPdf, isExporting };
}
```

### Required preprocessing — Shiki theme bake-in

Shiki's dual-theme output uses `--shiki-light` / `--shiki-dark` CSS variables. html2canvas reads computed styles at capture time, so this *should* work — but in practice, dual-theme requires a CSS selector (`.dark` ancestor) for the right variable to resolve. The reliable pattern is to walk the staging DOM once, read `getComputedStyle` for `color` / `background-color` on every token, and write the resolved values as inline `style="color: …; background-color: …"`. That guarantees html2canvas sees concrete colors regardless of how variable scoping resolves during capture.

```ts
function bakeShikiTheme(root: HTMLElement, theme: 'light' | 'dark'): void {
  if (theme === 'dark') root.classList.add('dark');
  for (const span of Array.from(root.querySelectorAll<HTMLElement>('pre.shiki span, code.shiki span'))) {
    const c = getComputedStyle(span);
    span.style.color = c.color;
    if (c.backgroundColor !== 'rgba(0, 0, 0, 0)') span.style.backgroundColor = c.backgroundColor;
  }
}
```

### Required preprocessing — Mermaid render-ready (V2)

For V1, document mermaid as a known limitation: `<div data-mermaid="true">` placeholders will appear as empty boxes in the PDF unless the markdown viewer has had time to finish rendering them before the button is clicked.

For V2, expose a render-complete signal from `MarkdownPreview` (see research opportunity #2 in the parent dossier) and either disable the PDF button until ready, or `await` the signal in `exportToPdf`.

Quick workaround that often works in practice: a 200–500 ms `await new Promise(r => setTimeout(r, 300))` before capture, since mermaid render is usually complete by the time the user clicks the toolbar. Not reliable enough to ship as the only mitigation, but acceptable as a stopgap before V2.

### Test injection (Fakes, not mocks)

```ts
// apps/web/src/features/041-file-browser/lib/pdf-generator.ts
export interface IPdfGenerator {
  generate(input: { html: string; filename: string; theme: 'light' | 'dark' }): Promise<Blob>;
}

// Production
export class Html2PdfGenerator implements IPdfGenerator { /* dynamic-import html2pdf inside */ }

// Tests
export class FakePdfGenerator implements IPdfGenerator {
  public lastCall?: { html: string; filename: string; theme: 'light' | 'dark' };
  async generate(input) { this.lastCall = input; return new Blob(['fake-pdf'], { type: 'application/pdf' }); }
}
```

The hook accepts an `IPdfGenerator` (defaulting to the real one). Constitutional `vi.mock` rule is satisfied — tests pass a `FakePdfGenerator` instance.

---

## Known Issues & Workarounds

| Issue | Cause | Workaround |
|---|---|---|
| Mermaid diagrams appear empty in PDF | html2canvas captures before client-side mermaid finishes rendering | Wait for render completion (MutationObserver on `[data-mermaid]` for SVG children); V1 stopgap: 300 ms delay |
| Mermaid SVGs look blurry | html2canvas default `scale: 1` rasterizes SVG | Set `html2canvas: { scale: 5 }` (memory + time cost) |
| Shiki colors wrong / CSS variable syntax leaks | html2canvas doesn't always resolve `var(--shiki-…)` against the right ancestor in detached staging | Bake computed colors as inline styles before capture (`bakeShikiTheme` helper) |
| Wide GFM tables truncate | Default letter portrait isn't wide enough | Detect via DOM width, switch `jsPDF: { orientation: 'landscape' }` for over-threshold tables, OR set `table { table-layout: fixed; word-break: break-word; }` in print CSS |
| Text not selectable in PDF | html2canvas rasterizes | Inherent to image-based PDF gen; if selectable text is required, switch to Puppeteer or `@react-pdf/renderer` (with structural rebuild) |
| Sandboxed iframe HTML (for `.html` file previews) | Parent can't read the iframe | We already hold the original HTML string before iframe blob creation (`html-viewer.tsx:157`) — feed *that* to `exportToPdf`, not the iframe DOM |
| External font fidelity | html2canvas font embedding is unreliable | Use system / web-safe stack in print-relevant elements, or pre-embed via `@font-face` in the staging container's CSS |

---

## Why not Puppeteer / Playwright (yet)

The deep-research analysis cleanly justifies deferring server-side to V2:

- **Cold start**: 5–15 s on Vercel after the function evicts. Not single-click feeling.
- **Function size**: `@sparticuz/chromium` (~50 MB) fits the 250 MB cap, but only with `outputFileTracing` discipline + `includeFiles`/`excludeFiles` in `vercel.json`. Easy to break.
- **Memory tier**: needs 1024 MB+ allocation, which raises cost per export.
- **Security**: server now processes potentially untrusted HTML. Adds an attack surface (RCE, SSRF if assets fetched). Need rate-limit + sandbox.

If V1 ships and we discover that Shiki/mermaid fidelity is a dealbreaker for users, then add `POST /api/workspaces/[slug]/render/pdf` backed by Playwright + `@sparticuz/chromium-min`. The hook interface (`IPdfGenerator.generate(input) → Promise<Blob>`) lets us swap implementations without touching the UI.

---

## V1 Spec Implications (what to write into `/plan-1b-v3-specify-and-clarify`)

The spec should explicitly resolve these as decisions, not open questions:

1. **Library**: `html2pdf.js`, lazy-loaded via `await import()` inside the click handler. Acceptance gate: bundle of `file-viewer-panel.tsx`'s eager chunk does NOT increase.
2. **Modes**: `[Preview]` mode for markdown files; `[Preview]` (or equivalent default) for HTML files. NOT supported in V1: `[Source]`, `[Diff]`, `[Rich]` (Rich added in V1.1 via `editor.getHTML()` if time allows).
3. **Mermaid**: V1 known limitation — mermaid may render as empty boxes if the user clicks before render completes. UX mitigation: 300 ms pre-capture delay. V2 task: real render-complete signal.
4. **Shiki**: theme bake-in helper required. Acceptance criterion: code-block colors in the PDF match the visible preview in both light and dark mode.
5. **GFM tables**: width-aware orientation switch (`landscape` if any table's natural width > page-content width).
6. **Filename**: `basename(filePath).replace(/\.(md|markdown|html|htm)$/i, '') + '.pdf'`. Fallback `document.pdf`.
7. **UX**: `Loader2` spinner + disabled button while exporting; `toast.success` / `toast.error` on settle; `data-testid="file-viewer-download-pdf"` for harness.
8. **Test contract**: `IPdfGenerator` interface; production `Html2PdfGenerator`; `FakePdfGenerator` for unit tests; harness test asserts `page.on('download')` fires and the filename matches.
9. **Domain placement**: entirely inside `file-browser`. No changes to `_platform/viewer` contracts in V1.
10. **Non-goals**: selectable PDF text, mermaid V1, server-side path, page-size customization, multi-file batch export, watermarks/headers/footers.

---

## Citations (from Perplexity)

The deep-research response cited 50 sources. Highlights most directly relevant to our decision:

- [4] github.com/diegomura/react-pdf/issues/632 — bundle size and React 19 issues with @react-pdf/renderer
- [13] github.com/shikijs/shiki/issues/33 — Shiki CSS variable conversion problems
- [16] github.com/niklasvh/html2canvas/issues/3009 — SVG / Mermaid quality and the `scale: 5` workaround
- [18] vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel — official Puppeteer-on-Vercel guidance (and its constraints)
- [29] github.com/eKoopmans/html2pdf.js/releases — html2pdf maintenance evidence
- [30] developer.mozilla.org/.../Media_queries/Printing — print CSS basics for the theme-bake / table-width work
- [36] shiki.matsu.io/guide/dual-themes — Shiki dual-theme variable contract
- [39] nextjs.org/docs/app/getting-started/server-and-client-components — App Router lazy-load pattern
- [43] github.com/whatwg/html/issues/7946 — proposed `window.print({ saveAsPDF: true })` (still experimental in 2026)

Full citation list and the verbatim 52 KB report transcript are persisted in the tool-results cache at the timestamp above; the curated decision-relevant points are summarized here.

---

## Status

- ✅ Research opportunity #1 from `preview-pdf-download-research.md` — **resolved**.
- ⚪ Research opportunity #2 (mermaid render-complete detection) — **not run**. Recommend running before V2 mermaid work; not blocking V1 since the spec accepts mermaid-as-known-limitation.

**Next step**: Run `/plan-1b-v3-specify-and-clarify "single-click PDF download from MD/HTML preview"` with this file in context. The spec should encode the ten V1 decisions above as locked-in choices, not open questions.
