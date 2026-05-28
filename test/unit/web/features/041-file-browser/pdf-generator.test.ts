/**
 * pdf-generator — IPdfGenerator seam, HTML sanitization, and off-screen staging.
 *
 * @vitest-environment jsdom
 *
 * Why: The HTML export path stages UNTRUSTED file content (Finding 03) into an
 *   in-document node for html2canvas capture. Inserting raw untrusted HTML into
 *   the live DOM executes `<img onerror>` / `<svg onload>` / inline handlers and
 *   loads `javascript:` URLs — a real XSS hole. The sanitize-then-stage contract
 *   and the off-screen-node lifecycle are the load-bearing safety logic, and both
 *   are pure enough to assert here. The real `Html2PdfGenerator.generate()` pulls
 *   in `html2pdf.js` (jspdf + html2canvas), which cannot run in jsdom — so the seam
 *   exists precisely so unit tests use a `FakePdfGenerator` and the real adapter is
 *   exercised by the L3 harness (R-TEST-007 / R-TEST-008).
 * Contract:
 *   - `sanitizeHtmlForPdf(html)` strips every JS-execution vector (`<script>`,
 *     `on*` handlers, `<svg onload>`, `javascript:`/`data:text/html` URLs, framing
 *     tags `<iframe>/<object>/<embed>`) AND `<style>` blocks (companion F002 — a staged
 *     `<style>` would apply CSS globally to the app document). Only inline `style=`
 *     attributes survive to the PDF in V1.
 *   - `captureHtmlOffscreen(clean, capture)` appends an off-screen in-document node,
 *     hands it to `capture`, returns the capture's Blob, and ALWAYS removes the node
 *     (success or throw) — html2canvas needs the node attached to resolve styles.
 *   - `FakePdfGenerator` records `lastCall` (source kind + filename) and returns a
 *     Blob, so the hook + component wiring can be asserted without html2pdf.
 * Usage Notes: Real DOMPurify runs in jsdom (binds to the global window). No
 *   `vi.mock` of own code; `FakePdfGenerator` is the injected substitute. The real
 *   `Html2PdfGenerator.generate()` is intentionally NOT called here.
 * Quality Contribution: Locks the XSS-mitigation contract before the HTML button
 *   (T005) wires untrusted file content into it, and proves the staging node never
 *   leaks into the document.
 * Worked Example: `await sanitizeHtmlForPdf('<img src=x onerror=alert(1)>')`
 *   → `'<img src="x">'` (onerror gone, img kept).
 *
 * Plan preview-pdf-download T002. Findings 02, 03, 06, 09, 10.
 */

import {
  FakePdfGenerator,
  type IPdfGenerator,
  captureHtmlOffscreen,
  sanitizeHtmlForPdf,
} from '@/features/041-file-browser/lib/pdf-generator';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sanitizeHtmlForPdf — attack vectors stripped', () => {
  it('drops <script> tags entirely', async () => {
    const out = await sanitizeHtmlForPdf('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>hi</p>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips onerror from <img> but keeps the element', async () => {
    const out = await sanitizeHtmlForPdf('<img src="x" onerror="alert(1)">');
    expect(out).toContain('<img');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips onload from <svg>', async () => {
    const out = await sanitizeHtmlForPdf('<svg onload="alert(1)"></svg>');
    expect(out.toLowerCase()).not.toContain('onload');
    expect(out).not.toContain('alert(1)');
  });

  it('removes <iframe>, <object>, and <embed>', async () => {
    const out = await sanitizeHtmlForPdf(
      '<iframe src="evil"></iframe><object data="x"></object><embed src="y">'
    );
    expect(out.toLowerCase()).not.toContain('<iframe');
    expect(out.toLowerCase()).not.toContain('<object');
    expect(out.toLowerCase()).not.toContain('<embed');
  });

  it('neutralizes javascript: href', async () => {
    const out = await sanitizeHtmlForPdf('<a href="javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('neutralizes data:text/html URLs', async () => {
    const out = await sanitizeHtmlForPdf('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(out.toLowerCase()).not.toContain('data:text/html');
  });

  it('strips inline on* handlers from arbitrary elements', async () => {
    const out = await sanitizeHtmlForPdf('<div onclick="steal()">x</div>');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out).not.toContain('steal()');
  });
});

describe('sanitizeHtmlForPdf — fidelity vs security', () => {
  it('DROPS <style> blocks (companion F002): untrusted CSS must not reach the app document', async () => {
    const out = await sanitizeHtmlForPdf(
      '<style>@import url(http://evil.test/x.css);body{background:url(http://evil.test/p.png)}</style><h1>Title</h1>'
    );
    expect(out.toLowerCase()).not.toContain('<style');
    expect(out).not.toContain('@import');
    expect(out).not.toContain('evil.test');
    // safe content survives
    expect(out).toContain('<h1>Title</h1>');
  });

  it('keeps inline style= attributes (preserved fidelity)', async () => {
    const out = await sanitizeHtmlForPdf('<p style="font-weight:bold">x</p>');
    expect(out).toContain('style="font-weight:bold"');
  });

  it('keeps safe structural + text content (headings, lists, tables)', async () => {
    const html = '<h2>H</h2><ul><li>a</li></ul><table><tr><td>c</td></tr></table>';
    const out = await sanitizeHtmlForPdf(html);
    expect(out).toContain('<h2>H</h2>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<td>c</td>');
  });
});

describe('captureHtmlOffscreen — staging lifecycle', () => {
  it('attaches an off-screen node, captures it, returns its Blob, then removes it', async () => {
    const before = document.body.childElementCount;
    let nodeSeenInDocument = false;
    let offScreen = false;
    const blob = new Blob(['x'], { type: 'application/pdf' });

    const result = await captureHtmlOffscreen('<h1>hi</h1>', async (node) => {
      nodeSeenInDocument = document.body.contains(node);
      offScreen = node.style.left.includes('-99999');
      expect(node.innerHTML).toContain('<h1>hi</h1>');
      return blob;
    });

    expect(result).toBe(blob);
    expect(nodeSeenInDocument).toBe(true);
    expect(offScreen).toBe(true);
    // node removed afterwards — body back to its prior child count
    expect(document.body.childElementCount).toBe(before);
  });

  it('removes the staging node even when capture throws', async () => {
    const before = document.body.childElementCount;
    await expect(
      captureHtmlOffscreen('<h1>hi</h1>', async () => {
        throw new Error('capture boom');
      })
    ).rejects.toThrow('capture boom');
    expect(document.body.childElementCount).toBe(before);
  });
});

describe('FakePdfGenerator', () => {
  it('implements IPdfGenerator, records lastCall, returns a Blob', async () => {
    const fake: IPdfGenerator = new FakePdfGenerator();
    const el = document.createElement('div');
    const blob = await fake.generate({
      source: { kind: 'element', element: el },
      filename: 'a.pdf',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect((fake as FakePdfGenerator).lastCall?.source.kind).toBe('element');
    expect((fake as FakePdfGenerator).lastCall?.filename).toBe('a.pdf');
  });

  it('records the html source kind and accumulates calls', async () => {
    const fake = new FakePdfGenerator();
    await fake.generate({ source: { kind: 'html', html: '<h1>x</h1>' }, filename: 'b.pdf' });
    await fake.generate({ source: { kind: 'html', html: '<h1>y</h1>' }, filename: 'c.pdf' });
    expect(fake.lastCall?.source.kind).toBe('html');
    expect(fake.calls).toHaveLength(2);
  });

  it('rejects when shouldThrow is set (drives the hook error path)', async () => {
    const fake = new FakePdfGenerator();
    fake.shouldThrow = true;
    await expect(
      fake.generate({
        source: { kind: 'element', element: document.createElement('div') },
        filename: 'x.pdf',
      })
    ).rejects.toThrow();
  });
});
