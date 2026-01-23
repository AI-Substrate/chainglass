'use client';

/**
 * KanbanCard - Draggable card component for Kanban board
 *
 * Uses dnd-kit useSortable hook for drag-and-drop functionality.
 * DYK-09: Keyboard accessibility built-in via attributes/listeners from useSortable.
 *
 * Pattern follows test-dndkit.tsx reference implementation.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { Card as CardType } from '@/data/fixtures/board.fixture';

const priorityColors: Record<string, string> = {
  low: 'border-l-green-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-red-500',
};

export interface KanbanCardProps {
  card: CardType;
}

/**
 * KanbanCard is a draggable card for the Kanban board.
 *
 * Uses useSortable from dnd-kit with attributes/listeners for
 * keyboard accessibility (Space to pick up, Arrows to move, Space to drop).
 *
 * @example
 * <KanbanCard card={{ id: 'card-1', title: 'Task 1', priority: 'high' }} />
 */
export function KanbanCard({ card }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityColor = priorityColors[card.priority ?? 'medium'];

  return (
    <Card
      ref={setNodeRef}
      style={style}
      data-sortable="true"
      data-dragging={isDragging}
      className={cn(
        'cursor-grab border-l-4 transition-shadow',
        priorityColor,
        isDragging && 'opacity-50 shadow-lg cursor-grabbing',
        'hover:shadow-md focus:ring-2 focus:ring-primary focus:outline-none'
      )}
      {...attributes}
      {...listeners}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
      </CardHeader>
      {(card.description || card.labels) && (
        <CardContent className="p-3 pt-0">
          {card.description && (
            <p className="text-xs text-muted-foreground mb-2">{card.description}</p>
          )}
          {card.labels && card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.labels.map((label) => (
                <span key={label} className="text-xs px-1.5 py-0.5 bg-muted rounded-full">
                  {label}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
