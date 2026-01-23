'use client';

/**
 * KanbanContent - Client component wrapper for Kanban board
 *
 * DYK-02: Page components are server components, but dnd-kit needs client.
 * This wrapper provides DndContext with proper sensor configuration.
 *
 * Uses useBoardState hook from Phase 4 for state management.
 * T008: Integrates with SSE for real-time updates.
 */

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BoardState, Card, CardId, ColumnId } from '@/data/fixtures/board.fixture';
import { useBoardState } from '@/hooks/useBoardState';
import { useSSE } from '@/hooks/useSSE';
import { type SSEEvent, sseEventSchema } from '@/lib/schemas/sse-events.schema';

import { KanbanCard } from './kanban-card';
import { KanbanColumn } from './kanban-column';

export interface KanbanContentProps {
  /** Initial board state with columns and cards */
  initialBoard: BoardState;
  /** Callback when a card is moved (for testing/SSE) */
  onMoveCard?: (cardId: CardId, targetColumnId: ColumnId, position: number) => void;
  /** SSE channel to subscribe to (optional) */
  sseChannel?: string;
}

/**
 * KanbanContent renders an interactive Kanban board with drag-and-drop.
 *
 * @example
 * <KanbanContent
 *   initialBoard={DEMO_BOARD}
 *   onMoveCard={(cardId, columnId, pos) => console.log('Moved', cardId)}
 *   sseChannel="kanban-demo"
 * />
 */
export function KanbanContent({ initialBoard, onMoveCard, sseChannel }: KanbanContentProps) {
  const { board, moveCard } = useBoardState(initialBoard);
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  // FIX-003: Validate sseChannel matches server-side pattern
  const validChannel = useMemo(() => {
    if (!sseChannel) return false;
    return /^[a-zA-Z0-9_-]+$/.test(sseChannel);
  }, [sseChannel]);

  if (sseChannel && !validChannel) {
    console.warn('KanbanContent: Invalid sseChannel format:', sseChannel);
  }

  // SSE integration for real-time updates (with schema validation - FIX-002)
  const { messages, isConnected } = useSSE<SSEEvent>(
    validChannel ? `/api/events/${sseChannel}` : '',
    undefined,
    { autoConnect: validChannel, messageSchema: sseEventSchema }
  );

  // Process SSE messages to update board state
  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.type === 'task_update') {
      const { taskId, columnId, position } = latestMessage.data;
      moveCard(taskId, columnId, position);
    }
  }, [messages, moveCard]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Find which column contains a card
  const findColumn = useCallback(
    (id: UniqueIdentifier): ColumnId | null => {
      // Check if it's a column id
      const col = board.columns.find((c) => c.id === id);
      if (col) return col.id;

      // Check if it's a card id
      for (const column of board.columns) {
        if (column.cards.some((card) => card.id === id)) {
          return column.id;
        }
      }
      return null;
    },
    [board.columns]
  );

  // Handle drag start - set active card for overlay
  const handleDragStart = useCallback(
    (event: { active: { id: UniqueIdentifier } }) => {
      const { active } = event;
      for (const column of board.columns) {
        const card = column.cards.find((c) => c.id === active.id);
        if (card) {
          setActiveCard(card);
          break;
        }
      }
    },
    [board.columns]
  );

  // Handle drag over - move card between columns in real-time
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as CardId;
      const overId = over.id as string;

      const activeColumn = findColumn(activeId);
      const overColumn = findColumn(overId);

      if (!activeColumn || !overColumn || activeColumn === overColumn) {
        return;
      }

      // Moving to a different column - place at the position of the over item
      const overColumnData = board.columns.find((c) => c.id === overColumn);
      if (!overColumnData) return;

      const overCardIndex = overColumnData.cards.findIndex((c) => c.id === overId);
      // If over a column (not a card), put at end; otherwise at card position
      const position = overCardIndex >= 0 ? overCardIndex : overColumnData.cards.length;

      moveCard(activeId, overColumn, position);
    },
    [board.columns, findColumn, moveCard]
  );

  // Handle drag end - finalize position
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);

      if (!over) return;

      const activeId = active.id as CardId;
      const overId = over.id as string;

      const activeColumn = findColumn(activeId);
      const overColumn = findColumn(overId);

      if (!activeColumn || !overColumn) return;

      // Same column reordering
      if (activeColumn === overColumn) {
        const column = board.columns.find((c) => c.id === activeColumn);
        if (!column) return;

        const activeIndex = column.cards.findIndex((c) => c.id === activeId);
        const overIndex = column.cards.findIndex((c) => c.id === overId);

        if (activeIndex !== overIndex && overIndex >= 0) {
          moveCard(activeId, activeColumn, overIndex);
        }
      }

      // Notify parent
      const targetColumn = board.columns.find((c) => c.id === overColumn);
      if (targetColumn) {
        const position = targetColumn.cards.findIndex((c) => c.id === activeId);
        onMoveCard?.(activeId, overColumn, position >= 0 ? position : targetColumn.cards.length);
      }
    },
    [board.columns, findColumn, moveCard, onMoveCard]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* SSE status indicator */}
      {sseChannel && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-muted-foreground">
            {isConnected ? 'SSE Connected' : 'SSE Disconnected'}
          </span>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map((column) => (
          <KanbanColumn key={column.id} column={column} />
        ))}
      </div>

      {/* Drag overlay shows a preview of the card being dragged */}
      <DragOverlay>{activeCard ? <KanbanCard card={activeCard} /> : null}</DragOverlay>
    </DndContext>
  );
}
