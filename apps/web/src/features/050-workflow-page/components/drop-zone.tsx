'use client';

/**
 * DropZone — In-place drop zone that appears between nodes during drag.
 *
 * Renders as a thin vertical indicator that expands on hover.
 * Uses useDroppable from dnd-kit.
 *
 * Phase 3: Drag-and-Drop + Persistence — Plan 050
 */

import { useDroppable } from '@dnd-kit/core';

export interface DropZoneProps {
  id: string;
  lineId: string;
  position: number;
  isActive: boolean;
  fullWidth?: boolean;
}

export function DropZone({ id, lineId, position, isActive, fullWidth }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'drop-zone', lineId, position },
  });

  // Always render so useDroppable stays registered with dnd-kit.
  // Hide visually when not active (during non-drag state).
  if (fullWidth) {
    return (
      <div
        ref={setNodeRef}
        data-testid={`drop-zone-${lineId}-${position}`}
        className={`flex items-center justify-center rounded-lg border-2 border-dashed transition-all ${
          !isActive
            ? 'min-h-0 h-1 overflow-hidden border-transparent opacity-0'
            : isOver
              ? 'min-h-[80px] bg-primary/20 border-primary'
              : 'min-h-[80px] bg-muted/10 border-muted-foreground/20'
        }`}
      >
        {isActive && (
          <span className="text-xs text-muted-foreground">
            {isOver ? 'Drop here' : 'Drop work unit here'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`drop-zone-${lineId}-${position}`}
      className={`flex items-center justify-center shrink-0 rounded transition-all self-stretch ${
        !isActive
          ? 'w-1 opacity-0'
          : isOver
            ? 'w-14 bg-primary/20 border-2 border-dashed border-primary'
            : 'w-10 bg-muted/30 border border-dashed border-muted-foreground/20'
      }`}
    >
      {isActive && <span className="text-xs text-muted-foreground">+</span>}
    </div>
  );
}
