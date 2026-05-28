# Execution Log — Single-Click PDF Download from MD / HTML Preview

**Plan**: [preview-pdf-download-plan.md](./preview-pdf-download-plan.md)
**Mode**: Simple (8 tasks, single phase)
**Companion**: `code-review-companion` (minih Power-On-Mode), run `2026-05-28T15-38-18-477Z-9bcb`

> Separate from the shared `execution.log.md` (which logs the FlowSpace MCP
> sub-feature) so this feature's log stays self-contained.

---

## Pre-Phase Harness Note

L3 harness boot (`just dev` + Playwright/CDP) is exercised at **T007**, where it
verifies the one thing jsdom cannot: a real `page.on('download')` event + filename.
T001–T006 are pure-logic / component work validated in vitest (jsdom), so a full
dev-server boot is not a prerequisite for them. The vitest runner is the active
substrate for the test-first tasks (`pnpm vitest run <path>`).

---

## T001 — Add deps (html2pdf.js, dompurify)

**Done**: Added `html2pdf.js@^0.14.0` and `dompurify` (`>=3.3.2`) to `apps/web`.

**Deviations from plan (both reduce footprint, neither changes behaviour)**:
- **No `@types/dompurify`**: `dompurify@3.3.3` ships its own types
  (`./dist/purify.cjs.d.ts`). `@types/dompurify` is a deprecated stub for v3 — adding
  it would shadow the real types, not help.
- **No local `declare module 'html2pdf.js'` shim**: `html2pdf.js@0.14.0` ships a
  complete bundled `type.d.ts` (`declare module "html2pdf.js"` with `from()`, `.set()`,
  `.outputPdf()` → `Promise`). The plan hedged the shim on "if it ships no types" — it does.
- **dompurify range `>=3.3.2`**: written by pnpm to match the root `pnpm.overrides`
  security pin (`"dompurify": ">=3.3.2"`). Left as-is — consistent with repo policy.

**Evidence**: `pnpm install` exited 0; both modules resolve and expose bundled `.d.ts`;
`apps/web/package.json` now lists both.

---

## T002 — IPdfGenerator + Html2PdfGenerator + FakePdfGenerator (RED→GREEN)

**Files**: `apps/web/src/features/041-file-browser/lib/pdf-generator.ts`,
`test/unit/web/features/041-file-browser/pdf-generator.test.ts`.

**RED→GREEN**: Wrote the 15-test spec first (module-missing failure = RED), then
implemented to green. Public surface: `IPdfGenerator` / `PdfExportRequest` /
`PdfSource` (`element` | `html`), `sanitizeHtmlForPdf`, `captureHtmlOffscreen`,
`PDF_SANITIZE_CONFIG`, `Html2PdfGenerator`, `FakePdfGenerator`. Both `html2pdf.js`
and `dompurify` are `await import(...)` inside `generate`/`sanitizeHtmlForPdf` (eager
bundle stays flat — AC-8).

**Testability split (no `vi.mock` of own code, html2pdf can't run in jsdom)**:
- `sanitizeHtmlForPdf` → tested with the REAL DOMPurify in jsdom (attack vectors).
- `captureHtmlOffscreen(clean, captureFn)` → staging + cleanup tested with a fake
  capture callback (incl. throw path → node still removed). This keeps html2pdf out
  of the unit tests entirely; the real `Html2PdfGenerator.generate()` is harness-only (T007).
- `FakePdfGenerator` records `lastCall`/`calls`, returns a stub Blob, `shouldThrow`.

**Discovery D-PDF-1 (security ↔ fidelity tension; deviation from plan's literal config)**:
The plan's T002 `FORBID_TAGS` listed `'style'`, but Finding 10 + the AC-4 note say HTML
files must "render their own embedded styles." Forbidding `<style>` would strip ALL CSS
and yield unstyled PDFs — contradicting the stated HTML behaviour. Resolution: **keep
`<style>`** (`ADD_TAGS:['style']`) since a style element cannot execute JS; the actual
XSS vectors (`<script>`, `on*`, `<svg onload>`, `javascript:`/`data:text/html`, framing
tags) remain forbidden + are proven stripped by attack-vector tests. Flagged to the
companion for a security second-opinion.

**Discovery D-PDF-2 (DOMPurify drops leading/`<head>` `<style>`)**: With default
extraction DOMPurify returns body-only, hoisting+dropping a leading `<style>` (and any
`<head>` CSS — exactly where real HTML files keep it). Fix: `FORCE_BODY:true` flattens
to body context and preserves `<style>`; verified the `div.innerHTML` staging round-trip
keeps the style element while still stripping script/onerror.

**Discovery D-PDF-3 (`as const` vs DOMPurify `Config`)**: `PDF_SANITIZE_CONFIG as const`
made `ADD_TAGS: readonly ['style']`, which is not assignable to `Config.ADD_TAGS: string[]`
(TS2769). Dropped `as const`.

**Evidence**: 15/15 tests green; `pdf-generator.ts` + test typecheck clean under both
`apps/web/tsconfig.json` and `test/tsconfig.json` (pre-existing unrelated carry-over
errors elsewhere left untouched — not introduced by this change); biome clean.
