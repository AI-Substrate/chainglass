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
 *  - `html`: an UNTRUSTED HTML-file string. It is DOMPurify-sanitized BEFORE being
 *    staged into an off-screen in-document node for capture (sanitize-then-stage,
 *    Finding 03), then the node is removed. `<style>` blocks are STRIPPED (companion
 *    F002: a staged `<style>` would apply CSS globally to the app document); only inline
 *    `style=` attributes survive, so HTML PDFs keep inline styling but lose `<style>`-block
 *    CSS in V1. The JS-execution vectors (`<script>`, `on*`, `<svg onload>`,
 *    `javascript:`/`data:text/html`, framing tags) are stripped too.
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
 * `<style>` is deliberately FORBIDDEN (companion review F002, HIGH): the staging node is
 * appended to `document.body`, so a `<style>` element from an untrusted HTML file would
 * apply CSS GLOBALLY to the live app document during capture — `@import` / `url(...)`
 * can fire network requests (exfiltration / tracking) and selectors can target real app
 * DOM, none of which DOMPurify's HTML sanitization neutralizes. This restores the
 * original validated-plan stance. V1 tradeoff: HTML-file PDFs lose `<style>`-block CSS
 * (inline `style=` attributes are still preserved). Richer HTML-CSS fidelity (CSS
 * sanitization that rejects `@import`/`url(...)`, or an isolated capture document) is a
 * deferred follow-up.
 */
export const PDF_SANITIZE_CONFIG = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'form'],
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

/** Sanitize untrusted HTML for safe staging + capture. Lazy-imports dompurify. */
export async function sanitizeHtmlForPdf(html: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify');
  return DOMPurify.sanitize(html, PDF_SANITIZE_CONFIG);
}

/**
 * Stage already-sanitized HTML in an off-screen IN-document node, hand it to
 * `capture`, and ALWAYS remove the node afterwards. html2canvas needs the node
 * attached to the document to resolve computed styles, so a detached node will not
 * do (Finding 10). The node is positioned far off-screen to avoid a visible flash.
 */
export async function captureHtmlOffscreen(
  cleanHtml: string,
  capture: (node: HTMLElement) => Promise<Blob>
): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#ffffff';
  // Safe: cleanHtml has already been through sanitizeHtmlForPdf.
  container.innerHTML = cleanHtml;
  document.body.appendChild(container);
  try {
    return await capture(container);
  } finally {
    container.remove();
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
    // Untrusted HTML: sanitize THEN stage off-screen, capture, and always clean up.
    const clean = await sanitizeHtmlForPdf(req.source.html);
    return captureHtmlOffscreen(clean, (node) => captureNodeToPdf(node, '#ffffff'));
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
