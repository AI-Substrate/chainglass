'use client';

/**
 * KanbanColumn - Column component for Kanban board
 *
 * Uses dnd-kit SortableContext for drag-and-drop within the column.
 * Contains KanbanCards and serves as a droppable container.
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { Column } from '@/data/fixtures/board.fixture';

import { KanbanCard } from './kanban-card';

export interface KanbanColumnProps {
  column: Column;
}

/**
 * KanbanColumn renders a column with its cards.
 *
 * Uses SortableContext from dnd-kit for vertical list reordering.
 *
 * @example
 * <KanbanColumn column={{ id: 'todo', title: 'Todo', cards: [...] }} />
 */
export function KanbanColumn({ column }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  // FIX-006: Memoize cardIds to prevent SortableContext re-renders
  const cardIds = useMemo(() => column.cards.map((card) => card.id), [column.cards]);

  return (
    <div
      className={cn(
        'flex flex-col min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg',
        isOver && 'ring-2 ring-primary/50'
      )}
    >
      {/* Column Header */}
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm flex items-center justify-between">
          {column.title}
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {column.cards.length}
          </span>
        </h3>
      </div>

      {/* Cards Container */}
      <div
        ref={setNodeRef}
        className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto"
        aria-label={`${column.title} column`}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <KanbanCard key={card.id} card={card} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
