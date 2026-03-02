'use client';

/**
 * Plan 059 Phase 3: AgentChipBar — Persistent top bar with agent chips
 *
 * Displays recent agents as draggable chips with slim/expanded modes.
 * Slim mode (default): single row, priority-sorted, "+N more" overflow.
 * Expanded mode: multi-row scrollable (max ~50vh).
 *
 * Drag-to-reorder via @dnd-kit/sortable v10. Order persisted in localStorage.
 *
 * DYK-P3-04: Slim/expanded to manage vertical space consumption.
 */

import { useRecentAgents } from '@/hooks/use-recent-agents';
import { STORAGE_KEYS, Z_INDEX, readStorage, writeStorage } from '@/lib/agents/constants';
import { cn } from '@/lib/utils';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AgentChip } from './agent-chip';

interface AgentChipBarProps {
  workspace?: string;
  worktreeSlug?: string;
  className?: string;
}

function SortableChip({ id, ...props }: { id: string } & React.ComponentProps<typeof AgentChip>) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AgentChip id={id} {...props} />
    </div>
  );
}

export function AgentChipBar({ workspace, worktreeSlug, className }: AgentChipBarProps) {
  const { agents, isLoading } = useRecentAgents(workspace, worktreeSlug);
  const [isExpanded, setIsExpanded] = useState(() =>
    readStorage(STORAGE_KEYS.chipBarExpanded, false)
  );

  // Custom order from localStorage (drag-to-reorder persistence)
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    if (!worktreeSlug) return [];
    return readStorage<string[]>(STORAGE_KEYS.chipOrder(worktreeSlug), []);
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Apply custom order if available, fallback to priority sort from hook
  const orderedAgents = useMemo(() => {
    if (customOrder.length === 0) return agents;
    const orderMap = new Map(customOrder.map((id, i) => [id, i]));
    return [...agents].sort((a, b) => {
      const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.priority - b.priority;
    });
  }, [agents, customOrder]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = orderedAgents.map((a) => a.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(ids, oldIndex, newIndex);
      setCustomOrder(newOrder);
      if (worktreeSlug) {
        writeStorage(STORAGE_KEYS.chipOrder(worktreeSlug), newOrder);
      }
    },
    [orderedAgents, worktreeSlug]
  );

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev: boolean) => {
      const next = !prev;
      writeStorage(STORAGE_KEYS.chipBarExpanded, next);
      return next;
    });
  }, []);

  // Hide when empty or loading
  if (isLoading || orderedAgents.length === 0) return null;

  // Slim mode: show first row worth of chips + overflow count
  const SLIM_MAX = 6;
  const visibleAgents = isExpanded ? orderedAgents : orderedAgents.slice(0, SLIM_MAX);
  const overflowCount = orderedAgents.length - SLIM_MAX;

  return (
    <div
      className={cn('border-b bg-background/95 backdrop-blur-sm px-3 py-1.5', className)}
      style={{ zIndex: Z_INDEX.TOP_BAR, position: 'relative' }}
    >
      <div className="flex items-center gap-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={visibleAgents.map((a) => a.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className={cn(
                'flex gap-1.5 flex-wrap',
                !isExpanded && 'flex-nowrap overflow-hidden',
                isExpanded && 'max-h-[50vh] overflow-y-auto'
              )}
            >
              {visibleAgents.map((agent) => (
                <SortableChip
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  type={agent.type}
                  status={agent.status}
                  intent={agent.intent}
                  compact={orderedAgents.length > 8}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Overflow / expand toggle */}
        {orderedAgents.length > SLIM_MAX && (
          <button
            type="button"
            onClick={toggleExpanded}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-1',
              'text-xs text-muted-foreground hover:text-foreground',
              'hover:bg-accent transition-colors shrink-0'
            )}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />+{overflowCount}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
