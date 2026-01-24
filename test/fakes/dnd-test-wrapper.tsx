/**
 * DndTestWrapper - Test wrapper for dnd-kit components
 *
 * Provides DndContext with KeyboardSensor and PointerSensor for testing.
 * DYK-08: jsdom cannot simulate pointer drag reliably, so tests should
 * focus on keyboard accessibility (Space→Arrow→Space).
 *
 * @vitest-environment jsdom
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
import type { ReactNode } from 'react';

export interface DndTestWrapperProps {
  children: ReactNode;
  onDragEnd?: (event: DragEndEvent) => void;
}

/**
 * DndTestWrapper provides DndContext with proper sensor configuration.
 *
 * Use this wrapper in tests for components that use dnd-kit.
 * Tests should focus on keyboard interactions (Space→Arrow→Space).
 *
 * @example
 * render(
 *   <DndTestWrapper onDragEnd={mockOnDragEnd}>
 *     <KanbanContent initialBoard={DEMO_BOARD} />
 *   </DndTestWrapper>
 * );
 */
export function DndTestWrapper({ children, onDragEnd }: DndTestWrapperProps) {
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}

export default DndTestWrapper;
