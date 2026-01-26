'use client';

/**
 * RunsKanbanContent - Kanban board for workflow runs
 *
 * Shows runs categorized by status:
 * - Active: Currently running
 * - Blocked: Waiting for user input
 * - Complete: Finished successfully
 * - Failed: Errored out
 *
 * Each card links to the run detail page.
 * Blocked runs show inline question input.
 */

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useState } from 'react';

import type { BoardState } from '@/data/fixtures/board.fixture';
import type { RunCard } from '@/data/fixtures/runs-board.fixture';

import { KanbanColumn } from './kanban-column';
import { RunKanbanCard } from './run-kanban-card';

export interface RunsKanbanContentProps {
  /** Board state with runs */
  board: BoardState;
  /** Whether to enable drag-drop (for reordering, not state change) */
  allowDrag?: boolean;
  /** Callback when a question is answered */
  onSubmitAnswer?: (runId: string, questionId: string, answer: string | string[] | boolean) => void;
}

/**
 * RunsKanbanContent renders a Kanban board for workflow runs.
 *
 * Unlike the generic kanban, this uses RunKanbanCard for enhanced display
 * and links to run detail pages. Blocked runs show inline question input.
 *
 * @example
 * <RunsKanbanContent board={DEMO_RUNS_BOARD} />
 */
export function RunsKanbanContent({
  board,
  allowDrag = false,
  onSubmitAnswer,
}: RunsKanbanContentProps) {
  const [activeCard, setActiveCard] = useState<RunCard | null>(null);

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

  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const { active } = event;
      for (const column of board.columns) {
        const card = column.cards.find((c) => c.id === active.id);
        if (card) {
          setActiveCard(card as RunCard);
          break;
        }
      }
    },
    [board.columns]
  );

  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    setActiveCard(null);
  }, []);

  const handleSubmit = useCallback(
    (runId: string, questionId: string, answer: string | string[] | boolean) => {
      console.log('Answer submitted:', { runId, questionId, answer });
      onSubmitAnswer?.(runId, questionId, answer);
    },
    [onSubmitAnswer]
  );

  // Non-draggable version (just display)
  if (!allowDrag) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            <div className="bg-muted/50 rounded-lg p-3">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                {column.title}
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                  {column.cards.length}
                </span>
              </h3>
              <div className="space-y-2">
                {column.cards.map((card) => (
                  <RunKanbanCard
                    key={card.id}
                    card={card as RunCard}
                    draggable={false}
                    onSubmit={handleSubmit}
                  />
                ))}
                {column.cards.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No runs</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Draggable version
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map((column) => (
          <KanbanColumn key={column.id} column={column} />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? <RunKanbanCard card={activeCard} draggable={false} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
