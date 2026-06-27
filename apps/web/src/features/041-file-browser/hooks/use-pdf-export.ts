'use client';

/**
 * usePdfExport — orchestrates client-side "Download as PDF" for the file viewer.
 *
 * Owns: filename derivation, the `isExporting` spinner state, success/error toasts,
 * the blob → `<a download>` download, a ~300ms pre-capture delay for mermaid on the
 * element path (Finding 07), a single-flight re-entrancy guard, and an unmount guard
 * so a late-resolving export never updates state or toasts after the viewer is gone
 * (mirrors the FX011 abort/mounted guard in `html-viewer.tsx`).
 *
 * The generator is injected via `IPdfGenerator` (no tsyringe DI — ADR-0013 / Finding 09);
 * the default is a stable module-level `Html2PdfGenerator` so callback identities stay
 * stable across renders. The default instance does NOT import the render engine
 * (html2canvas-pro / jsPDF) until `generate` runs, so the eager bundle is untouched
 * (Finding 06 / AC-8).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Html2PdfGenerator, type IPdfGenerator, type PdfExportRequest } from '../lib/pdf-generator';

/** Pre-capture delay giving client-rendered mermaid diagrams a moment to paint (Finding 07). */
const MERMAID_PRECAPTURE_DELAY_MS = 300;

const defaultGenerator: IPdfGenerator = new Html2PdfGenerator();

/** Basename with its extension replaced by `.pdf`; empty/untitled → `document.pdf`. */
export function deriveFilename(filePath: string | null | undefined): string {
  const base = (filePath ?? '').split('/').pop()?.trim() ?? '';
  if (!base) return 'document.pdf';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem || 'document'}.pdf`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface UsePdfExport {
  isExporting: boolean;
  /** Capture a live preview DOM node (markdown). No-ops if `element` is null. */
  exportElement: (element: HTMLElement | null, filePath: string) => Promise<void> | undefined;
  /** Capture an untrusted HTML source string (sanitized by the generator). */
  exportHtml: (html: string, filePath: string) => Promise<void>;
}

export function usePdfExport(generator: IPdfGenerator = defaultGenerator): UsePdfExport {
  const [isExporting, setIsExporting] = useState(false);
  // Synchronous re-entrancy guard — `isExporting` state lags a render behind, so a
  // double-click within the same tick must be blocked via a ref.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (req: PdfExportRequest, delayMs = 0): Promise<void> => {
      if (inFlightRef.current) return; // single-flight: ignore while busy
      inFlightRef.current = true;
      setIsExporting(true);
      try {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        const blob = await generator.generate(req);
        downloadBlob(blob, req.filename);
        if (mountedRef.current) toast.success('PDF downloaded');
      } catch (err) {
        console.error('[pdf-export] generation failed', err);
        if (mountedRef.current) toast.error('Could not generate PDF');
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setIsExporting(false);
      }
    },
    [generator]
  );

  const exportElement = useCallback(
    (element: HTMLElement | null, filePath: string) => {
      if (!element) return undefined;
      return run(
        { source: { kind: 'element', element }, filename: deriveFilename(filePath) },
        MERMAID_PRECAPTURE_DELAY_MS
      );
    },
    [run]
  );

  const exportHtml = useCallback(
    (html: string, filePath: string) =>
      run({ source: { kind: 'html', html }, filename: deriveFilename(filePath) }),
    [run]
  );

  return { isExporting, exportElement, exportHtml };
}
