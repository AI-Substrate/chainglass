'use client';

/**
 * dnd-kit Verification Component
 *
 * This component verifies that dnd-kit works correctly with React 19.
 * It is placed in test/verification/ to exclude from production builds.
 *
 * Verification checks:
 * 1. dnd-kit imports without peer dependency errors
 * 2. DndContext renders without RSC errors (requires "use client")
 * 3. Basic drag-and-drop functionality works
 *
 * Usage:
 *   Import this component in a test page to verify dnd-kit integration.
 *   DO NOT use in production code.
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
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

interface SortableItemProps {
  id: string;
}

function SortableItem({ id }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '10px',
    margin: '5px 0',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {id}
    </div>
  );
}

export function TestDndKit() {
  const [items, setItems] = useState(['Item 1', 'Item 2', 'Item 3', 'Item 4']);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((prevItems) => {
        const oldIndex = prevItems.indexOf(active.id as string);
        const newIndex = prevItems.indexOf(over.id as string);
        return arrayMove(prevItems, oldIndex, newIndex);
      });
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px' }}>
      <h2>dnd-kit Verification</h2>
      <p>Drag items to reorder. If drag-and-drop works, dnd-kit is functioning correctly.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => (
            <SortableItem key={id} id={id} />
          ))}
        </SortableContext>
      </DndContext>
      <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
        Current order: {items.join(' → ')}
      </p>
    </div>
  );
}

export default TestDndKit;
