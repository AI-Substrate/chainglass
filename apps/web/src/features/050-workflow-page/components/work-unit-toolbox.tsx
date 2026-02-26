'use client';

/**
 * WorkUnitToolbox — Right sidebar showing available work units grouped by type.
 * Items are draggable into the workflow canvas via dnd-kit.
 *
 * Phase 2+3 — Plan 050
 */

import type { WorkUnitSummary } from '@chainglass/positional-graph';
import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import type { ToolboxDragData } from '../types';

const TYPE_ICONS: Record<string, string> = {
  agent: '🤖',
  code: '⚙️',
  'user-input': '👤',
};

const TYPE_LABELS: Record<string, string> = {
  agent: 'Agents',
  code: 'Code',
  'user-input': 'Human Input',
};

const TYPE_ORDER = ['agent', 'code', 'user-input'] as const;

function DraggableUnit({ unit }: { unit: WorkUnitSummary }) {
  const dragData: ToolboxDragData = {
    type: 'toolbox-unit',
    unitSlug: unit.slug,
    unitType: unit.type,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbox-${unit.slug}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`toolbox-unit-${unit.slug}`}
      style={{ touchAction: 'none' }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs bg-card hover:bg-accent transition-colors cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span>{TYPE_ICONS[unit.type]}</span>
      <span className="truncate">{unit.slug}</span>
    </div>
  );
}

export interface WorkUnitToolboxProps {
  units: WorkUnitSummary[];
  isDragging?: boolean;
}

export function WorkUnitToolbox({ units }: WorkUnitToolboxProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = search
    ? units.filter((u) => u.slug.toLowerCase().includes(search.toLowerCase()))
    : units;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    icon: TYPE_ICONS[type],
    items: filtered.filter((u) => u.type === type),
  }));

  return (
    <div data-testid="work-unit-toolbox" className="flex flex-col h-full p-3 gap-3">
      <h3 className="text-sm font-semibold">Work Units</h3>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1 text-xs rounded border bg-background"
        data-testid="toolbox-search"
      />

      {units.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4" data-testid="toolbox-empty">
          No work units found.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No matches for &quot;{search}&quot;
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {grouped.map((group) => (
            <div key={group.type}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [group.type]: !prev[group.type] }))
                }
                className="flex items-center gap-1 text-xs font-medium w-full text-left py-1"
                data-testid={`toolbox-group-${group.type}`}
              >
                <span>{collapsed[group.type] ? '▸' : '▾'}</span>
                <span>{group.icon}</span>
                <span>
                  {group.label} ({group.items.length})
                </span>
              </button>
              {!collapsed[group.type] && (
                <div className="flex flex-col gap-1 ml-3">
                  {group.items.map((unit) => (
                    <DraggableUnit key={unit.slug} unit={unit} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
