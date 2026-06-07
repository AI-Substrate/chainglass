'use client';

/**
 * ImageEditor — inline freehand pen annotation over a raster image.
 *
 * Single canvas sized to the image's intrinsic resolution (CSS-scaled for
 * display via object-contain). Pointer Events + setPointerCapture +
 * getCoalescedEvents feed perfect-freehand; strokes are stored in image space
 * (an undo stack of completed strokes) and re-composited over the image on
 * every change so the saved bytes are at native resolution.
 *
 * Save is delegated upward: the editor exports the canvas to base64 and calls
 * onSaveOver / onSaveAsNew (file-browser owns the action + conflict dialog).
 * The viewer never imports file-browser — save flows down as callbacks.
 *
 * Plan 086: In-browser Image Editor — T009 (editor) + T011 (error/load/export states)
 * AC-2 (pen), AC-7 (native res), AC-11/12/13 (save UX), AC-15 (load failure), AC-17 (export/CORS)
 */

import {
  Component,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getStroke } from 'perfect-freehand';

import { Button } from '@/components/ui/button';

import { type Point, type Size, cssToImagePoint } from '../lib/canvas-coords';
import {
  type CanvasExportFormat,
  canvasExportFormat,
  exceedsCanvasLimit,
} from '../lib/image-export';
import { ImageEditorToolbar } from './image-editor-toolbar';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** Terminal result the parent reports back after a save attempt. Viewer-owned
 * shape so the editor never imports file-browser's SaveImageResult. */
export interface ImageSaveOutcome {
  ok: boolean;
  error?: 'conflict' | 'security' | 'write-failed' | 'unsupported-type' | string;
}

export interface ImageEditorProps {
  /** Same-origin image source (raw-file route) — same-origin keeps toBlob untainted (AC-17). */
  imageSrc: string;
  /** Original filename — drives the canvas export format (AC-6). */
  filename: string;
  /** Baseline mtime captured at load; passed to onSaveOver for the conflict guard. */
  imageMtime?: string;
  /** Save back to the original file. Parent owns the conflict dialog. */
  onSaveOver?: (payloadBase64: string, expectedMtime?: string) => Promise<ImageSaveOutcome>;
  /** Save a `<base>-edited.<ext>` sibling (unconditional). */
  onSaveAsNew?: (payloadBase64: string) => Promise<ImageSaveOutcome>;
  /** Leave edit mode (parent confirms discard of unsaved strokes). */
  onCancel?: () => void;
  /** Test seam: override canvas → base64 export (jsdom lacks a real toBlob). */
  saveImpl?: (canvas: HTMLCanvasElement, format: CanvasExportFormat) => Promise<string>;
}

const COLOR_PRESETS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff'] as const;
const WIDTH_PRESETS = [2, 4, 8] as const;

interface Stroke {
  points: number[][]; // image-space [x, y, pressure]
  color: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Stroke geometry
// ---------------------------------------------------------------------------

/** Build a filled Path2D from a perfect-freehand outline (quadratic smoothing). */
function outlineToPath2D(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  const [first] = outline;
  path.moveTo(first[0], first[1]);
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
  });
  ctx.fillStyle = stroke.color;
  ctx.fill(outlineToPath2D(outline));
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Default canvas → base64 exporter. Throws on a CORS-tainted canvas (AC-17). */
async function defaultExport(canvas: HTMLCanvasElement, format: CanvasExportFormat): Promise<string> {
  let target = canvas;
  if (format.flattenAlpha) {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fctx = flat.getContext('2d');
    if (!fctx) throw new Error('Could not create export canvas context');
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    target = flat;
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    // toBlob throws synchronously (SecurityError) on a tainted canvas.
    target.toBlob(resolve, format.mimeType, format.quality);
  });
  if (!blob) throw new Error('Canvas export failed (toBlob returned null)');
  return blobToBase64(blob);
}

// ---------------------------------------------------------------------------
// Error boundary (mirrors EditorErrorBoundary from markdown-wysiwyg-editor)
// ---------------------------------------------------------------------------

interface BoundaryProps {
  onCancel?: () => void;
  children: ReactNode;
}
interface BoundaryState {
  error: string | null;
}

class ImageEditorErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error: error.message || 'Unknown editor error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ImageEditor] Caught error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-4 p-8 text-center"
          data-testid="image-editor-fallback"
        >
          <h3 className="text-lg font-semibold">The image editor couldn&apos;t load.</h3>
          <p className="max-w-md text-sm text-muted-foreground">{this.state.error}</p>
          {this.props.onCancel && (
            <Button variant="outline" onClick={this.props.onCancel}>
              Back to image
            </Button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Inner editor
// ---------------------------------------------------------------------------

function ImageEditorInner({
  imageSrc,
  filename,
  imageMtime,
  onSaveOver,
  onSaveAsNew,
  onCancel,
  saveImpl,
}: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);
  const [width, setWidth] = useState<number>(WIDTH_PRESETS[1]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Holds the exported bytes while the user resolves an mtime conflict.
  const [conflictPayload, setConflictPayload] = useState<string | null>(null);

  // Redraw the image + all strokes (completed + in-progress) at native res.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    if (currentRef.current) drawStroke(ctx, currentRef.current);
  }, []);

  // Load the background image.
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    const handleLoad = () => {
      if (cancelled) return;
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        setLoadError('The image could not be decoded.');
        return;
      }
      if (exceedsCanvasLimit({ width: image.naturalWidth, height: image.naturalHeight })) {
        setLoadError('This image is too large to edit on this device.');
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      imageRef.current = image;
      setLoaded(true);
      redraw();
    };
    const handleError = () => {
      if (!cancelled) setLoadError('The image failed to load.');
    };
    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = imageSrc;
    return () => {
      cancelled = true;
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };
  }, [imageSrc, redraw]);

  const toImagePoint = useCallback((clientX: number, clientY: number, pressure: number): number[] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0, pressure];
    const rect = canvas.getBoundingClientRect();
    const element: Size = { width: rect.width, height: rect.height };
    const image: Size = { width: canvas.width, height: canvas.height };
    const css: Point = { x: clientX - rect.left, y: clientY - rect.top };
    const p = cssToImagePoint(css, element, image);
    return [p.x, p.y, pressure];
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!loaded || loadError) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      currentRef.current = {
        points: [toImagePoint(e.clientX, e.clientY, e.pressure || 0.5)],
        color,
        size: width,
      };
      redraw();
    },
    [loaded, loadError, toImagePoint, color, width, redraw]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = currentRef.current;
      if (!stroke) return;
      const native = e.nativeEvent;
      const events =
        typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
      for (const ev of events) {
        stroke.points.push(toImagePoint(ev.clientX, ev.clientY, ev.pressure || 0.5));
      }
      redraw();
    },
    [toImagePoint, redraw]
  );

  const finishStroke = useCallback(() => {
    const stroke = currentRef.current;
    if (!stroke) return;
    if (stroke.points.length > 0) {
      strokesRef.current = [...strokesRef.current, stroke];
      setStrokeCount(strokesRef.current.length);
    }
    currentRef.current = null;
    redraw();
  }, [redraw]);

  const handleUndo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
  }, [redraw]);

  const exportBase64 = useCallback(async (): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas is not ready');
    const format = canvasExportFormat(filename);
    const exporter = saveImpl ?? defaultExport;
    return exporter(canvas, format);
  }, [filename, saveImpl]);

  const reportFailure = useCallback((error?: string) => {
    // Retain strokes; surface a retryable error (AC-13).
    setSaveError(`Save failed (${error ?? 'unknown'}). Your drawing is preserved — try again.`);
  }, []);

  const handleExportError = useCallback((err: unknown) => {
    // toBlob SecurityError (CORS taint) or export failure (AC-17).
    setSaveError(
      err instanceof Error && /secur/i.test(err.message)
        ? 'Could not export the image (the canvas is cross-origin tainted).'
        : 'Could not export the image. Your drawing is preserved — try again.'
    );
  }, []);

  // Save over the original. On an mtime conflict, stash the exported payload and
  // raise the 3-way conflict dialog (the bytes + strokes live here, so the
  // dialog does too — the viewer never reaches into file-browser).
  const handleSaveOver = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const payload = await exportBase64();
      const outcome = await onSaveOver?.(payload, imageMtime);
      if (outcome && !outcome.ok) {
        if (outcome.error === 'conflict') setConflictPayload(payload);
        else reportFailure(outcome.error);
      }
    } catch (err) {
      handleExportError(err);
    } finally {
      setSaving(false);
    }
  }, [exportBase64, onSaveOver, imageMtime, reportFailure, handleExportError]);

  const handleSaveAsNew = useCallback(
    async (existingPayload?: string) => {
      setSaveError(null);
      setSaving(true);
      try {
        const payload = existingPayload ?? (await exportBase64());
        const outcome = await onSaveAsNew?.(payload);
        if (outcome && !outcome.ok) reportFailure(outcome.error);
      } catch (err) {
        handleExportError(err);
      } finally {
        setSaving(false);
      }
    },
    [exportBase64, onSaveAsNew, reportFailure, handleExportError]
  );

  // Conflict dialog choices (reuse the already-exported payload).
  const resolveOverwriteAnyway = useCallback(async () => {
    const payload = conflictPayload;
    setConflictPayload(null);
    if (!payload) return;
    setSaving(true);
    try {
      const outcome = await onSaveOver?.(payload); // no expectedMtime → unconditional
      if (outcome && !outcome.ok) reportFailure(outcome.error);
    } catch (err) {
      handleExportError(err);
    } finally {
      setSaving(false);
    }
  }, [conflictPayload, onSaveOver, reportFailure, handleExportError]);

  const resolveSaveAsNew = useCallback(async () => {
    const payload = conflictPayload;
    setConflictPayload(null);
    if (payload) await handleSaveAsNew(payload);
  }, [conflictPayload, handleSaveAsNew]);

  const resolveDiscard = useCallback(() => {
    setConflictPayload(null);
    onCancel?.();
  }, [onCancel]);

  const handleCancel = useCallback(() => {
    if (strokeCount > 0 && typeof window !== 'undefined') {
      if (!window.confirm('Discard your annotations?')) return;
    }
    onCancel?.();
  }, [strokeCount, onCancel]);

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 p-8 text-center"
        data-testid="image-editor-load-error"
      >
        <h3 className="text-lg font-semibold">Can&apos;t edit this image</h3>
        <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} data-testid="image-editor-load-error-back">
            Back to image
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="image-editor-root">
      <ImageEditorToolbar
        colors={COLOR_PRESETS}
        activeColor={color}
        onColorChange={setColor}
        widths={WIDTH_PRESETS}
        activeWidth={width}
        onWidthChange={setWidth}
        onUndo={handleUndo}
        canUndo={strokeCount > 0 && !saving}
        onSaveOver={handleSaveOver}
        onSaveAsNew={() => handleSaveAsNew()}
        onCancel={handleCancel}
        canSave={loaded && !loadError}
        saving={saving}
      />
      {saveError && (
        <div
          className="border-b bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="image-editor-save-error"
        >
          {saveError}
        </div>
      )}
      {conflictPayload !== null && (
        <div
          className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          role="alertdialog"
          aria-label="Save conflict"
          data-testid="image-editor-conflict"
        >
          <span className="mr-auto">
            This image changed on disk since you opened it. What would you like to do?
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resolveSaveAsNew}
            data-testid="image-editor-conflict-save-as-new"
          >
            Save as new
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resolveOverwriteAnyway}
            data-testid="image-editor-conflict-overwrite"
          >
            Overwrite anyway
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resolveDiscard}
            data-testid="image-editor-conflict-discard"
          >
            Discard &amp; reload
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-2">
        <canvas
          ref={canvasRef}
          data-testid="image-editor-canvas"
          className="max-h-full max-w-full touch-none object-contain"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
      </div>
    </div>
  );
}

export function ImageEditor(props: ImageEditorProps) {
  return (
    <ImageEditorErrorBoundary onCancel={props.onCancel}>
      <ImageEditorInner {...props} />
    </ImageEditorErrorBoundary>
  );
}
