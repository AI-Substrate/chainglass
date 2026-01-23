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
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo } from 'react';

import type { BoardState, CardId, ColumnId } from '@/data/fixtures/board.fixture';
import { useBoardState } from '@/hooks/useBoardState';
import { useSSE } from '@/hooks/useSSE';
import { type SSEEvent, sseEventSchema } from '@/lib/schemas/sse-events.schema';

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

  // FIX-006: Memoize handleDragEnd
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) return;

      const activeId = active.id as CardId;
      const overId = over.id as string;

      // Determine target column and position
      // Over could be a column id or a card id
      let targetColumnId: ColumnId;
      let position: number;

      // Check if dropping onto a column
      const targetColumn = board.columns.find((col) => col.id === overId);
      if (targetColumn) {
        // Dropping directly onto column - add to end
        targetColumnId = targetColumn.id;
        position = targetColumn.cards.length;
      } else {
        // Dropping onto a card - find the card's column and position
        let foundColumn: ColumnId | null = null;
        let foundPosition = 0;

        for (const col of board.columns) {
          const cardIndex = col.cards.findIndex((c) => c.id === overId);
          if (cardIndex !== -1) {
            foundColumn = col.id;
            foundPosition = cardIndex;
            break;
          }
        }

        if (!foundColumn) return;

        targetColumnId = foundColumn;
        position = foundPosition;
      }

      // Move the card
      moveCard(activeId, targetColumnId, position);

      // Notify parent (for testing/SSE integration)
      onMoveCard?.(activeId, targetColumnId, position);
    },
    [board.columns, moveCard, onMoveCard]
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
    </DndContext>
  );
}
