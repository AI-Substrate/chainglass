/**
 * Drop Handler - Phase 3 (T005)
 *
 * Utility for handling drag-drop from WorkUnitToolbox onto WorkGraphCanvas.
 * Per DYK#1: Dropped nodes start as 'disconnected' status.
 * Per DYK#2: Uses addUnconnectedNode() for UI drag-drop pattern.
 *
 * @module features/022-workgraph-ui/drop-handler
 */

import type { Position } from '@/features/022-workgraph-ui/workgraph-ui.types';
import type { IWorkGraphUIInstance } from './workgraph-ui.types';
import { WORKUNIT_DRAG_TYPE, type WorkUnitDragData } from './workunit-toolbox';

// ============================================
// Types
// ============================================

/**
 * Viewport transform from React Flow.
 */
export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Bounds rectangle for canvas positioning.
 */
export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Context for creating a drop handler.
 */
export interface DropHandlerContext {
  /** WorkGraphUIInstance to call mutations on */
  instance: IWorkGraphUIInstance;
  /** Function to get drop position in flow coordinates */
  getPosition: (event: DragEvent) => Position;
  /** Error callback for user feedback */
  onError: (message: string) => void;
}

// ============================================
// Functions
// ============================================

/**
 * Extract drop position in React Flow coordinates.
 *
 * Converts browser screen coordinates to flow coordinates,
 * accounting for canvas bounds and viewport transform (pan/zoom).
 *
 * @param event - Drop event with clientX/clientY
 * @param bounds - Canvas bounding rect
 * @param viewport - React Flow viewport (pan + zoom)
 * @returns Position in flow coordinates
 */
export function extractDropPosition(
  event: DragEvent,
  bounds: Bounds,
  viewport: ViewportTransform
): Position {
  // Convert client coordinates to canvas-relative
  const canvasX = event.clientX - bounds.left;
  const canvasY = event.clientY - bounds.top;

  // Convert canvas coordinates to flow coordinates
  // Account for pan (viewport.x, viewport.y) and zoom
  const flowX = (canvasX - viewport.x) / viewport.zoom;
  const flowY = (canvasY - viewport.y) / viewport.zoom;

  return { x: flowX, y: flowY };
}

/**
 * Parse drag data from drop event.
 * Includes runtime validation for security.
 *
 * @param event - Drop event
 * @returns Parsed WorkUnitDragData or null if invalid
 */
function parseDragData(event: DragEvent): WorkUnitDragData | null {
  const data = event.dataTransfer?.getData(WORKUNIT_DRAG_TYPE);
  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    // Runtime validation: ensure required fields exist and are valid
    if (typeof parsed.unitSlug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(parsed.unitSlug)) {
      return null;
    }
    if (typeof parsed.unitType !== 'string') {
      return null;
    }
    return parsed as WorkUnitDragData;
  } catch {
    return null;
  }
}

/**
 * Create a drop handler function for the canvas.
 *
 * Returns an async handler that:
 * 1. Prevents default browser behavior
 * 2. Extracts WorkUnit data from drag event
 * 3. Calls addUnconnectedNode on the instance
 * 4. Calls onError if something fails
 *
 * @param context - Handler context with instance and callbacks
 * @returns Async drop handler function
 *
 * @example
 * ```tsx
 * const handleDrop = createDropHandler({
 *   instance,
 *   getPosition: (e) => extractDropPosition(e, bounds, viewport),
 *   onError: (msg) => toast.error(msg),
 * });
 *
 * <div onDrop={handleDrop} ... />
 * ```
 */
export function createDropHandler(
  context: DropHandlerContext
): (event: DragEvent) => Promise<void> {
  const { instance, getPosition, onError } = context;

  return async (event: DragEvent): Promise<void> => {
    // Always prevent default to avoid browser navigation
    event.preventDefault();

    // Parse drag data
    const dragData = parseDragData(event);
    if (!dragData) {
      // Not a WorkUnit drag, or invalid data - ignore silently for wrong MIME
      // But call onError for parse failures (invalid JSON)
      const rawData = event.dataTransfer?.getData(WORKUNIT_DRAG_TYPE);
      if (rawData) {
        onError('Invalid drag data format');
      }
      return;
    }

    // Get drop position in flow coordinates
    const position = getPosition(event);

    // Call addUnconnectedNode on instance
    const result = await instance.addUnconnectedNode(dragData.unitSlug, position);

    // Check for errors (errors array is empty on success)
    if (result.errors && result.errors.length > 0) {
      onError(result.errors[0].message);
    }
  };
}

/**
 * Create a drag over handler for drop target.
 *
 * Enables drop by preventing default and setting drop effect.
 * Only allows drop if WORKUNIT_DRAG_TYPE is present.
 *
 * @returns DragOver handler function
 */
export function createDragOverHandler(): (event: DragEvent) => void {
  return (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };
}
