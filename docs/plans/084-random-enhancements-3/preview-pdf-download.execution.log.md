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
