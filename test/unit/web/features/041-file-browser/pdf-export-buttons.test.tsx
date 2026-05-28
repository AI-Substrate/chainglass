/**
 * PDF "Download as PDF" buttons — DOM gating, a11y, onClick wiring, spinner state, and
 * the asset-token-exclusion guarantee (Finding 11) for both viewer surfaces.
 *
 * @vitest-environment jsdom
 *
 * Why: The two buttons live in two physically distinct toolbars (FileViewerPanel for
 *   markdown preview, HtmlViewer for HTML preview). The risky bits are: showing the
 *   button only where it makes sense, passing the RIGHT source kind to the generator,
 *   and — for HTML — exporting the ORIGINAL pre-rewrite source so the short-lived
 *   `&_at=` asset token is never baked into a shareable PDF (Finding 11). All of that is
 *   asserted here behind an injected `FakePdfGenerator` (own-code seam — no `vi.mock` of
 *   own code); a real PDF is never produced (R-TEST-007).
 * Contract:
 *   - FileViewerPanel shows `file-viewer-download-pdf` only in markdown preview with
 *     `markdownHtml`; absent in source/diff and non-markdown preview. onClick →
 *     `{ kind:'element' }` + filename derived from `filePath`.
 *   - HtmlViewer shows `html-viewer-download-pdf` once the source has loaded; onClick →
 *     `{ kind:'html' }` whose `html` is the ORIGINAL source — no `&_at=` token even when
 *     the iframe path rewrote URLs with one.
 *   - Both buttons disable + show a spinner while exporting.
 * Usage Notes: `sonner` + heavy viewer deps (CodeMirror, DiffViewer, themed icons,
 *   AsciiSpinner) are mocked (third-party / unrelated). `fetch` + object-URL/anchor APIs
 *   are stubbed for HtmlViewer (jsdom gaps). The markdown export path carries a ~300ms
 *   mermaid delay, so wiring assertions `waitFor` the generator call.
 * Quality Contribution: Locks the user-visible gating + the Finding-11 token-exclusion
 *   invariant before release.
 * Worked Example: clicking the HTML button after a token rewrite → the generator
 *   receives `<img src="./pic.png">` (original), NOT the `&_at=`-tokenized URL.
 *
 * Plan preview-pdf-download T006. Findings 01, 08, 11.
 */

import { FileViewerPanel } from '@/features/041-file-browser/components/file-viewer-panel';
import { HtmlViewer } from '@/features/041-file-browser/components/html-viewer';
import {
  FakePdfGenerator,
  type IPdfGenerator,
  type PdfExportRequest,
} from '@/features/041-file-browser/lib/pdf-generator';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/_platform/themes', () => ({
  FileIcon: ({ className }: { className?: string }) => <img className={className} alt="" />,
}));
vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="code-editor">{value}</div>,
}));
vi.mock('@/components/viewers/diff-viewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
}));
vi.mock('@/features/_platform/panel-layout', () => ({
  AsciiSpinner: () => <div data-testid="ascii-spinner" />,
}));

/** Gated fake so generation can be held open across spinner assertions. */
class DeferredFake implements IPdfGenerator {
  calls: PdfExportRequest[] = [];
  private pending: Array<(b: Blob) => void> = [];
  generate(req: PdfExportRequest): Promise<Blob> {
    this.calls.push(req);
    return new Promise<Blob>((res) => this.pending.push(res));
  }
  resolveAll(): void {
    for (const res of this.pending) res(new Blob(['%PDF'], { type: 'application/pdf' }));
    this.pending = [];
  }
}

// jsdom implements neither object URLs nor anchor-triggered downloads. These stubs are
// installed for the whole file (the jsdom env is per-file, so no cross-file leakage) —
// they are intentionally NOT restored, because the real jsdom values are `undefined` and
// the HtmlViewer effect's cleanup calls `URL.revokeObjectURL` after a test ends.
const realAnchorClick = HTMLAnchorElement.prototype.click;
const realFetch = global.fetch;
URL.createObjectURL = vi.fn(() => 'blob:fake');
URL.revokeObjectURL = vi.fn();

beforeEach(() => {
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = realAnchorClick;
  global.fetch = realFetch;
  vi.clearAllMocks();
});

const mdProps = {
  filePath: 'docs/readme.md',
  content: '# hi',
  language: 'markdown',
  mtime: '2026-05-28T00:00:00Z',
  mode: 'preview' as const,
  onModeChange: vi.fn(),
  onSave: vi.fn(),
  onRefresh: vi.fn(),
  markdownHtml: '<h1>Hello</h1>',
};

describe('FileViewerPanel — PDF button gating', () => {
  it('shows the button (with a11y attrs) in markdown preview', () => {
    render(<FileViewerPanel {...mdProps} />);
    const btn = screen.getByTestId('file-viewer-download-pdf');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Download as PDF');
    expect(btn).toHaveAttribute('title', 'Download as PDF');
  });

  it('hides the button in source mode', async () => {
    render(<FileViewerPanel {...mdProps} mode="source" />);
    await screen.findByTestId('code-editor'); // settle the lazy Suspense boundary
    expect(screen.queryByTestId('file-viewer-download-pdf')).not.toBeInTheDocument();
  });

  it('hides the button in diff mode', async () => {
    render(<FileViewerPanel {...mdProps} mode="diff" />);
    await screen.findByTestId('diff-viewer'); // settle the lazy Suspense boundary
    expect(screen.queryByTestId('file-viewer-download-pdf')).not.toBeInTheDocument();
  });

  it('hides the button for a non-markdown preview', () => {
    render(
      <FileViewerPanel
        {...mdProps}
        language="typescript"
        content="const x = 1;"
        markdownHtml={undefined}
        highlightedHtml="<pre>const x = 1;</pre>"
      />
    );
    expect(screen.queryByTestId('file-viewer-download-pdf')).not.toBeInTheDocument();
  });

  it('hides the button when markdownHtml is absent', () => {
    render(<FileViewerPanel {...mdProps} markdownHtml={undefined} />);
    expect(screen.queryByTestId('file-viewer-download-pdf')).not.toBeInTheDocument();
  });
});

describe('FileViewerPanel — PDF button wiring', () => {
  it('exports the live element with the derived filename on click', async () => {
    const fake = new FakePdfGenerator();
    render(<FileViewerPanel {...mdProps} pdfGenerator={fake} />);

    const btn = screen.getByTestId('file-viewer-download-pdf');
    await userEvent.click(btn);
    await waitFor(() => expect(fake.lastCall).toBeTruthy(), { timeout: 2000 });

    expect(fake.lastCall?.source.kind).toBe('element');
    expect(fake.lastCall?.filename).toBe('readme.pdf');
    // let the export fully settle (download + setIsExporting(false)) inside act
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('disables the button and shows a spinner while exporting', async () => {
    const deferred = new DeferredFake();
    render(<FileViewerPanel {...mdProps} pdfGenerator={deferred} />);
    const btn = screen.getByTestId('file-viewer-download-pdf');

    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.querySelector('.animate-spin')).not.toBeNull();

    await waitFor(() => expect(deferred.calls).toHaveLength(1), { timeout: 2000 });
    deferred.resolveAll();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});

describe('HtmlViewer — PDF button', () => {
  it('shows the button after the source loads and exports the html source kind', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<h1>Doc</h1>',
    })) as unknown as typeof fetch;
    const fake = new FakePdfGenerator();

    render(<HtmlViewer src="/api/raw?worktree=/wt&file=page.html" pdfGenerator={fake} />);

    const btn = await screen.findByTestId('html-viewer-download-pdf');
    expect(btn).toHaveAttribute('aria-label', 'Download as PDF');

    await userEvent.click(btn);
    await waitFor(() => expect(fake.lastCall).toBeTruthy());
    expect(fake.lastCall?.source.kind).toBe('html');
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('exports the ORIGINAL pre-rewrite html — no &_at= asset token (Finding 11)', async () => {
    // Token mint + rewrite both happen (currentFilePath + rawFileBaseUrl + worktree),
    // so the iframe blob carries `&_at=`. The PDF export must use the untouched source.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/bootstrap/asset-token')) {
        return { ok: true, json: async () => ({ token: 'SECRET-TOKEN' }) };
      }
      return { ok: true, text: async () => '<img src="./pic.png">' };
    }) as unknown as typeof fetch;
    const fake = new FakePdfGenerator();

    render(
      <HtmlViewer
        src="/api/raw?worktree=/wt&file=docs/page.html"
        currentFilePath="docs/page.html"
        rawFileBaseUrl="/api/raw"
        pdfGenerator={fake}
      />
    );

    const btn = await screen.findByTestId('html-viewer-download-pdf');
    await userEvent.click(btn);
    await waitFor(() => expect(fake.lastCall).toBeTruthy());

    const exported = fake.lastCall?.source.kind === 'html' ? fake.lastCall.source.html : '';
    expect(exported).toBe('<img src="./pic.png">');
    expect(exported).not.toContain('_at=');
    expect(exported).not.toContain('SECRET-TOKEN');
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("does not expose a previous file's source after src changes (F004)", async () => {
    // File A loads; file B's fetch is left pending. The component is reused across the
    // switch, so the button must hide rather than export A under B's name.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('file=a.html')) return { ok: true, text: async () => '<h1>A</h1>' };
      return new Promise(() => {}); // b.html never resolves
    }) as unknown as typeof fetch;
    const fake = new FakePdfGenerator();

    const { rerender } = render(
      <HtmlViewer src="/api/raw?worktree=/wt&file=a.html" pdfGenerator={fake} />
    );
    await screen.findByTestId('html-viewer-download-pdf'); // A loaded

    rerender(<HtmlViewer src="/api/raw?worktree=/wt&file=b.html" pdfGenerator={fake} />);

    await waitFor(() =>
      expect(screen.queryByTestId('html-viewer-download-pdf')).not.toBeInTheDocument()
    );
    expect(fake.calls).toHaveLength(0);
  });
});
