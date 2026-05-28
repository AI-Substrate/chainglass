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

---

## T003 — use-pdf-export hook (RED→GREEN)

**Files**: `apps/web/src/features/041-file-browser/hooks/use-pdf-export.ts`,
`test/unit/web/features/041-file-browser/use-pdf-export.test.ts`.

**RED→GREEN** (14 tests). Surface: `usePdfExport(generator?)` → `{ isExporting,
exportElement(el, filePath), exportHtml(html, filePath) }`, plus pure `deriveFilename`.
- `'use client'`; default generator is a stable module-level `Html2PdfGenerator`
  (no eager html2pdf import — constructor is inert) so callback identities are stable.
- Single-flight: a `inFlightRef` (sync) blocks a double-click within the same tick
  (state lags a render); `isExporting` drives the spinner.
- Unmount guard: `mountedRef` gates `setIsExporting` AND the toasts, so a late-resolving
  export after the viewer unmounts neither warns nor toasts (mirrors FX011).
- `exportElement` applies the ~300ms mermaid pre-capture delay; `exportHtml` is immediate.
- Filename derivation: basename, last ext → `.pdf`, empty/dir-only → `document.pdf`.

**Discovery D-PDF-4 (jsdom lacks object URLs)**: `URL.createObjectURL` is undefined in
jsdom, so the blob → `<a download>` path threw and the happy-path *success* toast never
fired (it fell into the error branch — `fake.lastCall` was still set, which is why the
filename assertions passed but the toast assertion failed). Fix: the test stubs
`URL.createObjectURL`/`revokeObjectURL` + `HTMLAnchorElement.prototype.click` (jsdom
gaps, not own code) and restores them in `afterEach`. The fake-timer delay test uses
`vi.advanceTimersByTimeAsync(300)`; the single-flight + unmount tests use a gated
`DeferredPdfGenerator` so generation can be held open across the assertion.

**Evidence**: 14/14 green; hook + test typecheck clean; biome clean.

---

## Companion review — findings resolved (after T001–T003 pings)

The `code-review-companion` returned two findings; both addressed before T004.

**F001 (MEDIUM) — open-ended `dompurify` range on the sanitize boundary**
`apps/web` declared `dompurify: ">=3.3.2"` (pnpm wrote it to match the root override).
Companion: an open-ended range on the security-critical sanitize dep could accept a
future major on a lockfile refresh without an explicit decision.
**Resolution**: direct dep → `^3.3.2` (major-bounded). The root `pnpm.overrides.dompurify
">=3.3.2"` stays as the repo-wide transitive security floor (out of scope to change — it's
a maintained, monorepo-wide policy; it currently supersedes the direct specifier in the
lockfile, which is expected pnpm behaviour and frozen-lockfile-consistent). Resolved
version unchanged (3.3.3).

**F002 (HIGH) — untrusted `<style>` would become GLOBAL app CSS during staging**
My T002 deviation re-allowed `<style>` (`ADD_TAGS`) for HTML fidelity. But the staging
node is appended to `document.body`, so an untrusted file's `<style>` would apply CSS
document-wide during capture — `@import`/`url(...)` can fire network requests
(exfiltration/tracking) and selectors can target the real app DOM. DOMPurify's HTML
sanitization does not neutralize CSS URL/import vectors. This is exactly the boundary the
validated plan avoided by forbidding `style`.
**Resolution**: **reverted to forbidding `<style>`** (Option A — the conservative,
plan-aligned choice). Removed `ADD_TAGS`/`FORCE_BODY`; `'style'` is back in `FORBID_TAGS`.
Inline `style=` attributes are still preserved, so HTML PDFs keep inline styling but lose
`<style>`-block CSS — an accepted V1 limitation. The attack-vector test now asserts
`<style>` (incl. `@import`/`url(...)`) is stripped. Richer HTML-CSS fidelity (a CSS
sanitizer rejecting `@import`/`url(...)`, or an isolated capture document) is a deferred
follow-up. This reverses discoveries D-PDF-1/D-PDF-2 — the companion caught a real
security regression before it shipped.

---

## T004 — Markdown PDF button in FileViewerPanel

**File**: `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx`.

Added `usePdfExport()` + a `previewRef` to the top-level hooks (before the early
returns — Rules of Hooks). Put the `previewRef` on the `mode==='preview'` `<div className="p-4">`
wrapper (live-DOM capture). Added a raw `<button>` to the main toolbar's right-side group
(before Refresh), gated `mode==='preview' && isMarkdown && markdownHtml`:
`aria-label`/`title="Download as PDF"`, `data-testid="file-viewer-download-pdf"`,
`Loader2 animate-spin` + `disabled` while exporting else `FileDown`. onClick →
`exportPreviewPdf(previewRef.current, filePath)`. Matches the local raw-button idiom
(Finding 05); no shadcn Button.

**Evidence**: file-viewer-panel typechecks clean; 22/22 existing FileViewerPanel tests
still pass (no regression); biome clean. DOM-gating + onClick-wiring assertions are T006.

---

## Companion review — F003 (MEDIUM) contract-drift wording

After the F002 fix, the companion flagged stale "`<style>` preserved" wording that now
contradicts the sanitizer. **Resolution**: updated the `pdf-generator.ts` header, the
`pdf-generator.test.ts` header, and plan Key Finding 10 + the AC-4 line to state that
`<style>` blocks are stripped and only inline `style=` survives in V1. The execution-log
F002 entry above is kept as historical context.

---

## T005 — HTML PDF button in HtmlViewer

**File**: `apps/web/src/features/041-file-browser/components/html-viewer.tsx`.

- New `sourceHtml` state stores the **ORIGINAL pre-rewrite** `bodyRes.text()` value
  (set right after the abort check, before `rewriteRelativeUrls`) — so the exported PDF
  is built from token-free HTML (Finding 11). The token-rewritten string is used only for
  the iframe blob, never for export.
- Added `usePdfExport(pdfGenerator)` + a raw PDF button to the HtmlViewer toolbar (left of
  "Open in new tab"), gated on `sourceHtml`: `aria-label`/`title="Download as PDF"`,
  `data-testid="html-viewer-download-pdf"`, `Loader2` while exporting else `FileDown`.
  Filename source = `currentFilePath ?? extractFileParam(src) ?? ''` (new helper reads the
  `&file=` param; `deriveFilename` handles basename + fallback).
- Added optional `pdfGenerator?: IPdfGenerator` prop (test DI, mirrors FileViewerPanel's
  `saveFileImpl` precedent — no DI container per ADR-0013) so T006 can assert the exported
  source has no `&_at=` token via an injected `FakePdfGenerator`.

**Evidence**: html-viewer typechecks clean; biome clean; 10/10 existing rewrite tests pass.
No-token + gating + onClick-wiring assertions land in T006.

---

## T006 — Component DOM-gating + wiring tests

**Files**: `test/unit/web/features/041-file-browser/pdf-export-buttons.test.tsx` (new, 9
tests); added optional `pdfGenerator?: IPdfGenerator` test-DI prop to `FileViewerPanel`
(HtmlViewer got it in T005).

Coverage: FileViewerPanel button present (a11y attrs) in markdown preview; absent in
source/diff/non-markdown-preview/no-markdownHtml. onClick → `{kind:'element'}` + derived
filename. Disabled + spinner while exporting (gated fake). HtmlViewer button appears after
load; onClick → `{kind:'html'}`. **Finding 11**: with the token rewrite active (mocked
asset-token mint + relative-asset HTML), the exported source is the ORIGINAL
`<img src="./pic.png">` — asserts no `&_at=` and no token string leak into the PDF source.

**Discovery D-PDF-5 (test-env teardown)**: jsdom has no `URL.createObjectURL`/`revokeObjectURL`;
restoring them to the (undefined) originals made HtmlViewer's effect-cleanup `revokeObjectURL`
throw post-test. Fix: install the object-URL stubs file-wide and don't restore (jsdom env is
per-file). Also `await`-settled each click test (re-enable) and the lazy `<Suspense>` content
in source/diff renders to silence `act()`/suspended-resource warnings.

**Evidence**: 9/9 new tests green; full `041-file-browser` subset 533 passed / 1 skipped
across 48 files (no regressions); typecheck + biome clean; no act/console warnings.

---

## Companion review — F004 (HIGH) stale-source export after src change

The companion flagged a data-correctness bug I introduced: `HtmlViewer` is keyed by
`refreshKey` (not `src`), so switching HTML file A→B reuses the component; `sourceHtml`
kept A's content during B's pending fetch (and after a failed B load, since error paths
don't clear it), so clicking PDF would export A's HTML under B's filename.
**Resolution**: store `loadedSource = { src, html }` and derive
`sourceHtml = loadedSource?.src === src ? loadedSource.html : null`. The button gates on the
derived value, so during any non-matching state (reload in flight, failed load) the button
hides and cannot export stale content. Added a test: load file A → rerender to file B with
B's fetch pending → assert the button disappears and the generator is never called.

**Evidence**: html-viewer typecheck + biome clean; +1 test (10 in pdf-export-buttons); no
warnings.
