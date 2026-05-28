/**
 * pdf-generator — client-side PDF generation seam for the file-browser preview.
 *
 * `IPdfGenerator` decouples the viewer/hook from `html2pdf.js` so unit tests inject
 * a `FakePdfGenerator` (the real adapter pulls in jspdf + html2canvas, which cannot
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
 *    Finding 03), then the node is removed. `<style>` + inline `style=` are preserved
 *    so the file's own CSS survives (Finding 10 / AC-4 note); the JS-execution vectors
 *    (`<script>`, `on*`, `<svg onload>`, `javascript:`/`data:text/html`, framing tags)
 *    are stripped.
 *
 * Both `html2pdf.js` and `dompurify` are dynamically imported at call time so the
 * eager route bundle is untouched (Finding 06 / AC-8).
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

/** Real adapter — wraps `html2pdf.js`. Never imported until `generate` runs. */
export class Html2PdfGenerator implements IPdfGenerator {
  async generate(req: PdfExportRequest): Promise<Blob> {
    const { default: html2pdf } = await import('html2pdf.js');

    const baseOpts = {
      margin: 10,
      filename: req.filename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    };

    if (req.source.kind === 'element') {
      // Capture the live node — theme + mermaid already resolved. Match the on-screen
      // background so dark theme stays readable (AC-4).
      const opts = {
        ...baseOpts,
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: resolveBackgroundColor(req.source.element),
        },
      };
      const blob = await html2pdf().set(opts).from(req.source.element).outputPdf('blob');
      return blob as Blob;
    }

    // Untrusted HTML: sanitize THEN stage off-screen, capture, and always clean up.
    const clean = await sanitizeHtmlForPdf(req.source.html);
    const opts = {
      ...baseOpts,
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    };
    return captureHtmlOffscreen(clean, async (node) => {
      const blob = await html2pdf().set(opts).from(node).outputPdf('blob');
      return blob as Blob;
    });
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
