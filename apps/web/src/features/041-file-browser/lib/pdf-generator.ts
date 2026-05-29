/**
 * pdf-generator — client-side PDF generation seam for the file-browser preview.
 *
 * `IPdfGenerator` decouples the viewer/hook from the render engine so unit tests inject
 * a `FakePdfGenerator` (the real adapter pulls in html2canvas-pro + jsPDF, which cannot
 * run in jsdom — R-TEST-007). No tsyringe DI registration: per ADR-0013 the DI
 * container is server-side and React hooks can't resolve from it, so the hook takes
 * an optional generator param defaulting to `new Html2PdfGenerator()` (Finding 09).
 *
 * Two source kinds:
 *  - `element`: capture a LIVE in-document preview node (markdown). Rendered mermaid
 *    SVGs + resolved theme colors are already painted, so no detached staging and no
 *    CSS bake-in is needed (Finding 02).
 *  - `html`: an UNTRUSTED HTML-file string. It is DOMPurify-sanitized then rendered in an
 *    ISOLATED, same-origin, scripts-disabled IFRAME for capture (sanitize-then-isolate,
 *    Finding 03 + companion F002 follow-up), and the iframe is always removed afterward.
 *    Because the iframe is a SEPARATE document, the file's own `<style>` blocks style the
 *    capture WITHOUT leaking into the live app document — so HTML PDFs now match the
 *    on-screen page instead of collapsing to bare, unstyled text (FX-PDF-2). CSS `@import`
 *    at-rules are stripped (they can fetch remote stylesheets); inline `url(...)` is kept.
 *    The JS-execution vectors (`<script>`, `on*`, `<svg onload>`, `javascript:`/`data:text/html`,
 *    framing tags) are stripped, and the capture iframe runs WITHOUT `allow-scripts` as
 *    a second line of defense.
 *
 * `html2canvas-pro`, `jspdf`, and `dompurify` are all dynamically imported at call time
 * so the eager route bundle is untouched (Finding 06 / AC-8).
 *
 * We render with `html2canvas-pro` + `jsPDF` directly rather than via `html2pdf.js`:
 * html2pdf bundles stock html2canvas@1.x, which THROWS on the CSS Color 4 values
 * (`lab()` / `oklch()`) that the Tailwind v4 theme emits via getComputedStyle, and its
 * prebuilt webpack interop does not compose with Turbopack (the default export resolves
 * to a non-callable namespace). html2canvas-pro parses modern colors natively.
 */

export type PdfSource = { kind: 'element'; element: HTMLElement } | { kind: 'html'; html: string };

export interface PdfExportRequest {
  source: PdfSource;
  /** Download filename, already derived (basename + `.pdf`). Used by the caller for download. */
  filename: string;
}

export interface IPdfGenerator {
  generate(req: PdfExportRequest): Promise<Blob>;
}

/**
 * DOMPurify config for the untrusted HTML path. DOMPurify already strips `<script>`,
 * all `on*` handlers, and `javascript:` URLs by default; this config makes that intent
 * explicit and adds defense-in-depth (no framing tags, no unknown protocols, no
 * data-* attributes).
 *
 * `<style>` is ALLOWED here (FX-PDF-2): capture now renders into an ISOLATED same-origin
 * iframe (`captureHtmlInIframe`) — the "isolated capture document" that the original F002
 * review named as the proper fix. A `<style>` block scoped to that iframe cannot apply CSS
 * to the live app document or target real app DOM, so the global-pollution vector F002
 * flagged (HIGH) no longer applies — and HTML PDFs regain full `<style>`-block fidelity.
 * The remaining `@import` network vector is closed in `sanitizeHtmlForPdf`, which strips
 * `@import` at-rules from the sanitized output (inline `url(...)` backgrounds are kept).
 * Scripts can never run: DOMPurify strips them AND the capture iframe omits `allow-scripts`.
 */
export const PDF_SANITIZE_CONFIG = {
  // Sanitize the WHOLE document (HTML files are full pages), preserving the `<head>` so
  // head-level `<style>` survives — without this DOMPurify drops head content and the PDF
  // loses its CSS. `<style>` is not in DOMPurify's default allow-list, so add it back
  // explicitly; @import is stripped separately in sanitizeHtmlForPdf (FX-PDF-2).
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ['style'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'form'],
  FORBID_ATTR: [
    'onerror',
    'onload',
    'onclick',
    'ondblclick',
    'onmouseover',
    'onmouseout',
    'onmousedown',
    'onmouseup',
    'onkeydown',
    'onkeyup',
    'onkeypress',
    'onfocus',
    'onblur',
    'onsubmit',
    'onchange',
    'oninput',
    'onanimationstart',
    'onanimationend',
    'ontransitionend',
    'onbegin',
    'onend',
    'onloadstart',
  ],
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOW_DATA_ATTR: false,
};

/** Sanitize untrusted HTML for safe isolated-iframe capture. Lazy-imports dompurify. */
export async function sanitizeHtmlForPdf(html: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify');
  const clean = DOMPurify.sanitize(html, PDF_SANITIZE_CONFIG);
  // `<style>` is allowed (it is isolated to the capture iframe), but a CSS `@import` can
  // still fetch a remote stylesheet — strip those at-rules so an untrusted file can't
  // trigger network requests during capture. Inline `url(...)` backgrounds are preserved.
  return clean.replace(/@import\b[^;]*;?/gi, '');
}

/** Give the isolated document a moment to apply styles + load webfonts before capture. */
async function iframeSettled(iframe: HTMLIFrameElement): Promise<void> {
  try {
    // `fonts` is undefined under jsdom; optional chaining no-ops there.
    await iframe.contentDocument?.fonts?.ready;
  } catch {
    // best-effort: fall through to the timer below
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Render already-sanitized HTML inside an ISOLATED, same-origin, scripts-disabled iframe,
 * hand its `<body>` to `capture`, and ALWAYS remove the iframe afterward. Because the
 * iframe is a SEPARATE document, the file's `<style>` blocks style the capture without
 * leaking into the live app document — this is the "isolated capture document" the F002
 * review named as the proper fix, and it restores full CSS fidelity to HTML-file PDFs.
 *
 * `sandbox="allow-same-origin"` (note: NO `allow-scripts`) lets the parent read
 * `contentDocument` for html2canvas while guaranteeing the file's scripts never execute.
 * The doc is rendered at a desktop width so responsive layouts keep their on-screen look;
 * `canvasToA4Pdf` then scales the capture to fit the page.
 */
export async function captureHtmlInIframe(
  cleanHtml: string,
  capture: (node: HTMLElement) => Promise<Blob>
): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.cssText =
    'position:fixed;left:-99999px;top:0;width:1024px;height:0;border:0;background:#ffffff';
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('pdf-export: iframe contentDocument unavailable');
    // Safe: cleanHtml has already been through sanitizeHtmlForPdf, and the iframe omits
    // allow-scripts, so nothing in the file can execute.
    doc.open();
    doc.write(cleanHtml);
    doc.close();
    await iframeSettled(iframe);
    // Grow the iframe to the full content height so html2canvas captures the whole page.
    const root = doc.documentElement;
    iframe.style.height = `${Math.max(root.scrollHeight, doc.body?.scrollHeight ?? 0)}px`;
    return await capture(doc.body ?? root);
  } finally {
    iframe.remove();
  }
}

/** Walk ancestors to find the first non-transparent background color; default white. */
function resolveBackgroundColor(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
    node = node.parentElement;
  }
  return '#ffffff';
}

type JsPDFCtor = typeof import('jspdf').jsPDF;
type CloneHook = (doc: Document, root: HTMLElement) => void;

/**
 * Concrete, cross-platform font stacks for the rasterized PDF. The markdown preview inherits
 * its font from `<body>` (Tailwind Typography sets none on `.prose`); html2canvas clones only
 * the preview sub-tree, loses that inheritance, and falls back to the UA serif. We pin GitHub's
 * system stack so the PDF reads as a clean, business-like sans on macOS (San Francisco) and
 * Windows (Segoe UI), with monospace code blocks.
 */
const PDF_SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
const PDF_MONO_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace';

/** onclone hook: pin the sans stack on the cloned markdown root, keep code/pre monospace. */
function applyMarkdownPdfFont(doc: Document, root: HTMLElement): void {
  root.style.setProperty('font-family', PDF_SANS_STACK, 'important');
  const style = doc.createElement('style');
  style.textContent = `code,kbd,samp,pre,pre *,code *{font-family:${PDF_MONO_STACK} !important}`;
  (doc.head ?? root).appendChild(style);
}

/**
 * Render a node with html2canvas-pro (CSS Color 4 aware) and paginate the resulting
 * canvas into an A4 PDF. Both heavy deps are imported lazily here, never at module load.
 * `onclone` runs against the rasterization clone only (never the on-screen DOM).
 */
async function captureNodeToPdf(
  node: HTMLElement,
  backgroundColor: string,
  onclone?: CloneHook
): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas-pro');
  const { jsPDF } = await import('jspdf');
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor, onclone });
  return canvasToA4Pdf(canvas, jsPDF);
}

/**
 * Slice a (potentially tall) canvas across A4 portrait pages. The image keeps a
 * left/right margin and is shifted up one page-height at a time; content is rasterized
 * and may break across a page boundary (accepted V1 limitation, same as html2pdf).
 */
function canvasToA4Pdf(canvas: HTMLCanvasElement, JsPDF: JsPDFCtor): Blob {
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.98);

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position = heightLeft - imgH; // negative offset: shift the image up by one page
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
    heightLeft -= pageH;
  }
  return pdf.output('blob') as Blob;
}

/**
 * Real adapter — renders a DOM node to a canvas (html2canvas-pro) and paginates it into
 * a PDF (jsPDF). Neither dep is imported until `generate` runs.
 */
export class Html2PdfGenerator implements IPdfGenerator {
  async generate(req: PdfExportRequest): Promise<Blob> {
    if (req.source.kind === 'element') {
      // Capture the live node — theme + mermaid already resolved. Match the on-screen
      // background so dark theme stays readable (AC-4); pin a clean sans font (the cloned
      // sub-tree would otherwise serif-fall-back, see applyMarkdownPdfFont).
      return captureNodeToPdf(
        req.source.element,
        resolveBackgroundColor(req.source.element),
        applyMarkdownPdfFont
      );
    }
    // Untrusted HTML: sanitize THEN render in an isolated iframe (its own `<style>` applies
    // there, never to the app document), capture, and always clean up. Full CSS fidelity.
    const clean = await sanitizeHtmlForPdf(req.source.html);
    return captureHtmlInIframe(clean, (node) => captureNodeToPdf(node, '#ffffff'));
  }
}

/** Test substitute — records calls, returns a stub Blob, can simulate failure. */
export class FakePdfGenerator implements IPdfGenerator {
  lastCall?: PdfExportRequest;
  calls: PdfExportRequest[] = [];
  blobToReturn = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
  shouldThrow = false;

  async generate(req: PdfExportRequest): Promise<Blob> {
    this.lastCall = req;
    this.calls.push(req);
    if (this.shouldThrow) throw new Error('FakePdfGenerator: simulated failure');
    return this.blobToReturn;
  }
}
