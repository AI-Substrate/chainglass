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
        className={`flex items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 ${
          !isActive
            ? 'min-h-0 h-1 overflow-hidden border-transparent opacity-0'
            : isOver
              ? 'min-h-[70px] bg-primary/10 border-primary/50 shadow-inner'
              : 'min-h-[70px] bg-muted/20 border-border/25'
        }`}
      >
        {isActive && (
          <span className="text-[11px] text-muted-foreground/50 font-medium">
            {isOver ? 'Release to drop' : 'Drop work unit here'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`drop-zone-${lineId}-${position}`}
      className={`flex items-center justify-center shrink-0 rounded-lg transition-all duration-200 self-stretch ${
        !isActive
          ? 'w-1 opacity-0'
          : isOver
            ? 'w-12 bg-primary/10 border-2 border-dashed border-primary/50'
            : 'w-8 bg-muted/20 border border-dashed border-border/25'
      }`}
    >
      {isActive && <span className="text-[10px] text-muted-foreground/40 font-medium">+</span>}
    </div>
  );
}
