'use client';

import type { WorkUnitInput } from '@chainglass/positional-graph';
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
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  type FieldValidationError,
  InputOutputCard,
  type InputOutputItem,
} from './input-output-card';

/** Validation result for the entire list. */
export interface ListValidationErrors {
  [clientId: string]: FieldValidationError[];
}

/** Reserved param displayed as a locked card. */
export interface ReservedParam {
  name: string;
  description: string;
}

interface InputOutputCardListProps {
  /** Section label: "Inputs" or "Outputs". */
  label: string;
  /** Current items (with _clientId assigned). */
  items: InputOutputItem[];
  /** Called on structural changes (add, remove, reorder) — saves immediately. */
  onStructuralChange: (items: InputOutputItem[]) => void;
  /** Called on individual field edits — saves debounced. */
  onFieldChange: (items: InputOutputItem[]) => void;
  /** Reserved params to show as locked cards above user cards. */
  reservedParams?: ReservedParam[];
  /** Whether to block deletion of the last item (for outputs). */
  requireMinOne?: boolean;
  /** Per-card validation errors. */
  validationErrors?: ListValidationErrors;
}

/** Generate a stable unique ID (crypto.randomUUID requires secure context, so fallback). */
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Create a new item with sensible defaults and a fresh _clientId. */
function createDefaultItem(): InputOutputItem {
  return {
    _clientId: generateClientId(),
    name: '',
    type: 'data',
    data_type: 'text',
    required: true,
    description: undefined,
  };
}

/** Assign _clientId to items loaded from server (which don't have them). */
export function hydrateClientIds(items: WorkUnitInput[]): InputOutputItem[] {
  return items.map((item) => ({
    ...item,
    _clientId: generateClientId(),
  }));
}

/** Strip _clientId before sending to server. */
export function stripClientIds(items: InputOutputItem[]): WorkUnitInput[] {
  return items.map(({ _clientId, ...rest }) => rest);
}

const INPUT_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

/** Validate all items in the list. Returns per-card errors. */
export function validateItems(items: InputOutputItem[]): ListValidationErrors {
  const errors: ListValidationErrors = {};
  const namesSeen = new Map<string, string>(); // name → first _clientId

  for (const item of items) {
    const cardErrors: FieldValidationError[] = [];

    // Name: required
    if (!item.name) {
      cardErrors.push({ field: 'name', message: 'Name is required' });
    } else if (!INPUT_NAME_REGEX.test(item.name)) {
      cardErrors.push({
        field: 'name',
        message: 'Must start with a-z, then a-z, 0-9, or underscore',
      });
    } else {
      // Uniqueness check
      const existing = namesSeen.get(item.name);
      if (existing) {
        cardErrors.push({ field: 'name', message: 'Duplicate name' });
        // Also mark the first occurrence
        if (!errors[existing]?.some((e) => e.field === 'name' && e.message === 'Duplicate name')) {
          errors[existing] = [
            ...(errors[existing] ?? []),
            { field: 'name', message: 'Duplicate name' },
          ];
        }
      } else {
        namesSeen.set(item.name, item._clientId);
      }
    }

    // data_type required when type='data'
    if (item.type === 'data' && !item.data_type) {
      cardErrors.push({ field: 'data_type', message: 'Data type is required for data inputs' });
    }

    if (cardErrors.length > 0) {
      errors[item._clientId] = [...(errors[item._clientId] ?? []), ...cardErrors];
    }
  }

  return errors;
}

/** Sortable wrapper for InputOutputCard. */
function SortableCard({
  item,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
  deleteBlocked,
  errors,
}: {
  item: InputOutputItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (updated: InputOutputItem) => void;
  onDelete: () => void;
  deleteBlocked: boolean;
  errors?: FieldValidationError[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item._clientId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="group/card" {...attributes}>
      <InputOutputCard
        item={item}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        onChange={onChange}
        onDelete={onDelete}
        deleteBlocked={deleteBlocked}
        errors={errors}
        sortableRef={setNodeRef}
        activatorRef={setActivatorNodeRef}
        sortableStyle={style}
        dragListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  );
}

/**
 * Container for a list of InputOutputCards with DnD reorder, add/delete, and reserved params.
 *
 * DndContext + SortableContext with verticalListSortingStrategy.
 * Sensors: PointerSensor (distance: 8) + KeyboardSensor (sortableKeyboardCoordinates).
 * Per DYK R2-#5: Uses synthetic _clientId for SortableContext items.
 * Per DYK R1-#5: Each list manages its own expandedId independently.
 *
 * Plan 058, Phase 3, T002.
 */
export function InputOutputCardList({
  label,
  items,
  onStructuralChange,
  onFieldChange,
  reservedParams = [],
  requireMinOne = false,
  validationErrors = {},
}: InputOutputCardListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((i) => i._clientId === active.id);
        const newIndex = items.findIndex((i) => i._clientId === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          onStructuralChange(arrayMove(items, oldIndex, newIndex));
        }
      }
    },
    [items, onStructuralChange]
  );

  const handleAdd = useCallback(() => {
    const newItem = createDefaultItem();
    onStructuralChange([...items, newItem]);
    setExpandedId(newItem._clientId);
  }, [items, onStructuralChange]);

  const handleDelete = useCallback(
    (clientId: string) => {
      onStructuralChange(items.filter((i) => i._clientId !== clientId));
      if (expandedId === clientId) setExpandedId(null);
    },
    [items, onStructuralChange, expandedId]
  );

  const handleChange = useCallback(
    (updated: InputOutputItem) => {
      onFieldChange(items.map((i) => (i._clientId === updated._clientId ? updated : i)));
    },
    [items, onFieldChange]
  );

  const handleToggleExpand = useCallback((clientId: string) => {
    setExpandedId((prev) => (prev === clientId ? null : clientId));
  }, []);

  // Auto-collapse on drag start
  const handleDragStart = useCallback(() => {
    setExpandedId(null);
  }, []);

  const isDeleteBlocked = requireMinOne && items.length <= 1;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{label}</h4>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          aria-label={`Add ${label.toLowerCase().replace(/s$/, '')}`}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add
        </button>
      </div>

      {/* Reserved params (locked, non-draggable, above user cards) */}
      {reservedParams.map((rp) => (
        <div key={rp.name} className="group/card">
          <InputOutputCard
            item={{
              _clientId: `reserved-${rp.name}`,
              name: rp.name,
              type: 'data',
              data_type: 'text',
              required: true,
              description: rp.description,
            }}
            expanded={false}
            onToggleExpand={() => {}}
            onChange={() => {}}
            locked
          />
        </div>
      ))}

      {/* User cards with DnD */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          No {label.toLowerCase()} defined. Click + to add{' '}
          {label.toLowerCase() === 'inputs' ? 'an input' : 'an output'}.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i._clientId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {items.map((item) => (
                <SortableCard
                  key={item._clientId}
                  item={item}
                  expanded={expandedId === item._clientId}
                  onToggleExpand={() => handleToggleExpand(item._clientId)}
                  onChange={handleChange}
                  onDelete={() => handleDelete(item._clientId)}
                  deleteBlocked={isDeleteBlocked}
                  errors={validationErrors[item._clientId]}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
