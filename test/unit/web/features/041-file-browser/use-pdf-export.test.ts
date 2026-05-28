/**
 * usePdfExport — filename derivation, async state, toast, re-entrancy, mermaid delay,
 * and unmount safety. Plus `deriveFilename` as a pure unit.
 *
 * @vitest-environment jsdom
 *
 * Why: The hook is the orchestration brain — it decides the download filename, drives
 *   the `isExporting` spinner state, fires success/error toasts, debounces a ~300ms
 *   pre-capture delay for mermaid, refuses re-entrant double-clicks, and must not
 *   touch React state after the viewer unmounts mid-export. None of that needs a real
 *   PDF, so it is all asserted here behind a `FakePdfGenerator` / a gated test fake
 *   (the real adapter is harness-only — R-TEST-007).
 * Contract:
 *   - `deriveFilename(path)` → basename with extension replaced by `.pdf`; empty →
 *     `document.pdf`.
 *   - `exportElement(el, path)` applies a ~300ms pre-capture delay (mermaid) then
 *     generates from the live element; `exportHtml(html, path)` generates immediately.
 *   - `isExporting` goes true→false across success AND error; a second call while
 *     exporting is ignored (re-entrancy guard); after unmount, no state update / toast.
 *   - success → `toast.success`; failure → `toast.error`.
 * Usage Notes: `sonner` is mocked (third-party, not own code) so toasts are
 *   observable without a Toaster render. The generator is injected via `IPdfGenerator`
 *   (own-code seam — no `vi.mock` of own code). Fake timers drive the delay assertion.
 * Quality Contribution: Locks the UX + safety contract (spinner, single-flight,
 *   unmount-safe) before T004/T005 wire the buttons.
 * Worked Example: `deriveFilename('docs/notes.md')` → `'notes.pdf'`.
 *
 * Plan preview-pdf-download T003. Findings 07, 08.
 */

import { deriveFilename, usePdfExport } from '@/features/041-file-browser/hooks/use-pdf-export';
import {
  FakePdfGenerator,
  type IPdfGenerator,
  type PdfExportRequest,
} from '@/features/041-file-browser/lib/pdf-generator';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

/** Test fake whose generate() resolves only when `resolve()` is called. */
class DeferredPdfGenerator implements IPdfGenerator {
  calls: PdfExportRequest[] = [];
  private pending: Array<(b: Blob) => void> = [];
  generate(req: PdfExportRequest): Promise<Blob> {
    this.calls.push(req);
    return new Promise<Blob>((res) => {
      this.pending.push(res);
    });
  }
  resolveAll(): void {
    for (const res of this.pending) res(new Blob(['%PDF'], { type: 'application/pdf' }));
    this.pending = [];
  }
}

// jsdom implements neither object URLs nor anchor-triggered downloads — stub the
// browser APIs the blob → <a download> path relies on (not own code).
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;
const realAnchorClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  HTMLAnchorElement.prototype.click = realAnchorClick;
});

describe('deriveFilename', () => {
  it.each([
    ['README.md', 'README.pdf'],
    ['docs/notes.md', 'notes.pdf'],
    ['report.html', 'report.pdf'],
    ['a/b/c/deep.markdown', 'deep.pdf'],
    ['noext', 'noext.pdf'],
  ])('%s -> %s', (input, expected) => {
    expect(deriveFilename(input)).toBe(expected);
  });

  it('falls back to document.pdf for empty / nullish input', () => {
    expect(deriveFilename('')).toBe('document.pdf');
    expect(deriveFilename(undefined)).toBe('document.pdf');
    expect(deriveFilename(null)).toBe('document.pdf');
    expect(deriveFilename('some/dir/')).toBe('document.pdf');
  });
});

describe('usePdfExport — happy path + state', () => {
  it('exportHtml passes the html source kind + derived filename, toasts success', async () => {
    const fake = new FakePdfGenerator();
    const { result } = renderHook(() => usePdfExport(fake));

    await act(async () => {
      await result.current.exportHtml('<h1>hi</h1>', 'docs/page.html');
    });

    expect(fake.lastCall?.source.kind).toBe('html');
    expect(fake.lastCall?.filename).toBe('page.pdf');
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.isExporting).toBe(false);
  });

  it('exportElement passes the element source kind + filename', async () => {
    const fake = new FakePdfGenerator();
    const el = document.createElement('div');
    const { result } = renderHook(() => usePdfExport(fake));

    await act(async () => {
      await result.current.exportElement(el, 'notes.md');
    });

    expect(fake.lastCall?.source.kind).toBe('element');
    expect(fake.lastCall?.filename).toBe('notes.pdf');
  });

  it('exportElement no-ops on a null element', async () => {
    const fake = new FakePdfGenerator();
    const { result } = renderHook(() => usePdfExport(fake));
    await act(async () => {
      await result.current.exportElement(null, 'notes.md');
    });
    expect(fake.calls).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toggles isExporting true while generating, false after', async () => {
    const deferred = new DeferredPdfGenerator();
    const { result } = renderHook(() => usePdfExport(deferred));

    let p: Promise<void> | undefined;
    act(() => {
      p = result.current.exportHtml('<h1>x</h1>', 'a.html') as Promise<void>;
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    await act(async () => {
      deferred.resolveAll();
      await p;
    });
    expect(result.current.isExporting).toBe(false);
  });

  it('toasts error and resets isExporting when the generator throws', async () => {
    const fake = new FakePdfGenerator();
    fake.shouldThrow = true;
    const { result } = renderHook(() => usePdfExport(fake));

    await act(async () => {
      await result.current.exportHtml('<h1>x</h1>', 'a.html');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });
});

describe('usePdfExport — re-entrancy + mermaid delay + unmount', () => {
  it('ignores a second call while an export is in flight (single-flight)', async () => {
    const deferred = new DeferredPdfGenerator();
    const { result } = renderHook(() => usePdfExport(deferred));

    let p1: Promise<void> | undefined;
    act(() => {
      p1 = result.current.exportHtml('<h1>1</h1>', 'a.html') as Promise<void>;
      // second call before the first resolves — must be ignored
      result.current.exportHtml('<h1>2</h1>', 'b.html');
    });
    expect(deferred.calls).toHaveLength(1);

    await act(async () => {
      deferred.resolveAll();
      await p1;
    });
  });

  it('applies a ~300ms pre-capture delay on the element path before generating', async () => {
    vi.useFakeTimers();
    const fake = new FakePdfGenerator();
    const el = document.createElement('div');
    const { result } = renderHook(() => usePdfExport(fake));

    let done: Promise<void> | undefined;
    act(() => {
      done = result.current.exportElement(el, 'notes.md') as Promise<void>;
    });
    // generator not called yet — delay still pending
    expect(fake.calls).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await done;
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('does not toast or update state after unmount mid-export', async () => {
    const deferred = new DeferredPdfGenerator();
    const { result, unmount } = renderHook(() => usePdfExport(deferred));

    act(() => {
      void result.current.exportHtml('<h1>x</h1>', 'a.html');
    });
    unmount();

    await act(async () => {
      deferred.resolveAll();
      await Promise.resolve();
    });
    // export completed after unmount → no success toast (mounted guard)
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
